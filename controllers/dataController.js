const { spawn } = require('child_process');
const path = require('path');
const sql = require('mssql');
const dbConfig = require('../config/db.config'); // Adjust the path as necessary

// Function to fetch input data from database, predict, and store output
const processAndStoreData = async (req, res) => {
  try {
    await sql.connect(dbConfig);
    const request = new sql.Request();

    // Assuming 'InputData' is the table where your input data is stored
    const inputQuery = 'SELECT TOP 1 * FROM InputData ORDER BY DateCreated DESC'; // Adjust query as per your database schema

    const result = await request?.query(inputQuery);
    const inputFeatures = result.recordset[0]; // Assuming you only fetch one row, adjust as per your schema

    // Prepare features for prediction (assuming your Python script needs specific fields)
    const features = {};
    for (const key in inputFeatures) {
      if (inputFeatures.hasOwnProperty(key)) {
        features[key] = inputFeatures[key];
      }
    }

    // Spawn Python process to get prediction result
    const pythonProcess = spawn('python3', [path.join(__dirname, '../scripts/predict.py'), JSON.stringify(features)]);

    pythonProcess.stdout.on('data', async (data) => {
      const prediction = data.toString().trim();

      // Store prediction output into database (assuming 'OutputData' table)
      const outputQuery = `
        INSERT INTO OutputData (PredictionResult)
        VALUES (@PredictionResult)
      `;

      const outputRequest = new sql.Request();
      outputRequest.input('PredictionResult', sql.VarChar, prediction);
      await outputRequest.query(outputQuery);

      res.json({ prediction });
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
      res.status(500).json({ error: 'Error executing prediction script' });
    });
  } catch (err) {
    console.error('Error processing and storing data:', err.message);
    res.status(500).json({ error: 'Error processing and storing data' });
  } finally {
    await sql.close();
  }
};

module.exports = {
  processAndStoreData
};
