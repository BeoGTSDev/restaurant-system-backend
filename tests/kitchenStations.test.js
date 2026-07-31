const {
    KITCHEN_STATIONS, stationForCategory, stationConfig
} = require('../src/constants/kitchenStations');

describe('kitchen station mapping', () => {
    test.each([
        ['Beer', 'BAR'],
        ['Soft Drink', 'BAR'],
        ['Pizza', 'PIZZA'],
        ['Dessert', 'PASTRY'],
        ['Salad', 'COLD'],
        ['Carpaccio', 'COLD'],
        ['Main Course', 'HOT'],
        [null, 'HOT']
    ])('maps %p to %s', (category, station) => {
        expect(stationForCategory(category)).toBe(station);
    });

    test('all stations have a positive preparation time and unique code', () => {
        expect(new Set(KITCHEN_STATIONS.map(station => station.code)).size).toBe(KITCHEN_STATIONS.length);
        expect(KITCHEN_STATIONS.every(station => station.prepMinutes > 0)).toBe(true);
    });

    test('unknown station falls back to hot kitchen', () => {
        expect(stationConfig('UNKNOWN').code).toBe('HOT');
    });
});
