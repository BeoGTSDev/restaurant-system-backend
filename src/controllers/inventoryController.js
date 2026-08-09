// Controller file: receives request data, applies inventoryController rules, and returns JSON.
const { Ingredient, InventoryMovement, ProductIngredient, Product, User, BusinessDay, sequelize } = require('../models');

// HTTP handler: loads list data. It reads req data, uses models/services, and sends JSON with res.
const list = async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    const ingredients = await Ingredient.findAll({
        include: [{
            model: ProductIngredient,
            as: 'productLinks',
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'displayName'] }]
        }],
        order: [['name', 'ASC']]
    });
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

// HTTP handler: creates or starts create. It reads req data, uses models/services, and sends JSON with res.
const create = async (req, res) => {
    const { name, category, unit, quantity, reorderLevel, supplier } = req.body;
    const ingredient = await Ingredient.create({ name, category, unit, quantity, reorderLevel, supplier });
    res.status(201).json(ingredient);
};

// HTTP handler: changes and saves update. It reads req data, uses models/services, and sends JSON with res.
const update = async (req, res, next) => {
    const ingredient = await Ingredient.findByPk(req.params.id);
    if (!ingredient) return next(Object.assign(new Error('Ingredient not found'), { status: 404 }));
    const { name, category, unit, quantity, reorderLevel, supplier } = req.body;
    await ingredient.update({
        ...(name !== undefined ? { name } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(unit !== undefined ? { unit } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
        ...(reorderLevel !== undefined ? { reorderLevel } : {}),
        ...(supplier !== undefined ? { supplier } : {})
    });
    res.json(ingredient);
};

// HTTP handler: runs the move step. It reads req data, uses models/services, and sends JSON with res.
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
