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
    cancelledBy: { type: DataTypes.INTEGER, allowNull: true },
    cancellationApprovedBy: { type: DataTypes.INTEGER, allowNull: true },
    cancellationReason: { type: DataTypes.STRING, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true }
},
    {
        timestamps: true
    });

module.exports = OrderItem;
