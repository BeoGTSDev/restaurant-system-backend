// Test file: checks tableQr.test behavior and protects it from later changes.
const { generateTableQrCode } = require('../src/utils/tableQr');

describe('table QR code generation', () => {
    test('uses the Maison Lucas table prefix and URL-safe token', () => {
        expect(generateTableQrCode()).toMatch(/^MLT-[A-Za-z0-9_-]{24}$/);
    });

    test('generates unique values across a practical sample', () => {
        const values = Array.from({ length: 1000 }, generateTableQrCode);
        expect(new Set(values).size).toBe(values.length);
    });
});
