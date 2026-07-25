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
const BusinessDay = require('./BusinessDay')(sequelize);
const CashMovement = require('./CashMovement')(sequelize);
const OperationalTransfer = require('./OperationalTransfer')(sequelize);
const Ingredient = require('./Ingredient')(sequelize);
const InventoryMovement = require('./InventoryMovement')(sequelize);
const ShiftAreaConfig = require('./ShiftAreaConfig')(sequelize);
const ProductIngredient = require('./ProductIngredient')(sequelize);
const Voucher = require('./Voucher');
const Receipt = require('./Receipt');
const ReceiptItem = require('./ReceiptItem');
const PaymentTransaction = require('./PaymentTransaction');



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

BusinessDay.hasMany(CashMovement, { foreignKey: 'businessDayId', as: 'cashMovements' });
CashMovement.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
BusinessDay.hasMany(ShiftRecord, { foreignKey: 'businessDayId', as: 'shifts' });
ShiftRecord.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
BusinessDay.hasMany(Order, { foreignKey: 'businessDayId', as: 'orders' });
Order.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
ShiftRecord.hasMany(Order, { foreignKey: 'shiftId', as: 'orders' });
Order.belongsTo(ShiftRecord, { foreignKey: 'shiftId', as: 'shift' });
Order.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
Order.belongsTo(User, { foreignKey: 'paidBy', as: 'paymentStaff' });
OrderTransfer.belongsTo(User, { foreignKey: 'transferredBy', as: 'staff' });
OrderTransfer.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
OrderTransfer.belongsTo(ShiftRecord, { foreignKey: 'shiftId', as: 'shift' });
OperationalTransfer.belongsTo(User, { foreignKey: 'performedBy', as: 'performer' });
OperationalTransfer.belongsTo(User, { foreignKey: 'fromStaffId', as: 'fromStaff' });
OperationalTransfer.belongsTo(User, { foreignKey: 'toStaffId', as: 'toStaff' });
OperationalTransfer.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
OperationalTransfer.belongsTo(ShiftRecord, { foreignKey: 'shiftId', as: 'shift' });
InventoryMovement.belongsTo(Ingredient, { foreignKey: 'ingredientId', as: 'ingredient' });
Ingredient.hasMany(InventoryMovement, { foreignKey: 'ingredientId', as: 'movements' });
InventoryMovement.belongsTo(User, { foreignKey: 'performedBy', as: 'performer' });
InventoryMovement.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
ShiftAreaConfig.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
ShiftAreaConfig.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });
Product.hasMany(ProductIngredient, { foreignKey: 'productId', as: 'recipe' });
ProductIngredient.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Ingredient.hasMany(ProductIngredient, { foreignKey: 'ingredientId', as: 'productLinks' });
ProductIngredient.belongsTo(Ingredient, { foreignKey: 'ingredientId', as: 'ingredient' });

BusinessDay.hasMany(Receipt, { foreignKey: 'businessDayId', as: 'receipts' });
Receipt.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
Table.hasMany(Receipt, { foreignKey: 'tableId', as: 'receipts' });
Receipt.belongsTo(Table, { foreignKey: 'tableId', as: 'table' });
User.hasMany(Receipt, { foreignKey: 'paidBy', as: 'receiptsProcessed' });
Receipt.belongsTo(User, { foreignKey: 'paidBy', as: 'paymentStaff' });
Receipt.hasMany(ReceiptItem, { foreignKey: 'receiptId', as: 'items' });
ReceiptItem.belongsTo(Receipt, { foreignKey: 'receiptId', as: 'receipt' });
BusinessDay.hasMany(PaymentTransaction, { foreignKey: 'businessDayId', as: 'paymentTransactions' });
PaymentTransaction.belongsTo(BusinessDay, { foreignKey: 'businessDayId', as: 'businessDay' });
Table.hasMany(PaymentTransaction, { foreignKey: 'tableId', as: 'paymentTransactions' });
PaymentTransaction.belongsTo(Table, { foreignKey: 'tableId', as: 'table' });
PaymentTransaction.belongsTo(Receipt, { foreignKey: 'receiptId', as: 'receipt' });
User.hasMany(PaymentTransaction, { foreignKey: 'createdBy', as: 'paymentRequests' });
PaymentTransaction.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

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
    ,
    BusinessDay,
    CashMovement,
    OperationalTransfer,
    Ingredient,
    InventoryMovement
    ,
    ShiftAreaConfig
    ,
    ProductIngredient,
    Voucher,
    Receipt,
    ReceiptItem,
    PaymentTransaction
};

