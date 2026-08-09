// Reusable helper code used by startup or business files.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Op } = require('sequelize');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { sequelize, Category, Product, Zone, Table, Ingredient, ProductIngredient } = require('../models');
const inventoryCategory = require('./inventoryCategory');

// Helper: turns input values into parse csvline and returns the value to its caller.
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (inQuotes) {
            if (character === '"') {
                if (line[index + 1] === '"') {
                    current += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                current += character;
            }
        } else if (character === ',') {
            result.push(current);
            current = '';
        } else if (character === '"') {
            inQuotes = true;
        } else {
            current += character;
        }
    }

    result.push(current);
    return result;
}

// Helper: loads read csv rows data and returns the value to its caller.
function readCsvRows(csvPath, requiredHeaders) {
    if (!csvPath) {
        throw new Error('CSV file not found');
    }

    const lines = fs.readFileSync(csvPath, 'utf8')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter(line => line.trim() !== '');

    if (lines.length === 0) {
        throw new Error(`CSV file is empty: ${csvPath}`);
    }

    const headers = parseCSVLine(lines.shift()).map(header => header.trim());
    const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
    const missingHeaders = requiredHeaders.filter(header => headerIndex[header] === undefined);

    if (missingHeaders.length > 0) {
        throw new Error(`Invalid CSV headers in ${path.basename(csvPath)}. Missing: ${missingHeaders.join(', ')}`);
    }

    return lines.map(line => {
        const columns = parseCSVLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, (columns[index] || '').trim()]));
    });
}

// Helper: runs the find csv path step and returns the value to its caller.
function findCsvPath(environmentPath, fileName) {
    const candidates = [
        environmentPath,
        path.resolve(__dirname, `data/${fileName}`),
        path.resolve(__dirname, `../../${fileName}`),
        path.resolve(__dirname, `../../database/${fileName}`)
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate));
}

// Helper: runs the import menu data step and returns the value to its caller.
async function importMenuData(csvPath, transaction) {
    const rows = readCsvRows(csvPath, ['Full_Name', 'Price_VND', 'Category']);
    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
        const fullName = row.Full_Name;
        const categoryName = row.Category;
        if (!fullName || !categoryName) {
            skipped += 1;
            continue;
        }

        const [category] = await Category.findOrCreate({
            where: { name: categoryName },
            defaults: { description: null },
            transaction
        });

        const existingProduct = await Product.findOne({ where: { name: fullName }, transaction });
        if (existingProduct) {
            skipped += 1;
            continue;
        }

        const price = parseInt(row.Price_VND.replace(/[^0-9]/g, '') || '0', 10) || 0;
        await Product.create({
            name: fullName,
            internalName: row.Internal_Name || null,
            displayName: fullName,
            description: row.Description || null,
            price,
            imageUrl: null,
            categoryId: category.id,
            status: 'In Stock',
            remainingQty: null
        }, { transaction });
        inserted += 1;
    }

    return { inserted, skipped };
}

// Helper: runs the import tables and zones data step and returns the value to its caller.
async function importTablesAndZonesData(csvPath, transaction) {
    const rows = readCsvRows(csvPath, ['Zone_Name', 'Zone_Description', 'Table_Name']);
    let zonesCreated = 0;
    let tablesCreated = 0;
    let skipped = 0;

    for (const row of rows) {
        if (!row.Zone_Name || !row.Table_Name) {
            skipped += 1;
            continue;
        }

        const [zone, zoneCreated] = await Zone.findOrCreate({
            where: { name: row.Zone_Name },
            defaults: { description: row.Zone_Description || null },
            transaction
        });
        if (zoneCreated) zonesCreated += 1;

        const [table, tableCreated] = await Table.findOrCreate({
            where: { name: row.Table_Name },
            defaults: { zoneId: zone.id, status: 'Ready' },
            transaction
        });
        if (tableCreated) {
            tablesCreated += 1;
        } else if (table.zoneId !== zone.id) {
            skipped += 1;
            console.warn(`Skipping existing table with a different zone: ${table.name}`);
        } else {
            skipped += 1;
        }
    }

    return { zonesCreated, tablesCreated, skipped };
}

// Helper: runs the import inventory data step and returns the value to its caller.
async function importInventoryData(csvPath, transaction) {
    const rows = readCsvRows(csvPath, [
        'Ingredient_Name', 'Unit', 'Opening_Quantity', 'Reorder_Level',
        'Menu_Item_No', 'Menu_Full_Name', 'Quantity_Per_Serving'
    ]);
    const productIds = [...new Set(rows.map(row => Number(row.Menu_Item_No)).filter(Boolean))];
    const products = await Product.findAll({ where: { id: { [Op.in]: productIds } }, transaction });
    const productMap = new Map(products.map(product => [product.id, product]));

    const ingredientDefinitions = new Map();
    for (const row of rows) {
        if (row.Ingredient_Name && !ingredientDefinitions.has(row.Ingredient_Name)) {
            ingredientDefinitions.set(row.Ingredient_Name, {
                name: row.Ingredient_Name,
                unit: row.Unit,
                quantity: Number(row.Opening_Quantity || 0),
                reorderLevel: Number(row.Reorder_Level || 0),
                supplier: row.Supplier || null,
                category: row.Inventory_Category || inventoryCategory(row.Ingredient_Name),
                isActive: true
            });
        }
    }
    const ingredientNames = [...ingredientDefinitions.keys()];
    const existingIngredients = await Ingredient.findAll({ where: { name: { [Op.in]: ingredientNames } }, transaction });
    const existingNames = new Set(existingIngredients.map(item => item.name));
    const newIngredients = [...ingredientDefinitions.values()].filter(item => !existingNames.has(item.name));
    if (newIngredients.length) await Ingredient.bulkCreate(newIngredients, { transaction });
    const ingredients = await Ingredient.findAll({ where: { name: { [Op.in]: ingredientNames } }, transaction });
    const ingredientMap = new Map(ingredients.map(item => [item.name, item]));

    const existingLinks = await ProductIngredient.findAll({
        where: { productId: { [Op.in]: productIds } },
        transaction
    });
    const existingLinkKeys = new Set(existingLinks.map(link => `${link.productId}:${link.ingredientId}`));
    const links = [];
    let skipped = 0;
    for (const row of rows) {
        const product = productMap.get(Number(row.Menu_Item_No));
        const ingredient = ingredientMap.get(row.Ingredient_Name);
        if (!product || !ingredient) {
            skipped += 1;
            continue;
        }
        const key = `${product.id}:${ingredient.id}`;
        if (existingLinkKeys.has(key)) {
            skipped += 1;
            continue;
        }
        existingLinkKeys.add(key);
        links.push({
            productId: product.id,
            ingredientId: ingredient.id,
            quantityPerServing: Number(row.Quantity_Per_Serving || 0),
            unit: row.Unit
        });
    }
    if (links.length) await ProductIngredient.bulkCreate(links, { transaction });
    return { ingredientsCreated: newIngredients.length, recipeLinksCreated: links.length, skipped };
}

// Helper: runs the import csv data step and returns the value to its caller.
async function importCsvData() {
    const menuCsvPath = findCsvPath(process.env.MENU_CSV_PATH, 'menu_database.csv');
    const tablesZonesCsvPath = findCsvPath(process.env.TABLES_ZONES_CSV_PATH, 'tables_zones_database.csv');
    const inventoryCsvPath = findCsvPath(process.env.INVENTORY_CSV_PATH, 'inventory_recipes_database.csv');

    if (!menuCsvPath && !tablesZonesCsvPath && !inventoryCsvPath) {
        throw new Error('No import CSV files found.');
    }

    await sequelize.authenticate();
    console.log('Database connected. Starting CSV import...');

    const transaction = await sequelize.transaction();
    try {
        if (menuCsvPath) {
            const result = await importMenuData(menuCsvPath, transaction);
            console.log(`Menu import complete: ${result.inserted} products created, ${result.skipped} skipped.`);
        }

        if (tablesZonesCsvPath) {
            const result = await importTablesAndZonesData(tablesZonesCsvPath, transaction);
            console.log(`Tables/zones import complete: ${result.zonesCreated} zones and ${result.tablesCreated} tables created, ${result.skipped} skipped.`);
        }
        if (inventoryCsvPath) {
            const result = await importInventoryData(inventoryCsvPath, transaction);
            console.log(`Inventory import complete: ${result.ingredientsCreated} ingredients and ${result.recipeLinksCreated} recipe links created, ${result.skipped} skipped.`);
        }

        await transaction.commit();
        console.log('CSV import completed successfully.');
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

if (require.main === module) {
    importCsvData()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('CSV import failed:', error.message || error);
            process.exit(1);
        });
}

module.exports = {
    importCsvData,
    importMenuData,
    importTablesAndZonesData,
    importInventoryData,
    parseCSVLine,
    readCsvRows
};
