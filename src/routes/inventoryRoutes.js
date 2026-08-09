// Route file: maps URLs to checks and controller functions.
const router = require('express').Router();
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const controller = require('../controllers/inventoryController');

router.use(verifyToken, authorize(['manage_inventory']));
router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.post('/:id/movements', controller.move);

module.exports = router;
