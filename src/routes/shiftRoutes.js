const express = require('express');
const router = express.Router();
const { openShift, closeShift, getShiftReport, getAllShifts } = require('../controllers/shiftController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const { validateOpenShift, validateCloseShift } = require('../middleware/validation');

// Open shift
router.post('/open', verifyToken, authorize('manage_shifts'), validateOpenShift, openShift);

// Close shift
router.post('/close', verifyToken, authorize('manage_shifts'), validateCloseShift, closeShift);

// Get shift report by ID
router.get('/:shiftId', verifyToken, authorize('manage_shifts'), getShiftReport);

// Get all shifts with filters
router.get('/', verifyToken, authorize('manage_shifts'), getAllShifts);

module.exports = router;
