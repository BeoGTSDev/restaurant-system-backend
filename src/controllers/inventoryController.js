const { Ingredient, InventoryMovement, User, BusinessDay, sequelize } = require('../models');

const list = async (req, res) => {
    const ingredients = await Ingredient.findAll({ order: [['name', 'ASC']] });
    const movements = await InventoryMovement.findAll({
        include: [
            { model: Ingredient, as: 'ingredient', attributes: ['id', 'name', 'unit'] },
            { model: User, as: 'performer', attributes: ['id', 'fullName'] }
        ],
        order: [['createdAt', 'DESC']],
        limit: 100
    });
    res.json({ ingredients, movements });
};

const create = async (req, res) => {
    const ingredient = await Ingredient.create(req.body);
    res.status(201).json(ingredient);
};

const update = async (req, res, next) => {
    const ingredient = await Ingredient.findByPk(req.params.id);
    if (!ingredient) return next(Object.assign(new Error('Ingredient not found'), { status: 404 }));
    await ingredient.update(req.body);
    res.json(ingredient);
};

const move = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const ingredient = await Ingredient.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!ingredient) throw Object.assign(new Error('Ingredient not found'), { status: 404 });
        const amount = Number(req.body.quantity);
        if (!Number.isFinite(amount) || amount < 0) throw Object.assign(new Error('Enter a valid quantity'), { status: 400 });
        const before = Number(ingredient.quantity);
        let after = req.body.type === 'adjust' ? amount : before + (req.body.type === 'in' ? amount : -amount);
        if (after < 0) throw Object.assign(new Error('Not enough stock'), { status: 400 });
        const day = await BusinessDay.findOne({ where: { status: 'open' }, transaction });
        ingredient.quantity = after;
        await ingredient.save({ transaction });
        const movement = await InventoryMovement.create({
            ingredientId: ingredient.id,
            type: req.body.type,
            quantity: amount,
            beforeQuantity: before,
            afterQuantity: after,
            reason: req.body.reason || 'Stock update',
            performedBy: req.user?.id || null,
            businessDayId: day?.id || null
        }, { transaction });
        await transaction.commit();
        res.status(201).json({ ingredient, movement });
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

module.exports = { list, create, update, move };
