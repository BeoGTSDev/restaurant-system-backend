const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { login } = require('../controllers/authControllers');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.post('/create', verifyToken, authorize('manage_users'), userController.createUser);
router.post('/login', login);
router.get('/', verifyToken, authorize('manage_users'), userController.getAllUser);
router.patch('/:id', verifyToken, authorize('manage_users'), userController.updateUser);
router.delete('/:id', verifyToken, authorize('manage_users'), userController.deleteUser);

module.exports = router;