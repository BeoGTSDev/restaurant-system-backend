const express = require('express');
const router = express.Router();
const { openShift, closeShift, getShiftReport, getAllShifts, getCurrentRoster, setAreaStatus, removeAssignment, saveRoster } = require('../controllers/shiftController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

// Open shift
router.post('/open', verifyToken, authorize('manage_shifts'), openShift);

// Close shift
router.post('/close', verifyToken, authorize('manage_shifts'), closeShift);
router.get('/roster/current', verifyToken, authorize('manage_shifts'), getCurrentRoster);
router.post('/roster/assign', verifyToken, authorize('manage_shifts'), saveRoster);
router.put('/areas', verifyToken, authorize('manage_shifts'), setAreaStatus);
router.delete('/assignments/:id', verifyToken, authorize('manage_shifts'), removeAssignment);

// Get shift report by ID
router.get('/:shiftId', verifyToken, authorize('manage_shifts'), getShiftReport);

// Get all shifts with filters
router.get('/', verifyToken, authorize('manage_shifts'), getAllShifts);

module.exports = router;
