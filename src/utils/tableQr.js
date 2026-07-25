const crypto = require('crypto');

const generateTableQrCode = () => `MLT-${crypto.randomBytes(18).toString('base64url')}`;

module.exports = { generateTableQrCode };
