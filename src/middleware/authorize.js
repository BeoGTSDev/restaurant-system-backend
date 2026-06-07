const { verifyToken } = require('./authMiddleware');
const { Role } = require('../models');
const cache = require('../utils/permCache');

// authorize accepts a permission name, an array of permissions, or role names.
const authorize = (required) => {
    const requiredList = Array.isArray(required) ? required : [required];

    return async (req, res, next) => {
        // ensure token verified and req.user set
        if (!req.user) {
            // run verifyToken manually
            return verifyToken(req, res, async () => {
                // continue inside
                try {
                    await performCheck(req, res, next, requiredList);
                } catch (err) {
                    next(err);
                }
            });
        }

        try {
            await performCheck(req, res, next, requiredList);
        } catch (err) {
            next(err);
        }
    };
};

async function performCheck(req, res, next, requiredList) {
    // Admin bypass
    if (req.user.role === 'Admin') return next();

    // If any required entry matches the role name, allow
    if (requiredList.includes(req.user.role)) return next();

    // Otherwise check permissions
    let perms = req.user.permissions || [];
    // try cache when permissions are not present
    if ((!perms || perms.length === 0) && req.user.role) {
        const cached = cache.get(req.user.role);
        if (cached) {
            perms = cached;
            req.user.permissions = perms;
        } else {
            // load from DB and set cache
            const roleRec = await Role.findOne({ where: { name: req.user.role }, include: [{ association: 'Permissions' }] }).catch(() => null);
            if (roleRec && roleRec.Permissions) {
                perms = roleRec.Permissions.map(p => p.name);
                cache.set(req.user.role, perms, 3600);
                req.user.permissions = perms;
            }
        }
    }
    const has = requiredList.some(r => perms.includes(r));
    if (has) return next();

    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
}

module.exports = authorize;
