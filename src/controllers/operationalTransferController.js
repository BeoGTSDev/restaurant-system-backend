// Controller file: receives request data, applies operationalTransferController rules, and returns JSON.
const { OperationalTransfer, Table, User, BusinessDay, ShiftRecord } = require('../models');

// HTTP handler: loads list data. It reads req data, uses models/services, and sends JSON with res.
const list = async (req, res) => {
    const where = req.query.type ? { type: req.query.type } : {};
    const data = await OperationalTransfer.findAll({
        where,
        include: [
            { model: User, as: 'performer', attributes: ['id', 'fullName', 'staffCode'] },
            { model: User, as: 'fromStaff', attributes: ['id', 'fullName', 'staffCode'] },
            { model: User, as: 'toStaff', attributes: ['id', 'fullName', 'staffCode'] },
            { model: BusinessDay, as: 'businessDay', attributes: ['id', 'businessDate'] },
            { model: ShiftRecord, as: 'shift', attributes: ['id', 'shiftName'] }
        ],
        order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data });
};

// HTTP handler: runs the transfer staff step. It reads req data, uses models/services, and sends JSON with res.
const transferStaff = async (req, res, next) => {
    const { tableId, toStaffId, reason } = req.body;
    const table = await Table.findByPk(tableId);
    const staff = await User.findByPk(toStaffId);
    if (!table || !staff || !staff.isActive || !reason) {
        const err = new Error('Valid table, active receiving staff and reason are required');
        err.status = 400;
        return next(err);
    }
    const day = await BusinessDay.findOne({ where: { status: 'open' } });
    const shift = await ShiftRecord.findOne({ where: { cashierId: req.user.id, status: 'open' } });
    const fromStaffId = table.assignedStaffId;
    table.assignedStaffId = staff.id;
    await table.save();
    const record = await OperationalTransfer.create({
        type: 'staff', sourceTableId: table.id, fromStaffId, toStaffId: staff.id,
        performedBy: req.user.id, businessDayId: day?.id, shiftId: shift?.id,
        reason, status: 'completed'
    });
    res.status(201).json({ success: true, data: record });
};
module.exports = { list, transferStaff };
