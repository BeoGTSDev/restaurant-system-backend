const { Table, Bill, Zone, Order, OperationalTransfer, BusinessDay, ShiftRecord, sequelize } = require('../models');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { generateTableQrCode } = require('../utils/tableQr');

const openTable = async (req, res, next) => {
    const { id } = req.params;
    const table = await Table.findByPk(id);

    if (!table) {
        const err = new Error('Table not found');
        err.status = 404;
        return next(err);
    }

    if (table.status !== 'Ready') {
        const err = new Error('Table is not available');
        err.status = 400;
        return next(err);
    }

    const { guestCount, nationality, specialNote } = req.body || {};

    table.status = 'Escort';
    if (!table.qrCode) {
        return next(Object.assign(new Error('This legacy table has no QR code. Generate it once from table settings before opening.'), { status: 409 }));
    }
    table.qrSessionActive = true;
    table.qrSessionVersion = Number(table.qrSessionVersion || 0) + 1;
    table.qrSessionOpenedAt = new Date();
    if (guestCount !== undefined) table.guestCount = String(guestCount);
    if (nationality) table.nationality = nationality;
    if (specialNote) table.specialNote = specialNote;
    await table.save();

    res.status(200).json({ 
        success: true,
        message: 'Table opened successfully', 
        table 
    });
};

const createCustomerTableSession = async (req, res, next) => {
    const qrCode = String(req.body?.qrCode || '').trim();
    if (!qrCode) return next(Object.assign(new Error('Table QR code is required'), { status: 400 }));
    const table = await Table.findOne({ where: { qrCode } });
    if (!table || !table.qrSessionActive || ['Ready', 'CustomerPaid'].includes(table.status)) {
        return next(Object.assign(new Error('This table is not open for customer ordering.'), { status: 403 }));
    }
    const token = jwt.sign({
        type: 'customer-table',
        tableId: table.id,
        version: Number(table.qrSessionVersion)
    }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.status(200).json({
        success: true,
        data: {
            token,
            table: { id: table.id, name: table.name, status: table.status, zoneId: table.zoneId }
        }
    });
};

const createTable = async (req, res, next) => {
    if (Array.isArray(req.body)) {
        const sanitized = req.body.map(item => ({ name: item.name, zoneId: item.zoneId || null, qrCode: generateTableQrCode() }));
        const newTables = await Table.bulkCreate(sanitized);
        return res.status(201).json({
            success: true,
            message: `Created ${newTables.length} tables successfully`,
            data: newTables
        });
    }

    const { name, zoneId } = req.body;

    if (!name) {
        const err = new Error('Table name is required');
        err.status = 400;
        return next(err);
    }

    const existingTable = await Table.findOne({ where: { name } });
    if (existingTable) {
        const err = new Error('Table name already exists');
        err.status = 400;
        return next(err);
    }

    // Validate zone exists if provided
    if (zoneId) {
        const zone = await Zone.findByPk(zoneId);
        if (!zone) {
            const err = new Error('Zone not found');
            err.status = 404;
            return next(err);
        }
    }

    const newTable = await Table.create({ name, zoneId, qrCode: generateTableQrCode() });

    res.status(201).json({
        success: true,
        message: 'Table created successfully',
        data: newTable
    });
};

const getAllTables = async (req, res, next) => {
    const tables = await Table.findAll({
        include: [
            {
                model: Zone,
                as: 'zone',
                attributes: ['id', 'name', 'description']
            },
            {
                model: Order,
                as: 'orders',
                attributes: ['id', 'totalPrice', 'status'],
                where: { status: { [Op.notIn]: ['Paid', 'Cancelled'] } },
                required: false
            }
        ]
    });
    res.status(200).json({
        success: true,
        message: 'Tables fetched successfully',
        data: tables
    });
};

const requestOrderCheck = async (req, res, next) => {
    const { id } = req.params;
    await Table.update({ status: 'OrderCheck' }, { where: { id } });
    res.status(200).json({ 
        success: true,
        message: 'Table status: OrderCheck' 
    });
};

const requestBillCheck = async (req, res, next) => {
    const { id } = req.params;
    await Table.update({ status: 'BillCheck' }, { where: { id } });
    res.status(200).json({ 
        success: true,
        message: 'Bill generated. Order locked.' 
    });
};

const customerSelfPay = async (req, res, next) => {
    const { id } = req.params;
    const { amount } = req.body; 

    if (!amount) {
        const err = new Error('Amount is required to pay');
        err.status = 400;
        return next(err);
    }
    
    await Bill.create({
        totalAmount: amount,
        paymentMethod: 'Transfer/Cash'
    });
    await Table.update({ status: 'Ready' }, { where: { id } });

    res.status(200).json({ 
        success: true,
        message: 'Payment received. Bill saved. Table is Ready.',
        amount_paid: amount
    });
};

const cleanTable = async (req, res, next) => {
    const { id } = req.params;
    await Table.update({
        status: 'Ready',
        guestCount: null,
        nationality: null,
        specialNote: null,
        qrSessionActive: false,
        qrSessionOpenedAt: null,
        qrSessionVersion: sequelize.literal('"qrSessionVersion" + 1')
    }, { where: { id } });
    res.status(200).json({ 
        success: true,
        message: 'Table cleaned.' 
    });
};

const updateTable = async (req, res, next) => {
    const { id } = req.params;
    const { name, zoneId } = req.body;

    const table = await Table.findByPk(id);
    if (!table) {
        const err = new Error('Table not found');
        err.status = 404;
        return next(err);
    }

    if (name) {
        const existingTable = await Table.findOne({
            where: { name, id: { [require('sequelize').Op.ne]: id } }
        });
        if (existingTable) {
            const err = new Error('Table name already exists');
            err.status = 400;
            return next(err);
        }
    }

    if (zoneId) {
        const zone = await Zone.findByPk(zoneId);
        if (!zone) {
            const err = new Error('Zone not found');
            err.status = 404;
            return next(err);
        }
    }

    if (name) table.name = name;
    if (zoneId) table.zoneId = zoneId;
    if (req.body.guestCount !== undefined) table.guestCount = String(req.body.guestCount);
    if (req.body.nationality !== undefined) table.nationality = req.body.nationality;
    if (req.body.specialNote !== undefined) table.specialNote = req.body.specialNote;
    if (req.body.allergyNote !== undefined) table.allergyNote = req.body.allergyNote;
    
    await table.save();

    res.status(200).json({
        success: true,
        message: 'Table updated successfully',
        data: table
    });
};

const deleteTable = async (req, res, next) => {
    const { id } = req.params;

    const table = await Table.findByPk(id);
    if (!table) {
        const err = new Error('Table not found');
        err.status = 404;
        return next(err);
    }

    await table.destroy();

    res.status(200).json({ 
        success: true,
        message: 'Table deleted successfully' 
    });
};

const transferTable = async (req, res, next) => {
    const { id } = req.params;
    const { targetTableId } = req.body;

    if (!targetTableId) {
        const err = new Error('Target table ID is required');
        err.status = 400;
        return next(err);
    }

    const transaction = await sequelize.transaction();
    try {
        const sourceTable = await Table.findByPk(id, { transaction });
        const targetTable = await Table.findByPk(targetTableId, { transaction });

        if (!sourceTable || !targetTable) {
            await transaction.rollback();
            const err = new Error('Table not found');
            err.status = 404;
            return next(err);
        }

        if (targetTable.status !== 'Ready') {
            await transaction.rollback();
            const err = new Error('Target table is not available');
            err.status = 400;
            return next(err);
        }

        // Move all active orders to target table
        await Order.update(
            { tableId: targetTableId },
            { where: { tableId: id, status: { [Op.notIn]: ['Paid', 'Cancelled'] } }, transaction }
        );

        // Copy table info to target
        targetTable.status = sourceTable.status;
        targetTable.guestCount = sourceTable.guestCount;
        targetTable.nationality = sourceTable.nationality;
        targetTable.specialNote = sourceTable.specialNote;
        targetTable.qrSessionActive = true;
        targetTable.qrSessionVersion = Number(targetTable.qrSessionVersion || 0) + 1;
        targetTable.qrSessionOpenedAt = new Date();
        await targetTable.save({ transaction });

        // Reset source table
        sourceTable.status = 'Ready';
        sourceTable.guestCount = null;
        sourceTable.nationality = null;
        sourceTable.specialNote = null;
        sourceTable.qrSessionActive = false;
        sourceTable.qrSessionVersion = Number(sourceTable.qrSessionVersion || 0) + 1;
        sourceTable.qrSessionOpenedAt = null;
        await sourceTable.save({ transaction });

        const businessDay = await BusinessDay.findOne({ where: { status: 'open' }, transaction });
        const shift = req.user?.id
            ? await ShiftRecord.findOne({ where: { userId: req.user.id, status: { [Op.in]: ['active', 'break'] } }, transaction })
            : null;
        await OperationalTransfer.create({
            type: 'table',
            sourceTableId: Number(id),
            targetTableId: Number(targetTableId),
            performedBy: req.user?.id || null,
            businessDayId: businessDay?.id || null,
            shiftId: shift?.id || null,
            reason: req.body.reason || 'Table transfer',
            status: 'completed'
        }, { transaction });

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: `Transferred from ${sourceTable.name} to ${targetTable.name}`,
            data: { sourceTableId: id, targetTableId }
        });
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

module.exports = { createTable, getAllTables, openTable,
    createCustomerTableSession,
    requestBillCheck, requestOrderCheck, customerSelfPay,
    cleanTable, updateTable, deleteTable, transferTable };
