const { Op } = require('sequelize');
const { Receipt, ReceiptItem, User } = require('../models');

const parseRange = (startDate, endDate) => {
    if (!startDate || !endDate) throw Object.assign(new Error('Start date and end date are required.'), { status: 400 });
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        throw Object.assign(new Error('Invalid receipt date range.'), { status: 400 });
    }
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const earliest = new Date(todayEnd);
    earliest.setDate(earliest.getDate() - 29);
    earliest.setHours(0, 0, 0, 0);
    if (start < earliest || end > todayEnd || end.getTime() - start.getTime() > 30 * 86400000) {
        throw Object.assign(new Error('Receipts can only be searched within the most recent 30 days.'), { status: 400 });
    }
    return { start, end };
};

const listReceipts = async (req, res, next) => {
    try {
        const { start, end } = parseRange(req.query.startDate, req.query.endDate);
        const where = { paidAt: { [Op.between]: [start, end] } };
        if (req.query.paymentMethod) where.paymentMethod = req.query.paymentMethod;
        if (req.query.receiptNumber) where.receiptNumber = { [Op.iLike]: `%${String(req.query.receiptNumber).trim()}%` };
        const receipts = await Receipt.findAll({
            where,
            include: [{ model: User, as: 'paymentStaff', attributes: ['id', 'fullName', 'staffCode'] }],
            order: [['paidAt', 'DESC']],
            limit: 1000
        });
        res.status(200).json({ success: true, data: receipts });
    } catch (error) { next(error); }
};

const getReceipt = async (req, res, next) => {
    const receipt = await Receipt.findByPk(req.params.id, {
        include: [
            { model: ReceiptItem, as: 'items' },
            { model: User, as: 'paymentStaff', attributes: ['id', 'fullName', 'staffCode'] }
        ]
    });
    if (!receipt) return next(Object.assign(new Error('Receipt not found.'), { status: 404 }));
    res.status(200).json({ success: true, data: receipt });
};

module.exports = { listReceipts, getReceipt };
