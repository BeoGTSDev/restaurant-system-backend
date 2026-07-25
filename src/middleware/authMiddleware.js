const jwt = require('jsonwebtoken');
const { User, Role, Permission } = require('../models');

// Support both 'auth-token' and 'Authorization: Bearer <token>' formats
const extractToken = (req) => {
    let token = req.header('auth-token');
    if (!token) {
        const authHeader = req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
    }
    return token;
};

const verifyToken = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: 'Access Denied: No Token Provided' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        // load fresh user with role + permissions
        const user = await User.findByPk(payload.id, {
            include: [{ association: 'role', include: [{ association: 'Permissions' }] }]
        });

        if (!user) return res.status(401).json({ message: 'Invalid Token: user not found' });

        const permissions = (user.role && user.role.Permissions) ? user.role.Permissions.map(p => p.name) : [];

        req.user = {
            id: user.id,
            roleId: user.roleId,
            role: user.role ? user.role.name : null,
            permissions,
        };

        next();
    } catch (error) {
        const expired = error?.name === 'TokenExpiredError';
        res.status(401).json({
            message: expired ? 'Session expired. Please log in again.' : 'Invalid authentication token.'
        });
    }
};

const verifyAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') return next();
    return res.status(403).json({ message: 'Admin role required' });
};

// authorize by permission name (string) or allow array of permissions
const authorize = (required) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

        if (req.user.role === 'Admin') return next(); // Admin bypass

        const requiredList = Array.isArray(required) ? required : [required];
        const has = requiredList.some(r => req.user.permissions.includes(r));
        if (!has) return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
        next();
    };
};

module.exports = { verifyToken, verifyAdmin };
