// Database model: defines fields and storage rules for ReceiptItem records.
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('ReceiptItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    receiptId: { type: DataTypes.INTEGER, allowNull: false },
    orderId: { type: DataTypes.INTEGER, allowNull: true },
    productId: { type: DataTypes.INTEGER, allowNull: true },
    productName: { type: DataTypes.STRING, allowNull: false },
    categoryName: { type: DataTypes.STRING, allowNull: true },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    unitPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    lineTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    note: { type: DataTypes.STRING, allowNull: true }
}, { tableName: 'receipt_items', timestamps: true });
