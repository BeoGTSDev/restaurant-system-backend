const { BusinessDay } = require('../models');

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
