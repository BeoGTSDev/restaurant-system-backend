const { Order, OrderItem, Product, Table, sequelize } = require('../models');
const { resetExpiredDailyAvailability } = require('../utils/productAvailability');

const createOrder = async (req, res, next) => {
    const { tableId, items } = req.body;
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
            additionalPrice += product.price * quantity;
            orderItemsData.push({
                productId: item.productId,
                quantity,
                price: product.price,
                note: item.note || null
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
            order = await Order.create({
                tableId,
                totalPrice: additionalPrice,
                status: 'Pending'
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

const payBillByTable = async (req, res, next) => {
    const { tableId } = req.params;
    const paymentMethod = req.body?.paymentMethod || 'Cash';

    const table = await Table.findByPk(tableId);
    if (!table) {
        const err = new Error('Table not found');
        err.status = 404;
        return next(err);
    }

    // Get all unpaid orders of the table
    const orders = await Order.findAll({
        where: {
            tableId: tableId,
            status: ['Pending', 'Order']
        }
    });

    if (orders.length === 0) {
        const err = new Error('No orders to pay for this table');
        err.status = 400;
        return next(err);
    }

    let totalBill = 0;
    orders.forEach(order => {
        totalBill += order.totalPrice;
    });

    await Order.update(
        { status: 'Paid' },
        { where: { tableId: tableId, status: ['Pending', 'Order'] } }
    );

    await Table.update({ status: 'CustomerPaid' }, { where: { id: tableId } });

    req.io.emit('payment_completed', {
        tableId: tableId,
        totalBill: totalBill,
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
        totalBill: totalBill,
        ordersCount: orders.length,
        paymentMethod: paymentMethod || 'Cash'
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
    
    const validStatus = ['Pending', 'Fired', 'Cooking', 'Ready', 'Served', 'Cancelled', 'Remake', 'Fail'];
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

module.exports = { createOrder, getAllOrders, payBillByTable, checkBillByTable, updateOrderItemStatus };
