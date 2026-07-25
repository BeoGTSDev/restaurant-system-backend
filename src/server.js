const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
// initData will be required after env & DB are available to avoid early model loading
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { DataTypes } = require('sequelize');
const jwt = require('jsonwebtoken');

// Config
const validateEnv = require('./config/validateEnv');
const swaggerSetup = require('./config/swagger');

// Middleware imports
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimitMiddleware');


dotenv.config({ path: path.resolve(__dirname, '../.env') });
const { sequelize } = require('./models/index'); 
const permCache = require('./utils/permCache');
const { Role, Table } = require('./models');
const { generateTableQrCode } = require('./utils/tableQr');

// Validate environment variables
validateEnv();

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 5000;
const server = http.createServer(app);

const configuredOrigins = String(process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:3000,null')
    .split(',').map(value => value.trim()).filter(Boolean);
const originAllowed = (origin) => !origin || configuredOrigins.includes(origin);
const io = new Server(server, {
    cors: { origin: configuredOrigins, methods: ['GET', 'POST'] }
});

// Security middleware
app.use(helmet());

// Request logging
app.use(requestLogger);

// Rate limiting
app.use(apiLimiter);

// Swagger API Documentation
if (process.env.NODE_ENV !== 'production') swaggerSetup(app);

app.use((req, res, next) => {
    req.io = io;
    next();
});
app.use(cors({
    origin: (origin, callback) => originAllowed(origin)
        ? callback(null, true)
        : callback(Object.assign(new Error('Origin not allowed by CORS'), { status: 403 })),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'auth-token', 'x-table-session']
}));

// Body parser MUST come before routes
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// routes will be registered after models/routes are required below

app.get('/', (req, res) => {
  res.send('<h1>Maison Lucas Server is running!</h1>');
});


io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication required'));
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const { User } = require('./models');
        const user = await User.findByPk(payload.id, { attributes: ['id', 'isActive'] });
        if (!user?.isActive) return next(new Error('Account disabled'));
        socket.userId = user.id;
        next();
    } catch {
        next(new Error('Invalid socket authentication'));
    }
});

io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const startServer = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected successfully!');

        const queryInterface = sequelize.getQueryInterface();
        const userTable = await queryInterface.describeTable('Users').catch(() => null);
        if (userTable && !userTable.staffCode) {
            await queryInterface.addColumn('Users', 'staffCode', {
                type: DataTypes.STRING,
                allowNull: true
            });
            console.log('Added staffCode column to Users table');
        }
        if (userTable && !userTable.roleId) {
            await queryInterface.addColumn('Users', 'roleId', {
                type: DataTypes.INTEGER,
                allowNull: true
            });
            console.log('Added roleId column to Users table');
        }
        if (userTable && !userTable.totpSecret) {
            await queryInterface.addColumn('Users', 'totpSecret', {
                type: DataTypes.STRING,
                allowNull: true
            });
            console.log('Added totpSecret column to Users table');
        }

        // Add product name variants if missing
        const productTable = await queryInterface.describeTable('Products').catch(() => null);
        if (productTable && !productTable.internalName) {
            await queryInterface.addColumn('Products', 'internalName', {
                type: DataTypes.STRING,
                allowNull: true
            });
            console.log('Added internalName column to Products table');
        }
        if (productTable && !productTable.displayName) {
            await queryInterface.addColumn('Products', 'displayName', {
                type: DataTypes.STRING,
                allowNull: true
            });
            console.log('Added displayName column to Products table');
        }

        const tablesTable = await queryInterface.describeTable('Tables').catch(() => null);
        if (tablesTable) {
            const qrColumns = {
                qrCode: { type: DataTypes.STRING(64), allowNull: true, unique: true },
                qrSessionActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                qrSessionVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
                qrSessionOpenedAt: { type: DataTypes.DATE, allowNull: true }
            };
            for (const [columnName, definition] of Object.entries(qrColumns)) {
                if (!tablesTable[columnName]) await queryInterface.addColumn('Tables', columnName, definition);
            }
        }
        if (productTable && !productTable.availabilityDate) {
            await queryInterface.addColumn('Products', 'availabilityDate', {
                type: DataTypes.DATEONLY,
                allowNull: true
            });
            console.log('Added availabilityDate column to Products table');
        }

        // Upgrade existing BusinessDay tables created by earlier POS versions.
        // sequelize.sync() creates new tables but does not alter existing ones.
        const businessDayTable = await queryInterface.describeTable('business_days').catch(() => null);
        if (businessDayTable) {
            const businessDayColumns = {
                openingCash: {
                    type: DataTypes.DECIMAL(14, 2),
                    allowNull: false,
                    defaultValue: 0
                },
                openingDenominations: {
                    type: DataTypes.JSON,
                    allowNull: true
                },
                closingCash: {
                    type: DataTypes.DECIMAL(14, 2),
                    allowNull: true
                },
                closingDenominations: {
                    type: DataTypes.JSON,
                    allowNull: true
                },
                cashSales: {
                    type: DataTypes.DECIMAL(14, 2),
                    allowNull: false,
                    defaultValue: 0
                },
                expectedCash: {
                    type: DataTypes.DECIMAL(14, 2),
                    allowNull: true
                },
                difference: {
                    type: DataTypes.DECIMAL(14, 2),
                    allowNull: true
                },
                foodVatActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                foodVatRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 8 },
                alcoholVatActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                alcoholVatRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 10 },
                serviceChargeActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                serviceChargeRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
                serviceChargeName: { type: DataTypes.STRING, allowNull: true }
            };

            for (const [columnName, definition] of Object.entries(businessDayColumns)) {
                if (!businessDayTable[columnName]) {
                    await queryInterface.addColumn('business_days', columnName, definition);
                    console.log(`Added ${columnName} column to business_days table`);
                }
            }
        }

        const linkedTables = [
            ['shift_records', {
                businessDayId: { type: DataTypes.INTEGER, allowNull: true },
                shiftName: { type: DataTypes.STRING, allowNull: true },
                position: { type: DataTypes.STRING, allowNull: true },
                area: { type: DataTypes.STRING, allowNull: true }
            }],
            ['Orders', {
                businessDayId: { type: DataTypes.INTEGER, allowNull: true },
                dayOrderNumber: { type: DataTypes.INTEGER, allowNull: true },
                shiftId: { type: DataTypes.INTEGER, allowNull: true },
                createdBy: { type: DataTypes.INTEGER, allowNull: true },
                paidBy: { type: DataTypes.INTEGER, allowNull: true }
            }],
            ['order_transfers', {
                businessDayId: { type: DataTypes.INTEGER, allowNull: true },
                shiftId: { type: DataTypes.INTEGER, allowNull: true }
            }],
            ['OrderItems', {
                cancelledBy: { type: DataTypes.INTEGER, allowNull: true },
                cancellationApprovedBy: { type: DataTypes.INTEGER, allowNull: true },
                cancellationReason: { type: DataTypes.STRING, allowNull: true },
                cancelledAt: { type: DataTypes.DATE, allowNull: true }
            }],
            ['Tables', {
                assignedStaffId: { type: DataTypes.INTEGER, allowNull: true },
                allergyNote: { type: DataTypes.STRING, allowNull: true }
            }],
            ['receipts', {
                billDiscountPercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
                billDiscountAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
                billDiscountReason: { type: DataTypes.STRING, allowNull: true }
                ,foodVatAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }
                ,alcoholVatAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }
                ,serviceChargeAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }
                ,serviceChargeName: { type: DataTypes.STRING, allowNull: true }
            }]
        ];
        for (const [tableName, columns] of linkedTables) {
            const existingColumns = await queryInterface.describeTable(tableName).catch(() => null);
            if (!existingColumns) continue;
            for (const [columnName, definition] of Object.entries(columns)) {
                if (!existingColumns[columnName]) {
                    await queryInterface.addColumn(tableName, columnName, definition);
                    console.log(`Added ${columnName} column to ${tableName} table`);
                }
            }
        }
        await sequelize.query(`
            WITH ranked AS (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY "businessDayId" ORDER BY "createdAt", id
                ) AS sequence
                FROM "Orders"
                WHERE "businessDayId" IS NOT NULL
            )
            UPDATE "Orders" AS target
            SET "dayOrderNumber" = ranked.sequence
            FROM ranked
            WHERE target.id = ranked.id AND target."dayOrderNumber" IS NULL
        `).catch(() => {});
        await sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "orders_business_day_sequence"
            ON "Orders" ("businessDayId", "dayOrderNumber")
            WHERE "businessDayId" IS NOT NULL AND "dayOrderNumber" IS NOT NULL
        `).catch(() => {});
        const ingredientTable = await queryInterface.describeTable('ingredients').catch(() => null);
        if (ingredientTable && !ingredientTable.category) {
            await queryInterface.addColumn('ingredients', 'category', {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'Other'
            });
            console.log('Added category column to ingredients table');
        }
        // Earlier versions stored allergy alerts in specialNote. Split them so
        // customer requests and safety alerts can be displayed at the same time.
        await sequelize.query(`
            UPDATE "Tables"
            SET "allergyNote" = "specialNote", "specialNote" = NULL
            WHERE "allergyNote" IS NULL AND "specialNote" LIKE 'ALLERGY:%'
        `).catch(() => {});

        // Ensure PostgreSQL ENUM includes 'Disabled' before sync
        try {
            await sequelize.query(`ALTER TYPE "enum_Products_status" ADD VALUE IF NOT EXISTS 'Disabled'`);
            await sequelize.query(`ALTER TYPE "enum_shift_records_status" ADD VALUE IF NOT EXISTS 'break'`);
        } catch (_) { /* ENUM value may already exist or type may not exist yet */ }

        await sequelize.sync();
        console.log('Database & Tables synced successfully!');
        const tablesWithoutQr = await Table.findAll({ where: { qrCode: null } });
        for (const table of tablesWithoutQr) {
            table.qrCode = generateTableQrCode();
            await table.save();
        }
        
        // Clear old data
        // await sequelize.sync({ force: true }); 

        // Call initData after models are fully defined
        // Allow skipping init (useful when wiping DB for manual work)
        if (process.env.SKIP_INIT !== 'true') {
            const initData = require('./utils/initData');
            await initData();
        } else {
            console.log('SKIP_INIT=true — skipping initData (no seed will be created)');
        }

        // Prime permission cache: load all roles -> permissions into in-memory cache
        try {
            const roles = await Role.findAll({ include: [{ association: 'Permissions' }] });
            for (const r of roles) {
                const perms = (r.Permissions || []).map(p => p.name);
                permCache.set(r.name, perms, 3600);
            }
            console.log('Permission cache primed');
        } catch (err) {
            console.error('Error priming permission cache:', err);
        }

        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Server startup error:', error);
    }
};

// Route imports (after env & DB are available)
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const tableRoutes = require('./routes/tablesRoutes');
const orderRoutes = require('./routes/orderRoutes');
const revenueRoutes = require('./routes/revenueRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const orderTransferRoutes = require('./routes/orderTransferRoutes');
const roleRoutes = require('./routes/roleRoutes');
const systemRoutes = require('./routes/systemRoutes');
const operationalTransferRoutes = require('./routes/operationalTransferRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const voucherRoutes = require('./routes/voucherRoutes');
const receiptRoutes = require('./routes/receiptRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/orders', orderTransferRoutes);
// expose transfer overview under a dedicated path
app.use('/api/order-transfers', orderTransferRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/operational-transfers', operationalTransferRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/receipts', receiptRoutes);

// Error middleware must be registered after every route.
app.use(errorHandler);

if (require.main === module) {
    startServer();
}

module.exports = app;
