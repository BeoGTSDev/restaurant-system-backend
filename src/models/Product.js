const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Category = require('./Category');

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    // Optional alternate names for different UIs
    internalName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    displayName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    },
    price: {
        type: DataTypes.INTEGER, 
        allowNull: false
    },
    imageUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },
    categoryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Category,
            key: 'id'
        }
    },
    status: {
        type: DataTypes.ENUM('In Stock', 'Out of Stock', 'Disabled'),
        allowNull: false,
        defaultValue: 'In Stock'
    },
    remainingQty: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    }
}, {
    timestamps: true
});

module.exports = Product;