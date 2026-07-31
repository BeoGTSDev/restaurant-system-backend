const crypto = require('crypto');

const createWebhookSignature = ({ secret, timestamp, rawBody }) => crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)}`)
    .digest('hex');

const verifyWebhookSignature = ({
    secret,
    timestamp,
    suppliedSignature,
    rawBody,
    nowSeconds = Math.floor(Date.now() / 1000),
    toleranceSeconds = 300
}) => {
    const supplied = String(suppliedSignature || '').replace(/^sha256=/i, '');
    if (!secret || !timestamp || !/^[a-f0-9]{64}$/i.test(supplied) || !rawBody) return false;
    if (!Number.isFinite(Number(timestamp)) || Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;
    const expected = createWebhookSignature({ secret, timestamp, rawBody });
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
};

module.exports = { createWebhookSignature, verifyWebhookSignature };
