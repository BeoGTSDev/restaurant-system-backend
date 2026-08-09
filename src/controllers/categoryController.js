// Controller file: receives request data, applies categoryController rules, and returns JSON.
const Category = require('../models/Category');

// HTTP handler: creates or starts create category. It reads req data, uses models/services, and sends JSON with res.
const createCategory = async (req, res, next) => {
    const { name, description } = req.body;

    const existingCategory = await Category.findOne({ where: { name } });
    if (existingCategory) {
        const err = new Error('Category name already exists');
        err.status = 400;
        return next(err);
    }

    const newCategory = await Category.create({ name, description });
    res.status(201).json({ 
        success: true,
        message: 'Category created successfully', 
        data: newCategory 
    });
};

// HTTP handler: runs the bulk create categories step. It reads req data, uses models/services, and sends JSON with res.
const bulkCreateCategories = async (req, res, next) => {
    const categories = req.body?.categories;

    if (!Array.isArray(categories) || categories.length === 0) {
        const err = new Error('Please provide an array of categories');
        err.status = 400;
        return next(err);
    }

    const createdCategories = [];
    const errors = [];

    for (const category of categories) {
        try {
            const existingCategory = await Category.findOne({ where: { name: category.name } });
            if (existingCategory) {
                errors.push(`Category "${category.name}" already exists`);
                continue;
            }

            const newCategory = await Category.create({
                name: category.name,
                description: category.description || ''
            });
            createdCategories.push(newCategory);
        } catch (error) {
            errors.push(`Error creating "${category.name}": ${error.message}`);
        }
    }

    res.status(201).json({
        success: true,
        message: `${createdCategories.length} categories created successfully`,
        data: createdCategories,
        errors: errors.length > 0 ? errors : null
    });
};

// HTTP handler: loads get all categories data. It reads req data, uses models/services, and sends JSON with res.
const getAllCategories = async (req, res, next) => {
    const categories = await Category.findAll();
    res.status(200).json({
        success: true,
        data: categories
    });
};

module.exports = { createCategory, bulkCreateCategories, getAllCategories };
