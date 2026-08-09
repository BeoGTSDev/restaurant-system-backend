// Middleware: checks or prepares a request before its controller runs.
// Stop a replayed offline write from creating the same database change twice.
const { UniqueConstraintError } = require('sequelize');
const { IdempotencyRecord } = require('../models');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

module.exports = async function idempotency(req, res, next) {
    const key = String(req.get('Idempotency-Key') || '').trim();
    if (!key || !MUTATING_METHODS.has(req.method)) return next();
    if (key.length > 64) return res.status(400).json({ success: false, message: 'Invalid Idempotency-Key' });

    try {
        const existing = await IdempotencyRecord.findOne({ where: { key } });
        if (existing?.completed) return res.status(existing.statusCode || 200).json(existing.responseBody);
        if (existing) return res.status(409).json({ success: false, message: 'Operation is already being processed' });

        const record = await IdempotencyRecord.create({ key, method: req.method, path: req.originalUrl });
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            const statusCode = res.statusCode;
            if (statusCode >= 200 && statusCode < 300) {
                record.update({ completed: true, statusCode, responseBody: body }).catch(() => {});
            } else {
                record.destroy().catch(() => {});
            }
            return originalJson(body);
        };
        next();
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return res.status(409).json({ success: false, message: 'Operation is already being processed' });
        }
        next(error);
    }
};
