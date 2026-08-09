// Database model: defines fields and storage rules for CashMovement records.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('CashMovement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    businessDayId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('in', 'out'), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    reason: { type: DataTypes.STRING, allowNull: false },
    createdBy: { type: DataTypes.INTEGER, allowNull: false }
}, {
    timestamps: true,
    tableName: 'cash_movements'
});
