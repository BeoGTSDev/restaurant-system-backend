// Controller file: receives request data, applies roleController rules, and returns JSON.
const { Role, Permission, User } = require('../models');

// HTTP handler: loads list roles data. It reads req data, uses models/services, and sends JSON with res.
const listRoles = async (req, res, next) => {
    try {
        const roles = await Role.findAll({ include: [{ association: 'Permissions' }] });
        res.json({ success: true, data: roles });
    } catch (err) { next(err); }
};

// HTTP handler: loads get role data. It reads req data, uses models/services, and sends JSON with res.
const getRole = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id, { include: [{ association: 'Permissions' }] });
        if (!role) return res.status(404).json({ message: 'Role not found' });
        res.json({ success: true, data: role });
    } catch (err) { next(err); }
};

// HTTP handler: creates or starts create role. It reads req data, uses models/services, and sends JSON with res.
const createRole = async (req, res, next) => {
    try {
        const { name, label, description } = req.body;
        const role = await Role.create({ name, label, description });
        res.status(201).json({ success: true, data: role });
    } catch (err) { next(err); }
};

// HTTP handler: changes and saves update role. It reads req data, uses models/services, and sends JSON with res.
const updateRole = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Role not found' });
        const { label, description } = req.body;
        await role.update({
            ...(label !== undefined ? { label: String(label).trim() } : {}),
            ...(description !== undefined ? { description: String(description).trim() } : {})
        });
        res.json({ success: true, data: role });
    } catch (err) { next(err); }
};

// HTTP handler: removes, closes, or resets delete role. It reads req data, uses models/services, and sends JSON with res.
const deleteRole = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Role not found' });
        await role.destroy();
        res.json({ success: true });
    } catch (err) { next(err); }
};

// HTTP handler: loads list permissions data. It reads req data, uses models/services, and sends JSON with res.
const listPermissions = async (req, res, next) => {
    try {
        const perms = await Permission.findAll();
        res.json({ success: true, data: perms });
    } catch (err) { next(err); }
};

// HTTP handler: creates or starts create permission. It reads req data, uses models/services, and sends JSON with res.
const createPermission = async (req, res, next) => {
    try {
        const { name, description } = req.body;
        const perm = await Permission.create({ name, description });
        res.status(201).json({ success: true, data: perm });
    } catch (err) { next(err); }
};

// HTTP handler: changes and saves update role permissions. It reads req data, uses models/services, and sends JSON with res.
const updateRolePermissions = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Role not found' });
        const { permissions } = req.body;
        if (!Array.isArray(permissions) || permissions.some(item => typeof item !== 'string')) {
            return res.status(400).json({ message: 'Permissions must be an array of permission names' });
        }
        const perms = await Permission.findAll({ where: { name: permissions } });
        await role.setPermissions(perms);
        const updated = await Role.findByPk(req.params.id, { include: [{ association: 'Permissions' }] });
        res.json({ success: true, data: updated });
    } catch (err) { next(err); }
};

// HTTP handler: changes and saves assign role to user. It reads req data, uses models/services, and sends JSON with res.
const assignRoleToUser = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Role not found' });
        const { userId } = req.body;
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.roleId = role.id;
        await user.save();
        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};

module.exports = {
    listRoles,
    getRole,
    createRole,
    updateRole,
    deleteRole,
    listPermissions,
    createPermission,
    updateRolePermissions,
    assignRoleToUser
};
