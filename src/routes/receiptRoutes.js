const router = require('express').Router();
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const { listReceipts, getReceipt } = require('../controllers/receiptController');

router.get('/', verifyToken, authorize(['view_receipts', 'view_reports', 'cashout']), listReceipts);
router.get('/:id', verifyToken, authorize(['view_receipts', 'view_reports', 'cashout']), getReceipt);

module.exports = router;
