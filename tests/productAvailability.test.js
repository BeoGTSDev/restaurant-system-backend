const { Op } = require('sequelize');
const {
    getBusinessDate, resetExpiredDailyAvailability
} = require('../src/utils/productAvailability');

describe('daily product availability reset', () => {
    test('business date uses ISO calendar format', () => {
        expect(getBusinessDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('resets only expired daily limits and preserves disabled products', async () => {
        const Product = { update: jest.fn().mockResolvedValue([3]) };
        const transaction = {};
        const today = await resetExpiredDailyAvailability(Product, transaction);
        expect(Product.update).toHaveBeenCalledWith(
            { status: 'In Stock', remainingQty: null, availabilityDate: null },
            {
                where: {
                    availabilityDate: { [Op.not]: null, [Op.ne]: today },
                    status: { [Op.ne]: 'Disabled' }
                },
                transaction
            }
        );
    });
});
