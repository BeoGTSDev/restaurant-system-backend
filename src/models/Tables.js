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
    qrSessionOpenedAt: { type: DataTypes.DATE, allowNull: true }
},{
    timestamps: true
});

module.exports = Table;
