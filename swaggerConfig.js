// swaggerConfig.js
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
      description: 'API Information'
    },
    servers: [
      {
        url: 'http://localhost:5000/api'
      }
    ]
  },
  apis: ['./routes/*.js', './models/*.js'] // Adjust the paths as necessary
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

module.exports = {
  swaggerUi,
  swaggerDocs
};
