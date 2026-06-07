const bcrypt = require('bcryptjs');
const { User, Role, Permission } = require('../models');

const PERMISSIONS = [
    'manage_users',
    'view_reports',
    'cashout',
    'create_order',
    'update_order',
    'delete_order',
    'manage_products',
    'manage_categories',
    'manage_tables',
    'manage_shifts',
    'approve_booking',
    'manage_inventory',
    'view_orders',
    'update_order_status',
    'manage_roles'
];

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

const ROLE_PERMISSIONS = {
    Admin: PERMISSIONS,
    RM: ['manage_products', 'manage_categories', 'manage_tables', 'view_reports', 'manage_shifts', 'manage_inventory'],
    AssistantManager: ['manage_products', 'manage_tables', 'view_reports'],
    Leader: ['manage_tables', 'view_orders'],
    Waiter: ['create_order', 'update_order'],
    Reception: ['approve_booking', 'create_order'],
    Cashier: ['cashout', 'view_reports'],
    Chef: ['view_orders', 'update_order_status'],
    HR: ['manage_users'],
    SupplyManager: ['manage_inventory'],
    Customer: ['create_order']
};

const initData = async () => {
    try {
        // create permissions
        for (const permName of PERMISSIONS) {
            await Permission.findOrCreate({ where: { name: permName }, defaults: { description: permName } });
        }

        // create roles
        const roleMap = {};
        for (const roleName of ROLES) {
            const [role] = await Role.findOrCreate({ where: { name: roleName }, defaults: { label: roleName } });
            roleMap[roleName] = role;
        }

        // assign permissions to roles
        for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
            const role = roleMap[roleName];
            if (!role) continue;
            const permRecords = await Permission.findAll({ where: { name: perms } });
            await role.setPermissions(permRecords);
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
