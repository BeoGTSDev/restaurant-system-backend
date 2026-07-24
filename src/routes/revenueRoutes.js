const express = require('express');
const router = express.Router();
const revenueController = require('../controllers/revenueController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.get('/daily', verifyToken, authorize('view_reports'), revenueController.getDailyRevenue);
router.get('/best-selling', verifyToken, authorize('view_reports'), revenueController.getBestSellingProducts);
router.get('/monthly', verifyToken, authorize('view_reports'), revenueController.getMonthlyRevenue);
router.get('/operations', verifyToken, authorize('view_reports'), revenueController.getOperationsReport);

module.exports = router;
