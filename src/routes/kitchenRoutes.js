const router = require('express').Router();
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const { getKitchenConfig, getExpectedQueue, getStationQueue, bulkAction, returnItems, getHistory, getCompletedQueue } = require('../controllers/kitchenController');

router.get('/config', verifyToken, authorize(['view_dishup', 'update_order_status']), getKitchenConfig);
router.get('/expected', verifyToken, authorize(['view_dishup', 'manage_expeditor', 'update_order_status']), getExpectedQueue);
router.get('/stations/:code', verifyToken, authorize(['work_kitchen_station', 'update_order_status']), getStationQueue);
router.get('/logs', verifyToken, authorize(['view_kitchen_logs', 'update_order_status']), getHistory);
router.get('/history', verifyToken, authorize(['view_dishup', 'manage_expeditor', 'update_order_status']), getCompletedQueue);
router.post('/actions', verifyToken, authorize(['manage_expeditor', 'update_order_status']), bulkAction);
router.post('/return', verifyToken, authorize(['manage_expeditor', 'update_order_status']), returnItems);

module.exports = router;
