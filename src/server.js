const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
// initData will be required after env & DB are available to avoid early model loading
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { DataTypes } = require('sequelize');

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
const { Role } = require('./models');

// Validate environment variables
validateEnv();

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
    }
})

// Security middleware
app.use(helmet());

// Request logging
app.use(requestLogger);

// Rate limiting
app.use(apiLimiter);

// Swagger API Documentation
swaggerSetup(app);

app.use((req, res, next) => {
    req.io = io;
    next();
});
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'auth-token']
}));

// Body parser MUST come before routes
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// routes will be registered after models/routes are required below

app.get('/', (req, res) => {
  res.send('<h1>Maison Lucas Server is running!</h1>');
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
        if (productTable && !productTable.availabilityDate) {
            await queryInterface.addColumn('Products', 'availabilityDate', {
                type: DataTypes.DATEONLY,
                allowNull: true
            });
            console.log('Added availabilityDate column to Products table');
        }

        // Ensure PostgreSQL ENUM includes 'Disabled' before sync
        try {
            await sequelize.query(`ALTER TYPE "enum_Products_status" ADD VALUE IF NOT EXISTS 'Disabled'`);
        } catch (_) { /* ENUM value may already exist or type may not exist yet */ }

        await sequelize.sync();
        console.log('Database & Tables synced successfully!');
        
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

startServer();

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

// Error middleware must be registered after every route.
app.use(errorHandler);
