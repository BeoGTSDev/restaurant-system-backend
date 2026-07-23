// backend/src/controllers/userController.js
const { User, Role } = require('../models');
const bcrypt = require('bcryptjs');


const createUser = async (req, res, next) => {
  const { fullName, email, password, pin, staffCode, roleId } = req.body;
  const secret = password || pin;

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    const err = new Error('Email already exists');
    err.status = 400;
    return next(err);
  }


  if (!staffCode) {
    const err = new Error('Staff code is required');
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

const getAllUser = async (req, res, next) => {
  const users = await User.findAll({
    attributes: { exclude: ['password'] },
    include: [{ model: Role, as: 'role', attributes: ['id', 'name', 'label'] }]
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

module.exports = { createUser, getAllUser, updateUser, deleteUser };
