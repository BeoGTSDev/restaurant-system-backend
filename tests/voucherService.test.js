jest.mock('../src/models', () => ({
    Voucher: { findOne: jest.fn() }
}));

const { Voucher } = require('../src/models');
const {
    normalizeCode, validateVoucherCodeFormat, calculateVoucher
} = require('../src/services/voucherService');

const item = (price, quantity, category) => ({
    price, quantity, product: { category: { name: category } }
});

const validVoucher = overrides => ({
    code: 'FD25001',
    isActive: true,
    usedCount: 0,
    usageLimit: 1,
    validFrom: '2020-01-01',
    validUntil: '2099-12-31',
    scope: 'FOOD',
    discountPercent: 25,
    ...overrides
});

describe('voucherService', () => {
    beforeEach(() => Voucher.findOne.mockReset());

    test('normalizes whitespace and casing', () => {
        expect(normalizeCode(' fd25001 ')).toBe('FD25001');
    });

    test.each(['FD10001', 'FD25002', 'FD50003', 'DR10004', 'DR25005', 'DR50006'])(
        'accepts valid code %s', code => expect(validateVoucherCodeFormat(code)).toBe(true)
    );

    test.each(['FD00001', 'FD1001', 'XX10001', 'DR75123', ''])(
        'rejects invalid code %s', code => expect(validateVoucherCodeFormat(code)).toBe(false)
    );

    test('empty voucher returns an undiscounted total without database lookup', async () => {
        const result = await calculateVoucher({ code: '', items: [item(50000, 2, 'Pizza')] });
        expect(result.totalAmount).toBe(100000);
        expect(result.discountAmount).toBe(0);
        expect(Voucher.findOne).not.toHaveBeenCalled();
    });

    test('food voucher discounts food but not drinks', async () => {
        Voucher.findOne.mockResolvedValue(validVoucher());
        const result = await calculateVoucher({
            code: 'FD25001',
            items: [item(100000, 1, 'Pizza'), item(50000, 1, 'Beer')]
        });
        expect(result.eligibleAmount).toBe(100000);
        expect(result.discountAmount).toBe(25000);
        expect(result.totalAmount).toBe(125000);
    });

    test('drink voucher recognises beverage categories', async () => {
        Voucher.findOne.mockResolvedValue(validVoucher({
            code: 'DR50001', scope: 'DRINK', discountPercent: 50
        }));
        const result = await calculateVoucher({
            code: 'DR50001',
            items: [item(60000, 2, 'Soft Drink'), item(100000, 1, 'Pizza')]
        });
        expect(result.eligibleAmount).toBe(120000);
        expect(result.discountAmount).toBe(60000);
    });

    test('rejects inactive voucher', async () => {
        Voucher.findOne.mockResolvedValue(validVoucher({ isActive: false }));
        await expect(calculateVoucher({ code: 'FD25001', items: [item(1, 1, 'Food')] }))
            .rejects.toMatchObject({ status: 404 });
    });

    test('rejects exhausted voucher', async () => {
        Voucher.findOne.mockResolvedValue(validVoucher({ usedCount: 1 }));
        await expect(calculateVoucher({ code: 'FD25001', items: [item(1, 1, 'Food')] }))
            .rejects.toMatchObject({ status: 409 });
    });

    test('rejects expired voucher', async () => {
        Voucher.findOne.mockResolvedValue(validVoucher({ validUntil: '2020-01-02' }));
        await expect(calculateVoucher({ code: 'FD25001', items: [item(1, 1, 'Food')] }))
            .rejects.toThrow('expired');
    });

    test('rejects a voucher with no eligible items', async () => {
        Voucher.findOne.mockResolvedValue(validVoucher());
        await expect(calculateVoucher({ code: 'FD25001', items: [item(1, 1, 'Beer')] }))
            .rejects.toThrow('does not apply');
    });
});
