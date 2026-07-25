const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const {
    getBusinessDay,
    updateChargeSettings,
    startNewBusinessDay,
    createCashMovement,
    closeBusinessDay,
    resetTestEnvironment
} = require('../controllers/systemController');

const router = express.Router();

router.get('/business-day', verifyToken, getBusinessDay);
router.put('/business-day/charges', verifyToken, authorize('manage_cash_day'), updateChargeSettings);
router.post('/business-day/start', verifyToken, authorize(['manage_cash_day', 'manage_shifts']), startNewBusinessDay);
router.post('/business-day/cash-movements', verifyToken, authorize(['manage_cash_day', 'cashout']), createCashMovement);
router.post('/business-day/close', verifyToken, authorize(['manage_cash_day', 'manage_shifts']), closeBusinessDay);
router.post('/test-reset', verifyToken, authorize('manage_roles'), resetTestEnvironment);

module.exports = router;
