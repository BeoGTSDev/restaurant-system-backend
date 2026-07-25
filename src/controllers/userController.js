// backend/src/controllers/userController.js
const { Op } = require('sequelize');
const { User, Role, ShiftRecord } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generateNextStaffCode = async () => {
  const users = await User.findAll({
    attributes: ['staffCode'],
    where: { staffCode: { [Op.not]: null } },
    raw: true
  });
  const highest = users.reduce((max, item) => {
    const numeric = Number.parseInt(String(item.staffCode || '').replace(/\D/g, ''), 10);
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);
  return String(highest + 1).padStart(4, '0');
};

const createUser = async (req, res, next) => {
  const { fullName, email, password, pin, roleId } = req.body;
  const staffCode = String(req.body.staffCode || await generateNextStaffCode()).trim();
  const secret = password || pin;

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    const err = new Error('Email already exists');
    err.status = 400;
    return next(err);
  }


  if (!roleId) {
    const err = new Error('Role is required');
    err.status = 400;
    return next(err);
  }

  const role = await Role.findByPk(roleId);
  if (!role) {
    const err = new Error('Role not found');
    err.status = 404;
    return next(err);
  }

  if (!secret) {
    const err = new Error('PIN is required');
    err.status = 400;
    return next(err);
  }

  if (!/^\d{4}$/.test(String(secret))) {
    const err = new Error('PIN must be exactly 4 digits');
    err.status = 400;
    return next(err);
  }

  const existingStaffCode = await User.findOne({ where: { staffCode } });
  if (existingStaffCode) {
    const err = new Error('Staff code already exists');
    err.status = 400;
    return next(err);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(String(secret), salt);

  const newUser = await User.create({ fullName, email, password: hashedPassword, staffCode, roleId: role.id, isActive: true });

  res.status(201).json({
    success: true,
    message: 'Create Staff successfully!',
    user: { id: newUser.id, email: newUser.email, staffCode: newUser.staffCode, roleId: newUser.roleId }
  });
};

const getNextStaffCode = async (req, res) => {
  res.status(200).json({
    success: true,
    data: { staffCode: await generateNextStaffCode() }
  });
};

const getMe = async (req, res, next) => {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ['password', 'totpSecret'] },
    include: [{ model: Role, as: 'role', attributes: ['id', 'name', 'label'] }]
  });
  if (!user) return next(Object.assign(new Error('User not found'), { status: 404 }));
  res.json({ success: true, data: user });
};

const changeMyPin = async (req, res, next) => {
  const currentPin = String(req.body?.currentPin || '');
  const newPin = String(req.body?.newPin || '');
  if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
    return next(Object.assign(new Error('Current and new PIN must be exactly 4 digits'), { status: 400 }));
  }
  const user = await User.findByPk(req.user.id);
  if (!user || !(await bcrypt.compare(currentPin, user.password))) {
    return next(Object.assign(new Error('Current PIN is incorrect'), { status: 403 }));
  }
  user.password = await bcrypt.hash(newPin, 10);
  await user.save({ fields: ['password'] });
  res.json({ success: true, message: 'PIN changed successfully' });
};

const impersonateUser = async (req, res, next) => {
  const user = await User.findByPk(req.params.id, {
    include: [{ model: Role, as: 'role', include: [{ association: 'Permissions' }] }]
  });
  if (!user || !user.isActive) return next(Object.assign(new Error('Target account is missing or inactive'), { status: 404 }));
  if (user.role?.name === 'Admin') return next(Object.assign(new Error('Admin accounts cannot be impersonated'), { status: 400 }));
  const permissions = (user.role?.Permissions || []).map(permission => permission.name);
  const token = jwt.sign({
    id: user.id,
    roleId: user.roleId,
    role: user.role?.name || null,
    permissions,
    impersonatedBy: req.user.id
  }, process.env.JWT_SECRET, { expiresIn: '2h' });
  console.info(`Admin ${req.user.id} impersonated user ${user.id}`);
  res.json({
    success: true,
    message: `Logged in as ${user.fullName}`,
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, staffCode: user.staffCode, role: user.role?.name || null, permissions },
    impersonatedBy: req.user.id
  });
};

const getAllUser = async (req, res, next) => {
  const users = await User.findAll({
    attributes: { exclude: ['password'] },
    include: [
      { model: Role, as: 'role', attributes: ['id', 'name', 'label'] },
      {
        model: ShiftRecord,
        as: 'shifts',
        where: { status: 'open' },
        required: false,
        attributes: ['id', 'shiftName', 'position', 'area', 'openedAt', 'status']
      }
    ]
  });

  res.status(200).json({
    success: true,
    message: 'Get all users successfully',
    data: users
  });
};

const updateUser = async (req, res, next) => {
  const { id } = req.params;
  const { fullName, email, password, pin, isActive, staffCode, roleId } = req.body;

  const user = await User.findByPk(id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    return next(err);
  }

  if (email && email !== user.email) {
    const exist = await User.findOne({ where: { email } });
    if (exist) {
      const err = new Error('Email already in use');
      err.status = 400;
      return next(err);
    }
  }

  if (staffCode && staffCode !== user.staffCode) {
    const exist = await User.findOne({ where: { staffCode } });
    if (exist) {
      const err = new Error('Staff code already in use');
      err.status = 400;
      return next(err);
    }
  }

  if (roleId !== undefined) {
    const role = await Role.findByPk(roleId);
    if (!role) {
      const err = new Error('Role not found');
      err.status = 404;
      return next(err);
    }
    user.roleId = role.id;
  }

  const secret = password || pin;
  if (secret) {
    if (!/^\d{4}$/.test(String(secret))) {
      const err = new Error('PIN must be exactly 4 digits');
      err.status = 400;
      return next(err);
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(String(secret), salt);
  }

  if (fullName !== undefined) user.fullName = fullName;
  if (email !== undefined) user.email = email;
  if (staffCode !== undefined) user.staffCode = staffCode;
  if (isActive !== undefined) user.isActive = isActive;

  await user.save();

  res.status(200).json({
    success: true,
    message: 'User updated',
    user: { id: user.id, fullName: user.fullName, email: user.email, roleId: user.roleId, isActive: user.isActive }
  });
};

const updateUserStatus = async (req, res, next) => {
  const { id } = req.params;
  if (typeof req.body?.isActive !== 'boolean') {
    const err = new Error('Active status must be true or false');
    err.status = 400;
    return next(err);
  }

  const user = await User.findByPk(id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    return next(err);
  }

  user.isActive = req.body.isActive;
  await user.save({ fields: ['isActive'] });

  res.status(200).json({
    success: true,
    message: user.isActive ? 'Staff account activated' : 'Staff account deactivated',
    data: { id: user.id, isActive: Boolean(user.isActive) }
  });
};

const deleteUser = async (req, res, next) => {
  const { id } = req.params;
  const user = await User.findByPk(id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    return next(err);
  }

  await user.destroy();
  res.status(200).json({ success: true, message: 'User deleted' });
};

module.exports = { createUser, getNextStaffCode, getMe, changeMyPin, impersonateUser, getAllUser, updateUser, updateUserStatus, deleteUser };
