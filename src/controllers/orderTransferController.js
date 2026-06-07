const { Order, OrderItem, Table, OrderTransfer, sequelize } = require('../models');
const { Op } = require('sequelize');

const transferItems = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const { orderId } = req.params;
        const { orderItemIds, targetTableId, reason } = req.body;
        const transferredBy = req.user?.id;

        // Validate inputs
        if (!Array.isArray(orderItemIds) || orderItemIds.length === 0) {
            await transaction.rollback();
            const err = new Error('orderItemIds must be a non-empty array');
            err.status = 400;
            return next(err);
        }

        if (!targetTableId) {
            await transaction.rollback();
            const err = new Error('targetTableId is required');
            err.status = 400;
            return next(err);
        }

        // Fetch original order
        const originalOrder = await Order.findByPk(orderId, { transaction });
        if (!originalOrder) {
            await transaction.rollback();
            const err = new Error('Original order not found');
            err.status = 404;
            return next(err);
        }

        // Fetch target table
        const targetTable = await Table.findByPk(targetTableId, { transaction });
        if (!targetTable) {
            await transaction.rollback();
            const err = new Error('Target table not found');
            err.status = 404;
            return next(err);
        }

        // Fetch all order items to transfer
        const itemsToTransfer = await OrderItem.findAll({
            where: {
                id: { [Op.in]: orderItemIds },
                orderId: orderId
            },
            transaction
        });

        if (itemsToTransfer.length !== orderItemIds.length) {
            await transaction.rollback();
            const err = new Error('Some order items not found or do not belong to this order');
            err.status = 400;
            return next(err);
        }

        // Calculate transferred amount
        const transferredAmount = itemsToTransfer.reduce((sum, item) => 
            sum + (parseFloat(item.price) * item.quantity), 0
        );

        // Create new order for target table
        const newOrder = await Order.create({
            tableId: targetTableId,
            totalPrice: transferredAmount,
            status: 'Pending'
        }, { transaction });

        // Move items to new order
        await OrderItem.update(
            { orderId: newOrder.id },
            {
                where: { id: { [Op.in]: orderItemIds } },
                transaction
            }
        );

        // Recalculate original order total
        const remainingItems = await OrderItem.findAll({
            where: { orderId: orderId },
            transaction
        });

        const newOriginalTotal = remainingItems.reduce((sum, item) => 
            sum + (parseFloat(item.price) * item.quantity), 0
        );

        await originalOrder.update(
            { totalPrice: newOriginalTotal },
            { transaction }
        );

        // If original order has no items left, mark as cancelled
        if (remainingItems.length === 0) {
            await originalOrder.update(
                { status: 'Cancelled' },
                { transaction }
            );
        }

        // Create OrderTransfer record (audit trail)
        const orderTransfer = await OrderTransfer.create({
            originalOrderId: orderId,
            newOrderId: newOrder.id,
            transferredItemCount: itemsToTransfer.length,
            transferredAmount: transferredAmount,
            transferredBy: transferredBy,
            itemIds: orderItemIds,
            reason: reason || 'Customer split payment preference'
        }, { transaction });

        await transaction.commit();

        // Emit Socket.io events
        if (req.io) {
            req.io.emit('order:items-transferred', {
                originalOrderId: orderId,
                newOrderId: newOrder.id,
                transferredItemCount: itemsToTransfer.length,
                originalTableId: originalOrder.tableId,
                newTableId: targetTableId,
                timestamp: new Date()
            });

            req.io.emit('order:created', {
                orderId: newOrder.id,
                tableId: targetTableId,
                totalPrice: transferredAmount,
                itemCount: itemsToTransfer.length,
                timestamp: new Date()
            });
        }

        res.status(200).json({
            success: true,
            message: 'Items transferred successfully',
            transfer: {
                transferId: orderTransfer.id,
                originalOrder: {
                    id: originalOrder.id,
                    tableId: originalOrder.tableId,
                    newTotal: newOriginalTotal,
                    itemsRemaining: remainingItems.length,
                    status: remainingItems.length === 0 ? 'Cancelled' : originalOrder.status
                },
                newOrder: {
                    id: newOrder.id,
                    tableId: targetTableId,
                    total: transferredAmount,
                    itemCount: itemsToTransfer.length,
                    status: 'Pending'
                },
                itemsTransferred: itemsToTransfer.map(item => ({
                    id: item.id,
                    productId: item.productId,
                    quantity: item.quantity,
                    price: item.price
                }))
            }
        });

    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

const getTransferHistory = async (req, res, next) => {
    const { orderId } = req.params;

    const transfers = await OrderTransfer.findAll({
        where: {
            [Op.or]: [
                { originalOrderId: orderId },
                { newOrderId: orderId }
            ]
        },
        include: [
            {
                model: Order,
                as: 'originalOrder',
                attributes: ['id', 'tableId', 'totalPrice', 'status']
            },
            {
                model: Order,
                as: 'newOrder',
                attributes: ['id', 'tableId', 'totalPrice', 'status']
            }
        ],
        order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
        success: true,
        message: 'Transfer history retrieved',
        total: transfers.length,
        data: transfers
    });
};

const reverseTransfer = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const { transferId } = req.params;

        const transfer = await OrderTransfer.findByPk(transferId, { transaction });
        if (!transfer) {
            await transaction.rollback();
            const err = new Error('Transfer not found');
            err.status = 404;
            return next(err);
        }

        if (transfer.status === 'reversed') {
            await transaction.rollback();
            const err = new Error('Transfer already reversed');
            err.status = 400;
            return next(err);
        }

        // Get original and new orders
        const originalOrder = await Order.findByPk(transfer.originalOrderId, { transaction });
        const newOrder = await Order.findByPk(transfer.newOrderId, { transaction });

        if (!originalOrder || !newOrder) {
            await transaction.rollback();
            const err = new Error('Associated orders not found');
            err.status = 404;
            return next(err);
        }

        // Move items back to original order
        await OrderItem.update(
            { orderId: transfer.originalOrderId },
            {
                where: { id: { [Op.in]: transfer.itemIds } },
                transaction
            }
        );

        // Recalculate totals
        const allOriginalItems = await OrderItem.findAll({
            where: { orderId: transfer.originalOrderId },
            transaction
        });

        const newOriginalTotal = allOriginalItems.reduce((sum, item) => 
            sum + (parseFloat(item.price) * item.quantity), 0
        );

        await originalOrder.update(
            { 
                totalPrice: newOriginalTotal,
                status: 'Pending'
            },
            { transaction }
        );

        // Delete new order if now empty
        const remainingNewItems = await OrderItem.findAll({
            where: { orderId: transfer.newOrderId },
            transaction
        });

        if (remainingNewItems.length === 0) {
            await newOrder.destroy({ transaction });
        }

        // Mark transfer as reversed
        await transfer.update(
            { status: 'reversed' },
            { transaction }
        );

        await transaction.commit();

        if (req.io) {
            req.io.emit('order:transfer-reversed', {
                transferId: transferId,
                originalOrderId: transfer.originalOrderId,
                newOrderId: transfer.newOrderId,
                timestamp: new Date()
            });
        }

        res.status(200).json({
            success: true,
            message: 'Transfer reversed successfully',
            originalOrder: {
                id: originalOrder.id,
                tableId: originalOrder.tableId,
                totalPrice: newOriginalTotal,
                status: 'Pending'
            }
        });

    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};



const getAllTransfers = async (req, res, next) => {
    const transfers = await OrderTransfer.findAll({
        include: [
            {
                model: Order,
                as: 'originalOrder',
                attributes: ['id', 'tableId', 'totalPrice', 'status']
            },
            {
                model: Order,
                as: 'newOrder',
                attributes: ['id', 'tableId', 'totalPrice', 'status']
            }
        ],
        order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, message: 'All transfers', total: transfers.length, data: transfers });
};

module.exports = { transferItems, getTransferHistory, reverseTransfer, getAllTransfers };
