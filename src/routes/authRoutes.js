const express = require('express');
const router = express.Router();
const { login, staffLogin, register } = require('../controllers/authControllers');
const { authLimiter } = require('../middleware/rateLimitMiddleware');
const { validateLogin, validateRegister, validateStaffLogin } = require('../middleware/validation');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful, returns user data and token
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts, please try again later
 */
router.post('/login', authLimiter, ...validateLogin, login);

/**
 * @swagger
 * /auth/staff-login:
 *   post:
 *     summary: Staff login by staff code and PIN
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - staffCode
 *               - pin
 *             properties:
 *               staffCode:
 *                 type: string
 *                 example: ST0001
 *               pin:
 *                 type: string
 *                 example: '1234'
 *     responses:
 *       200:
 *         description: Staff login successful
 *       401:
 *         description: Invalid staff code or PIN
 */
router.post('/staff-login', authLimiter, ...validateStaffLogin, staffLogin);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: User registration
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               email:
 *                 type: string
 *                 example: newuser@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       429:
 *         description: Too many registration attempts
 */
router.post('/register', authLimiter, ...validateRegister, register);

module.exports = router;