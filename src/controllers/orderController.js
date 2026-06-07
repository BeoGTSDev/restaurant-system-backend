const { Order, OrderItem, Product, Table, sequelize } = require('../models');

const createOrder = async (req, res, next) => {
    const { tableId, items } = req.body;

    const table = await Table.findByPk(tableId);
    if (!table) {
        const err = new Error('Table not found');
        err.status = 404;
        return next(err);
    }

    if (['BillCheck', 'CustomerPaid', 'Ready'].includes(table.status)) {
        const err = new Error('Cannot order! Table is checking out.');
        err.status = 400;
        return next(err);
    }

    if (table.status === 'Ready') {
        const err = new Error('Please escort guest (Open Table) first!');
        err.status = 400;
        return next(err);
    }

    let statusChanged = false;

    if (['Escort', 'OrderCheck'].includes(table.status)) {
        table.status = 'Order';
        await table.save();
        statusChanged = true;
    }

    let additionalPrice = 0;
    let orderItemsData = [];
    let itemDetailsForSocket = [];

    for (const item of items) {
        const product = await Product.findByPk(item.productId);
        if (!product) {
            const err = new Error(`Product ID ${item.productId} not found`);
            err.status = 404;
            return next(err);
        }
        additionalPrice += product.price * item.quantity;

        orderItemsData.push({
            productId: item.productId,
            quantity: item.quantity,
            price: product.price
        });

        itemDetailsForSocket.push({
            productName: product.name,
            quantity: item.quantity,
            image: product.image
        });
    }

    let order = await Order.findOne({
        where: {
            tableId: tableId,
            status: 'Order'
        }
    });

    if (order) {
        order.totalPrice += additionalPrice;
        await order.save();
    } else {
        order = await Order.create({
            tableId,
            totalPrice: additionalPrice, 
            status: 'Pending'
        });
    }

    const itemsWithOrderId = orderItemsData.map(item => ({
        ...item,
        orderId: order.id
    }));

    await OrderItem.bulkCreate(itemsWithOrderId);

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