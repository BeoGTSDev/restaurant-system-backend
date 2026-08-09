// Middleware: checks or prepares a request before its controller runs.
const { body, validationResult } = require('express-validator');

// Validation rules for login
const loginValidators = [
    body('email').trim().isEmail().withMessage('Invalid email format'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const staffLoginValidators = [
    body('staffCode').trim().notEmpty().withMessage('Staff code is required'),
    body('pin')
        .trim()
        .isLength({ min: 4, max: 4 })
        .withMessage('PIN must be exactly 4 digits')
        .isNumeric()
        .withMessage('PIN must contain only digits')
];

// Validation rules for register
const registerValidators = [
    body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format'),
    body('fullName').trim().notEmpty().withMessage('Full name is required').isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('password').notEmpty().withMessage('Password is required').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

// Check validation results middleware
// Request check: checks check validation and returns a safe yes/no result. It calls next() only when the request may continue.
const checkValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const err = new Error('Validation failed');
        err.status = 400;
        err.errors = errors.array().map(e => ({
            param: e.param,
            msg: e.msg
        }));
        return next(err);
    }
    next();
};

// Validation for monetary amounts
const moneyAmountValidators = [
    body('amount')
        .isFloat({ min: 0 })
        .withMessage('Amount must be a positive number')
];

// Validation for shift operations
const openShiftValidators = [
    body('cashIn')
        .isFloat({ min: 0 })
        .withMessage('Cash in must be a positive number')
];

const closeShiftValidators = [
    body('shiftId')
        .notEmpty()
        .withMessage('Shift ID is required'),
    body('cashOut')
        .isFloat({ min: 0 })
        .withMessage('Cash out must be a positive number')
];

// Export as flat arrays for easy spread in routes
const validateLogin = [...loginValidators, checkValidation];
const validateStaffLogin = [...staffLoginValidators, checkValidation];
const validateRegister = [...registerValidators, checkValidation];
const validateMoneyAmount = [...moneyAmountValidators, checkValidation];
const validateOpenShift = [...openShiftValidators, checkValidation];
const validateCloseShift = [...closeShiftValidators, checkValidation];

module.exports = {
    validateLogin,
    validateStaffLogin,
    validateRegister,
    validateMoneyAmount,
    validateOpenShift,
    validateCloseShift
};
