const { Op } = require('sequelize');

const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'Asia/Ho_Chi_Minh';

const getBusinessDate = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const resetExpiredDailyAvailability = async (Product, transaction) => {
    const today = getBusinessDate();
    await Product.update(
        {
            status: 'In Stock',
            remainingQty: null,
            availabilityDate: null
        },
        {
            where: {
                availabilityDate: { [Op.not]: null, [Op.ne]: today },
                status: { [Op.ne]: 'Disabled' }
            },
            transaction
        }
    );
    return today;
};

module.exports = { getBusinessDate, resetExpiredDailyAvailability };
