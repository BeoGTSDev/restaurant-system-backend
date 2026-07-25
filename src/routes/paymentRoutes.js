const express = require('express');
const verifyCustomerTableSession = require('../middleware/customerTableSession');
const { requireOpenBusinessDay } = require('../middleware/businessDayMiddleware');
const {
    createSePayPayment,
    getSePayPaymentStatus,
    handleSePayWebhook
} = require('../controllers/paymentController');

const router = express.Router();

router.post('/sepay/webhook', handleSePayWebhook);
router.post('/sepay/create', requireOpenBusinessDay, verifyCustomerTableSession, createSePayPayment);
router.get('/sepay/:reference/status', getSePayPaymentStatus);

module.exports = router;
