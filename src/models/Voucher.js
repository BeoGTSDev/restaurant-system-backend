const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('Voucher', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(16), allowNull: false, unique: true },
    scope: { type: DataTypes.ENUM('DRINK', 'FOOD'), allowNull: false },
    discountPercent: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    usageLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    usedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    validFrom: { type: DataTypes.DATEONLY, allowNull: true },
    validUntil: { type: DataTypes.DATEONLY, allowNull: true }
}, { tableName: 'vouchers', timestamps: true });
