const { Sequelize } = require('sequelize');


console.log('DB_USER type:', typeof process.env.DB_USER, 'DB_PASSWORD type:', typeof process.env.DB_PASSWORD);
console.log('DB_PASSWORD preview:', process.env.DB_PASSWORD ? `${process.env.DB_PASSWORD}`.slice(0, 10) : process.env.DB_PASSWORD);
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT || 5432,
    logging: false,
    }
);


const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Successfully connection DB')
    } catch (error) {
        console.error('Failed connection DB', error);
    }
};

module.exports = { sequelize, connectDB};