const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('InventoryMovement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ingredientId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('in', 'out', 'adjust'), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    beforeQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    afterQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    reason: { type: DataTypes.STRING, allowNull: false },
    performedBy: { type: DataTypes.INTEGER, allowNull: true },
    businessDayId: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'inventory_movements', timestamps: true });
