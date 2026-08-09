// Database model: defines fields and storage rules for PaymentTransaction records.
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('PaymentTransaction', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'SePay' },
    reference: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    providerTransactionId: { type: DataTypes.STRING(64), allowNull: true, unique: true },
    businessDayId: { type: DataTypes.INTEGER, allowNull: false },
    tableId: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    receiptId: { type: DataTypes.INTEGER, allowNull: true },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    status: {
        type: DataTypes.ENUM('Pending', 'Paid', 'Failed', 'Expired'),
        allowNull: false,
        defaultValue: 'Pending'
    },
    billSnapshot: { type: DataTypes.JSON, allowNull: false },
    clientTokenHash: { type: DataTypes.STRING(64), allowNull: false },
    rawCallback: { type: DataTypes.JSON, allowNull: true },
    failureReason: { type: DataTypes.STRING, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    paidAt: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'payment_transactions',
    timestamps: true,
    indexes: [
        { fields: ['tableId', 'status'] },
        { fields: ['businessDayId', 'status'] }
    ]
});
