const { lineTotal, calculateBillTotals, calculateCashSettlement } = require('../src/services/billingService');

const item = (price, quantity, category) => ({
    price, quantity, product: { category: { name: category } }
});

describe('billingService', () => {
    test('calculates a line total from numeric strings', () => {
        expect(lineTotal(item('125000', '2', 'Food'))).toBe(250000);
    });

    test('returns the subtotal when no taxes or discounts are active', () => {
        const result = calculateBillTotals({
            items: [item(100000, 2, 'Main Course')],
            voucherSubtotal: 200000,
            voucherTotal: 200000
        });
        expect(result).toMatchObject({ subtotal: 200000, discountedSubtotal: 200000, totalAmount: 200000 });
    });

    test('applies voucher then bill discount in the correct order', () => {
        const result = calculateBillTotals({
            items: [item(100000, 1, 'Food')],
            voucherSubtotal: 100000,
            voucherTotal: 75000,
            voucherDiscountAmount: 25000,
            billDiscountPercent: 10
        });
        expect(result.billDiscountAmount).toBe(7500);
        expect(result.discountAmount).toBe(32500);
        expect(result.discountedSubtotal).toBe(67500);
    });

    test('splits food and alcohol VAT proportionally after discounts', () => {
        const result = calculateBillTotals({
            items: [item(80000, 1, 'Main Course'), item(20000, 1, 'Beer')],
            voucherSubtotal: 100000,
            voucherTotal: 90000,
            foodVatActive: true,
            foodVatRate: 8,
            alcoholVatActive: true,
            alcoholVatRate: 10
        });
        expect(result.foodVatAmount).toBe(5760);
        expect(result.alcoholVatAmount).toBe(1800);
        expect(result.totalAmount).toBe(97560);
    });

    test('recognises wine and cocktail as alcohol', () => {
        const result = calculateBillTotals({
            items: [item(50000, 1, 'Wine'), item(50000, 1, 'Cocktail')],
            voucherSubtotal: 100000,
            voucherTotal: 100000,
            alcoholVatActive: true,
            alcoholVatRate: 10
        });
        expect(result.alcoholVatAmount).toBe(10000);
        expect(result.foodVatAmount).toBe(0);
    });

    test('adds service charge after discounts', () => {
        const result = calculateBillTotals({
            items: [item(100000, 1, 'Food')],
            voucherSubtotal: 100000,
            voucherTotal: 80000,
            serviceChargeActive: true,
            serviceChargeRate: 5
        });
        expect(result.serviceChargeAmount).toBe(4000);
        expect(result.totalAmount).toBe(84000);
    });

    test('never lets bill discount make subtotal negative', () => {
        const result = calculateBillTotals({
            items: [],
            voucherSubtotal: 100,
            voucherTotal: 100,
            billDiscountPercent: 150
        });
        expect(result.discountedSubtotal).toBe(0);
        expect(result.totalAmount).toBe(0);
    });

    test('calculates exact cash change', () => {
        expect(calculateCashSettlement({
            totalAmount: 1300000, cashReceived: 2000000, availableDrawerCash: 1000000
        })).toEqual({ cashReceived: 2000000, changeDue: 700000 });
    });

    test('rejects cash below amount due', () => {
        expect(() => calculateCashSettlement({
            totalAmount: 600000, cashReceived: 500000, availableDrawerCash: 1000000
        })).toThrow('less than the amount due');
    });

    test('rejects change above available drawer cash', () => {
        expect(() => calculateCashSettlement({
            totalAmount: 1300000, cashReceived: 2000000, availableDrawerCash: 500000
        })).toThrow('Not enough cash in drawer');
    });
});
