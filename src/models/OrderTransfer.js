// Database model: defines fields and storage rules for OrderTransfer records.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const OrderTransfer = sequelize.define('OrderTransfer', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        originalOrderId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Orders',
                key: 'id'
            }
        },
        newOrderId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Orders',
                key: 'id'
            }
        },
        transferredItemCount: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        transferredAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        transferredBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'Users',
                key: 'id'
            },
            comment: 'Waiter/Staff who performed the transfer'
        },
        businessDayId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        shiftId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        itemIds: {
            type: DataTypes.JSON,
            allowNull: false,
            comment: 'Array of transferred OrderItem IDs for audit'
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Why items were transferred (e.g., "customer payment preference")'
        },
        status: {
            type: DataTypes.ENUM('pending', 'completed', 'reversed'),
            defaultValue: 'completed'
        }
    }, {
        timestamps: true,
        tableName: 'order_transfers'
    });

    return OrderTransfer;
};
