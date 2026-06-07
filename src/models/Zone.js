const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Zone = sequelize.define('Zone', {
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
    description: {
        type: DataTypes.STRING
    }
}, {
    timestamps: true
});

module.exports = Zone;
