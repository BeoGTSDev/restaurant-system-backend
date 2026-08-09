// Route file: maps URLs to checks and controller functions.
const express = require('express');
const router = express.Router();
const { transferItems, getTransferHistory, reverseTransfer } = require('../controllers/orderTransferController');
const { getAllTransfers } = require('../controllers/orderTransferController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

// Transfer items from one order to another table
router.post('/:orderId/transfer-items', verifyToken, authorize('update_order'), transferItems);

// Get transfer history for an order
router.get('/:orderId/transfer-history', verifyToken, authorize('view_orders'), getTransferHistory);

// Get all transfers (for admin/manager overview)
router.get('/all', verifyToken, authorize('view_orders'), getAllTransfers);

// Reverse a transfer (move items back)
router.post('/reverse/:transferId', verifyToken, authorize('update_order'), reverseTransfer);

module.exports = router;
