const express = require('express');
const router = express.Router();
const {
    createOrder,
    getAllOrders,
    getCustomerOrder,
    payBillByTable,
    checkBillByTable,
    updateOrderItemStatus,
    cancelOrderItem
} = require('../controllers/orderController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const { requireOpenBusinessDay } = require('../middleware/businessDayMiddleware');

router.post('/create', verifyToken, authorize('create_order'), requireOpenBusinessDay, createOrder);

// QR/customer menu: the controller still validates that the table exists and
// has been opened by staff before accepting an order.
router.post('/customer', requireOpenBusinessDay, createOrder);
router.get('/customer/table/:tableId', getCustomerOrder);

router.get('/', verifyToken, authorize('view_orders'), getAllOrders);

router.get('/table/:tableId/bill', verifyToken, authorize('view_orders'), checkBillByTable);

router.put('/table/:tableId/pay', verifyToken, authorize('cashout'), payBillByTable);

router.put('/items/:itemId/status', verifyToken, authorize('update_order_status'), updateOrderItemStatus);
router.post('/items/:itemId/cancel', verifyToken, authorize(['create_order', 'update_order']), cancelOrderItem);

module.exports = router;
