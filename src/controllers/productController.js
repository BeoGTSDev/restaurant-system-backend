const { Product, Category } = require('../models/index');
const { getBusinessDate, resetExpiredDailyAvailability } = require('../utils/productAvailability');

const parseRemainingQty = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) {
        const err = new Error('Remaining quantity must be a non-negative whole number');
        err.status = 400;
        throw err;
    }
    return quantity;
};

const availabilityValues = (status, remainingQty) => {
    if (status === 'Disabled') {
        return { status, remainingQty: null, availabilityDate: null };
    }

    const quantity = parseRemainingQty(remainingQty);
    if (status === 'Out of Stock' || quantity === 0) {
        return { status: 'Out of Stock', remainingQty: 0, availabilityDate: getBusinessDate() };
    }
    if (quantity !== null) {
        return { status: 'In Stock', remainingQty: quantity, availabilityDate: getBusinessDate() };
    }
    return { status: 'In Stock', remainingQty: null, availabilityDate: null };
};

const createProduct = async (req, res, next) => {
    const { name, internalName, displayName, description, price, categoryId, status, remainingQty } = req.body;

    const existingProduct = await Product.findOne({ where: { name } });
    if (existingProduct) {
        const err = new Error('Product name already exists');
        err.status = 400;
        return next(err);
    }
    
    const imageUrl = req.file ? req.file.path : null;

    const category = await Category.findByPk(categoryId);
    if (!category) {
        const err = new Error('Category not found');
        err.status = 404;
        return next(err);
    }

    const availability = availabilityValues(status || 'In Stock', remainingQty);
    const newProduct = await Product.create({
        name,
        internalName: internalName || null,
        displayName: displayName || null,
        description,
        price,
        imageUrl,
        categoryId,
        ...availability
    });

    res.status(201).json({
        success: true,
        message: 'Product created successfully',
        product: newProduct
    });
};

const bulkCreateProducts = async (req, res, next) => {
    const products = req.body?.products;

    if (!Array.isArray(products) || products.length === 0) {
        const err = new Error('Please provide an array of products');
        err.status = 400;
        return next(err);
    }

    const createdProducts = [];
    const errors = [];

    for (const product of products) {
        try {
            const existingProduct = await Product.findOne({ where: { name: product.name } });
            if (existingProduct) {
                errors.push(`Product "${product.name}" already exists`);
                continue;
            }

            const category = await Category.findByPk(product.categoryId);
            if (!category) {
                errors.push(`Category ID ${product.categoryId} for "${product.name}" not found`);
                continue;
            }

            const newProduct = await Product.create({
                name: product.name,
                internalName: product.internalName || null,
                displayName: product.displayName || null,
                description: product.description || '',
                price: product.price,
                imageUrl: product.imageUrl || null,
                categoryId: product.categoryId
            });
            createdProducts.push(newProduct);
        } catch (error) {
            errors.push(`Error creating "${product.name}": ${error.message}`);
        }
    }

    res.status(201).json({
        success: true,
        message: `${createdProducts.length} products created successfully`,
        data: createdProducts,
        errors: errors.length > 0 ? errors : null
    });
};

const getAllProducts = async (req, res, next) => {
    await resetExpiredDailyAvailability(Product);
    const products = await Product.findAll({
        include: [{ model: Category, as: 'category', attributes: ['name'] }]
    });
    res.status(200).json({
        success: true,
        data: products
    });
};

const updateProduct = async (req, res, next) => {
    const { id } = req.params;
    const { name, internalName, displayName, description, price, categoryId, status, remainingQty } = req.body;

    const product = await Product.findByPk(id);
    if (!product) {
        const err = new Error('Product not found');
        err.status = 404;
        return next(err);
    }

    if (name && name !== product.name) {
        const existingProduct = await Product.findOne({ where: { name } });
        if (existingProduct) {
            const err = new Error('Product name already exists');
            err.status = 400;
            return next(err);
        }
        product.name = name;
    }

    if (categoryId && categoryId !== product.categoryId) {
        const category = await Category.findByPk(categoryId);
        if (!category) {
            const err = new Error('Category not found');
            err.status = 404;
            return next(err);
        }
        product.categoryId = categoryId;
    }

    if (description !== undefined) product.description = description;
    if (internalName !== undefined) product.internalName = internalName || null;
    if (displayName !== undefined) product.displayName = displayName || null;
    if (price !== undefined) product.price = price;
    if (status !== undefined || remainingQty !== undefined) {
        const availability = availabilityValues(
            status !== undefined ? status : product.status,
            remainingQty !== undefined ? remainingQty : product.remainingQty
        );
        product.status = availability.status;
        product.remainingQty = availability.remainingQty;
        product.availabilityDate = availability.availabilityDate;
    }
    if (req.file) product.imageUrl = req.file.path;

    await product.save();

    res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        product: product
    });
};

const deleteProduct = async (req, res, next) => {
    const { id } = req.params;

    const product = await Product.findByPk(id);
    if (!product) {
        const err = new Error('Product not found');
        err.status = 404;
        return next(err);
    }

    await product.destroy();

    res.status(200).json({
        success: true,
        message: 'Product deleted successfully'
    });
};

module.exports = { createProduct, bulkCreateProducts, getAllProducts, updateProduct, deleteProduct };
