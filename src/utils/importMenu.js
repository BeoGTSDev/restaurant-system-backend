const fs = require('fs');
const path = require('path');
const { sequelize, Category, Product } = require('../models');

function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i+1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
            } else cur += ch;
        } else {
            if (ch === ',') { result.push(cur); cur = ''; }
            else if (ch === '"') { inQuotes = true; }
            else cur += ch;
        }
    }
    result.push(cur);
    return result;
}

async function importMenu() {
    const csvPath = path.resolve(__dirname, '../../../database/menu_database.csv');
    if (!fs.existsSync(csvPath)) {
        console.error('CSV file not found:', csvPath);
        process.exit(1);
    }

    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
    const header = parseCSVLine(lines.shift());

    // map header indices
    const idx = {};
    header.forEach((h, i) => idx[h.trim()] = i);

    try {
        await sequelize.authenticate();
        console.log('DB connected — starting import');

        let count = 0;
        for (const line of lines) {
            const cols = parseCSVLine(line);
            const fullName = cols[idx['Full_Name']]?.trim();
            const internal = cols[idx['Internal_Name']]?.trim();
            const priceRaw = cols[idx['Price_VND']]?.trim();
            const categoryName = cols[idx['Category']]?.trim();
            const description = cols[idx['Description']]?.trim() || null;

            if (!fullName || !categoryName) continue;

            // ensure category exists
            const [cat] = await Category.findOrCreate({ where: { name: categoryName }, defaults: { description: null } });

            // price to integer
            const price = parseInt(priceRaw?.replace(/[^0-9]/g, '') || '0', 10) || 0;

            // Ensure unique name: if exists, skip
            const existing = await Product.findOne({ where: { name: fullName } });
            if (existing) {
                console.log('Skipping existing product:', fullName);
                continue;
            }

            await Product.create({
                name: fullName,
                internalName: internal || null,
                displayName: fullName,
                description: description,
                price: price,
                imageUrl: null,
                categoryId: cat.id,
                status: 'In Stock',
                remainingQty: null
            });
            count++;
            if (count % 50 === 0) console.log(`${count} products imported...`);
        }

        console.log(`Import complete — ${count} products inserted`);
        process.exit(0);
    } catch (err) {
        console.error('Import failed:', err);
        process.exit(1);
    }
}

if (require.main === module) importMenu();

module.exports = importMenu;
