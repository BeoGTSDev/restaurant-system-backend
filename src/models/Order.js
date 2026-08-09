// Database model: defines fields and storage rules for Order records.
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    totalPrice: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'Pending'
    },
    businessDayId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    dayOrderNumber: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    shiftId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    paidBy: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
},{
    timestamps: true,
    indexes: [{ unique: true, fields: ['businessDayId', 'dayOrderNumber'] }]
});

module.exports = Order;
