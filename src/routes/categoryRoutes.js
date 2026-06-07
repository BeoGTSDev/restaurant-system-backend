const express = require('express');
const router = express.Router();
const { createCategory, bulkCreateCategories, getAllCategories } = require('../controllers/categoryController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');


router.get('/', getAllCategories);


router.post('/create', verifyToken, authorize('manage_categories'), createCategory);

router.post('/bulk-create', verifyToken, authorize('manage_categories'), bulkCreateCategories);

module.exports = router;