// Middleware: checks or prepares a request before its controller runs.
const { BusinessDay } = require('../models');

// Request check: checks require open business day and returns a safe yes/no result. It calls next() only when the request may continue.
const requireOpenBusinessDay = async (req, res, next) => {
    const current = await BusinessDay.findOne({ where: { status: 'open' } });
    if (!current) {
        const err = new Error('POS is closed. Start the business day before creating orders.');
        err.status = 423;
        return next(err);
    }
    req.businessDay = current;
    next();
};

module.exports = { requireOpenBusinessDay };
