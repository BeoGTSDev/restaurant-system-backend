const {
    Order, OrderItem, Product, Category, BusinessDay,
    ShiftRecord, OrderTransfer, CashMovement, User, Receipt
} = require('../models');
const { Op, fn, col, literal } = require('sequelize');


const getDailyRevenue = async (req, res, next) => {
    const businessDay = await BusinessDay.findOne({
        where: { status: 'open' },
        order: [['startedAt', 'DESC']]
    });
    const NOW = new Date();
    if (!businessDay) {
        return res.status(200).json({
            success: true,
            message: 'No open business day',
            date: null,
            data: { totalRevenue: 0, totalOrders: 0 }
        });
    }

    // Revenue belongs to the active POS business session, not to the calendar
    // date. This makes a newly opened day start at zero even when it is opened
    // again on the same calendar day.
    const revenueWindow = {
        [Op.gte]: businessDay.startedAt,
        [Op.lte]: NOW
    };

    const totalRevenue = await Order.sum('totalPrice', {
        where: {
            status: 'Paid',
            updatedAt: revenueWindow
        }
    });

    const totalOrders = await Order.count({
        where: {
            status: 'Paid',
            updatedAt: revenueWindow
        }
    });

    res.status(200).json({
        success: true,
        message: 'Daily revenue statistics',
        date: businessDay.businessDate,
        businessDayId: businessDay.id,
        startedAt: businessDay.startedAt,
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

const getOperationsReport = async (req, res) => {
    const businessDay = req.query.businessDayId
        ? await BusinessDay.findByPk(req.query.businessDayId)
        : await BusinessDay.findOne({ order: [['startedAt', 'DESC']] });
    if (!businessDay) {
        return res.status(200).json({ success: true, data: null });
    }

    const [orders, shifts, transfers, cashMovements, receipts] = await Promise.all([
        Order.findAll({
            where: { businessDayId: businessDay.id },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'fullName', 'staffCode'] },
                { model: User, as: 'paymentStaff', attributes: ['id', 'fullName', 'staffCode'] }
            ],
            order: [['createdAt', 'DESC']]
        }),
        ShiftRecord.findAll({
            where: { businessDayId: businessDay.id },
            include: [{ model: User, as: 'cashier', attributes: ['id', 'fullName', 'staffCode'] }],
            order: [['openedAt', 'DESC']]
        }),
        OrderTransfer.findAll({
            where: { businessDayId: businessDay.id },
            include: [{ model: User, as: 'staff', attributes: ['id', 'fullName', 'staffCode'] }],
            order: [['createdAt', 'DESC']]
        }),
        CashMovement.findAll({
            where: { businessDayId: businessDay.id },
            order: [['createdAt', 'DESC']]
        }),
        Receipt.findAll({ where: { businessDayId: businessDay.id }, attributes: ['totalAmount'] })
    ]);

    const paidOrders = orders.filter(order => order.status === 'Paid');
    const cashIn = cashMovements.filter(item => item.type === 'in').reduce((s, item) => s + Number(item.amount), 0);
    const cashOut = cashMovements.filter(item => item.type === 'out').reduce((s, item) => s + Number(item.amount), 0);
    res.status(200).json({
        success: true,
        data: {
            businessDay,
            summary: {
                revenue: receipts.reduce((s, receipt) => s + Number(receipt.totalAmount), 0),
                paidOrders: paidOrders.length,
                activeOrders: orders.filter(order => ['Pending', 'Order'].includes(order.status)).length,
                shifts: shifts.length,
                activeShifts: shifts.filter(shift => shift.status === 'open').length,
                transfers: transfers.length,
                openingCash: Number(businessDay.openingCash || 0),
                cashIn,
                cashOut,
                expectedCash: Number(businessDay.openingCash || 0) + Number(businessDay.cashSales || 0) + cashIn - cashOut
            },
            shifts,
            transfers,
            cashMovements,
            orders
        }
    });
};

module.exports = { getDailyRevenue, getBestSellingProducts, getMonthlyRevenue, getOperationsReport };
