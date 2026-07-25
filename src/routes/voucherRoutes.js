const router = require('express').Router();
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const { validateForTable, listVouchers, updateVoucher } = require('../controllers/voucherController');

router.post('/validate', verifyToken, authorize('cashout'), validateForTable);
router.get('/', verifyToken, authorize('manage_vouchers'), listVouchers);
router.patch('/:id', verifyToken, authorize('manage_vouchers'), updateVoucher);

module.exports = router;
