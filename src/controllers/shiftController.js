const { ShiftRecord, Order, User } = require('../models');
const { sequelize } = require('../models');
const { Op } = require('sequelize');

const openShift = async (req, res, next) => {
    const { cashIn } = req.body;
    const cashierId = req.user.id;

    // Check if shift already open today
    const existingShift = await ShiftRecord.findOne({
        where: {
            cashierId,
            shiftDate: new Date().toISOString().split('T')[0],
            status: 'open'
        }
    });

    if (existingShift) {
        const err = new Error('Shift already opened today');
        err.status = 400;
        return next(err);
    }

    const newShift = await ShiftRecord.create({
        cashierId,
        shiftDate: new Date().toISOString().split('T')[0],
        cashIn: parseFloat(cashIn),
        status: 'open',
        openedAt: new Date()
    });

    res.status(201).json({
        success: true,
        message: 'Shift opened successfully',
        shift: {
            id: newShift.id,
            cashierId: newShift.cashierId,
            shiftDate: newShift.shiftDate,
            cashIn: newShift.cashIn,
            openedAt: newShift.openedAt
        }
    });
};

const closeShift = async (req, res, next) => {
    const { shiftId, cashOut, notes } = req.body;
    const cashierId = req.user.id;

    const shift = await ShiftRecord.findByPk(shiftId);
    if (!shift) {
        const err = new Error('Shift not found');
        err.status = 404;
        return next(err);
    }

    // Permission checks removed — allow closure (caller should reimplement permission logic later)

    if (shift.status === 'closed') {
        const err = new Error('Shift already closed');
        err.status = 400;
        return next(err);
    }

    // Calculate revenue for this shift
    const ordersForShift = await Order.findAll({
        where: {
            status: 'Paid',
            createdAt: {
                [Op.gte]: new Date(`${shift.shiftDate} 00:00:00`),
                [Op.lte]: new Date(`${shift.shiftDate} 23:59:59`)
            }
        },
        attributes: [
            [sequelize.fn('SUM', sequelize.col('totalPrice')), 'total']
        ],
        raw: true
    });

    const totalRevenue = parseFloat(ordersForShift[0]?.total || 0);
    const expectedAmount = parseFloat(shift.cashIn) + totalRevenue;
    const discrepancy = parseFloat(cashOut) - expectedAmount;

    shift.cashOut = parseFloat(cashOut);
    shift.totalRevenue = totalRevenue;
    shift.expectedAmount = expectedAmount;
    shift.discrepancy = discrepancy;
    shift.notes = notes || '';
    shift.status = 'closed';
    shift.closedAt = new Date();

    await shift.save();

    const discrepancyStatus = discrepancy === 0 ? 'EXACT' : discrepancy > 0 ? 'SURPLUS' : 'SHORTAGE';

    res.status(200).json({
        success: true,
        message: 'Shift closed successfully',
        shift: {
            id: shift.id,
            shiftDate: shift.shiftDate,
            cashIn: shift.cashIn,
            totalRevenue: shift.totalRevenue,
            expectedAmount: shift.expectedAmount,
            cashOut: shift.cashOut,
            discrepancy: shift.discrepancy,
            discrepancyStatus,
            discrepancyPercentage: expectedAmount > 0 ? 
                ((discrepancy / expectedAmount) * 100).toFixed(2) + '%' : '0%'
        }
    });
};

const getShiftReport = async (req, res, next) => {
    const { shiftId } = req.params;

    const shift = await ShiftRecord.findByPk(shiftId, {
        include: [{
            model: User,
            as: 'cashier',
            attributes: ['id', 'fullName', 'email']
        }]
    });

    if (!shift) {
        const err = new Error('Shift not found');
        err.status = 404;
        return next(err);
    }

    // Get all orders for this shift
    const orders = await Order.findAll({
        where: {
            status: 'Paid',
            createdAt: {
                [Op.gte]: new Date(`${shift.shiftDate} 00:00:00`),
                [Op.lte]: new Date(`${shift.shiftDate} 23:59:59`)
            }
        },
        attributes: ['id', 'tableId', 'totalPrice', 'createdAt'],
        order: [['createdAt', 'ASC']],
        raw: true
    });

    res.status(200).json({
        success: true,
        message: 'Shift report',
        shift: {
            id: shift.id,
            cashier: shift.cashier,
            shiftDate: shift.shiftDate,
            openedAt: shift.openedAt,
            closedAt: shift.closedAt,
            cashIn: shift.cashIn,
            totalRevenue: shift.totalRevenue,
            expectedAmount: shift.expectedAmount,
            cashOut: shift.cashOut,
            discrepancy: shift.discrepancy,
            discrepancyStatus: shift.discrepancy === 0 ? 'EXACT' : 
                              shift.discrepancy > 0 ? 'SURPLUS' : 'SHORTAGE',
            notes: shift.notes,
            status: shift.status
        },
        ordersSummary: {
            totalOrders: orders.length,
            totalAmount: orders.reduce((sum, o) => sum + parseFloat(o.totalPrice), 0)
        },
        orders: orders
    });
};

const getAllShifts = async (req, res, next) => {
    const { startDate, endDate, cashierId, status } = req.query;

    const whereClause = {};
    if (cashierId) whereClause.cashierId = cashierId;
    if (status) whereClause.status = status;
    if (startDate || endDate) {
        whereClause.shiftDate = {};
        if (startDate) whereClause.shiftDate[Op.gte] = startDate;
        if (endDate) whereClause.shiftDate[Op.lte] = endDate;
    }

    const shifts = await ShiftRecord.findAll({
        where: whereClause,
        include: [{
            model: User,
            as: 'cashier',
            attributes: ['id', 'fullName', 'email']
        }],
        order: [['shiftDate', 'DESC'], ['id', 'DESC']],
        raw: false
    });

    res.status(200).json({
        success: true,
        message: 'Shifts retrieved successfully',
        total: shifts.length,
        data: shifts
    });
};

module.exports = { openShift, closeShift, getShiftReport, getAllShifts };
