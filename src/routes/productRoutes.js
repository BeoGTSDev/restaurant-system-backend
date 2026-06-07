const express = require('express');
const router = express.Router();
const { createProduct, bulkCreateProducts, getAllProducts, updateProduct, deleteProduct } = require('../controllers/productController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const upload = require('../middleware/uploadMiddleware');



router.get('/', getAllProducts);

router.post('/bulk-create', verifyToken, authorize('manage_products'), bulkCreateProducts);

router.post('/create', verifyToken, authorize('manage_products'), upload.single('image'), createProduct);

router.put('/:id', verifyToken, authorize('manage_products'), upload.single('image'), updateProduct);

router.delete('/:id', verifyToken, authorize('manage_products'), deleteProduct);

module.exports = router;