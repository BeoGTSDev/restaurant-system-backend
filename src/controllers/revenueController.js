// Controller file: receives request data, applies revenueController rules, and returns JSON.
const {
    Order, BusinessDay, ShiftRecord, OrderTransfer, CashMovement, User, Receipt, ReceiptItem
} = require('../models');
const { Op, fn, col } = require('sequelize');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// HTTP handler: runs the vietnam day boundary step. It reads req data, uses models/services, and sends JSON with res.
const vietnamDayBoundary = (value, endOfDay = false) => {
    if (!DATE_ONLY.test(String(value || ''))) return null;
    const [year, month, day] = String(value).split('-').map(Number);
    const utc = Date.UTC(year, month - 1, day);
    const check = new Date(utc);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+07:00`);
};

// HTTP handler: loads get daily revenue data. It reads req data, uses models/services, and sends JSON with res.
const getDailyRevenue = async (req, res, next) => {
    const businessDay = await BusinessDay.findOne({
        where: { status: 'open' },
        order: [['startedAt', 'DESC']]
    });
    if (!businessDay) {
        return res.status(200).json({
            success: true,
            message: 'No open business day',
            date: null,
            data: { totalRevenue: 0, totalOrders: 0 }
        });
    }

    // A receipt is the immutable paid-bill snapshot. Order.totalPrice is a
    // pre-adjustment operational value and must not be used as revenue.
    const [totalRevenue, totalOrders] = await Promise.all([
        Receipt.sum('totalAmount', { where: { businessDayId: businessDay.id } }),
        Receipt.count({ where: { businessDayId: businessDay.id } })
    ]);

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

// HTTP handler: loads get best selling products data. It reads req data, uses models/services, and sends JSON with res.
const getBestSellingProducts = async (req, res, next) => {
    const { limit = 10, startDate, endDate } = req.query;
    const receiptWhere = {};
    if (startDate || endDate) {
        const start = startDate ? vietnamDayBoundary(startDate) : null;
        const end = endDate ? vietnamDayBoundary(endDate, true) : null;
        if ((startDate && !start) || (endDate && !end) || (start && end && start > end)) {
            return next(Object.assign(new Error('Invalid best-seller date range.'), { status: 400 }));
        }
        receiptWhere.paidAt = {};
        if (start) receiptWhere.paidAt[Op.gte] = start;
        if (end) receiptWhere.paidAt[Op.lte] = end;
    }

    try {
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const bestSellers = await ReceiptItem.findAll({
            attributes: [
                'productId',
                'productName',
                'categoryName',
                [fn('SUM', col('ReceiptItem.quantity')), 'totalQuantity'],
                [fn('SUM', col('ReceiptItem.lineTotal')), 'totalRevenue']
            ],
            include: [{
                model: Receipt,
                as: 'receipt',
                attributes: [],
                where: receiptWhere,
                required: true
            }],
            group: ['ReceiptItem.productId', 'ReceiptItem.productName', 'ReceiptItem.categoryName'],
            order: [[fn('SUM', col('ReceiptItem.quantity')), 'DESC']],
            limit: safeLimit,
            raw: true,
            subQuery: false
        });

        res.status(200).json({
            success: true,
            message: 'Best selling products',
            data: bestSellers.map(item => ({
                productId: item.productId,
                productName: item.productName,
                category: item.categoryName || 'N/A',
                totalQuantitySold: Number(item.totalQuantity || 0),
                totalRevenue: Number(item.totalRevenue || 0)
            })),
            dateRange: startDate || endDate ? `${startDate || 'beginning'} to ${endDate || 'now'}` : 'All time',
            limit: safeLimit
        });
    } catch (err) {
        console.error('getBestSellingProducts error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch best selling products', error: err.message });
    }
};

// HTTP handler: loads get monthly revenue data. It reads req data, uses models/services, and sends JSON with res.
const getMonthlyRevenue = async (req, res, next) => {
    const { year, month } = req.query;
    const dayWhere = {};
    if (month && !year) {
        return next(Object.assign(new Error('Report year is required when month is provided.'), { status: 400 }));
    }
    if (year) {
        const yearNumber = Number(year);
        if (!Number.isInteger(yearNumber) || yearNumber < 2000 || yearNumber > 2200) {
            return next(Object.assign(new Error('Invalid report year.'), { status: 400 }));
        }
        let start = `${yearNumber}-01-01`;
        let end = `${yearNumber}-12-31`;
        if (month) {
            const monthNumber = Number(month);
            if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
                return next(Object.assign(new Error('Invalid report month.'), { status: 400 }));
            }
            start = `${yearNumber}-${String(monthNumber).padStart(2, '0')}-01`;
            end = new Date(Date.UTC(yearNumber, monthNumber, 0)).toISOString().slice(0, 10);
        }
        dayWhere.businessDate = { [Op.between]: [start, end] };
    }

    const receipts = await Receipt.findAll({
        attributes: ['totalAmount'],
        include: [{
            model: BusinessDay,
            as: 'businessDay',
            attributes: ['businessDate'],
            where: dayWhere,
            required: true
        }],
        raw: true
    });

    const groupedByMonth = {};
    receipts.forEach(receipt => {
        const businessDate = receipt['businessDay.businessDate'];
        const [receiptYear, receiptMonth] = String(businessDate).split('-').map(Number);
        const monthKey = `${receiptYear}-${String(receiptMonth).padStart(2, '0')}`;
        
        if (!groupedByMonth[monthKey]) {
            groupedByMonth[monthKey] = {
                year: receiptYear,
                month: receiptMonth,
                monthName: new Date(Date.UTC(receiptYear, receiptMonth - 1, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' }),
                totalRevenue: 0,
                totalOrders: 0
            };
        }

        groupedByMonth[monthKey].totalRevenue += Number(receipt.totalAmount) || 0;
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

// HTTP handler: loads get operations report data. It reads req data, uses models/services, and sends JSON with res.
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
        Receipt.findAll({
            where: { businessDayId: businessDay.id },
            attributes: [
                'id', 'receiptNumber', 'tableId', 'tableName', 'subtotal',
                'discountAmount', 'totalAmount', 'paymentMethod', 'cashReceived',
                'changeDue', 'voucherCode', 'billDiscountAmount', 'foodVatAmount',
                'alcoholVatAmount', 'serviceChargeAmount', 'paidBy', 'paidAt'
            ],
            include: [{ model: User, as: 'paymentStaff', attributes: ['id', 'fullName', 'staffCode'] }],
            order: [['paidAt', 'DESC']]
        })
    ]);

    const cashIn = cashMovements.filter(item => item.type === 'in').reduce((s, item) => s + Number(item.amount), 0);
    const cashOut = cashMovements.filter(item => item.type === 'out').reduce((s, item) => s + Number(item.amount), 0);
    // HTTP handler: runs the sum receipt step. It reads req data, uses models/services, and sends JSON with res.
    const sumReceipt = field => receipts.reduce((sum, receipt) => sum + Number(receipt[field] || 0), 0);
    const paymentBreakdown = receipts.reduce((result, receipt) => {
        const method = receipt.paymentMethod || 'Other';
        if (!result[method]) result[method] = { count: 0, amount: 0 };
        result[method].count += 1;
        result[method].amount += Number(receipt.totalAmount || 0);
        return result;
    }, {});
    const calculatedCashSales = receipts
        .filter(receipt => receipt.paymentMethod === 'Cash')
        .reduce((sum, receipt) => sum + Number(receipt.totalAmount || 0), 0);
    res.status(200).json({
        success: true,
        data: {
            businessDay,
            summary: {
                revenue: sumReceipt('totalAmount'),
                grossSales: sumReceipt('subtotal'),
                discounts: sumReceipt('discountAmount'),
                foodVat: sumReceipt('foodVatAmount'),
                alcoholVat: sumReceipt('alcoholVatAmount'),
                serviceCharge: sumReceipt('serviceChargeAmount'),
                paidOrders: receipts.length,
                activeOrders: orders.filter(order => ['Pending', 'Order'].includes(order.status)).length,
                shifts: shifts.length,
                activeShifts: shifts.filter(shift => shift.status === 'open').length,
                transfers: transfers.length,
                openingCash: Number(businessDay.openingCash || 0),
                cashIn,
                cashOut,
                cashSales: calculatedCashSales,
                recordedCashSales: Number(businessDay.cashSales || 0),
                expectedCash: Number(businessDay.openingCash || 0) + calculatedCashSales + cashIn - cashOut,
                paymentBreakdown
            },
            shifts,
            transfers,
            cashMovements,
            orders,
            receipts
        }
    });
};

module.exports = { getDailyRevenue, getBestSellingProducts, getMonthlyRevenue, getOperationsReport };
