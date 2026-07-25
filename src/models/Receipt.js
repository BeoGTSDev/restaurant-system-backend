const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('Receipt', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    receiptNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    businessDayId: { type: DataTypes.INTEGER, allowNull: false },
    tableId: { type: DataTypes.INTEGER, allowNull: true },
    tableName: { type: DataTypes.STRING, allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    discountAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    totalAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    paymentMethod: { type: DataTypes.STRING, allowNull: false },
    cashReceived: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    changeDue: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    voucherCode: { type: DataTypes.STRING(16), allowNull: true },
    billDiscountPercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    billDiscountAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    billDiscountReason: { type: DataTypes.STRING, allowNull: true },
    foodVatAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    alcoholVatAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    serviceChargeAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    serviceChargeName: { type: DataTypes.STRING, allowNull: true },
    paidBy: { type: DataTypes.INTEGER, allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { tableName: 'receipts', timestamps: true });
