const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const ShiftRecord = sequelize.define('ShiftRecord', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        cashierId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'id'
            }
        },
        businessDayId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        shiftName: {
            type: DataTypes.STRING,
            allowNull: true
        },
        position: {
            type: DataTypes.STRING,
            allowNull: true
        },
        area: {
            type: DataTypes.STRING,
            allowNull: true
        },
        shiftDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        cashIn: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            defaultValue: 0
        },
        cashOut: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true
        },
        totalRevenue: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            defaultValue: 0
        },
        expectedAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            comment: 'cashIn + totalRevenue'
        },
        discrepancy: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            defaultValue: 0,
            comment: 'cashOut - expectedAmount (negative = thiếu, positive = thừa)'
        },
        status: {
            type: DataTypes.ENUM('open', 'closed', 'break'),
            defaultValue: 'open'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        openedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        closedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        timestamps: true,
        tableName: 'shift_records'
    });

    return ShiftRecord;
};
