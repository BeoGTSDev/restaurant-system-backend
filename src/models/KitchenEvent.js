// Database model: defines fields and storage rules for KitchenEvent records.
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('KitchenEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderItemId: { type: DataTypes.INTEGER, allowNull: false },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    tableId: { type: DataTypes.INTEGER, allowNull: false },
    businessDayId: { type: DataTypes.INTEGER, allowNull: true },
    fromStatus: { type: DataTypes.STRING(24), allowNull: true },
    toStatus: { type: DataTypes.STRING(24), allowNull: false },
    action: { type: DataTypes.STRING(32), allowNull: false },
    reason: { type: DataTypes.STRING(160), allowNull: true },
    performedBy: { type: DataTypes.INTEGER, allowNull: true },
    performerName: { type: DataTypes.STRING(120), allowNull: true }
}, { timestamps: true, tableName: 'kitchen_events' });
