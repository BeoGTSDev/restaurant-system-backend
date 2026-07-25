const { sequelize, Permission, Role } = require('../models');
const { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } = require('../config/roleAccess');

const syncRoleAccess = async () => {
    await sequelize.sync();
    for (const [name, description] of PERMISSIONS) {
        const [permission] = await Permission.findOrCreate({ where: { name }, defaults: { description } });
        if (permission.description !== description) await permission.update({ description });
    }
    for (const [roleName, names] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        const [role] = await Role.findOrCreate({ where: { name: roleName }, defaults: { label: roleName } });
        const permissions = await Permission.findAll({ where: { name: names } });
        await role.setPermissions(permissions);
    }
    console.log('Role access matrix synchronized');
};

if (require.main === module) syncRoleAccess().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
module.exports = syncRoleAccess;
