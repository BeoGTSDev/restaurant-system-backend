const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('ProductIngredient', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    ingredientId: { type: DataTypes.INTEGER, allowNull: false },
    quantityPerServing: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: false }
}, {
    tableName: 'product_ingredients',
    timestamps: true,
    indexes: [{ unique: true, fields: ['productId', 'ingredientId'] }]
});
