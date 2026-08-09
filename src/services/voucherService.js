// Service file: holds reusable voucherService business rules.
const { Voucher } = require('../models');

const DRINK_CATEGORIES = new Set(['beer', 'cocktail', 'mocktail', 'juice', 'smoothie', 'soft drink', 'beverages', 'bar']);
// Business rule: turns input values into normalize code. A controller passes values in and receives the result.
const normalizeCode = code => String(code || '').trim().toUpperCase();

// Business rule: checks validate voucher code format and returns a safe yes/no result. A controller passes values in and receives the result.
const validateVoucherCodeFormat = code => /^(DR|FD)(10|25|50)\d{3}$/.test(normalizeCode(code));

// Business rule: turns input values into calculate voucher. A controller passes values in and receives the result.
const calculateVoucher = async ({ code, items, transaction, lock = false }) => {
    const normalized = normalizeCode(code);
    const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    if (!normalized) return { voucher: null, subtotal, eligibleAmount: 0, discountAmount: 0, totalAmount: subtotal };
    if (!validateVoucherCodeFormat(normalized)) {
        throw Object.assign(new Error('Invalid voucher code format.'), { status: 400 });
    }
    const voucher = await Voucher.findOne({
        where: { code: normalized },
        transaction,
        lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
    });
    const today = new Date().toISOString().slice(0, 10);
    if (!voucher || !voucher.isActive) throw Object.assign(new Error('Voucher is invalid or inactive.'), { status: 404 });
    if (voucher.usedCount >= voucher.usageLimit) throw Object.assign(new Error('Voucher has already been used.'), { status: 409 });
    if (voucher.validFrom && today < voucher.validFrom) throw Object.assign(new Error('Voucher is not active yet.'), { status: 409 });
    if (voucher.validUntil && today > voucher.validUntil) throw Object.assign(new Error('Voucher has expired.'), { status: 409 });

    const eligibleAmount = items.reduce((sum, item) => {
        const category = String(item.product?.category?.name || '').trim().toLowerCase();
        const isDrink = DRINK_CATEGORIES.has(category);
        const eligible = voucher.scope === 'DRINK' ? isDrink : !isDrink;
        return eligible ? sum + Number(item.price) * Number(item.quantity) : sum;
    }, 0);
    if (eligibleAmount <= 0) {
        throw Object.assign(new Error(`Voucher does not apply to any ${voucher.scope.toLowerCase()} item in this bill.`), { status: 409 });
    }
    const discountAmount = Math.round(eligibleAmount * Number(voucher.discountPercent) / 100);
    return {
        voucher,
        subtotal,
        eligibleAmount,
        discountAmount,
        totalAmount: Math.max(0, subtotal - discountAmount)
    };
};

module.exports = { normalizeCode, validateVoucherCodeFormat, calculateVoucher };
