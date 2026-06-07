const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Restaurant Management System API',
            version: '1.0.0',
            description: 'API documentation for Restaurant Management System',
            contact: {
                name: 'API Support',
                email: 'support@rms.local'
            }
        },
        servers: [
            {
                url: 'http://127.0.0.1:5001/api',
                description: 'Development server'
            },
            {
                url: 'http://localhost:5001/api',
                description: 'Alternative localhost'
            }
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        },
        security: [
            {
                BearerAuth: []
            }
        ]
    },
    apis: ['./src/routes/*.js', './src/controllers/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerSetup = (app) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    console.log('API Documentation available at http://localhost:3000/api-docs');
};

module.exports = swaggerSetup;
