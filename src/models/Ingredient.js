// Database model: defines fields and storage rules for Ingredient records.
const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Ingredient', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    unit: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
    reorderLevel: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
    supplier: { type: DataTypes.STRING, allowNull: true },
    category: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Other' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'ingredients', timestamps: true });
