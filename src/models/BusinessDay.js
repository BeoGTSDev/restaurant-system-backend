// Database model: defines fields and storage rules for BusinessDay records.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('BusinessDay', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    businessDate: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('open', 'closed'),
        allowNull: false,
        defaultValue: 'open'
    },
    startedBy: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    startedAt: {
        type: DataTypes.DATE,
        allowNull: false
    },
    openingCash: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
    },
    openingDenominations: {
        type: DataTypes.JSON,
        allowNull: true
    },
    closingCash: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true
    },
    closingDenominations: {
        type: DataTypes.JSON,
        allowNull: true
    },
    cashSales: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
    },
    expectedCash: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true
    },
    difference: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true
    },
    foodVatActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    foodVatRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 8 },
    alcoholVatActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    alcoholVatRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 10 },
    serviceChargeActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    serviceChargeRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    serviceChargeName: { type: DataTypes.STRING, allowNull: true },
    closedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    note: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    timestamps: true,
    tableName: 'business_days'
});
