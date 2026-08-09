// Route file: maps URLs to checks and controller functions.
const express = require('express');
const router = express.Router();
const { createZone, getAllZones, getZoneById, updateZone, deleteZone } = require('../controllers/zoneController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.get('/', verifyToken, authorize(['manage_tables', 'create_order', 'view_orders']), getAllZones);
router.get('/:id', verifyToken, authorize(['manage_tables', 'create_order', 'view_orders']), getZoneById);
router.post('/', verifyToken, authorize('manage_tables'), createZone);
router.put('/:id', verifyToken, authorize('manage_tables'), updateZone);
router.delete('/:id', verifyToken, authorize('manage_tables'), deleteZone);

module.exports = router;
