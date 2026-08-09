// Controller file: receives request data, applies receiptController rules, and returns JSON.
const { Op } = require('sequelize');
const { Receipt, ReceiptItem, User } = require('../models');

const BUSINESS_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// HTTP handler: turns input values into parse date only. It reads req data, uses models/services, and sends JSON with res.
const parseDateOnly = value => {
    if (!DATE_ONLY.test(String(value || ''))) return null;
    const [year, month, day] = String(value).split('-').map(Number);
    const utc = Date.UTC(year, month - 1, day);
    const check = new Date(utc);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return { year, month, day, utc };
};
// HTTP handler: runs the vietnam date step. It reads req data, uses models/services, and sends JSON with res.
const vietnamDate = date => new Date(date.getTime() + BUSINESS_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10);

// HTTP handler: turns input values into parse range. It reads req data, uses models/services, and sends JSON with res.
const parseRange = (startDate, endDate) => {
    if (!startDate || !endDate) throw Object.assign(new Error('Start date and end date are required.'), { status: 400 });
    const startParts = parseDateOnly(startDate);
    const endParts = parseDateOnly(endDate);
    if (!startParts || !endParts || startParts.utc > endParts.utc) {
        throw Object.assign(new Error('Invalid receipt date range.'), { status: 400 });
    }
    const today = vietnamDate(new Date());
    const todayParts = parseDateOnly(today);
    const earliest = new Date(todayParts.utc);
    earliest.setUTCDate(earliest.getUTCDate() - 29);
    if (startParts.utc < earliest.getTime()
        || endParts.utc > todayParts.utc
        || endParts.utc - startParts.utc > 29 * 86400000) {
        throw Object.assign(new Error('Receipts can only be searched within the most recent 30 days.'), { status: 400 });
    }
    // Convert Vietnam calendar-day boundaries to UTC instants for paidAt.
    const start = new Date(startParts.utc - BUSINESS_TIMEZONE_OFFSET_MS);
    const end = new Date(endParts.utc + 86400000 - BUSINESS_TIMEZONE_OFFSET_MS - 1);
    return { start, end };
};

// HTTP handler: loads list receipts data. It reads req data, uses models/services, and sends JSON with res.
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

// HTTP handler: loads get receipt data. It reads req data, uses models/services, and sends JSON with res.
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
