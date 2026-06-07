const express = require('express');
const router = express.Router();
const { createZone, getAllZones, getZoneById, updateZone, deleteZone } = require('../controllers/zoneController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.get('/', getAllZones);
router.get('/:id', getZoneById);
router.post('/', verifyToken, authorize('manage_tables'), createZone);
router.put('/:id', verifyToken, authorize('manage_tables'), updateZone);
router.delete('/:id', verifyToken, authorize('manage_tables'), deleteZone);

module.exports = router;
