// Database model: defines fields and storage rules for ShiftAreaConfig records.
const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('ShiftAreaConfig', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    businessDayId: { type: DataTypes.INTEGER, allowNull: false },
    shiftName: { type: DataTypes.STRING, allowNull: false },
    zoneId: { type: DataTypes.INTEGER, allowNull: false },
    isOpen: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
    tableName: 'shift_area_configs',
    timestamps: true,
    indexes: [{ unique: true, fields: ['businessDayId', 'shiftName', 'zoneId'] }]
});
