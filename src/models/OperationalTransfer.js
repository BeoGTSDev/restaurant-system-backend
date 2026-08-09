// Database model: defines fields and storage rules for OperationalTransfer records.
const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('OperationalTransfer', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.ENUM('table', 'staff'), allowNull: false },
    sourceTableId: { type: DataTypes.INTEGER, allowNull: true },
    targetTableId: { type: DataTypes.INTEGER, allowNull: true },
    fromStaffId: { type: DataTypes.INTEGER, allowNull: true },
    toStaffId: { type: DataTypes.INTEGER, allowNull: true },
    performedBy: { type: DataTypes.INTEGER, allowNull: false },
    businessDayId: { type: DataTypes.INTEGER, allowNull: true },
    shiftId: { type: DataTypes.INTEGER, allowNull: true },
    reason: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'completed' }
}, { timestamps: true, tableName: 'operational_transfers' });
