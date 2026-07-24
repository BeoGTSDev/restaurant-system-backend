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
