const KITCHEN_STATIONS = Object.freeze([
    { code: 'HOT', name: 'Hot Kitchen', color: '#ef6c4d', prepMinutes: 16 },
    { code: 'COLD', name: 'Cold Kitchen', color: '#42b8a4', prepMinutes: 9 },
    { code: 'PIZZA', name: 'Pizza', color: '#e7a94b', prepMinutes: 14 },
    { code: 'PASTRY', name: 'Pastry', color: '#b783db', prepMinutes: 12 },
    { code: 'BAR', name: 'Bar', color: '#5da4e8', prepMinutes: 6 }
]);

const stationForCategory = categoryName => {
    const category = String(categoryName || '').trim().toLowerCase();
    if (/beer|cocktail|mocktail|juice|smoothie|soft drink|wine|bar/.test(category)) return 'BAR';
    if (/pizza/.test(category)) return 'PIZZA';
    if (/dessert|pastry|cake|ice cream/.test(category)) return 'PASTRY';
    if (/salad|cold|carpaccio/.test(category)) return 'COLD';
    return 'HOT';
};

const stationConfig = code => KITCHEN_STATIONS.find(station => station.code === code) || KITCHEN_STATIONS[0];

module.exports = { KITCHEN_STATIONS, stationForCategory, stationConfig };
