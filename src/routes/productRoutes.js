const express = require('express');
const router = express.Router();
const { createProduct, bulkCreateProducts, getAllProducts, getPublicProducts, updateProduct, updateProductAvailability, deleteProduct } = require('../controllers/productController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const upload = require('../middleware/uploadMiddleware');



router.get('/public', getPublicProducts);
router.get('/', verifyToken, authorize(['view_menu', 'manage_products', 'create_order']), getAllProducts);

router.post('/bulk-create', verifyToken, authorize('manage_products'), bulkCreateProducts);

router.post('/create', verifyToken, authorize('manage_products'), upload.single('image'), upload.validateImageSignature, createProduct);

router.put('/:id', verifyToken, authorize('manage_products'), upload.single('image'), upload.validateImageSignature, updateProduct);
router.patch('/:id/availability', verifyToken, authorize('set_menu_availability'), updateProductAvailability);

router.delete('/:id', verifyToken, authorize('manage_products'), deleteProduct);

module.exports = router;
