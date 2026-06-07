const { Order, OrderItem, Product, Category } = require('../models');
const { Op, fn, col, literal } = require('sequelize');


const getDailyRevenue = async (req, res, next) => {
    const TODAY_START = new Date();
    TODAY_START.setHours(0, 0, 0, 0);

    const NOW = new Date();

    const totalRevenue = await Order.sum('totalPrice', {
        where: {
            status: 'Paid',
            createdAt: {
                [Op.gte]: TODAY_START, 
                [Op.lte]: NOW 
            }
        }
    });

    const totalOrders = await Order.count({
        where: {
            status: 'Paid',
            createdAt: {
                [Op.gte]: TODAY_START,
                [Op.lte]: NOW
            }
        }
    });

    res.status(200).json({
        success: true,
        message: 'Daily revenue statistics',
        date: TODAY_START.toLocaleDateString(),
        data: {
            totalRevenue: totalRevenue || 0,
            totalOrders: totalOrders
        }
    });
};

const getBestSellingProducts = async (req, res, next) => {
    const { limit = 10, startDate, endDate } = req.query;

    const whereClause = { status: 'Paid' };
    if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
            whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            whereClause.createdAt[Op.lte] = end;
        }
    }

    try {
        const bestSellers = await OrderItem.findAll({
        attributes: [
            'productId',
            [fn('SUM', col('OrderItem.quantity')), 'totalQuantity'],
            [fn('SUM', col('OrderItem.price')), 'totalRevenue']
        ],
        include: [
            {
                model: Order,
                as: 'order',
                attributes: [],
                where: whereClause,
                required: true
            },
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'price'],
                include: [
                    {
                        model: Category,
                        as: 'category',
                        attributes: ['id', 'name']
                    }
                ],
                required: true
            }
        ],
        group: ['product.id', 'product->category.id', 'OrderItem.productId'],
        order: [[fn('SUM', col('OrderItem.quantity')), 'DESC']],
        subQuery: false,
        limit: parseInt(limit),
        raw: false
    });

        res.status(200).json({
        success: true,
        message: 'Best selling products',
        data: bestSellers.map(item => ({
            productId: item.productId,
            productName: item.product.name,
            productPrice: item.product.price,
            category: item.product.category ? item.product.category.name : 'N/A',
            totalQuantitySold: parseInt(item.dataValues.totalQuantity),
            totalRevenue: parseFloat(item.dataValues.totalRevenue) || 0
        })),
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
        limit: parseInt(limit)
        });
    } catch (err) {
        console.error('getBestSellingProducts error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch best selling products', error: err.message });
    }
};

const getMonthlyRevenue = async (req, res, next) => {
    const { year, month } = req.query;

    const whereClause = { status: 'Paid' };
    if (year) {
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
        whereClause.createdAt = {
            [Op.gte]: startOfYear,
            [Op.lte]: endOfYear
        };

        if (month) {
            const monthNum = parseInt(month) - 1;
            const startOfMonth = new Date(year, monthNum, 1);
            const endOfMonth = new Date(year, monthNum + 1, 0, 23, 59, 59, 999);
            whereClause.createdAt = {
                [Op.gte]: startOfMonth,
                [Op.lte]: endOfMonth
            };
        }
    }

    const allOrders = await Order.findAll({
        where: whereClause,
        attributes: ['id', 'totalPrice', 'createdAt'],
        raw: true
    });

    const groupedByMonth = {};
    allOrders.forEach(order => {
        const date = new Date(order.createdAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!groupedByMonth[monthKey]) {
            groupedByMonth[monthKey] = {
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                monthName: date.toLocaleString('en', { month: 'long' }),
                totalRevenue: 0,
                totalOrders: 0
            };
        }

        groupedByMonth[monthKey].totalRevenue += parseFloat(order.totalPrice) || 0;
        groupedByMonth[monthKey].totalOrders += 1;
    });

    const result = Object.values(groupedByMonth).sort((a, b) => {
        const dateA = new Date(a.year, a.month - 1);
        const dateB = new Date(b.year, b.month - 1);
        return dateB - dateA;
    });

    res.status(200).json({
        success: true,
        message: 'Monthly revenue statistics',
        filter: {
            year: year ? parseInt(year) : 'All years',
            month: month ? parseInt(month) : 'All months'
        },
        data: result,
        summary: {
            totalRevenue: result.reduce((sum, m) => sum + m.totalRevenue, 0),
            totalOrders: result.reduce((sum, m) => sum + m.totalOrders, 0),
            monthsCount: result.length
        }
    });
};

module.exports = { getDailyRevenue, getBestSellingProducts, getMonthlyRevenue };