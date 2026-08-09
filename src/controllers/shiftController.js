// Controller file: receives request data, applies shiftController rules, and returns JSON.
const { ShiftRecord, ShiftAreaConfig, Order, User, BusinessDay, Zone, Receipt } = require('../models');
const { sequelize } = require('../models');
const { Op } = require('sequelize');

// HTTP handler: creates or starts open shift. It reads req data, uses models/services, and sends JSON with res.
const openShift = async (req, res, next) => {
    const { staffId, shiftName, position, area, notes, assignmentId } = req.body;
    const cashierId = Number(staffId || req.user.id);
    const businessDay = await BusinessDay.findOne({ where: { status: 'open' } });
    if (!businessDay) {
        const err = new Error('Open the business day before starting staff shifts');
        err.status = 423;
        return next(err);
    }
    const staff = await User.findByPk(cashierId);
    if (!staff || !staff.isActive) {
        const err = new Error('Active staff member not found');
        err.status = 404;
        return next(err);
    }

    // One assignment per staff, business day and service period. Reassigning
    // position or area updates the roster rather than creating clock events.
    const existingShift = assignmentId
      ? await ShiftRecord.findByPk(assignmentId)
      : await ShiftRecord.findOne({
        where: {
            cashierId,
            businessDayId: businessDay.id,
            shiftName: shiftName || 'Morning'
        }
      });

    if (existingShift) {
        const duplicate = await ShiftRecord.findOne({
            where: {
                id: { [Op.ne]: existingShift.id },
                cashierId,
                businessDayId: businessDay.id,
                shiftName: shiftName || 'Morning'
            }
        });
        if (duplicate) return next(Object.assign(new Error('This staff member is already assigned to that shift'), { status: 409 }));
        await existingShift.update({
            cashierId,
            shiftName: shiftName || existingShift.shiftName,
            position: position || null,
            area: area || null,
            notes: notes || null,
            status: 'open'
        });
        return res.status(200).json({ success: true, message: 'Roster assignment updated', shift: existingShift });
    }

    const newShift = await ShiftRecord.create({
        cashierId,
        businessDayId: businessDay.id,
        shiftDate: businessDay.businessDate,
        shiftName: shiftName || 'General',
        position: position || null,
        area: area || null,
        notes: notes || null,
        cashIn: 0,
        status: 'open',
        openedAt: new Date()
    });

    res.status(201).json({
        success: true,
        message: 'Roster assignment created',
        shift: {
            id: newShift.id,
            cashierId: newShift.cashierId,
            shiftDate: newShift.shiftDate,
            staff: { id: staff.id, fullName: staff.fullName },
            shiftName: newShift.shiftName,
            position: newShift.position,
            area: newShift.area,
            openedAt: newShift.openedAt
        }
    });
};

// HTTP handler: loads get current roster data. It reads req data, uses models/services, and sends JSON with res.
const getCurrentRoster = async (req, res, next) => {
    const businessDay = await BusinessDay.findOne({ where: { status: 'open' } });
    if (!businessDay) return res.json({ success: true, data: { businessDay: null, assignments: [], areas: [] } });
    await ShiftRecord.update(
        { shiftName: 'Mid' },
        { where: { businessDayId: businessDay.id, shiftName: 'Afternoon' } }
    );
    const [assignments, areas, zones] = await Promise.all([
        ShiftRecord.findAll({
            where: { businessDayId: businessDay.id, status: 'open' },
            include: [{ model: User, as: 'cashier', attributes: ['id', 'fullName', 'staffCode'] }],
            order: [['shiftName', 'ASC'], ['area', 'ASC'], ['position', 'ASC']]
        }),
        ShiftAreaConfig.findAll({ where: { businessDayId: businessDay.id } }),
        Zone.findAll({ order: [['id', 'ASC']] })
    ]);
    res.json({ success: true, data: { businessDay, assignments, areas, zones } });
};

// HTTP handler: changes and saves set area status. It reads req data, uses models/services, and sends JSON with res.
const setAreaStatus = async (req, res, next) => {
    const { shiftName, zoneId, isOpen } = req.body;
    const businessDay = await BusinessDay.findOne({ where: { status: 'open' } });
    if (!businessDay) return next(Object.assign(new Error('Open the business day before planning shifts'), { status: 423 }));
    const zone = await Zone.findByPk(zoneId);
    if (!zone) return next(Object.assign(new Error('Area not found'), { status: 404 }));
    const [config] = await ShiftAreaConfig.findOrCreate({
        where: { businessDayId: businessDay.id, shiftName, zoneId },
        defaults: { isOpen: Boolean(isOpen) }
    });
    if (config.isOpen !== Boolean(isOpen)) await config.update({ isOpen: Boolean(isOpen) });
    res.json({ success: true, data: config });
};

// HTTP handler: removes, closes, or resets remove assignment. It reads req data, uses models/services, and sends JSON with res.
const removeAssignment = async (req, res, next) => {
    const assignment = await ShiftRecord.findByPk(req.params.id);
    if (!assignment) return next(Object.assign(new Error('Roster assignment not found'), { status: 404 }));
    await assignment.destroy();
    res.json({ success: true, message: 'Staff removed from roster' });
};

// HTTP handler: changes and saves save roster. It reads req data, uses models/services, and sends JSON with res.
const saveRoster = async (req, res, next) => {
    const { shiftName, areas = [], assignments = [] } = req.body;
    if (!['Morning', 'Mid', 'Evening'].includes(shiftName)) {
        return next(Object.assign(new Error('Invalid shift period'), { status: 400 }));
    }
    const businessDay = await BusinessDay.findOne({ where: { status: 'open' } });
    if (!businessDay) return next(Object.assign(new Error('Open the business day before assigning the roster'), { status: 423 }));
    const staffIds = assignments.map(item => Number(item.staffId));
    if (new Set(staffIds).size !== staffIds.length) {
        return next(Object.assign(new Error('A staff member can only have one position in a shift'), { status: 409 }));
    }
    for (const item of assignments) {
        const allowed = item.area === 'Reception'
            ? ['Cashier', 'Receptionist']
            : ['Area Manager', 'Floor Staff'];
        if (!allowed.includes(item.position)) {
            return next(Object.assign(new Error(`Invalid position for ${item.area}`), { status: 400 }));
        }
    }
    if (!assignments.some(item => item.area === 'Reception' && item.position === 'Receptionist')) {
        return next(Object.assign(new Error('Reception requires a Receptionist'), { status: 400 }));
    }
    const openZoneIds = areas.filter(area => area.isOpen).map(area => Number(area.zoneId));
    const openZones = await Zone.findAll({ where: { id: { [Op.in]: openZoneIds } } });
    const missingManager = openZones.find(zone => !assignments.some(item => item.area === zone.name && item.position === 'Area Manager'));
    if (missingManager) {
        return next(Object.assign(new Error(`${missingManager.name} requires an Area Manager`), { status: 400 }));
    }
    await sequelize.transaction(async transaction => {
        await ShiftRecord.destroy({
            where: { businessDayId: businessDay.id, shiftName, status: 'open' },
            transaction
        });
        if (assignments.length) {
            await ShiftRecord.bulkCreate(assignments.map(item => ({
                cashierId: Number(item.staffId),
                businessDayId: businessDay.id,
                shiftDate: businessDay.businessDate,
                shiftName,
                position: item.position,
                area: item.area,
                notes: item.notes || null,
                status: 'open',
                openedAt: new Date()
            })), { transaction });
        }
        for (const area of areas) {
            await ShiftAreaConfig.upsert({
                businessDayId: businessDay.id,
                shiftName,
                zoneId: Number(area.zoneId),
                isOpen: Boolean(area.isOpen)
            }, { transaction });
        }
    });
    res.json({ success: true, message: `${shiftName} roster assigned` });
};

// HTTP handler: removes, closes, or resets close shift. It reads req data, uses models/services, and sends JSON with res.
const closeShift = async (req, res, next) => {
    const { shiftId, notes } = req.body;

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

    // Attribute settled revenue to the staff account that processed payment,
    // within this deployment window and business day.
    const paidAt = { [Op.gte]: shift.openedAt || shift.createdAt };
    if (shift.closedAt) paidAt[Op.lte] = shift.closedAt;
    const totalRevenue = Number(await Receipt.sum('totalAmount', {
        where: {
            businessDayId: shift.businessDayId,
            paidBy: shift.cashierId,
            paidAt
        }
    }) || 0);
    shift.totalRevenue = totalRevenue;
    shift.notes = notes || '';
    shift.status = 'closed';
    shift.closedAt = new Date();

    await shift.save();

    res.status(200).json({
        success: true,
        message: 'Shift closed successfully',
        shift: {
            id: shift.id,
            shiftDate: shift.shiftDate,
            totalRevenue: shift.totalRevenue,
            workedMinutes: Math.max(0, Math.round((shift.closedAt - shift.openedAt) / 60000)),
            status: shift.status
        }
    });
};

// HTTP handler: loads get shift report data. It reads req data, uses models/services, and sends JSON with res.
const getShiftReport = async (req, res, next) => {
    const { shiftId } = req.params;

    const shift = await ShiftRecord.findByPk(shiftId, {
        include: [{
            model: User,
            as: 'cashier',
            attributes: ['id', 'fullName', 'email']
        }, {
            model: BusinessDay,
            as: 'businessDay',
            attributes: ['id', 'businessDate', 'status']
        }]
    });

    if (!shift) {
        const err = new Error('Shift not found');
        err.status = 404;
        return next(err);
    }

    const receiptWhere = {
        businessDayId: shift.businessDayId,
        paidBy: shift.cashierId,
        paidAt: { [Op.gte]: shift.openedAt || shift.createdAt }
    };
    if (shift.closedAt) receiptWhere.paidAt[Op.lte] = shift.closedAt;
    const receipts = await Receipt.findAll({
        where: receiptWhere,
        order: [['paidAt', 'ASC']]
    });

    // Order activity is kept separately from settled revenue. It is filtered
    // by the same business day and the account that created the order.
    const orders = await Order.findAll({
        where: {
            businessDayId: shift.businessDayId,
            createdBy: shift.cashierId
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
            paidBills: receipts.length,
            totalAmount: receipts.reduce((sum, receipt) => sum + Number(receipt.totalAmount), 0)
        },
        orders,
        receipts
    });
};

// HTTP handler: loads get all shifts data. It reads req data, uses models/services, and sends JSON with res.
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

module.exports = { openShift, closeShift, getShiftReport, getAllShifts, getCurrentRoster, setAreaStatus, removeAssignment, saveRoster };
