// Reusable helper code used by startup or business files.
const crypto = require('crypto');

// Helper: creates or starts generate table qr code and returns the value to its caller.
const generateTableQrCode = () => `MLT-${crypto.randomBytes(18).toString('base64url')}`;

module.exports = { generateTableQrCode };
