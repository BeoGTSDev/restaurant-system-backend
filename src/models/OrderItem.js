const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OrderItem = sequelize.define('OrderItem', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    price: { 
        type: DataTypes.INTEGER, 
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM(
            'Pending', 
            'Fired',   
            'Cooking',  
            'Ready',   
            'Pickup',
            'Served', 
            'Cancelled', 
            'Remake',  
            'Fail'
        ),
        defaultValue: 'Pending'
    },
    note: {
        type: DataTypes.STRING,
        allowNull: true
    },
    courseTiming: { type: DataTypes.ENUM('ALL_NOW', 'SHARE', 'SAME_TIME'), allowNull: false, defaultValue: 'ALL_NOW' },
    orderSource: { type: DataTypes.ENUM('STAFF', 'CUSTOMER'), allowNull: false, defaultValue: 'STAFF' },
    orderedByName: { type: DataTypes.STRING(120), allowNull: true },
    priority: { type: DataTypes.ENUM('NORMAL', 'ASAP', 'REMAKE'), allowNull: false, defaultValue: 'NORMAL' },
    prepMinutes: { type: DataTypes.INTEGER, allowNull: true },
    firedAt: { type: DataTypes.DATE, allowNull: true },
    cookingAt: { type: DataTypes.DATE, allowNull: true },
    pickupAt: { type: DataTypes.DATE, allowNull: true },
    servedAt: { type: DataTypes.DATE, allowNull: true },
    previousStatus: { type: DataTypes.STRING(24), allowNull: true },
    failReason: { type: DataTypes.STRING(120), allowNull: true },
    cancelledBy: { type: DataTypes.INTEGER, allowNull: true },
    cancellationApprovedBy: { type: DataTypes.INTEGER, allowNull: true },
    cancellationReason: { type: DataTypes.STRING, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true }
},
    {
        timestamps: true
    });

module.exports = OrderItem;
