const groups = [
    ['Seafood', /salmon|shrimp|seafood|clam|calamari|tuna/i],
    ['Meat', /chicken|beef|pork|duck|parma ham|bacon/i],
    ['Dairy & Cheese', /milk|cream|mozzarella|burrata|ricotta|gorgonzola|parmesan|egg/i],
    ['Produce', /greens|fruit|tomato|garlic|onion|spinach|mushroom|avocado|potato/i],
    ['Sauces & Oils', /oil|sauce|stock|citrus mix/i],
    ['Bar', /beer|spirit/i],
    ['Beverages', /soda|ice/i],
    ['Dry Goods', /dough|pasta|rice|sugar|salt/i]
];

module.exports = name => groups.find(([, pattern]) => pattern.test(name))?.[0] || 'Other';
