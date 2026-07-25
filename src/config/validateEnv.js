// Validate required environment variables
const validateEnv = () => {
    const requiredEnv = [
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'DB_HOST',
        'DB_PORT',
        'JWT_SECRET',
        'API_PORT'
    ];

    const missing = requiredEnv.filter(env => !process.env[env]);

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(env => console.error(`   - ${env}`));
        process.exit(1);
    }
    if (String(process.env.JWT_SECRET).length < 48 || process.env.JWT_SECRET === 'RMS_JWT_SECRET_KEY_123') {
        console.error('JWT_SECRET must be a unique random value of at least 48 characters');
        process.exit(1);
    }

    console.log('All required environment variables are present');
};

module.exports = validateEnv;
