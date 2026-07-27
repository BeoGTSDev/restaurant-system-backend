const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('KitchenBillHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    tableId: { type: DataTypes.INTEGER, allowNull: false },
    tableName: { type: DataTypes.STRING(80), allowNull: false },
    orderNumber: { type: DataTypes.INTEGER, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: false },
    snapshot: { type: DataTypes.JSONB, allowNull: false }
}, {
    timestamps: true,
    tableName: 'kitchen_bill_history',
    indexes: [{ fields: ['completedAt'] }, { fields: ['tableId'] }]
});
