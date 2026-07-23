const { Sequelize } = require('sequelize');

const isSslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const rejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true';

const expandRailwayTemplate = (value) => {
    if (!value || typeof value !== 'string') return value;
    return value.replace(/\$\{\{([A-Z0-9_]+)\}\}/g, (_, key) => process.env[key] || '');
};

const isRailwayRuntime = Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID
);

const inferredDbName = process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.DB_NAME;
const inferredDbUser = process.env.PGUSER || process.env.POSTGRES_USER || process.env.DB_USER;
const inferredDbPassword = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD;
const proxyDomain = process.env.RAILWAY_TCP_PROXY_DOMAIN;
const proxyPort = process.env.RAILWAY_TCP_PROXY_PORT;

const constructedPublicUrl = (proxyDomain && proxyPort && inferredDbUser && inferredDbPassword && inferredDbName)
    ? `postgresql://${encodeURIComponent(inferredDbUser)}:${encodeURIComponent(inferredDbPassword)}@${proxyDomain}:${proxyPort}/${inferredDbName}`
    : null;

const expandedDatabaseUrl = expandRailwayTemplate(process.env.DATABASE_URL);
const expandedDatabasePublicUrl = expandRailwayTemplate(process.env.DATABASE_PUBLIC_URL);

const preferredDatabaseUrl = isRailwayRuntime
    ? expandedDatabaseUrl
    : (expandedDatabasePublicUrl || constructedPublicUrl || expandedDatabaseUrl);

const commonOptions = {
    dialect: 'postgres',
    logging: false,
    dialectOptions: isSslEnabled
        ? {
            ssl: {
                require: true,
                rejectUnauthorized
            }
        }
        : {}
};

const sequelize = preferredDatabaseUrl
    ? new Sequelize(preferredDatabaseUrl, commonOptions)
    : new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            ...commonOptions,
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 5432
        }
    );


const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Successfully connected to DB');
    } catch (error) {
        console.error('Failed DB connection', error);
    }
};

module.exports = { sequelize, connectDB};