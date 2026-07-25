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
    Receipt,
    ReceiptItem
} = require('../models');

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

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

    const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const alcoholSubtotal = items
        .filter(item => /beer|wine|cocktail|alcohol|spirit/i.test(item.product?.category?.name || ''))
        .reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const foodSubtotal = subtotal - alcoholSubtotal;
    const foodVatAmount = businessDay.foodVatActive
        ? Math.round(foodSubtotal * Number(businessDay.foodVatRate || 0) / 100)
        : 0;
    const alcoholVatAmount = businessDay.alcoholVatActive
        ? Math.round(alcoholSubtotal * Number(businessDay.alcoholVatRate || 0) / 100)
        : 0;
    const serviceChargeAmount = businessDay.serviceChargeActive
        ? Math.round(subtotal * Number(businessDay.serviceChargeRate || 0) / 100)
        : 0;
    const totalAmount = subtotal + foodVatAmount + alcoholVatAmount + serviceChargeAmount;
    const snapshotItems = items.map(item => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        productName: item.product?.displayName || item.product?.name || `Product ${item.productId}`,
        quantity: Number(item.quantity),
        unitPrice: Number(item.price),
        lineTotal: Number(item.price) * Number(item.quantity),
        note: item.note || null
    }));
    const fingerprint = sha256(JSON.stringify(snapshotItems.map(item => [
        item.id, item.orderId, item.productId, item.quantity, item.unitPrice
    ])));

    return {
        businessDay,
        orders,
        items,
        snapshot: {
            orderIds,
            items: snapshotItems,
            subtotal,
            foodVatAmount,
            alcoholVatAmount,
            serviceChargeAmount,
            serviceChargeName: serviceChargeAmount ? businessDay.serviceChargeName : null,
            totalAmount,
            fingerprint
        }
    };
};

const createReference = async transaction => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const reference = `ML${crypto.randomInt(10000000, 100000000)}`;
        const exists = await PaymentTransaction.findOne({ where: { reference }, transaction });
        if (!exists) return reference;
    }
    throw Object.assign(new Error('Could not allocate a payment reference.'), { status: 503 });
};

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

const createSePayPayment = async (req, res) => {
    if (!process.env.SEPAY_WEBHOOK_SECRET || !process.env.SEPAY_BANK_CODE || !process.env.SEPAY_ACCOUNT_NUMBER) {
        throw Object.assign(new Error('Online payment is not configured.'), { status: 503 });
    }
    const tableId = req.customerTable.id;
    const clientToken = crypto.randomBytes(32).toString('hex');
    let response;

    await sequelize.transaction(async transaction => {
        const table = await Table.findByPk(tableId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!table || !table.qrSessionActive) {
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

const verifySePaySignature = req => {
    const secret = process.env.SEPAY_WEBHOOK_SECRET;
    const timestamp = String(req.header('X-SePay-Timestamp') || '');
    const supplied = String(req.header('X-SePay-Signature') || '').replace(/^sha256=/i, '');
    if (!secret || !timestamp || !/^[a-f0-9]{64}$/i.test(supplied) || !req.rawBody) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
    const expected = crypto.createHmac('sha256', secret)
        .update(`${timestamp}.${req.rawBody.toString('utf8')}`)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
};

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
            { status: 'Paid', paidBy: null },
            { where: { id: { [Op.in]: payment.billSnapshot.orderIds }, status: { [Op.in]: ['Pending', 'Order'] } }, transaction }
        );
        table.status = 'CustomerPaid';
        table.qrSessionActive = false;
        table.qrSessionVersion = Number(table.qrSessionVersion || 0) + 1;
        table.qrSessionOpenedAt = null;
        await table.save({ transaction });

        const receipt = await Receipt.create({
            receiptNumber: `TMP-${crypto.randomBytes(12).toString('hex')}`,
            businessDayId: payment.businessDayId,
            tableId: table.id,
            tableName: table.name,
            subtotal: payment.billSnapshot.subtotal,
            discountAmount: 0,
            totalAmount: payment.amount,
            paymentMethod: 'SePay',
            foodVatAmount: payment.billSnapshot.foodVatAmount,
            alcoholVatAmount: payment.billSnapshot.alcoholVatAmount,
            serviceChargeAmount: payment.billSnapshot.serviceChargeAmount,
            serviceChargeName: payment.billSnapshot.serviceChargeName,
            paidBy: null,
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

module.exports = { createSePayPayment, getSePayPaymentStatus, handleSePayWebhook };
