// Database model: defines fields and storage rules for RolePermission records.
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RolePermission = sequelize.define('RolePermission', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    roleId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    permissionId: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    timestamps: false
});

module.exports = RolePermission;
