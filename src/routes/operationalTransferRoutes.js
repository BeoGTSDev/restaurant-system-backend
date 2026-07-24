const router = require('express').Router();
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const controller = require('../controllers/operationalTransferController');
router.get('/', verifyToken, authorize('view_orders'), controller.list);
router.post('/staff', verifyToken, authorize('update_order'), controller.transferStaff);
module.exports = router;
