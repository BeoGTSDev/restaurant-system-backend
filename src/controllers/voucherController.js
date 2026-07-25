const { Order, OrderItem, Product, Category, Voucher, Receipt } = require('../models');
const { Op } = require('sequelize');
const { calculateVoucher } = require('../services/voucherService');

const validateForTable = async (req, res, next) => {
    try {
        const orders = await Order.findAll({
            where: { tableId: req.body?.tableId, status: { [Op.in]: ['Pending', 'Order'] } },
            include: [{ model: OrderItem, as: 'items', where: { status: { [Op.ne]: 'Cancelled' } }, required: false,
                include: [{ model: Product, as: 'product', include: [{ model: Category, as: 'category' }] }] }]
        });
        const items = orders.flatMap(order => order.items || []);
        if (!items.length) return next(Object.assign(new Error('No bill items found for this table.'), { status: 404 }));
        const result = await calculateVoucher({ code: req.body?.code, items });
        res.status(200).json({
            success: true,
            data: {
                code: result.voucher.code,
                scope: result.voucher.scope,
                discountPercent: result.voucher.discountPercent,
                subtotal: result.subtotal,
                eligibleAmount: result.eligibleAmount,
                discountAmount: result.discountAmount,
                totalAmount: result.totalAmount
            }
        });
    } catch (error) { next(error); }
};

const listVouchers = async (req, res) => {
    const vouchers = await Voucher.findAll({ order: [['createdAt', 'DESC']] });
    const receipts = await Receipt.findAll({
        where: { voucherCode: { [Op.not]: null } },
        attributes: ['id', 'receiptNumber', 'voucherCode', 'tableName', 'totalAmount', 'paidAt', 'paidBy'],
        order: [['paidAt', 'DESC']]
    });
    const usage = receipts.reduce((map, receipt) => {
        (map[receipt.voucherCode] ||= []).push(receipt);
        return map;
    }, {});
    res.json({ success: true, data: vouchers.map(voucher => ({ ...voucher.toJSON(), receipts: usage[voucher.code] || [] })) });
};

const updateVoucher = async (req, res, next) => {
    const voucher = await Voucher.findByPk(req.params.id);
    if (!voucher) return next(Object.assign(new Error('Voucher not found'), { status: 404 }));
    if (typeof req.body.isActive === 'boolean') voucher.isActive = req.body.isActive;
    if (req.body.usageLimit !== undefined) {
        const limit = Number(req.body.usageLimit);
        if (!Number.isInteger(limit) || limit < voucher.usedCount || limit > 10000) return next(Object.assign(new Error('Usage limit must be a whole number not lower than used count'), { status: 400 }));
        voucher.usageLimit = limit;
    }
    if (req.body.validFrom !== undefined) voucher.validFrom = req.body.validFrom || null;
    if (req.body.validUntil !== undefined) voucher.validUntil = req.body.validUntil || null;
    await voucher.save();
    res.json({ success: true, message: 'Voucher updated', data: voucher });
};

module.exports = { validateForTable, listVouchers, updateVoucher };
