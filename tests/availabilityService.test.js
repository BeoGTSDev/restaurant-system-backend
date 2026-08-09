// Test file: checks availabilityService.test behavior and protects it from later changes.
const {
    parseRemainingQty, availabilityValues, reserveAvailability
} = require('../src/services/availabilityService');

describe('availabilityService', () => {
    test.each([
        [undefined, null], [null, null], ['', null], ['5', 5], [0, 0]
    ])('parses remaining quantity %p', (input, expected) => {
        expect(parseRemainingQty(input)).toBe(expected);
    });

    test.each([-1, 1.5, 'abc'])('rejects invalid remaining quantity %p', input => {
        expect(() => parseRemainingQty(input)).toThrow('non-negative whole number');
    });

    test('disabled availability is permanent and has no daily quantity', () => {
        expect(availabilityValues('Disabled', 5, '2026-07-31')).toEqual({
            status: 'Disabled', remainingQty: null, availabilityDate: null
        });
    });

    test('zero quantity becomes sold out today', () => {
        expect(availabilityValues('In Stock', 0, '2026-07-31')).toEqual({
            status: 'Out of Stock', remainingQty: 0, availabilityDate: '2026-07-31'
        });
    });

    test('explicit sold out ignores a supplied positive quantity', () => {
        expect(availabilityValues('Out of Stock', 8, '2026-07-31')).toEqual({
            status: 'Out of Stock', remainingQty: 0, availabilityDate: '2026-07-31'
        });
    });

    test('positive daily quantity remains in stock', () => {
        expect(availabilityValues('In Stock', 5, '2026-07-31')).toEqual({
            status: 'In Stock', remainingQty: 5, availabilityDate: '2026-07-31'
        });
    });

    test('unlimited availability has no visible quantity', () => {
        expect(availabilityValues('In Stock', null, '2026-07-31')).toEqual({
            status: 'In Stock', remainingQty: null, availabilityDate: null
        });
    });

    test('reserving final item automatically sells out', () => {
        expect(reserveAvailability(1, 1)).toEqual({ remainingQty: 0, status: 'Out of Stock' });
    });

    test('reserving from unlimited inventory remains unlimited', () => {
        expect(reserveAvailability(null, 99)).toEqual({ remainingQty: null, status: 'In Stock' });
    });

    test('rejects an order above remaining quantity', () => {
        expect(() => reserveAvailability(3, 4)).toThrow('Only 3 item(s) remain today');
    });

    test.each([0, -1, 1.5])('rejects invalid requested quantity %p', quantity => {
        expect(() => reserveAvailability(5, quantity)).toThrow('positive whole number');
    });
});
