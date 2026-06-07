const { Role, Permission, User } = require('../models');

const listRoles = async (req, res, next) => {
    try {
        const roles = await Role.findAll({ include: [{ association: 'Permissions' }] });
        res.json({ success: true, data: roles });
    } catch (err) { next(err); }
};

const getRole = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id, { include: [{ association: 'Permissions' }] });
        if (!role) return res.status(404).json({ message: 'Role not found' });
        res.json({ success: true, data: role });
    } catch (err) { next(err); }
};

const createRole = async (req, res, next) => {
    try {
        const { name, label, description } = req.body;
        const role = await Role.create({ name, label, description });
        res.status(201).json({ success: true, data: role });
    } catch (err) { next(err); }
};

const updateRole = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Role not found' });
        await role.update(req.body);
        res.json({ success: true, data: role });
    } catch (err) { next(err); }
};

const deleteRole = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Role not found' });
        await role.destroy();
        res.json({ success: true });
    } catch (err) { next(err); }
};

const listPermissions = async (req, res, next) => {
    try {
        const perms = await Permission.findAll();
        res.json({ success: true, data: perms });
    } catch (err) { next(err); }
};

const createPermission = async (req, res, next) => {
    try {
        const { name, description } = req.body;
        const perm = await Permission.create({ name, description });
        res.status(201).json({ success: true, data: perm });
    } catch (err) { next(err); }
};

const updateRolePermissions = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Role not found' });
        const { permissions } = req.body; // array of permission names
        const perms = await Permission.findAll({ where: { name: permissions } });
        await role.setPermissions(perms);
        const updated = await Role.findByPk(req.params.id, { include: [{ association: 'Permissions' }] });
        res.json({ success: true, data: updated });
    } catch (err) { next(err); }
};

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
