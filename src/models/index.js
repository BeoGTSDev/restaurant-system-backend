const { sequelize } = require('../config/database');


const User = require('./User');
const { Model } = require('sequelize');
const Category = require('./Category');
const Product = require('./Product');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Table = require('./Tables');
const Zone = require('./Zone');
const ShiftRecord = require('./ShiftRecord')(sequelize);
const OrderTransfer = require('./OrderTransfer')(sequelize);
const Role = require('./Role');
const Permission = require('./Permission');
const RolePermission = require('./RolePermission');



Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });


Zone.hasMany(Table, { foreignKey: 'zoneId', as: 'tables' });
Table.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });

Table.hasMany(Order, { foreignKey: 'tableId', as: 'orders' });
Order.belongsTo(Table, { foreignKey: 'tableId', as: 'table' });


Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });


Product.hasMany(OrderItem, { foreignKey: 'productId', as: 'orderItems' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

ShiftRecord.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });
User.hasMany(ShiftRecord, { foreignKey: 'cashierId', as: 'shifts' });

// Role / Permission associations
Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'roleId', otherKey: 'permissionId' });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permissionId', otherKey: 'roleId' });

// User - Role
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

OrderTransfer.belongsTo(Order, { foreignKey: 'originalOrderId', as: 'originalOrder' });
OrderTransfer.belongsTo(Order, { foreignKey: 'newOrderId', as: 'newOrder' });
Order.hasMany(OrderTransfer, { foreignKey: 'originalOrderId', as: 'transfersOut' });
Order.hasMany(OrderTransfer, { foreignKey: 'newOrderId', as: 'transfersIn' });

module.exports = {
    sequelize,
    Model,
    User,
    Category,
    Product,
    OrderItem,
    Order,
    Table,
    Zone,
    ShiftRecord,
    OrderTransfer
    ,
    Role,
    Permission,
    RolePermission
};

