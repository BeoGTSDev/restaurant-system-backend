const parseRemainingQty = value => {
    if (value === undefined || value === null || value === '') return null;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) {
        throw Object.assign(new Error('Remaining quantity must be a non-negative whole number'), { status: 400 });
    }
    return quantity;
};

const availabilityValues = (status, remainingQty, businessDate) => {
    if (status === 'Disabled') return { status, remainingQty: null, availabilityDate: null };
    const quantity = parseRemainingQty(remainingQty);
    if (status === 'Out of Stock' || quantity === 0) {
        return { status: 'Out of Stock', remainingQty: 0, availabilityDate: businessDate };
    }
    if (quantity !== null) {
        return { status: 'In Stock', remainingQty: quantity, availabilityDate: businessDate };
    }
    return { status: 'In Stock', remainingQty: null, availabilityDate: null };
};

const reserveAvailability = (remainingQty, requestedQuantity) => {
    const requested = Number(requestedQuantity);
    if (!Number.isInteger(requested) || requested <= 0) {
        throw Object.assign(new Error('Quantity must be a positive whole number.'), { status: 400 });
    }
    if (remainingQty === null || remainingQty === undefined) {
        return { remainingQty: null, status: 'In Stock' };
    }
    const remaining = Number(remainingQty);
    if (requested > remaining) {
        throw Object.assign(new Error(`Only ${remaining} item(s) remain today.`), { status: 409 });
    }
    const next = remaining - requested;
    return { remainingQty: next, status: next === 0 ? 'Out of Stock' : 'In Stock' };
};

module.exports = { parseRemainingQty, availabilityValues, reserveAvailability };
