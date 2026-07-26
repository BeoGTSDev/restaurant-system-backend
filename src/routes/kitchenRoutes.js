const router = require('express').Router();
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const { getKitchenConfig, getExpectedQueue, getStationQueue } = require('../controllers/kitchenController');

router.get('/config', verifyToken, authorize('view_orders'), getKitchenConfig);
router.get('/expected', verifyToken, authorize('view_orders'), getExpectedQueue);
router.get('/stations/:code', verifyToken, authorize('view_orders'), getStationQueue);

module.exports = router;
