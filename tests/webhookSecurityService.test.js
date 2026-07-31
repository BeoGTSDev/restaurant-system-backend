const {
    createWebhookSignature, verifyWebhookSignature
} = require('../src/services/webhookSecurityService');

describe('webhookSecurityService', () => {
    const secret = 'test-secret';
    const timestamp = '1785480000';
    const rawBody = Buffer.from('{"id":123,"code":"ML12345678"}');
    const signature = createWebhookSignature({ secret, timestamp, rawBody });

    test('generates a stable SHA-256 HMAC', () => {
        expect(signature).toMatch(/^[a-f0-9]{64}$/);
        expect(createWebhookSignature({ secret, timestamp, rawBody })).toBe(signature);
    });

    test('accepts a valid signature inside the replay window', () => {
        expect(verifyWebhookSignature({
            secret, timestamp, rawBody, suppliedSignature: signature, nowSeconds: 1785480100
        })).toBe(true);
    });

    test('accepts the sha256= signature prefix', () => {
        expect(verifyWebhookSignature({
            secret, timestamp, rawBody, suppliedSignature: `sha256=${signature}`, nowSeconds: 1785480100
        })).toBe(true);
    });

    test('rejects a modified payload', () => {
        expect(verifyWebhookSignature({
            secret, timestamp, rawBody: Buffer.from('{"id":124}'),
            suppliedSignature: signature, nowSeconds: 1785480100
        })).toBe(false);
    });

    test('rejects an expired timestamp to prevent replay', () => {
        expect(verifyWebhookSignature({
            secret, timestamp, rawBody, suppliedSignature: signature, nowSeconds: 1785480401
        })).toBe(false);
    });

    test.each([
        { secret: '', timestamp, rawBody, suppliedSignature: signature },
        { secret, timestamp: '', rawBody, suppliedSignature: signature },
        { secret, timestamp, rawBody: null, suppliedSignature: signature },
        { secret, timestamp, rawBody, suppliedSignature: 'invalid' }
    ])('rejects incomplete or malformed authentication data', input => {
        expect(verifyWebhookSignature({ ...input, nowSeconds: 1785480100 })).toBe(false);
    });
});
