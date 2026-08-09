// Reusable helper code used by startup or business files.
const { sequelize, User, Role, Permission } = require('../models');

// Helper: checks check admin and returns a safe yes/no result and returns the value to its caller.
async function checkAdmin() {
    try {
        await sequelize.authenticate();
        console.log('DB connected — checking admin users');

        const admins = await User.findAll({ where: { email: 'admin@rms.com' }, include: [{ model: Role, as: 'role', include: [{ model: Permission, through: { attributes: [] } }] }] });
        if (!admins || admins.length === 0) {
            console.log('No user with email admin@rms.com found. Listing first 5 users:');
            const users = await User.findAll({ limit: 5, include: [{ model: Role, as: 'role' }] });
            users.forEach(u => console.log(u.id, u.email, u.staffCode, 'roleId=', u.roleId, 'role=', u.role?.name));
            process.exit(0);
        }

        for (const a of admins) {
            console.log('Found admin:', a.id, a.email, 'staffCode=', a.staffCode, 'roleId=', a.roleId, 'role=', a.role?.name);
            if (a.role && a.role.Permissions) console.log('Permissions:', a.role.Permissions.map(p => p.name));
        }
        process.exit(0);
    } catch (err) {
        console.error('Check failed:', err);
        process.exit(1);
    }
}

if (require.main === module) checkAdmin();
