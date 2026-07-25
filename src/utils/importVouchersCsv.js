const fs = require('fs');
const path = require('path');
const { sequelize, Voucher } = require('../models');
const { validateVoucherCodeFormat } = require('../services/voucherService');

const importVouchersCsv = async () => {
    const csvPath = path.join(__dirname, 'data', 'vouchers_database.csv');
    const lines = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const headers = lines.shift().split(',');
    const rows = lines.map(line => Object.fromEntries(line.split(',').map((value, index) => [headers[index], value.trim()])));
    const seen = new Set();
    for (const row of rows) {
        if (!validateVoucherCodeFormat(row.code) || seen.has(row.code)) {
            throw new Error(`Invalid or duplicate voucher code in CSV: ${row.code}`);
        }
        seen.add(row.code);
    }
    await sequelize.sync();
    for (const row of rows) {
        await Voucher.findOrCreate({
            where: { code: row.code },
            defaults: {
                scope: row.scope,
                discountPercent: Number(row.discountPercent),
                description: row.description,
                isActive: row.isActive === 'true',
                usageLimit: Number(row.usageLimit)
            }
        });
    }
    console.log(`Imported ${rows.length} unique vouchers`);
};

if (require.main === module) {
    importVouchersCsv().then(() => process.exit(0)).catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = importVouchersCsv;
