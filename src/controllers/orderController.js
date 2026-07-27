const { Op } = require('sequelize');
const crypto = require('crypto');
const { Order, OrderItem, Product, Category, ProductIngredient, Ingredient, InventoryMovement, Table, BusinessDay, CashMovement, ShiftRecord, Voucher, Receipt, ReceiptItem, sequelize } = require('../models');
const { resetExpiredDailyAvailability } = require('../utils/productAvailability');
const { calculateVoucher, normalizeCode } = require('../services/voucherService');

const createOrder = async (req, res, next) => {
    const { tableId, items, courseTiming = 'ALL_NOW' } = req.body;
    const normalizedCourseTiming = ['ALL_NOW', 'SHARE', 'SAME_TIME'].includes(courseTiming) ? courseTiming : 'ALL_NOW';
    if (!Array.isArray(items) || items.length === 0) {
        const err = new Error('Order must contain at least one item');
        err.status = 400;
        return next(err);
    }

    let table;
    let order;
    let statusChanged = false;
    let additionalPrice = 0;
    let orderItemsData = [];
    let itemDetailsForSocket = [];
    const staffShift = req.user?.id
        ? await ShiftRecord.findOne({ where: { cashierId: req.user.id, status: 'open' }, order: [['openedAt', 'DESC']] })
        : null;

    await sequelize.transaction(async (transaction) => {
        await resetExpiredDailyAvailability(Product, transaction);
        table = await Table.findByPk(tableId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!table) {
            const err = new Error('Table not found');
            err.status = 404;
            throw err;
        }
        if (['BillCheck', 'CustomerPaid'].includes(table.status)) {
            const err = new Error('Cannot order! Table is checking out.');
            err.status = 400;
            throw err;
        }
        if (table.status === 'Ready') {
            const err = new Error('Please escort guest (Open Table) first!');
            err.status = 400;
            throw err;
        }
        if (['Escort', 'OrderCheck'].includes(table.status)) {
            table.status = 'Order';
            await table.save({ transaction });
            statusChanged = true;
        }

        for (const item of items) {
            const quantity = Number(item.quantity);
            if (!Number.isInteger(quantity) || quantity <= 0) {
                const err = new Error('Item quantity must be a positive whole number');
                err.status = 400;
                throw err;
            }
            const product = await Product.findByPk(item.productId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!product) {
                const err = new Error(`Product ID ${item.productId} not found`);
                err.status = 404;
                throw err;
            }
            if (product.status !== 'In Stock') {
                const err = new Error(`${product.name} is sold out`);
                err.status = 409;
                throw err;
            }
            if (product.remainingQty !== null && quantity > product.remainingQty) {
                const err = new Error(`${product.name} only has ${product.remainingQty} left today`);
                err.status = 409;
                throw err;
            }

            if (product.remainingQty !== null) {
                product.remainingQty -= quantity;
                if (product.remainingQty === 0) product.status = 'Out of Stock';
                await product.save({ transaction });
            }
            const recipe = await ProductIngredient.findAll({ where: { productId: product.id }, transaction });
            for (const component of recipe) {
                const ingredient = await Ingredient.findByPk(component.ingredientId, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                const required = Number(component.quantityPerServing) * quantity;
                const before = Number(ingredient.quantity);
                if (before < required) {
                    const err = new Error(`${product.displayName || product.name} cannot be ordered: ${ingredient.name} stock is insufficient`);
                    err.status = 409;
                    throw err;
                }
                ingredient.quantity = before - required;
                await ingredient.save({ transaction });
                await InventoryMovement.create({
                    ingredientId: ingredient.id,
                    type: 'out',
                    quantity: required,
                    beforeQuantity: before,
                    afterQuantity: ingredient.quantity,
                    reason: `Order: ${product.displayName || product.name}`,
                    performedBy: req.user?.id || null,
                    businessDayId: req.businessDay?.id || null
                }, { transaction });
            }
            additionalPrice += product.price * quantity;
            orderItemsData.push({
                productId: item.productId,
                quantity,
                price: product.price,
                note: item.note || null,
                courseTiming: ['ALL_NOW', 'SHARE', 'SAME_TIME'].includes(item.courseTiming) ? item.courseTiming : normalizedCourseTiming,
                orderSource: req.user?.id ? 'STAFF' : 'CUSTOMER',
                orderedByName: req.user?.fullName || req.user?.role || 'Customer'
            });
            itemDetailsForSocket.push({
                productName: product.name,
                quantity,
                image: product.imageUrl
            });
        }

        order = await Order.findOne({
            where: { tableId, status: 'Order' },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (order) {
            order.totalPrice += additionalPrice;
            await order.save({ transaction });
        } else {
            const lockedBusinessDay = await BusinessDay.findByPk(req.businessDay?.id, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!lockedBusinessDay) throw Object.assign(new Error('Open business day not found'), { status: 423 });
            const lastNumber = await Order.max('dayOrderNumber', {
                where: { businessDayId: lockedBusinessDay.id },
                transaction
            });
            order = await Order.create({
                tableId,
                totalPrice: additionalPrice,
                status: 'Pending',
                businessDayId: lockedBusinessDay.id,
                dayOrderNumber: Number(lastNumber || 0) + 1,
                shiftId: staffShift?.id || null,
                createdBy: req.user?.id || null
            }, { transaction });
        }
        await OrderItem.bulkCreate(
            orderItemsData.map(item => ({ ...item, orderId: order.id })),
            { transaction }
        );
    });

    req.io.emit('new_order', {
        tableId: tableId,
        tableName: table.name || `Table ${tableId}`,
        orderId: order.id,
        dayOrderNumber: order.dayOrderNumber,
        items: itemDetailsForSocket,
        timestamp: new Date()
    });
    if (statusChanged) {
        req.io.emit('table_status_update', {
            tableId: tableId,
            status: 'Order'
        });
    }

    res.status(201).json({
        success: true,
        message: 'Order updated successfully', 
        orderId: order.id, 
        totalPrice: order.totalPrice 
    });
};

const getAllOrders = async (req, res, next) => {
    const orders = await Order.findAll({
        include: [
            { model: Table, as: 'table' },
            { 
                model: OrderItem, 
                as: 'items',
                include: [{ model: Product, as: 'product' }]
            }
        ],
        order: [['createdAt', 'DESC']]
    });
    res.status(200).json({
        success: true,
        data: orders
    });
};

const getCustomerOrder = async (req, res, next) => {
    const { tableId } = req.params;
    const table = await Table.findByPk(tableId, {
        attributes: ['id', 'name', 'status']
    });

    if (!table) {
        const err = new Error('Table not found');
        err.status = 404;
        return next(err);
    }

    const orders = await Order.findAll({
        where: {
            tableId,
            status: ['Pending', 'Order']
        },
        attributes: ['id', 'totalPrice', 'status', 'createdAt', 'updatedAt'],
        include: [{
            model: OrderItem,
            as: 'items',
            attributes: ['id', 'quantity', 'price', 'note', 'status'],
            include: [{
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'displayName', 'imageUrl']
            }]
        }],
        order: [['createdAt', 'ASC']]
    });

    res.status(200).json({
        success: true,
        data: { table, orders }
    });
};

const setBillAdjustments = async (req, res, next) => {
    const tableId = Number(req.params.tableId);
    const voucherCode = normalizeCode(req.body?.voucherCode) || null;
    const billDiscountPercent = Number(req.body?.billDiscountPercent || 0);
    const billDiscountReason = String(req.body?.billDiscountReason || '').trim();
    const allowedBillDiscounts = [0, 5, 10, 15, 20];
    const allowedDiscountReasons = ['Guest complaint', 'Service recovery', 'Quality issue', 'Manager courtesy'];

    if (!allowedBillDiscounts.includes(billDiscountPercent)) {
        return next(Object.assign(new Error('Invalid bill discount percentage.'), { status: 400 }));
    }
    if (billDiscountPercent > 0 && req.user.role !== 'Admin' && !req.user.permissions.includes('approve_bill_discount')) {
        return next(Object.assign(new Error('Bill discount requires manager approval permission.'), { status: 403 }));
    }
    if (billDiscountPercent > 0 && !allowedDiscountReasons.includes(billDiscountReason)) {
        return next(Object.assign(new Error('Select an approved bill discount reason.'), { status: 400 }));
    }

    await sequelize.transaction(async transaction => {
        const table = await Table.findByPk(tableId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!table) throw Object.assign(new Error('Table not found'), { status: 404 });
        if (table.status === 'CustomerPaid') {
            throw Object.assign(new Error('This bill has already been paid.'), { status: 409 });
        }
        if (voucherCode) {
            const orders = await Order.findAll({
                where: { tableId, status: { [Op.in]: ['Pending', 'Order'] } },
                include: [{
                    model: OrderItem,
                    as: 'items',
                    where: { status: { [Op.ne]: 'Cancelled' } },
                    required: false,
                    include: [{ model: Product, as: 'product', include: [{ model: Category, as: 'category' }] }]
                }],
                transaction
            });
            await calculateVoucher({
                code: voucherCode,
                items: orders.flatMap(order => order.items || []),
                transaction
            });
        }
        table.billVoucherCode = voucherCode;
        table.billDiscountPercent = billDiscountPercent;
        table.billDiscountReason = billDiscountPercent ? billDiscountReason : null;
        table.billDiscountApprovedBy = billDiscountPercent ? req.user.id : null;
        await table.save({ transaction });
    });

    res.json({ success: true, message: 'Bill adjustments saved.' });
};

const payBillByTable = async (req, res, next) => {
    const { tableId } = req.params;
    const paymentMethod = String(req.body?.paymentMethod || 'Cash').trim();
    const cashReceived = Number(req.body?.cashReceived || 0);
    const billDiscountPercent = Number(req.body?.billDiscountPercent || 0);
    const billDiscountReason = String(req.body?.billDiscountReason || '').trim();
    const allowedMethods = ['Cash', 'Card', 'Bank Transfer', 'Other'];
    const allowedBillDiscounts = [0, 5, 10, 15, 20];
    const allowedDiscountReasons = ['Guest complaint', 'Service recovery', 'Quality issue', 'Manager courtesy'];
    if (!allowedMethods.includes(paymentMethod)) return next(Object.assign(new Error('Invalid payment method.'), { status: 400 }));
    if (!allowedBillDiscounts.includes(billDiscountPercent)) return next(Object.assign(new Error('Invalid bill discount percentage.'), { status: 400 }));
    if (billDiscountPercent > 0 && req.user.role !== 'Admin' && !req.user.permissions.includes('approve_bill_discount')) {
        return next(Object.assign(new Error('Bill discount requires manager approval permission.'), { status: 403 }));
    }
    if (billDiscountPercent > 0 && !allowedDiscountReasons.includes(billDiscountReason)) {
        return next(Object.assign(new Error('Select an approved bill discount reason.'), { status: 400 }));
    }

    let paymentResult;
    await sequelize.transaction(async transaction => {
        const table = await Table.findByPk(tableId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!table) throw Object.assign(new Error('Table not found'), { status: 404 });
        const businessDay = await BusinessDay.findOne({ where: { status: 'open' }, transaction, lock: transaction.LOCK.UPDATE });
        if (!businessDay) throw Object.assign(new Error('POS is closed. Open the business day before taking payment.'), { status: 423 });
        const orders = await Order.findAll({
            where: { tableId, status: { [Op.in]: ['Pending', 'Order'] } },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!orders.length) throw Object.assign(new Error('No orders to pay for this table'), { status: 409 });
        const orderIds = orders.map(order => order.id);
        const items = await OrderItem.findAll({
            where: { orderId: { [Op.in]: orderIds }, status: { [Op.ne]: 'Cancelled' } },
            include: [{ model: Product, as: 'product', include: [{ model: Category, as: 'category' }] }],
            transaction,
            lock: { level: transaction.LOCK.UPDATE, of: OrderItem }
        });
        if (!items.length) throw Object.assign(new Error('The bill has no payable items.'), { status: 409 });

        const voucherResult = await calculateVoucher({
            code: req.body?.voucherCode,
            items,
            transaction,
            lock: true
        });
        const billDiscountAmount = Math.round(voucherResult.totalAmount * billDiscountPercent / 100);
        const discountedSubtotal = Math.max(0, voucherResult.totalAmount - billDiscountAmount);
        const alcoholGross = items
            .filter(item => /beer|wine|cocktail|alcohol|spirit/i.test(item.product?.category?.name || ''))
            .reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
        const alcoholShare = voucherResult.subtotal > 0 ? alcoholGross / voucherResult.subtotal : 0;
        const alcoholTaxBase = discountedSubtotal * alcoholShare;
        const foodTaxBase = discountedSubtotal - alcoholTaxBase;
        const foodVatAmount = businessDay.foodVatActive ? Math.round(foodTaxBase * Number(businessDay.foodVatRate || 0) / 100) : 0;
        const alcoholVatAmount = businessDay.alcoholVatActive ? Math.round(alcoholTaxBase * Number(businessDay.alcoholVatRate || 0) / 100) : 0;
        const serviceChargeAmount = businessDay.serviceChargeActive ? Math.round(discountedSubtotal * Number(businessDay.serviceChargeRate || 0) / 100) : 0;
        const totalBill = discountedSubtotal + foodVatAmount + alcoholVatAmount + serviceChargeAmount;
        const isCash = paymentMethod === 'Cash';
        const changeDue = isCash ? cashReceived - totalBill : 0;
        if (isCash && (!Number.isFinite(cashReceived) || cashReceived < totalBill)) {
            throw Object.assign(new Error('Cash received is less than the amount due'), { status: 400 });
        }
        if (isCash) {
            const movements = await CashMovement.findAll({
                where: { businessDayId: businessDay.id },
                attributes: ['type', 'amount'],
                transaction,
                raw: true
            });
            const cashIn = movements.filter(item => item.type === 'in').reduce((sum, item) => sum + Number(item.amount), 0);
            const cashOut = movements.filter(item => item.type === 'out').reduce((sum, item) => sum + Number(item.amount), 0);
            const availableDrawerCash = Number(businessDay.openingCash || 0) + Number(businessDay.cashSales || 0) + cashIn - cashOut;
            if (changeDue > availableDrawerCash) {
                throw Object.assign(new Error(`Not enough cash in drawer for change. Available: ${availableDrawerCash}, change required: ${changeDue}`), { status: 409 });
            }
        }

        await Order.update(
            { status: 'Paid', paidBy: req.user.id },
            { where: { id: { [Op.in]: orderIds }, status: { [Op.in]: ['Pending', 'Order'] } }, transaction }
        );
        table.status = 'CustomerPaid';
        table.qrSessionActive = false;
        table.qrSessionVersion = Number(table.qrSessionVersion || 0) + 1;
        table.qrSessionOpenedAt = null;
        await table.save({ transaction });
        if (isCash) {
            businessDay.cashSales = Number(businessDay.cashSales || 0) + totalBill;
            await businessDay.save({ transaction });
        }
        if (voucherResult.voucher) {
            voucherResult.voucher.usedCount = Number(voucherResult.voucher.usedCount) + 1;
            await voucherResult.voucher.save({ transaction });
        }

        const receipt = await Receipt.create({
            // Keep the temporary unique value within Receipt.receiptNumber VARCHAR(32).
            // It is replaced with the human-readable number immediately after INSERT.
            receiptNumber: `TMP-${crypto.randomBytes(12).toString('hex')}`,
            businessDayId: businessDay.id,
            tableId: table.id,
            tableName: table.name,
            subtotal: voucherResult.subtotal,
            discountAmount: voucherResult.discountAmount + billDiscountAmount,
            totalAmount: totalBill,
            paymentMethod,
            cashReceived: isCash ? cashReceived : null,
            changeDue: isCash ? changeDue : null,
            voucherCode: voucherResult.voucher?.code || null,
            billDiscountPercent,
            billDiscountAmount,
            billDiscountReason: billDiscountPercent ? billDiscountReason : null,
            foodVatAmount,
            alcoholVatAmount,
            serviceChargeAmount,
            serviceChargeName: serviceChargeAmount ? businessDay.serviceChargeName : null,
            paidBy: req.user.id,
            paidAt: new Date()
        }, { transaction });
        const datePart = String(businessDay.businessDate).replace(/-/g, '');
        receipt.receiptNumber = `ML-${datePart}-${String(receipt.id).padStart(6, '0')}`;
        await receipt.save({ transaction });
        await ReceiptItem.bulkCreate(items.map(item => ({
            receiptId: receipt.id,
            orderId: item.orderId,
            productId: item.productId,
            productName: item.product?.displayName || item.product?.name || `Product ${item.productId}`,
            quantity: item.quantity,
            unitPrice: item.price,
            lineTotal: Number(item.price) * Number(item.quantity),
            note: item.note || null
        })), { transaction });
        paymentResult = {
            receiptId: receipt.id,
            receiptNumber: receipt.receiptNumber,
            totalBill,
            subtotal: voucherResult.subtotal,
            discountAmount: voucherResult.discountAmount + billDiscountAmount,
            voucherDiscountAmount: voucherResult.discountAmount,
            billDiscountPercent,
            billDiscountAmount,
            billDiscountReason: billDiscountPercent ? billDiscountReason : null,
            foodVatAmount,
            alcoholVatAmount,
            serviceChargeAmount,
            serviceChargeName: serviceChargeAmount ? businessDay.serviceChargeName : null,
            voucherCode: normalizeCode(req.body?.voucherCode) || null,
            changeDue: isCash ? changeDue : 0,
            ordersCount: orders.length,
            tableName: table.name
        };
    });

    req.io.emit('payment_completed', {
        tableId: tableId,
        totalBill: paymentResult.totalBill,
        receiptNumber: paymentResult.receiptNumber,
        paymentMethod: paymentMethod,
        timestamp: new Date()
    });
    req.io.emit('table_status_update', {
        tableId: tableId,
        status: 'CustomerPaid'
    });

    res.status(200).json({
        success: true,
        message: 'Bill paid successfully',
        tableId: tableId,
        ...paymentResult,
        paymentMethod
    });
};

const checkBillByTable = async (req, res, next) => {
    const { tableId } = req.params;

    const table = await Table.findByPk(tableId);
    if (!table) {
        const err = new Error('Table not found');
        err.status = 404;
        return next(err);
    }

    const orders = await Order.findAll({
        where: {
            tableId: tableId,
            status: ['Pending', 'Order']
        },
        include: [
            {
                model: OrderItem,
                as: 'items',
                include: [{ model: Product, as: 'product' }]
            }
        ]
    });

    if (orders.length === 0) {
        const err = new Error('No orders for this table');
        err.status = 400;
        return next(err);
    }

    let totalBill = 0;
    orders.forEach(order => {
        totalBill += order.totalPrice;
    });

    await Table.update({ status: 'BillCheck' }, { where: { id: tableId } });

    req.io.emit('bill_request', {
        tableId: tableId,
        tableName: table.name || `Table ${tableId}`,
        totalAmount: totalBill
    });
    req.io.emit('table_status_update', {
        tableId: tableId,
        status: 'BillCheck'
    });
    
    res.status(200).json({
        success: true,
        message: 'Bill details retrieved',
        tableId: tableId,
        totalBill: totalBill,
        ordersCount: orders.length,
        orders: orders
    });
};

const updateOrderItemStatus = async (req, res, next) => {
    const { itemId } = req.params;
    const { status, note } = req.body;
    
    const validStatus = ['Pending', 'Fired', 'Cooking', 'Ready', 'Pickup', 'Served', 'Cancelled', 'Remake', 'Fail'];
    if (!validStatus.includes(status)) {
        const err = new Error('Invalid status');
        err.status = 400;
        return next(err);
    }

    const orderItem = await OrderItem.findByPk(itemId, {
        include: [
            { 
                model: Order, 
                as: 'order',
                include: [{ model: Table, as: 'table' }] 
            },
            { model: Product, as: 'product' }
        ]
    });

    if (!orderItem) {
        const err = new Error('Item not found');
        err.status = 404;
        return next(err);
    }

    orderItem.status = status;
    if (note) orderItem.note = note;
    await orderItem.save();

    const payload = {
        orderId: orderItem.orderId,
        itemId: orderItem.id,
        tableId: orderItem.order.tableId,
        tableName: orderItem.order.table ? orderItem.order.table.name : 'Unknown',
        productName: orderItem.product.name,
        status: status,
        note: note || '',
        updatedAt: new Date()
    };

    req.io.emit('order_item_updated', payload);

    res.status(200).json({ 
        success: true,
        message: 'Status updated', 
        data: payload 
    });
};

const cancelOrderItem = async (req, res, next) => {
    const { itemId } = req.params;
    const { approvedBy, reason } = req.body;
    if (!approvedBy || !String(reason || '').trim()) {
        const err = new Error('Supervisor approval and cancellation reason are required');
        err.status = 400;
        return next(err);
    }
    let cancelledItem;
    await sequelize.transaction(async transaction => {
        cancelledItem = await OrderItem.findByPk(itemId, {
            include: [{ model: Product, as: 'product' }],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!cancelledItem || cancelledItem.status === 'Cancelled') {
            const err = new Error('Order item is missing or already cancelled');
            err.status = 409;
            throw err;
        }
        cancelledItem.status = 'Cancelled';
        cancelledItem.cancelledBy = req.user.id;
        cancelledItem.cancellationApprovedBy = approvedBy;
        cancelledItem.cancellationReason = String(reason).trim();
        cancelledItem.cancelledAt = new Date();
        await cancelledItem.save({ transaction });
        const order = await Order.findByPk(cancelledItem.orderId, { transaction, lock: transaction.LOCK.UPDATE });
        order.totalPrice = Math.max(0, Number(order.totalPrice) - Number(cancelledItem.price) * cancelledItem.quantity);
        await order.save({ transaction });
        if (cancelledItem.product?.remainingQty != null) {
            cancelledItem.product.remainingQty += cancelledItem.quantity;
            cancelledItem.product.status = 'In Stock';
            await cancelledItem.product.save({ transaction });
        }
        const recipe = await ProductIngredient.findAll({ where: { productId: cancelledItem.productId }, transaction });
        for (const component of recipe) {
            const ingredient = await Ingredient.findByPk(component.ingredientId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            const restored = Number(component.quantityPerServing) * cancelledItem.quantity;
            const before = Number(ingredient.quantity);
            ingredient.quantity = before + restored;
            await ingredient.save({ transaction });
            await InventoryMovement.create({
                ingredientId: ingredient.id,
                type: 'in',
                quantity: restored,
                beforeQuantity: before,
                afterQuantity: ingredient.quantity,
                reason: `Cancelled item: ${cancelledItem.product.displayName || cancelledItem.product.name}`,
                performedBy: req.user.id,
                businessDayId: order.businessDayId || null
            }, { transaction });
        }
    });
    req.io.emit('order_item_updated', { itemId: cancelledItem.id, status: 'Cancelled', tableRefresh: true });
    res.status(200).json({ success: true, message: 'Order item cancelled', data: cancelledItem });
};

module.exports = {
    createOrder,
    getAllOrders,
    getCustomerOrder,
    payBillByTable,
    checkBillByTable,
    setBillAdjustments,
    updateOrderItemStatus,
    cancelOrderItem
};
