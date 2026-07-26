const { Op } = require('sequelize');
const { Order, OrderItem, Product, Category, Table } = require('../models');
const { KITCHEN_STATIONS, stationForCategory, stationConfig } = require('../constants/kitchenStations');

const ACTIVE_ITEM_STATUSES = ['Pending', 'Fired', 'Cooking', 'Ready', 'Remake'];

const loadKitchenItems = async () => {
    const items = await OrderItem.findAll({
        where: { status: { [Op.in]: ACTIVE_ITEM_STATUSES } },
        include: [
            {
                model: Order,
                as: 'order',
                where: { status: { [Op.in]: ['Pending', 'Order'] } },
                attributes: ['id', 'dayOrderNumber', 'tableId', 'createdAt'],
                include: [{
                    model: Table,
                    as: 'table',
                    attributes: ['id', 'name', 'guestLanguage', 'guestAllergies', 'allergyNote', 'specialNote']
                }]
            },
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'displayName', 'categoryId'],
                include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }]
            }
        ],
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
    });

    return items.map(item => {
        const stationCode = stationForCategory(item.product?.category?.name);
        const station = stationConfig(stationCode);
        const createdAt = new Date(item.createdAt);
        const expectedAt = new Date(createdAt.getTime() + station.prepMinutes * 60000);
        return {
            id: item.id,
            orderId: item.orderId,
            orderNumber: item.order?.dayOrderNumber,
            tableId: item.order?.tableId,
            tableName: item.order?.table?.name || 'Unknown',
            productId: item.productId,
            productName: item.product?.displayName || item.product?.name || `Product ${item.productId}`,
            categoryName: item.product?.category?.name || 'Kitchen',
            quantity: Number(item.quantity),
            status: item.status,
            note: item.note,
            stationCode,
            stationName: station.name,
            stationColor: station.color,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            expectedAt,
            overdue: Date.now() > expectedAt.getTime() && item.status !== 'Ready',
            guestLanguage: item.order?.table?.guestLanguage,
            allergies: item.order?.table?.guestAllergies || [],
            allergyNote: item.order?.table?.allergyNote,
            tableNote: item.order?.table?.specialNote
        };
    });
};

const getKitchenConfig = async (req, res) => {
    res.json({ success: true, data: { stations: KITCHEN_STATIONS } });
};

const getExpectedQueue = async (req, res) => {
    const items = await loadKitchenItems();
    const tables = Object.values(items.reduce((groups, item) => {
        const key = item.tableId;
        if (!groups[key]) {
            groups[key] = {
                tableId: item.tableId,
                tableName: item.tableName,
                orderNumber: item.orderNumber,
                guestLanguage: item.guestLanguage,
                allergies: item.allergies,
                tableNote: item.tableNote,
                earliestExpectedAt: item.expectedAt,
                items: []
            };
        }
        groups[key].items.push(item);
        if (new Date(item.expectedAt) < new Date(groups[key].earliestExpectedAt)) {
            groups[key].earliestExpectedAt = item.expectedAt;
        }
        return groups;
    }, {})).sort((a, b) => new Date(a.earliestExpectedAt) - new Date(b.earliestExpectedAt));
    res.json({ success: true, data: { generatedAt: new Date(), tables, items } });
};

const getStationQueue = async (req, res) => {
    const stationCode = String(req.params.code || '').toUpperCase();
    if (!KITCHEN_STATIONS.some(station => station.code === stationCode)) {
        return res.status(404).json({ success: false, message: 'Kitchen station not found.' });
    }
    const items = (await loadKitchenItems()).filter(item => item.stationCode === stationCode);
    res.json({
        success: true,
        data: {
            station: stationConfig(stationCode),
            generatedAt: new Date(),
            items
        }
    });
};

module.exports = { getKitchenConfig, getExpectedQueue, getStationQueue };
