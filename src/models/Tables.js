const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Table = sequelize.define('Tables', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },

    status: {
        type: DataTypes.STRING,
        defaultValue: 'Ready'
    },

    guestCount: {
        type: DataTypes.STRING,
        allowNull: true
    },

    nationality: {
        type: DataTypes.STRING,
        allowNull: true
    },
    guestLanguage: { type: DataTypes.STRING(8), allowNull: true },
    guestAllergies: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },

    specialNote: {
        type: DataTypes.STRING,
        allowNull: true
    },
    allergyNote: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    zoneId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    assignedStaffId: { type: DataTypes.INTEGER, allowNull: true }
    ,
    qrCode: { type: DataTypes.STRING(64), allowNull: true, unique: true },
    qrSessionActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    qrSessionVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    qrSessionOpenedAt: { type: DataTypes.DATE, allowNull: true },
    billVoucherCode: { type: DataTypes.STRING(16), allowNull: true },
    billDiscountPercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    billDiscountReason: { type: DataTypes.STRING, allowNull: true },
    billDiscountApprovedBy: { type: DataTypes.INTEGER, allowNull: true }
},{
    timestamps: true
});

module.exports = Table;
