// Database model: defines fields and storage rules for IdempotencyRecord records.
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('IdempotencyRecord', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    method: { type: DataTypes.STRING(8), allowNull: false },
    path: { type: DataTypes.STRING(255), allowNull: false },
    statusCode: { type: DataTypes.INTEGER, allowNull: true },
    responseBody: { type: DataTypes.JSON, allowNull: true },
    completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
    tableName: 'idempotency_records',
    timestamps: true,
    indexes: [{ unique: true, fields: ['key'] }]
});
