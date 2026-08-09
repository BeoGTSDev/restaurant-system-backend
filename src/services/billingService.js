// Service file: holds reusable billingService business rules.
// Calculate in order: item total -> voucher -> manager discount -> tax and service charge.
const ALCOHOL_CATEGORY_PATTERN = /beer|wine|cocktail|alcohol|spirit/i;

// Business rule: runs the line total step. A controller passes values in and receives the result.
const lineTotal = item => Number(item.price) * Number(item.quantity);

const calculateBillTotals = ({
    items,
    voucherSubtotal,
    voucherTotal,
    voucherDiscountAmount = 0,
    billDiscountPercent = 0,
    foodVatActive = false,
    foodVatRate = 0,
    alcoholVatActive = false,
    alcoholVatRate = 0,
    serviceChargeActive = false,
    serviceChargeRate = 0
}) => {
    const subtotal = Number(voucherSubtotal);
    const voucherAdjustedTotal = Number(voucherTotal);
    const discountPercent = Number(billDiscountPercent);
    const billDiscountAmount = Math.round(voucherAdjustedTotal * discountPercent / 100);
    const discountedSubtotal = Math.max(0, voucherAdjustedTotal - billDiscountAmount);
    const alcoholSubtotal = items
        .filter(item => ALCOHOL_CATEGORY_PATTERN.test(item.product?.category?.name || ''))
        .reduce((sum, item) => sum + lineTotal(item), 0);
    const alcoholShare = subtotal > 0 ? alcoholSubtotal / subtotal : 0;
    const alcoholTaxBase = discountedSubtotal * alcoholShare;
    const foodTaxBase = discountedSubtotal - alcoholTaxBase;
    const foodVatAmount = foodVatActive
        ? Math.round(foodTaxBase * Number(foodVatRate) / 100)
        : 0;
    const alcoholVatAmount = alcoholVatActive
        ? Math.round(alcoholTaxBase * Number(alcoholVatRate) / 100)
        : 0;
    const serviceChargeAmount = serviceChargeActive
        ? Math.round(discountedSubtotal * Number(serviceChargeRate) / 100)
        : 0;

    return {
        subtotal,
        voucherDiscountAmount: Number(voucherDiscountAmount),
        billDiscountPercent: discountPercent,
        billDiscountAmount,
        discountAmount: Number(voucherDiscountAmount) + billDiscountAmount,
        discountedSubtotal,
        foodVatAmount,
        alcoholVatAmount,
        serviceChargeAmount,
        totalAmount: discountedSubtotal + foodVatAmount + alcoholVatAmount + serviceChargeAmount
    };
};

// Business rule: turns input values into calculate cash settlement. A controller passes values in and receives the result.
const calculateCashSettlement = ({ totalAmount, cashReceived, availableDrawerCash }) => {
    const total = Number(totalAmount);
    const received = Number(cashReceived);
    const available = Number(availableDrawerCash);
    if (!Number.isFinite(received) || received < total) {
        throw Object.assign(new Error('Cash received is less than the amount due.'), { status: 409 });
    }
    const changeDue = received - total;
    if (changeDue > available) {
        throw Object.assign(new Error(`Not enough cash in drawer for change. Available: ${available}, change required: ${changeDue}`), { status: 409 });
    }
    return { cashReceived: received, changeDue };
};

module.exports = { ALCOHOL_CATEGORY_PATTERN, lineTotal, calculateBillTotals, calculateCashSettlement };
