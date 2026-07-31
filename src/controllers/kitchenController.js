const { Op } = require('sequelize');
const { Order, OrderItem, Product, Category, Table, KitchenEvent, KitchenBillHistory, User, BusinessDay } = require('../models');
const { KITCHEN_STATIONS, stationForCategory, stationConfig } = require('../constants/kitchenStations');
const { getKitchenAction, getKitchenTiming } = require('../services/kitchenWorkflowService');

const ACTIVE_ITEM_STATUSES = ['Pending', 'Fired', 'Cooking', 'Ready', 'Pickup', 'Remake'];
const TERMINAL_ITEM_STATUSES = ['Served', 'Cancelled'];

const loadKitchenItems = async (statuses = ACTIVE_ITEM_STATUSES, activeOrdersOnly = true) => {
    const items = await OrderItem.findAll({
        where: { status: { [Op.in]: statuses } },
        include: [
            {
                model: Order,
                as: 'order',
                where: activeOrdersOnly ? { status: { [Op.in]: ['Pending', 'Order'] } } : undefined,
                attributes: ['id', 'dayOrderNumber', 'tableId', 'businessDayId', 'createdAt', 'createdBy'],
                include: [{
                    model: Table,
                    as: 'table',
                    attributes: ['id', 'name', 'guestCount', 'nationality', 'guestLanguage', 'guestAllergies', 'allergyNote', 'specialNote']
                }, { model: User, as: 'creator', attributes: ['id', 'fullName'], required: false }]
            },
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'internalName', 'displayName', 'categoryId'],
                include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }]
            }
        ],
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
    });

    return items.map(item => {
        const stationCode = stationForCategory(item.product?.category?.name);
        const station = stationConfig(stationCode);
        const createdAt = new Date(item.createdAt);
        const prepMinutes = Number(item.prepMinutes || station.prepMinutes);
        // Compatibility for Cooking rows created by the legacy generic status endpoint,
        // which changed the status without persisting cookingAt.
        const timing = getKitchenTiming({
            status: item.status,
            cookingAt: item.cookingAt,
            updatedAt: item.updatedAt,
            prepMinutes
        });
        const effectiveCookingAt = timing.processStartedAt;
        const expectedAt = timing.expectedAt;
        return {
            id: item.id,
            orderId: item.orderId,
            orderNumber: item.order?.dayOrderNumber,
            businessDayId: item.order?.businessDayId,
            tableId: item.order?.tableId,
            tableName: item.order?.table?.name || 'Unknown',
            productId: item.productId,
            productName: item.product?.internalName || item.product?.name || item.product?.displayName || `Product ${item.productId}`,
            displayName: item.product?.displayName || item.product?.name,
            categoryName: item.product?.category?.name || 'Kitchen',
            quantity: Number(item.quantity),
            status: item.status,
            previousStatus: item.previousStatus,
            courseTiming: item.courseTiming,
            orderSource: item.orderSource,
            orderedByName: item.orderedByName || item.order?.creator?.fullName || (item.orderSource === 'CUSTOMER' ? 'Customer' : 'Staff'),
            priority: item.priority,
            prepMinutes,
            firedAt: item.firedAt,
            cookingAt: effectiveCookingAt,
            pickupAt: item.pickupAt,
            servedAt: item.servedAt,
            note: item.note,
            stationCode,
            stationName: station.name,
            stationColor: station.color,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            expectedAt,
            overdue: timing.overdue,
            guestLanguage: item.order?.table?.guestLanguage,
            nationality: item.order?.table?.nationality || item.order?.table?.guestLanguage,
            guestCount: item.order?.table?.guestCount,
            billCreatedAt: item.order?.createdAt,
            allergies: item.order?.table?.guestAllergies || [],
            allergyNote: item.order?.table?.allergyNote,
            tableNote: item.order?.table?.specialNote
        };
    });
};

const getKitchenConfig = async (req, res) => {
    res.json({ success: true, data: { stations: KITCHEN_STATIONS } });
};

const snapshotCompletedOrders = async orderIds => {
    const uniqueOrderIds = [...new Set(orderIds.map(Number).filter(Number.isInteger))];
    if (!uniqueOrderIds.length) return;
    const incomplete = await OrderItem.findAll({
        where: {
            orderId: { [Op.in]: uniqueOrderIds },
            status: { [Op.notIn]: TERMINAL_ITEM_STATUSES }
        },
        attributes: ['orderId'],
        raw: true
    });
    const incompleteIds = new Set(incomplete.map(item => Number(item.orderId)));
    const completedIds = uniqueOrderIds.filter(id => !incompleteIds.has(id));
    await KitchenBillHistory.destroy({ where: { orderId: { [Op.in]: [...incompleteIds] } } });
    if (!completedIds.length) return;

    const terminalItems = (await loadKitchenItems(TERMINAL_ITEM_STATUSES, false))
        .filter(item => completedIds.includes(Number(item.orderId)));
    const grouped = terminalItems.reduce((groups, item) => {
        (groups[item.orderId] ||= []).push(item);
        return groups;
    }, {});
    for (const [orderIdValue, items] of Object.entries(grouped)) {
        if (!items.length) continue;
        const first = items[0];
        const completedAt = new Date(Math.max(...items.map(item =>
            new Date(item.servedAt || item.updatedAt).getTime()
        )));
        const snapshot = {
            billId: Number(orderIdValue),
            orderId: Number(orderIdValue),
            tableId: first.tableId,
            tableName: first.tableName,
            orderNumber: first.orderNumber,
            guestLanguage: first.guestLanguage,
            nationality: first.nationality,
            guestCount: first.guestCount,
            allergies: first.allergies,
            tableNote: first.tableNote,
            billCreatedAt: first.billCreatedAt,
            completedAt,
            durationMinutes: Math.max(0, Math.floor((completedAt.getTime() - new Date(first.billCreatedAt).getTime()) / 60000)),
            orderedByName: items[items.length - 1].orderedByName,
            courseTiming: first.courseTiming,
            earliestExpectedAt: first.expectedAt,
            items
        };
        await KitchenBillHistory.findOrCreate({
            where: { orderId: Number(orderIdValue) },
            defaults: {
                tableId: first.tableId,
                tableName: first.tableName,
                orderNumber: first.orderNumber,
                completedAt,
                snapshot
            }
        });
    }
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
                nationality: item.nationality,
                guestCount: item.guestCount,
                billCreatedAt: item.billCreatedAt,
                orderedByName: item.orderedByName,
                courseTiming: item.courseTiming,
                earliestExpectedAt: item.expectedAt,
                items: []
            };
        }
        groups[key].items.push(item);
        if (item.expectedAt && (!groups[key].earliestExpectedAt
            || new Date(item.expectedAt) < new Date(groups[key].earliestExpectedAt))) {
            groups[key].earliestExpectedAt = item.expectedAt;
        }
        return groups;
    }, {})).sort((a, b) => new Date(a.billCreatedAt) - new Date(b.billCreatedAt) || a.tableId - b.tableId);
    res.json({ success: true, data: { generatedAt: new Date(), tables, items } });
};

const getStationQueue = async (req, res) => {
    const stationCode = String(req.params.code || '').toUpperCase();
    if (!KITCHEN_STATIONS.some(station => station.code === stationCode)) {
        return res.status(404).json({ success: false, message: 'Kitchen station not found.' });
    }
    const items = (await loadKitchenItems()).filter(item => item.stationCode === stationCode && item.status !== 'Pending')
        .sort((a, b) => (b.priority !== 'NORMAL') - (a.priority !== 'NORMAL') || new Date(a.createdAt) - new Date(b.createdAt));
    res.json({
        success: true,
        data: {
            station: stationConfig(stationCode),
            generatedAt: new Date(),
            items
        }
    });
};

const bulkAction = async (req, res) => {
    const action = String(req.body.action || '').toUpperCase();
    const itemIds = [...new Set((req.body.itemIds || []).map(Number).filter(Number.isInteger))];
    const definition = getKitchenAction(action);
    if (!definition || !itemIds.length) return res.status(400).json({ success: false, message: 'Choose items and a valid kitchen action.' });
    const items = await OrderItem.findAll({ where: { id: itemIds }, include: [{ model: Order, as: 'order' }] });
    if (items.length !== itemIds.length || items.some(item => !definition.allowed.includes(item.status))) {
        return res.status(409).json({ success: false, message: 'Selected items must share a compatible status for this action.' });
    }
    const now = new Date();
    for (const item of items) {
        const fromStatus = item.status;
        item.previousStatus = fromStatus;
        item.status = definition.status;
        if (definition.priority) item.priority = definition.priority;
        if (definition.timestamp) item[definition.timestamp] = now;
        if (action === 'FAIL') item.failReason = String(req.body.reason || 'Quality fail');
        await item.save();
        await KitchenEvent.create({
            orderItemId: item.id, orderId: item.orderId, tableId: item.order.tableId, businessDayId: item.order.businessDayId,
            fromStatus, toStatus: item.status, action, reason: req.body.reason || null,
            performedBy: req.user.id, performerName: req.user.fullName || req.user.role
        });
        req.io.emit('order_item_updated', { itemId: item.id, tableId: item.order.tableId, status: item.status, action });
    }
    await snapshotCompletedOrders(items.map(item => item.orderId));
    res.json({ success: true, data: { action, updated: items.length } });
};

const returnItems = async (req, res) => {
    const itemIds = (req.body.itemIds || []).map(Number);
    const items = await OrderItem.findAll({ where: { id: itemIds }, include: [{ model: Order, as: 'order' }] });
    for (const item of items) {
        const fromStatus = item.status;
        item.status = item.previousStatus || 'Pending';
        item.previousStatus = fromStatus;
        await item.save();
        await KitchenEvent.create({ orderItemId: item.id, orderId: item.orderId, tableId: item.order.tableId, businessDayId: item.order.businessDayId, fromStatus, toStatus: item.status, action: 'RETURN', performedBy: req.user.id, performerName: req.user.fullName || req.user.role });
    }
    await snapshotCompletedOrders(items.map(item => item.orderId));
    res.json({ success: true, data: { updated: items.length } });
};

const getHistory = async (req, res) => {
    const businessDay = await BusinessDay.findOne({ where: { status: 'open' }, order: [['startedAt', 'DESC']] });
    const eventRecords = businessDay
        ? await KitchenEvent.findAll({
            where: { businessDayId: businessDay.id },
            order: [['createdAt', 'DESC']],
            limit: Math.min(Number(req.query.limit) || 300, 1000)
        })
        : [];
    const itemIds = [...new Set(eventRecords.map(event => event.orderItemId))];
    const orderItems = itemIds.length
        ? await OrderItem.findAll({
            where: { id: itemIds },
            attributes: ['id'],
            include: [{ model: Product, as: 'product', attributes: ['internalName', 'name', 'displayName'] }]
        })
        : [];
    const itemNames = new Map(orderItems.map(item => [
        item.id,
        item.product?.internalName || item.product?.name || item.product?.displayName || `Item #${item.id}`
    ]));
    const events = eventRecords.map(event => ({
        ...event.toJSON(),
        productName: itemNames.get(event.orderItemId) || `Item #${event.orderItemId}`
    }));
    res.json({ success: true, data: { events } });
};

const getCompletedQueue = async (req, res) => {
    const terminalOrderIds = await OrderItem.findAll({
        where: { status: { [Op.in]: TERMINAL_ITEM_STATUSES } },
        attributes: [[require('sequelize').fn('DISTINCT', require('sequelize').col('orderId')), 'orderId']],
        raw: true
    });
    await snapshotCompletedOrders(terminalOrderIds.map(item => Number(item.orderId)));
    const records = await KitchenBillHistory.findAll({ order: [['completedAt', 'DESC']] });
    const tables = records.map(record => record.snapshot);
    const items = tables.flatMap(table => table.items || []);
    res.json({ success: true, data: { tables, items } });
};

module.exports = { getKitchenConfig, getExpectedQueue, getStationQueue, bulkAction, returnItems, getHistory, getCompletedQueue };
