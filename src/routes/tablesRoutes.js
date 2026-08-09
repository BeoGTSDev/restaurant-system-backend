// Route file: maps URLs to checks and controller functions.
const express = require('express');
const router = express.Router();
const { createTable, getAllTables, openTable, createCustomerTableSession, updateCustomerPreferences, cleanTable, updateTable, deleteTable, transferTable } = require('../controllers/tableController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const verifyCustomerTableSession = require('../middleware/customerTableSession');

router.post('/customer/session', createCustomerTableSession);
router.put('/customer/preferences', verifyCustomerTableSession, updateCustomerPreferences);
router.get('/', verifyToken, authorize(['manage_tables', 'create_order', 'view_orders']), getAllTables);
router.post('/create', verifyToken, authorize('manage_tables'), createTable);
router.put('/:id/open', verifyToken, authorize('create_order'), openTable);
router.put('/:id/clean', verifyToken, authorize('manage_tables'), cleanTable);
router.put('/:id/transfer', verifyToken, authorize('update_order'), transferTable);
router.put('/:id', verifyToken, authorize('manage_tables'), updateTable);
router.delete('/:id', verifyToken, authorize('manage_tables'), deleteTable);

module.exports = router;
