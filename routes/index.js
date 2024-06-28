const express = require('express');
const sql = require('mssql');
const { spawn } = require('child_process');
const router = express.Router();
const dbConfig = require('../config/db.config');

// Connect to the database
sql.connect(dbConfig, (err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to the database.');
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: Test database connection
 *     description: Execute a simple SELECT query to test the database connection
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   Column1:
 *                     type: string
 *                   Column2:
 *                     type: string
 *       500:
 *         description: Database query failed
 */
router.get('/', async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM SinterRDI`; // Replace 'SinterRDI' with your table name
    res.json(result.recordset);
  } catch (err) {
    console.error('Query failed:', err);
    res.status(500).send('Database query failed.');
  }
});

/**
 * @swagger
 * /predict:
 *   post:
 *     summary: Get prediction
 *     description: Get a prediction from the model
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               features:
 *                 type: array
 *                 items:
 *                   type: number
 *                 example: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 prediction:
 *                   type: string
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Error executing prediction script
 */
router.post('/predict', (req, res) => {
  const features = req.body.features;

  // Ensure that features are provided and have the correct length
  if (!features || features.length !== 16) {
    return res.status(400).json({ error: 'Invalid features array. Must contain exactly 16 elements.' });
  }

  const pythonProcess = spawn('python3', ['../scripts/predict.py', JSON.stringify(features)]);

  pythonProcess.stdout.on('data', (data) => {
    const prediction = data.toString().trim();
    res.json({ prediction });
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
    res.status(500).json({ error: 'Error executing prediction script' });
  });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python process exited with code ${code}`);
    }
  });
});

module.exports = router;
