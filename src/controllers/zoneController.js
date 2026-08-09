// Controller file: receives request data, applies zoneController rules, and returns JSON.
const { Zone, Table } = require('../models');

// HTTP handler: creates or starts create zone. It reads req data, uses models/services, and sends JSON with res.
const createZone = async (req, res, next) => {
    const { name, description } = req.body;

    if (!name) {
        const err = new Error('Zone name is required');
        err.status = 400;
        return next(err);
    }

    const existingZone = await Zone.findOne({ where: { name } });
    if (existingZone) {
        const err = new Error('Zone name already exists');
        err.status = 400;
        return next(err);
    }

    const zone = await Zone.create({ name, description });
    res.status(201).json({ 
        success: true,
        message: 'Zone created successfully', 
        data: zone 
    });
};

// HTTP handler: loads get all zones data. It reads req data, uses models/services, and sends JSON with res.
const getAllZones = async (req, res, next) => {
    const zones = await Zone.findAll({
        include: [
            {
                model: Table,
                as: 'tables',
                attributes: ['id', 'name', 'status']
            }
        ]
    });
    res.status(200).json({ 
        success: true,
        message: 'Zones fetched successfully',
        data: zones 
    });
};

// HTTP handler: loads get zone by id data. It reads req data, uses models/services, and sends JSON with res.
const getZoneById = async (req, res, next) => {
    const { id } = req.params;
    const zone = await Zone.findByPk(id, {
        include: [
            {
                model: Table,
                as: 'tables',
                attributes: ['id', 'name', 'status']
            }
        ]
    });

    if (!zone) {
        const err = new Error('Zone not found');
        err.status = 404;
        return next(err);
    }

    res.status(200).json({ 
        success: true,
        message: 'Zone fetched successfully',
        data: zone 
    });
};

// HTTP handler: changes and saves update zone. It reads req data, uses models/services, and sends JSON with res.
const updateZone = async (req, res, next) => {
    const { id } = req.params;
    const { name, description } = req.body;

    const zone = await Zone.findByPk(id);
    if (!zone) {
        const err = new Error('Zone not found');
        err.status = 404;
        return next(err);
    }

    if (name && name !== zone.name) {
        const existingZone = await Zone.findOne({ where: { name } });
        if (existingZone) {
            const err = new Error('Zone name already exists');
            err.status = 400;
            return next(err);
        }
        zone.name = name;
    }

    if (description) zone.description = description;
    await zone.save();

    res.status(200).json({ 
        success: true,
        message: 'Zone updated successfully', 
        data: zone 
    });
};

// HTTP handler: removes, closes, or resets delete zone. It reads req data, uses models/services, and sends JSON with res.
const deleteZone = async (req, res, next) => {
    const { id } = req.params;

    const zone = await Zone.findByPk(id);
    if (!zone) {
        const err = new Error('Zone not found');
        err.status = 404;
        return next(err);
    }

    // Check if zone has tables
    const tableCount = await Table.count({ where: { zoneId: id } });
    if (tableCount > 0) {
        const err = new Error(`Cannot delete zone. It has ${tableCount} table(s). Remove tables first.`);
        err.status = 400;
        return next(err);
    }

    await zone.destroy();
    res.status(200).json({ 
        success: true,
        message: 'Zone deleted successfully' 
    });
};

module.exports = { createZone, getAllZones, getZoneById, updateZone, deleteZone };
