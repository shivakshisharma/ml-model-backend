// const express = require('express');
// const bodyParser = require('body-parser');
// const cors = require('cors');
// const apiRoutes = require('./routes/apiRoutes');

// const app = express();

// app.use(cors()); // Enable CORS for all origins
// app.use(bodyParser.json()); // Parse application/json

// app.use('/api', apiRoutes);
// app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs)); // Setup Swagger UI


// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

const express = require('express');
const sql = require('mssql');
const dbConfig = require('./config/db.config');

const app = express();

// Connect to the database
sql.connect(dbConfig, (err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to the database.');
});

// Example route to test the database connection
app.get('/', async (req, res) => {
  try {
    const result = await sql.query`SELECT TOP 1 * FROM YourTable`; // Replace 'YourTable' with your table name
    res.json(result.recordset);
  } catch (err) {
    console.error('Query failed:', err);
    res.status(500).send('Database query failed.');
  }
});

const port = 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
