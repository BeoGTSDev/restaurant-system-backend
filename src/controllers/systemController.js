const { Op } = require('sequelize');
const {
    sequelize, BusinessDay, CashMovement, ShiftRecord, Order, Product, Table
} = require('../models');
const { getBusinessDate } = require('../utils/productAvailability');

const parseCash = (value, label) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        const err = new Error(`${label} must be a non-negative number`);
        err.status = 400;
        throw err;
    }
    return amount;
};

const cashSummary = async (businessDay) => {
    if (!businessDay) return null;
    const movements = await CashMovement.findAll({
        where: { businessDayId: businessDay.id },
        order: [['createdAt', 'DESC']]
    });
    const cashIn = movements.filter(m => m.type === 'in').reduce((s, m) => s + Number(m.amount), 0);
    const cashOut = movements.filter(m => m.type === 'out').reduce((s, m) => s + Number(m.amount), 0);
    const cashSales = Number(businessDay.cashSales || 0);
    return {
        openingCash: Number(businessDay.openingCash || 0),
        cashSales,
        cashIn,
        cashOut,
        expectedCash: Number(businessDay.openingCash || 0) + cashSales + cashIn - cashOut,
        movements
    };
};

const getBusinessDay = async (req, res) => {
    const current = await BusinessDay.findOne({
        where: { status: 'open' },
        order: [['startedAt', 'DESC']]
    });
    res.status(200).json({
        success: true,
        data: current,
        summary: await cashSummary(current),
        calendarDate: getBusinessDate()
    });
};

const startNewBusinessDay = async (req, res, next) => {
    const existing = await BusinessDay.findOne({ where: { status: 'open' } });
    if (existing) {
        const err = new Error('A business day is already open');
        err.status = 409;
        return next(err);
    }
    const [activeOrderCount, openShiftCount] = await Promise.all([
        Order.count({ where: { status: { [Op.in]: ['Pending', 'Order'] } } }),
        ShiftRecord.count({ where: { status: 'open' } })
    ]);
    if (activeOrderCount || openShiftCount) {
        const err = new Error(`Cannot open: ${activeOrderCount} active order(s) and ${openShiftCount} open shift(s) remain from the previous day`);
        err.status = 409;
        return next(err);
    }

    const openingCash = parseCash(req.body?.openingCash, 'Opening cash');
    const businessDate = req.body?.businessDate || getBusinessDate();
    let businessDay;
    await sequelize.transaction(async (transaction) => {
        await Product.update(
            { status: 'In Stock', remainingQty: null, availabilityDate: null },
            { where: { availabilityDate: { [Op.not]: null }, status: { [Op.ne]: 'Disabled' } }, transaction }
        );
        await Table.update(
            { status: 'Ready', guestCount: null, nationality: null, specialNote: null },
            { where: {}, transaction }
        );
        businessDay = await BusinessDay.create({
            businessDate,
            status: 'open',
            startedBy: req.user.id,
            startedAt: new Date(),
            openingCash,
            openingDenominations: req.body?.denominations || null,
            note: req.body?.note || null
        }, { transaction });
    });

    req.io.emit('business_day_started', { id: businessDay.id, businessDate });
    req.io.emit('table_status_update', { resetAll: true, status: 'Ready' });
    req.io.emit('product_availability_reset', { businessDate });
    res.status(201).json({ success: true, message: 'Business day opened', data: businessDay });
};

const createCashMovement = async (req, res, next) => {
    const businessDay = await BusinessDay.findOne({ where: { status: 'open' } });
    if (!businessDay) {
        const err = new Error('Open the business day first');
        err.status = 423;
        return next(err);
    }
    if (!['in', 'out'].includes(req.body?.type)) {
        const err = new Error('Cash movement type must be in or out');
        err.status = 400;
        return next(err);
    }
    const amount = parseCash(req.body?.amount, 'Amount');
    if (amount === 0 || !String(req.body?.reason || '').trim()) {
        const err = new Error('A positive amount and reason are required');
        err.status = 400;
        return next(err);
    }
    const movement = await CashMovement.create({
        businessDayId: businessDay.id,
        type: req.body.type,
        amount,
        reason: String(req.body.reason).trim(),
        createdBy: req.user.id
    });
    res.status(201).json({ success: true, message: 'Cash movement recorded', data: movement, summary: await cashSummary(businessDay) });
};

const closeBusinessDay = async (req, res, next) => {
    const businessDay = await BusinessDay.findOne({ where: { status: 'open' } });
    if (!businessDay) {
        const err = new Error('No open business day');
        err.status = 409;
        return next(err);
    }
    const [activeOrders, openShifts] = await Promise.all([
        Order.count({ where: { status: { [Op.in]: ['Pending', 'Order'] } } }),
        ShiftRecord.count({ where: { status: 'open' } })
    ]);
    if (activeOrders || openShifts) {
        const err = new Error(`Cannot close: ${activeOrders} active order(s), ${openShifts} open shift(s)`);
        err.status = 409;
        return next(err);
    }
    const closingCash = parseCash(req.body?.closingCash, 'Closing cash');
    const summary = await cashSummary(businessDay);
    businessDay.closingCash = closingCash;
    businessDay.closingDenominations = req.body?.denominations || null;
    businessDay.expectedCash = summary.expectedCash;
    businessDay.difference = closingCash - summary.expectedCash;
    businessDay.status = 'closed';
    businessDay.closedAt = new Date();
    await businessDay.save();
    req.io.emit('business_day_closed', { id: businessDay.id });
    res.status(200).json({
        success: true,
        message: 'Business day closed',
        data: businessDay,
        summary: { ...summary, closingCash, difference: closingCash - summary.expectedCash }
    });
};

const resetTestEnvironment = async (req, res) => {
    const resetAt = new Date();
    let cancelledOrders = 0;
    let closedShifts = 0;

    await sequelize.transaction(async (transaction) => {
        const [orderCount] = await Order.update(
            { status: 'Cancelled' },
            {
                where: { status: { [Op.in]: ['Pending', 'Order'] } },
                transaction
            }
        );
        cancelledOrders = orderCount;

        const [shiftCount] = await ShiftRecord.update(
            {
                status: 'closed',
                cashOut: 0,
                totalRevenue: 0,
                expectedAmount: 0,
                discrepancy: 0,
                closedAt: resetAt,
                notes: 'Closed by test environment reset'
            },
            { where: { status: 'open' }, transaction }
        );
        closedShifts = shiftCount;

        await BusinessDay.update(
            {
                status: 'closed',
                closingCash: 0,
                expectedCash: 0,
                difference: 0,
                closedAt: resetAt,
                note: 'Closed by test environment reset'
            },
            { where: { status: 'open' }, transaction }
        );

        await Table.update(
            {
                status: 'Ready',
                guestCount: null,
                nationality: null,
                specialNote: null
            },
            { where: {}, transaction }
        );

        await Product.update(
            { status: 'In Stock', remainingQty: null, availabilityDate: null },
            {
                where: {
                    availabilityDate: { [Op.not]: null },
                    status: { [Op.ne]: 'Disabled' }
                },
                transaction
            }
        );
    });

    req.io.emit('test_environment_reset', { resetAt });
    req.io.emit('business_day_closed', { reset: true });
    req.io.emit('table_status_update', { resetAll: true, status: 'Ready' });
    req.io.emit('product_availability_reset', { reset: true });

    res.status(200).json({
        success: true,
        message: 'Test environment reset successfully',
        data: {
            cancelledOrders,
            closedShifts,
            tablesReset: true,
            dailyAvailabilityReset: true,
            masterDataPreserved: true
        }
    });
};

module.exports = {
    getBusinessDay,
    startNewBusinessDay,
    createCashMovement,
    closeBusinessDay,
    resetTestEnvironment
};
