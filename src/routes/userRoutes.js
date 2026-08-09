// Route file: maps URLs to checks and controller functions.
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.post('/create', verifyToken, authorize('manage_users'), userController.createUser);
router.get('/', verifyToken, authorize(['manage_users', 'manage_shifts']), userController.getAllUser);
router.get('/next-code', verifyToken, authorize('manage_users'), userController.getNextStaffCode);
router.get('/me', verifyToken, userController.getMe);
router.patch('/me/pin', verifyToken, userController.changeMyPin);
router.post('/:id/impersonate', verifyToken, verifyAdmin, userController.impersonateUser);
router.patch('/:id/status', verifyToken, authorize('manage_users'), userController.updateUserStatus);
router.patch('/:id', verifyToken, authorize('manage_users'), userController.updateUser);
router.delete('/:id', verifyToken, authorize('manage_users'), userController.deleteUser);

module.exports = router;
