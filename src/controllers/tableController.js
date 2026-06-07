const { Table, Bill, Zone, Order, sequelize } = require('../models');
const { Op } = require('sequelize');

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

const createTable = async (req, res, next) => {
    if (Array.isArray(req.body)) {
        const newTables = await Table.bulkCreate(req.body);
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

    const newTable = await Table.create({ name, zoneId });

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
    await Table.update({ status: 'Ready', guestCount: null, nationality: null, specialNote: null }, { where: { id } });
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
        await targetTable.save({ transaction });

        // Reset source table
        sourceTable.status = 'Ready';
        sourceTable.guestCount = null;
        sourceTable.nationality = null;
        sourceTable.specialNote = null;
        await sourceTable.save({ transaction });

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
    requestBillCheck, requestOrderCheck, customerSelfPay,
    cleanTable, updateTable, deleteTable, transferTable };