const { Op } = require('sequelize');
const {
    sequelize,
    BusinessDay,
    ShiftRecord,
    Order,
    Product,
    Table
} = require('../models');
const { getBusinessDate } = require('../utils/productAvailability');

const getBusinessDay = async (req, res) => {
    const current = await BusinessDay.findOne({
        where: { status: 'open' },
        order: [['startedAt', 'DESC']]
    });

    res.status(200).json({
        success: true,
        data: current,
        calendarDate: getBusinessDate()
    });
};

const startNewBusinessDay = async (req, res, next) => {
    const openShiftCount = await ShiftRecord.count({ where: { status: 'open' } });
    const activeOrderCount = await Order.count({
        where: { status: { [Op.in]: ['Pending', 'Order'] } }
    });

    if (openShiftCount > 0 || activeOrderCount > 0) {
        const details = [];
        if (openShiftCount) details.push(`${openShiftCount} open shift(s)`);
        if (activeOrderCount) details.push(`${activeOrderCount} active order(s)`);
        const err = new Error(`Cannot start a new business day: close ${details.join(' and ')} first`);
        err.status = 409;
        return next(err);
    }

    const businessDate = getBusinessDate();
    let businessDay;

    await sequelize.transaction(async (transaction) => {
        await BusinessDay.update(
            { status: 'closed', closedAt: new Date() },
            { where: { status: 'open' }, transaction }
        );

        // Only availability configured for a specific day is reset. Permanently
        // disabled products remain disabled.
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

        await Table.update(
            {
                status: 'Ready',
                guestCount: null,
                nationality: null,
                specialNote: null
            },
            { where: {}, transaction }
        );

        businessDay = await BusinessDay.create({
            businessDate,
            status: 'open',
            startedBy: req.user.id,
            startedAt: new Date(),
            note: req.body?.note || null
        }, { transaction });
    });

    req.io.emit('business_day_started', {
        id: businessDay.id,
        businessDate,
        startedAt: businessDay.startedAt
    });
    req.io.emit('table_status_update', { resetAll: true, status: 'Ready' });
    req.io.emit('product_availability_reset', { businessDate });

    res.status(201).json({
        success: true,
        message: 'New business day started successfully',
        data: businessDay
    });
};

module.exports = { getBusinessDay, startNewBusinessDay };
