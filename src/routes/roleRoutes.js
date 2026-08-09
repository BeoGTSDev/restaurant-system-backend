// Route file: maps URLs to checks and controller functions.
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { verifyToken } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

// Roles
router.get('/', verifyToken, authorize(['Admin', 'manage_roles', 'manage_users']), roleController.listRoles);
router.get('/:id', verifyToken, authorize(['Admin', 'manage_roles']), roleController.getRole);
router.post('/', verifyToken, authorize(['Admin', 'manage_roles']), roleController.createRole);
router.put('/:id', verifyToken, authorize(['Admin', 'manage_roles']), roleController.updateRole);
router.delete('/:id', verifyToken, authorize(['Admin', 'manage_roles']), roleController.deleteRole);

// Permissions
router.get('/permissions/all', verifyToken, authorize(['Admin', 'manage_roles']), roleController.listPermissions);
router.post('/permissions', verifyToken, authorize(['Admin', 'manage_roles']), roleController.createPermission);

// role -> permissions mapping
router.put('/:id/permissions', verifyToken, authorize(['Admin', 'manage_roles']), roleController.updateRolePermissions);

// assign role to user
router.post('/:id/assign-user', verifyToken, authorize(['Admin', 'manage_roles']), roleController.assignRoleToUser);

module.exports = router;
