// Controller file: receives request data, applies authControllers rules, and returns JSON.
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Optional speakeasy for TOTP 2FA — load lazily
let speakeasy = null;
try { speakeasy = require('speakeasy'); } catch (e) { /* will handle absence when 2FA required */ }

// HTTP handler: runs the login step. It reads req data, uses models/services, and sends JSON with res.
const login = async (req, res, next) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const user = await User.findOne({ where: { email: normalizedEmail }, include: [{ association: 'role', include: [{ association: 'Permissions' }] }] });

  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    return next(err);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    return next(err);
  }

  if (!user.isActive) {
    const err = new Error('Account is disabled');
    err.status = 403;
    return next(err);
  }

  // If this is an Admin login, enforce optional security checks
  const roleName = user.role ? String(user.role.name).toLowerCase() : '';
  const isAdmin = roleName.includes('admin');
  if (isAdmin) {
    // 1) IP whitelist: set ADMIN_ALLOWED_IPS as comma-separated list in .env
    const allowed = process.env.ADMIN_ALLOWED_IPS ? process.env.ADMIN_ALLOWED_IPS.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (allowed.length > 0) {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = forwarded ? String(forwarded).split(',')[0].trim() : req.ip;
      if (!allowed.includes(ip)) {
        const err = new Error('Admin login not allowed from this IP');
        err.status = 403;
        return next(err);
      }
    }

    // 2) Optional TOTP 2FA: enable by setting ADMIN_2FA_REQUIRED=true
    if (String(process.env.ADMIN_2FA_REQUIRED).toLowerCase() === 'true') {
      if (!speakeasy) {
        const err = new Error('2FA support not installed on server (missing speakeasy).');
        err.status = 500;
        return next(err);
      }
      // user.totpSecret must exist (base32)
      if (!user.totpSecret) {
        const err = new Error('Admin 2FA not configured for this account. Contact system administrator.');
        err.status = 403;
        return next(err);
      }
      const { totp } = req.body;
      if (!totp) {
        const err = new Error('Two-factor authentication code required for admin login');
        err.status = 401;
        return next(err);
      }
      const verified = speakeasy.totp.verify({ secret: user.totpSecret, encoding: 'base32', token: String(totp).trim(), window: 1 });
      if (!verified) {
        const err = new Error('Invalid two-factor authentication code');
        err.status = 401;
        return next(err);
      }
    }
  }

  const permissions = (user.role && user.role.Permissions) ? user.role.Permissions.map(p => p.name) : [];
  const payload = { id: user.id, roleId: user.roleId, role: user.role ? user.role.name : null, permissions };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

  res.status(200).json({
    success: true,
    message: 'Login successfully!',
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role ? user.role.name : null,
      permissions
    }
  });
};

// HTTP handler: runs the staff login step. It reads req data, uses models/services, and sends JSON with res.
const staffLogin = async (req, res, next) => {
  const { staffCode, pin } = req.body;

  const user = await User.findOne({ where: { staffCode }, include: [{ association: 'role', include: [{ association: 'Permissions' }] }] });

  if (!user) {
    const err = new Error('Invalid staff code or PIN');
    err.status = 401;
    return next(err);
  }

  const isMatch = await bcrypt.compare(pin, user.password);
  if (!isMatch) {
    const err = new Error('Invalid staff code or PIN');
    err.status = 401;
    return next(err);
  }

  if (!user.isActive) {
    const err = new Error('Account is disabled');
    err.status = 403;
    return next(err);
  }

  const permissions = (user.role && user.role.Permissions) ? user.role.Permissions.map(p => p.name) : [];
  const payload = { id: user.id, roleId: user.roleId, role: user.role ? user.role.name : null, permissions };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

  res.status(200).json({
    success: true,
    message: 'Staff login successfully!',
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      staffCode: user.staffCode,
      role: user.role ? user.role.name : null,
      permissions
    }
  });
};

// HTTP handler: runs the register step. It reads req data, uses models/services, and sends JSON with res.
const register = async (req, res, next) => {
  const { fullName, password, email } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const existingUser = await User.findOne({ where: { email: normalizedEmail } });
  if (existingUser) {
    const err = new Error('Email already exists');
    err.status = 400;
    return next(err);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const newUser = await User.create({ fullName, email: normalizedEmail, password: hashedPassword });

  res.status(201).json({
    success: true,
    message: 'User registered successfully!',
    data: { id: newUser.id, username: newUser.fullName, email: newUser.email }
  });
};

// HTTP handler: runs the authorize supervisor action step. It reads req data, uses models/services, and sends JSON with res.
const authorizeSupervisorAction = async (req, res, next) => {
  const { staffCode } = req.body;
  const user = await User.findOne({ where: { staffCode }, include: [{ association: 'role' }] });
  const allowedRoles = ['admin', 'leader', 'assistantmanager', 'rm'];
  const roleName = String(user?.role?.name || '').toLowerCase();
  if (!user || !user.isActive || !allowedRoles.includes(roleName)) {
    const err = new Error('Supervisor approval denied. Use an active Leader, Assistant Manager, RM or Admin staff code.');
    err.status = 403;
    return next(err);
  }
  res.status(200).json({
    success: true,
    data: { id: user.id, fullName: user.fullName, role: user.role.name }
  });
};

module.exports = { login, staffLogin, register, authorizeSupervisorAction };
