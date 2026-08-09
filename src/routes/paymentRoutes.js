// Route file: maps URLs to checks and controller functions.
const express = require('express');
const verifyCustomerTableSession = require('../middleware/customerTableSession');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const { requireOpenBusinessDay } = require('../middleware/businessDayMiddleware');
const {
    createSePayPayment,
    createPosSePayPayment,
    getCustomerBill,
    applyCustomerVoucher,
    getSePayPaymentStatus,
    handleSePayWebhook
} = require('../controllers/paymentController');

const router = express.Router();

router.post('/sepay/webhook', handleSePayWebhook);
router.post('/sepay/create', requireOpenBusinessDay, verifyCustomerTableSession, createSePayPayment);
router.post('/sepay/pos/create', verifyToken, authorize('cashout'), requireOpenBusinessDay, createPosSePayPayment);
router.get('/sepay/:reference/status', getSePayPaymentStatus);
router.get('/customer/bill', requireOpenBusinessDay, verifyCustomerTableSession, getCustomerBill);
router.post('/customer/voucher', requireOpenBusinessDay, verifyCustomerTableSession, applyCustomerVoucher);

module.exports = router;
