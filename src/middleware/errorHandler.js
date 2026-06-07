// Centralized error handler middleware
const errorHandler = (err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    console.error(`[ERROR] ${new Date().toISOString()} - ${req.method} ${req.path} - ${status} - ${message}`);
    if (err.stack) console.error(err.stack);

    // Validation errors
    if (err.errors && Array.isArray(err.errors)) {
        console.log('[VALIDATION] Errors:', JSON.stringify(err.errors, null, 2));
        return res.status(400).json({
            success: false,
            status: 400,
            message: 'Validation error',
            errors: err.errors.length > 0 ? err.errors.map(e => ({
                field: e.param || e.field || 'unknown',
                message: e.msg || e.message || 'Unknown error'
            })) : [{ field: 'unknown', message: 'Validation failed but no details available' }]
        });
    }

    // Sequelize validation error
    if (err.name === 'SequelizeValidationError') {
        return res.status(400).json({
            success: false,
            status: 400,
            message: 'Validation error',
            errors: err.errors.map(e => ({
                field: e.path,
                message: e.message
            }))
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            status: 401,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            status: 401,
            message: 'Token expired'
        });
    }

    // Standard error response
    res.status(status).json({
        success: false,
        status,
        message
    });
};

module.exports = errorHandler;
