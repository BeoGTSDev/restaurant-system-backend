const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const { getBusinessDay, startNewBusinessDay } = require('../controllers/systemController');

const router = express.Router();

router.get('/business-day', verifyToken, authorize('manage_shifts'), getBusinessDay);
router.post('/business-day/start', verifyToken, authorize('manage_shifts'), startNewBusinessDay);

module.exports = router;
