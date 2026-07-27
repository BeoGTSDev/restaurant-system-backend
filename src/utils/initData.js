const bcrypt = require('bcryptjs');
const { User, Role, Permission } = require('../models');
const { PERMISSIONS: PERMISSION_DEFINITIONS, DEFAULT_ROLE_PERMISSIONS } = require('../config/roleAccess');
const PERMISSIONS = PERMISSION_DEFINITIONS.map(([name]) => name);

const ROLES = [
    'Admin',
    'RM',
    'AssistantManager',
    'Leader',
    'Waiter',
    'Reception',
    'Cashier',
    'Chef',
    'HR',
    'SupplyManager',
    'Customer'
];

const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

const initData = async () => {
    try {
        // create permissions
        const newlyCreatedPermissions = new Set();
        for (const [permName, description] of PERMISSION_DEFINITIONS) {
            const [permission, created] = await Permission.findOrCreate({ where: { name: permName }, defaults: { description } });
            if (created) newlyCreatedPermissions.add(permission.name);
        }

        // create roles
        const roleMap = {};
        const newlyCreatedRoles = new Set();
        for (const roleName of ROLES) {
            const [role, created] = await Role.findOrCreate({ where: { name: roleName }, defaults: { label: roleName } });
            roleMap[roleName] = role;
            if (created) newlyCreatedRoles.add(roleName);
        }

        // Apply the full default matrix only to new roles. Existing role choices
        // made in Roles & Access are preserved; only newly introduced permissions
        // are added according to their default role mapping.
        for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
            const role = roleMap[roleName];
            if (!role) continue;
            const namesToAdd = newlyCreatedRoles.has(roleName)
                ? perms
                : perms.filter(name => newlyCreatedPermissions.has(name));
            if (!namesToAdd.length) continue;
            const permRecords = await Permission.findAll({ where: { name: namesToAdd } });
            await role.addPermissions(permRecords);
        }

        // create admin user if none exists
        const userCount = await User.count();
        if (userCount === 0) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);
            const adminRole = roleMap['Admin'];

            const admin = await User.create({
                fullName: 'System Admin',
                email: 'admin@rms.com',
                password: hashedPassword,
                isActive: true,
                roleId: adminRole ? adminRole.id : null
            });

            // If ADMIN_2FA_REQUIRED is set, attempt to generate a TOTP secret for admin
            try {
                if (String(process.env.ADMIN_2FA_REQUIRED).toLowerCase() === 'true') {
                    let speakeasy;
                    try { speakeasy = require('speakeasy'); } catch (e) { speakeasy = null; }
                    if (speakeasy) {
                        const secret = speakeasy.generateSecret({ name: 'RMS Admin (' + admin.email + ')' });
                        admin.totpSecret = secret.base32;
                        await admin.save();
                        console.log('Admin 2FA secret generated. Add this to your authenticator app using this URL:');
                        console.log(secret.otpauth_url);
                    } else {
                        console.log('ADMIN_2FA_REQUIRED is true but speakeasy is not installed; please install speakeasy to enable 2FA.');
                    }
                }
            } catch (e) {
                console.warn('Failed to auto-generate admin 2FA secret:', e.message || e);
            }

            console.log('Admin user created | Email: admin@rms.com | Password: admin123');
        }

        console.log('Roles and permissions initialized');
    } catch (error) {
        console.error('Error initializing data:', error);
    }
};

if (require.main === module) {
    initData().then(() => {
        console.log('initData finished');
        process.exit(0);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = initData;
