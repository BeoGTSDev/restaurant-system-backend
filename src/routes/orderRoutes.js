const express = require('express');
const router = express.Router();
const { createOrder, getAllOrders, payBillByTable, checkBillByTable, updateOrderItemStatus } = require('../controllers/orderController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.post('/create', verifyToken, authorize('create_order'), createOrder);

router.get('/', verifyToken, authorize('view_orders'), getAllOrders);

router.get('/table/:tableId/bill', verifyToken, authorize('view_orders'), checkBillByTable);

router.put('/table/:tableId/pay', verifyToken, authorize('cashout'), payBillByTable);

router.put('/items/:itemId/status', verifyToken, authorize('update_order_status'), updateOrderItemStatus);

module.exports = router;