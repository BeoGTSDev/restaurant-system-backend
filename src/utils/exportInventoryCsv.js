const fs = require('fs');
const path = require('path');
const { ProductIngredient, Product, Ingredient, sequelize } = require('../models');

const csv = value => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function exportInventoryCsv() {
    const links = await ProductIngredient.findAll({
        include: [
            { model: Product, as: 'product' },
            { model: Ingredient, as: 'ingredient' }
        ],
        order: [['productId', 'ASC'], ['ingredientId', 'ASC']]
    });
    const headers = [
        'Ingredient_Code', 'Ingredient_Name', 'Unit', 'Opening_Quantity',
        'Reorder_Level', 'Supplier', 'Inventory_Category', 'Menu_Item_No', 'Menu_Full_Name',
        'Quantity_Per_Serving'
    ];
    const lines = [headers.join(',')];
    for (const link of links) {
        const ingredient = link.ingredient;
        const product = link.product;
        lines.push([
            `ING-${String(ingredient.id).padStart(3, '0')}`,
            ingredient.name,
            ingredient.unit,
            Number(ingredient.quantity),
            Number(ingredient.reorderLevel),
            ingredient.supplier,
            ingredient.category,
            product.id,
            product.displayName || product.name,
            Number(link.quantityPerServing)
        ].map(csv).join(','));
    }
    const output = path.resolve(__dirname, 'data/inventory_recipes_database.csv');
    fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
    console.log(`Exported ${links.length} recipe rows to ${output}`);
}

if (require.main === module) {
    exportInventoryCsv()
        .then(() => sequelize.close())
        .catch(error => { console.error(error); process.exit(1); });
}

module.exports = exportInventoryCsv;
