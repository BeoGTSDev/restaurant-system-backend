// Controller file: receives request data, applies paymentController rules, and returns JSON.
// Payment flow: fixed bill -> pending SePay row -> signed webhook -> final receipt.
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
    sequelize,
    PaymentTransaction,
    BusinessDay,
    Table,
    Order,
    OrderItem,
    Product,
    Category,
    Voucher,
    Receipt,
    ReceiptItem
} = require('../models');
const { calculateVoucher } = require('../services/voucherService');
const { calculateBillTotals } = require('../services/billingService');
const { verifyWebhookSignature } = require('../services/webhookSecurityService');

// HTTP handler: runs the sha256 step. It reads req data, uses models/services, and sends JSON with res.
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

// HTTP handler: loads load bill data. It reads req data, uses models/services, and sends JSON with res.
const loadBill = async (tableId, transaction, lock = false) => {
    const businessDay = await BusinessDay.findOne({
        where: { status: 'open' },
        transaction,
        lock: lock ? transaction.LOCK.UPDATE : undefined
    });
    if (!businessDay) throw Object.assign(new Error('POS is closed.'), { status: 423 });

    const orders = await Order.findAll({
        where: { tableId, status: { [Op.in]: ['Pending', 'Order'] } },
        transaction,
        lock: lock ? transaction.LOCK.UPDATE : undefined
    });
    if (!orders.length) throw Object.assign(new Error('There is no open bill for this table.'), { status: 409 });

    const orderIds = orders.map(order => order.id);
    const items = await OrderItem.findAll({
        where: { orderId: { [Op.in]: orderIds }, status: { [Op.ne]: 'Cancelled' } },
        include: [{ model: Product, as: 'product', include: [{ model: Category, as: 'category' }] }],
        transaction,
        lock: lock ? { level: transaction.LOCK.UPDATE, of: OrderItem } : undefined,
        order: [['id', 'ASC']]
    });
    if (!items.length) throw Object.assign(new Error('The bill has no payable items.'), { status: 409 });

    const table = await Table.findByPk(tableId, { transaction });
    const voucherResult = await calculateVoucher({
        code: table?.billVoucherCode,
        items,
        transaction,
        lock
    });
    const billDiscountPercent = Number(table?.billDiscountPercent || 0);
    const totals = calculateBillTotals({
        items,
        voucherSubtotal: voucherResult.subtotal,
        voucherTotal: voucherResult.totalAmount,
        voucherDiscountAmount: voucherResult.discountAmount,
        billDiscountPercent,
        foodVatActive: businessDay.foodVatActive,
        foodVatRate: businessDay.foodVatRate,
        alcoholVatActive: businessDay.alcoholVatActive,
        alcoholVatRate: businessDay.alcoholVatRate,
        serviceChargeActive: businessDay.serviceChargeActive,
        serviceChargeRate: businessDay.serviceChargeRate
    });
    const {
        subtotal, billDiscountAmount, discountedSubtotal, foodVatAmount,
        alcoholVatAmount, serviceChargeAmount, totalAmount
    } = totals;
    const snapshotItems = items.map(item => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        productName: item.product?.displayName || item.product?.name || `Product ${item.productId}`,
        categoryName: item.product?.category?.name || null,
        quantity: Number(item.quantity),
        unitPrice: Number(item.price),
        lineTotal: Number(item.price) * Number(item.quantity),
        note: item.note || null
    }));
    const fingerprint = sha256(JSON.stringify({
        items: snapshotItems.map(item => [
            item.id, item.orderId, item.productId, item.quantity, item.unitPrice
        ]),
        voucherCode: voucherResult.voucher?.code || null,
        billDiscountPercent,
        billDiscountReason: billDiscountPercent ? table.billDiscountReason : null,
        foodVatRate: businessDay.foodVatActive ? Number(businessDay.foodVatRate || 0) : 0,
        alcoholVatRate: businessDay.alcoholVatActive ? Number(businessDay.alcoholVatRate || 0) : 0,
        serviceChargeRate: businessDay.serviceChargeActive ? Number(businessDay.serviceChargeRate || 0) : 0
    }));

    return {
        businessDay,
        orders,
        items,
        snapshot: {
            orderIds,
            items: snapshotItems,
            subtotal,
            voucherCode: voucherResult.voucher?.code || null,
            voucherDiscountAmount: voucherResult.discountAmount,
            billDiscountPercent,
            billDiscountAmount,
            billDiscountReason: billDiscountPercent ? table.billDiscountReason : null,
            discountAmount: totals.discountAmount,
            discountedSubtotal,
            foodVatAmount,
            alcoholVatAmount,
            serviceChargeAmount,
            serviceChargeName: serviceChargeAmount ? businessDay.serviceChargeName : null,
            totalAmount,
            fingerprint
        }
    };
};

// HTTP handler: creates or starts create reference. It reads req data, uses models/services, and sends JSON with res.
const createReference = async transaction => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const reference = `ML${crypto.randomInt(10000000, 100000000)}`;
        const exists = await PaymentTransaction.findOne({ where: { reference }, transaction });
        if (!exists) return reference;
    }
    throw Object.assign(new Error('Could not allocate a payment reference.'), { status: 503 });
};

// HTTP handler: runs the payment response step. It reads req data, uses models/services, and sends JSON with res.
const paymentResponse = (payment, clientToken) => {
    const bankCode = String(process.env.SEPAY_BANK_CODE).trim();
    const accountNumber = String(process.env.SEPAY_ACCOUNT_NUMBER).trim();
    const accountName = String(process.env.SEPAY_ACCOUNT_NAME || 'MAISON LUCAS').trim();
    const amount = Math.round(Number(payment.amount));
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(accountNumber)}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(payment.reference)}&accountName=${encodeURIComponent(accountName)}`;
    return {
        reference: payment.reference,
        amount,
        status: payment.status,
        expiresAt: payment.expiresAt,
        bankCode,
        accountNumber,
        accountName,
        qrUrl,
        clientToken
    };
};

// HTTP handler: creates or starts create payment for table. It reads req data, uses models/services, and sends JSON with res.
const createPaymentForTable = async (req, res, tableId, requireActiveQrSession) => {
    if (!process.env.SEPAY_WEBHOOK_SECRET || !process.env.SEPAY_BANK_CODE || !process.env.SEPAY_ACCOUNT_NUMBER) {
        throw Object.assign(new Error('Online payment is not configured.'), { status: 503 });
    }
    const clientToken = crypto.randomBytes(32).toString('hex');
    let response;

    await sequelize.transaction(async transaction => {
        const table = await Table.findByPk(tableId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!table || (requireActiveQrSession && !table.qrSessionActive)) {
            throw Object.assign(new Error('This table session is no longer active.'), { status: 401 });
        }
        if (table.status === 'CustomerPaid') {
            throw Object.assign(new Error('This table has already been paid.'), { status: 409 });
        }

        await PaymentTransaction.update(
            { status: 'Expired', failureReason: 'Replaced by a new payment request' },
            { where: { tableId, status: 'Pending' }, transaction }
        );
        const bill = await loadBill(tableId, transaction, true);
        const reference = await createReference(transaction);
        const payment = await PaymentTransaction.create({
            reference,
            businessDayId: bill.businessDay.id,
            tableId,
            createdBy: req.user?.id || null,
            amount: bill.snapshot.totalAmount,
            billSnapshot: bill.snapshot,
            clientTokenHash: sha256(clientToken),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }, { transaction });
        table.status = 'BillCheck';
        await table.save({ transaction });
        response = paymentResponse(payment, clientToken);
    });

    req.io.emit('table_status_update', { tableId, status: 'BillCheck' });
    res.status(201).json({ success: true, data: response });
};

// HTTP handler: creates or starts create se pay payment. It reads req data, uses models/services, and sends JSON with res.
const createSePayPayment = (req, res) => createPaymentForTable(
    req,
    res,
    req.customerTable.id,
    true
);

// HTTP handler: creates or starts create pos se pay payment. It reads req data, uses models/services, and sends JSON with res.
const createPosSePayPayment = (req, res) => {
    const tableId = Number(req.body?.tableId);
    if (!Number.isInteger(tableId) || tableId <= 0) {
        throw Object.assign(new Error('A valid table is required.'), { status: 400 });
    }
    return createPaymentForTable(req, res, tableId, false);
};

// HTTP handler: loads get customer bill data. It reads req data, uses models/services, and sends JSON with res.
const getCustomerBill = async (req, res) => {
    const bill = await loadBill(req.customerTable.id);
    res.json({ success: true, data: bill.snapshot });
};

// HTTP handler: changes and saves apply customer voucher. It reads req data, uses models/services, and sends JSON with res.
const applyCustomerVoucher = async (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) throw Object.assign(new Error('Enter a voucher code.'), { status: 400 });
    let snapshot;
    await sequelize.transaction(async transaction => {
        const table = await Table.findByPk(req.customerTable.id, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!table || !table.qrSessionActive) {
            throw Object.assign(new Error('This table session is no longer active.'), { status: 401 });
        }
        table.billVoucherCode = code;
        await table.save({ transaction });
        try {
            snapshot = (await loadBill(table.id, transaction, true)).snapshot;
        } catch (error) {
            table.billVoucherCode = null;
            await table.save({ transaction });
            throw error;
        }
    });
    res.json({ success: true, data: snapshot });
};

// HTTP handler: loads get se pay payment status data. It reads req data, uses models/services, and sends JSON with res.
const getSePayPaymentStatus = async (req, res, next) => {
    const payment = await PaymentTransaction.findOne({ where: { reference: String(req.params.reference).toUpperCase() } });
    if (!payment || !req.query.token || !crypto.timingSafeEqual(
        Buffer.from(payment.clientTokenHash, 'hex'),
        Buffer.from(sha256(req.query.token), 'hex')
    )) {
        return next(Object.assign(new Error('Payment session not found.'), { status: 404 }));
    }
    if (payment.status === 'Pending' && new Date(payment.expiresAt).getTime() < Date.now()) {
        payment.status = 'Expired';
        payment.failureReason = 'Payment request expired';
        await payment.save();
    }
    res.json({
        success: true,
        data: {
            reference: payment.reference,
            amount: Number(payment.amount),
            status: payment.status,
            receiptId: payment.receiptId,
            paidAt: payment.paidAt,
            failureReason: payment.failureReason
        }
    });
};

// HTTP handler: checks verify se pay signature and returns a safe yes/no result. It reads req data, uses models/services, and sends JSON with res.
const verifySePaySignature = req => {
    return verifyWebhookSignature({
        secret: process.env.SEPAY_WEBHOOK_SECRET,
        timestamp: String(req.header('X-SePay-Timestamp') || ''),
        suppliedSignature: req.header('X-SePay-Signature'),
        rawBody: req.rawBody
    });
};

// HTTP handler: handles the handle se pay webhook action. It reads req data, uses models/services, and sends JSON with res.
const handleSePayWebhook = async (req, res) => {
    if (!verifySePaySignature(req)) {
        return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }
    const payload = req.body || {};
    const providerTransactionId = String(payload.id || payload.referenceCode || '').trim();
    const reference = String(payload.code || '').trim().toUpperCase();

    if (!providerTransactionId || !reference || payload.transferType !== 'in') {
        return res.status(200).json({ success: true });
    }

    let event = null;
    await sequelize.transaction(async transaction => {
        const duplicate = await PaymentTransaction.findOne({ where: { providerTransactionId }, transaction });
        if (duplicate) return;
        const payment = await PaymentTransaction.findOne({
            where: { reference },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!payment || payment.status === 'Paid') return;

        payment.providerTransactionId = providerTransactionId;
        payment.rawCallback = payload;
        if (payment.status !== 'Pending') {
            await payment.save({ transaction });
            return;
        }
        const configuredAccount = String(process.env.SEPAY_ACCOUNT_NUMBER || '').replace(/\s/g, '');
        const callbackAccount = String(payload.accountNumber || '').replace(/\s/g, '');
        if (configuredAccount && configuredAccount !== callbackAccount) {
            payment.status = 'Failed';
            payment.failureReason = 'Receiving account mismatch';
            await payment.save({ transaction });
            return;
        }
        if (Math.round(Number(payload.transferAmount)) !== Math.round(Number(payment.amount))) {
            payment.status = 'Failed';
            payment.failureReason = 'Transferred amount does not match the bill';
            await payment.save({ transaction });
            return;
        }
        if (new Date(payment.expiresAt).getTime() < Date.now()) {
            payment.status = 'Expired';
            payment.failureReason = 'Payment arrived after expiry';
            await payment.save({ transaction });
            return;
        }

        const table = await Table.findByPk(payment.tableId, { transaction, lock: transaction.LOCK.UPDATE });
        const bill = await loadBill(payment.tableId, transaction, true);
        if (bill.businessDay.id !== payment.businessDayId || bill.snapshot.fingerprint !== payment.billSnapshot.fingerprint) {
            payment.status = 'Failed';
            payment.failureReason = 'Bill changed after the payment request was created';
            await payment.save({ transaction });
            return;
        }

        await Order.update(
            { status: 'Paid', paidBy: payment.createdBy || null },
            { where: { id: { [Op.in]: payment.billSnapshot.orderIds }, status: { [Op.in]: ['Pending', 'Order'] } }, transaction }
        );
        table.status = 'CustomerPaid';
        table.qrSessionActive = false;
        table.qrSessionVersion = Number(table.qrSessionVersion || 0) + 1;
        table.qrSessionOpenedAt = null;
        await table.save({ transaction });
        if (payment.billSnapshot.voucherCode) {
            const voucher = await Voucher.findOne({
                where: { code: payment.billSnapshot.voucherCode },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (voucher) {
                voucher.usedCount = Number(voucher.usedCount || 0) + 1;
                await voucher.save({ transaction });
            }
        }

        const receipt = await Receipt.create({
            receiptNumber: `TMP-${crypto.randomBytes(12).toString('hex')}`,
            businessDayId: payment.businessDayId,
            tableId: table.id,
            tableName: table.name,
            subtotal: payment.billSnapshot.subtotal,
            discountAmount: payment.billSnapshot.discountAmount,
            totalAmount: payment.amount,
            paymentMethod: 'SePay',
            voucherCode: payment.billSnapshot.voucherCode,
            billDiscountPercent: payment.billSnapshot.billDiscountPercent,
            billDiscountAmount: payment.billSnapshot.billDiscountAmount,
            billDiscountReason: payment.billSnapshot.billDiscountReason,
            foodVatAmount: payment.billSnapshot.foodVatAmount,
            alcoholVatAmount: payment.billSnapshot.alcoholVatAmount,
            serviceChargeAmount: payment.billSnapshot.serviceChargeAmount,
            serviceChargeName: payment.billSnapshot.serviceChargeName,
            paidBy: payment.createdBy || null,
            paidAt: new Date()
        }, { transaction });
        const datePart = String(bill.businessDay.businessDate).replace(/-/g, '');
        receipt.receiptNumber = `ML-${datePart}-${String(receipt.id).padStart(6, '0')}`;
        await receipt.save({ transaction });
        await ReceiptItem.bulkCreate(payment.billSnapshot.items.map(item => ({
            receiptId: receipt.id,
            orderId: item.orderId,
            productId: item.productId,
            productName: item.productName,
            categoryName: item.categoryName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            note: item.note
        })), { transaction });

        payment.status = 'Paid';
        payment.receiptId = receipt.id;
        payment.paidAt = new Date();
        await payment.save({ transaction });
        event = {
            tableId: table.id,
            tableName: table.name,
            totalBill: Number(payment.amount),
            receiptNumber: receipt.receiptNumber,
            paymentMethod: 'SePay',
            reference: payment.reference,
            timestamp: new Date()
        };
    });

    if (event) {
        req.io.emit('payment_completed', event);
        req.io.emit('table_status_update', { tableId: event.tableId, status: 'CustomerPaid' });
    }
    return res.status(200).json({ success: true });
};

module.exports = {
    createSePayPayment,
    createPosSePayPayment,
    getCustomerBill,
    applyCustomerVoucher,
    getSePayPaymentStatus,
    handleSePayWebhook
};
