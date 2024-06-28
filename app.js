const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { swaggerUi, swaggerDocs } = require('./swaggerConfig');
const routes = require('./routes/index');

const app = express();
app.use(bodyParser.json());
app.use(cors()); // Enable CORS for all origins

// Swagger setup
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Use routes
app.use('/', routes);

const port = 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
