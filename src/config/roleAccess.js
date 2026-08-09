// Startup configuration shared by the application.
const PERMISSIONS = [
    ['view_dashboard', 'View dashboard and daily operational summary'],
    ['view_menu', 'View menu management and availability'],
    ['manage_products', 'Create and edit menu items'],
    ['set_menu_availability', 'Set remaining quantity and sold-out availability'],
    ['manage_categories', 'Create and edit menu categories'],
    ['view_tables', 'View tables and table details'],
    ['manage_tables', 'Create, edit, open, clean and transfer tables'],
    ['create_order', 'Create orders and add items'],
    ['view_orders', 'View active orders and bills'],
    ['update_order', 'Edit or transfer active orders'],
    ['delete_order', 'Cancel or remove order items'],
    ['update_order_status', 'Update kitchen order status'],
    ['view_dishup', 'Open the Dish Up kitchen display'],
    ['manage_expeditor', 'Fire, complete, fail, cancel and return dishes at Expeditor'],
    ['work_kitchen_station', 'Join kitchen stations and update preparation status'],
    ['view_kitchen_logs', 'View Dish Up status history and kitchen audit logs'],
    ['view_transfers', 'View transfer history'],
    ['manage_users', 'Create and manage staff accounts'],
    ['manage_inventory', 'Manage ingredients, recipes and stock'],
    ['view_receipts', 'Search and view receipt details'],
    ['view_reports', 'View revenue and operational reports'],
    ['manage_shifts', 'Plan and deploy staff shifts'],
    ['cashout', 'Settle bills and receive payment'],
    ['approve_bill_discount', 'Approve complaint and service-recovery bill discounts'],
    ['manage_vouchers', 'View voucher usage and manage voucher availability'],
    ['manage_cash_day', 'Open/close business day and record cash movements'],
    ['approve_booking', 'Manage reception and booking actions'],
    ['manage_roles', 'Configure roles and access permissions']
];

const DEFAULT_ROLE_PERMISSIONS = {
    Admin: PERMISSIONS.map(([name]) => name),
    RM: ['view_dashboard','view_menu','manage_products','set_menu_availability','manage_categories','view_tables','manage_tables','create_order','view_orders','update_order','delete_order','view_transfers','manage_users','manage_inventory','view_receipts','view_reports','manage_shifts','cashout','approve_bill_discount','manage_vouchers','manage_cash_day','approve_booking','view_dishup','manage_expeditor','work_kitchen_station','view_kitchen_logs'],
    AssistantManager: ['view_dashboard','view_menu','manage_products','set_menu_availability','view_tables','manage_tables','create_order','view_orders','update_order','delete_order','view_transfers','manage_inventory','view_receipts','view_reports','manage_shifts','cashout','approve_bill_discount','manage_vouchers','manage_cash_day','approve_booking','view_dishup','manage_expeditor','work_kitchen_station','view_kitchen_logs'],
    Leader: ['view_dashboard','view_menu','set_menu_availability','view_tables','manage_tables','create_order','view_orders','update_order','delete_order','view_transfers','view_receipts','manage_shifts','approve_bill_discount','view_dishup','manage_expeditor','view_kitchen_logs'],
    Waiter: ['view_dashboard','view_menu','view_tables','create_order','view_orders','update_order','view_transfers'],
    Reception: ['view_dashboard','view_menu','view_tables','manage_tables','create_order','view_orders','approve_booking'],
    Cashier: ['view_dashboard','view_menu','view_tables','create_order','view_orders','view_receipts','cashout','manage_cash_day'],
    Chef: ['view_dashboard','view_menu','view_tables','view_orders','update_order_status','view_dishup','work_kitchen_station'],
    HR: ['view_dashboard','view_tables','manage_users'],
    SupplyManager: ['view_dashboard','view_menu','view_tables','manage_products','manage_categories','manage_inventory'],
    Customer: []
};

module.exports = { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS };
