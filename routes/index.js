// const express = require('express');
// const sql = require('mssql');
// const { spawn } = require('child_process');
// const router = express.Router();
// const dbConfig = require('../config/db.config');

// // Connect to the database
// sql.connect(dbConfig, (err) => {
//   if (err) {
//     console.error('Database connection failed:', err);
//     return;
//   }
//   console.log('Connected to the database.');
// });

// /**
//  * @swagger
//  * /:
//  *   get:
//  *     summary: Test database connection
//  *     description: Execute a simple SELECT query to test the database connection
//  *     responses:
//  *       200:
//  *         description: Successful response
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: array
//  *               items:
//  *                 type: object
//  *                 properties:
//  *                   Column1:
//  *                     type: string
//  *                   Column2:
//  *                     type: string
//  *       500:
//  *         description: Database query failed
//  */
// router.get('/', async (req, res) => {
//   try {
//     const result = await sql.query`SELECT * FROM SinterRDI`; // Replace 'SinterRDI' with your table name
//     res.json(result.recordset);
//   } catch (err) {
//     console.error('Query failed:', err);
//     res.status(500).send('Database query failed.');
//   }
// });

// /**
//  * @swagger
//  * /predict:
//  *   post:
//  *     summary: Get prediction
//  *     description: Get a prediction from the model
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               features:
//  *                 type: array
//  *                 items:
//  *                   type: number
//  *                 example: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]
//  *     responses:
//  *       200:
//  *         description: Successful response
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 prediction:
//  *                   type: string
//  *       400:
//  *         description: Invalid input
//  *       500:
//  *         description: Error executing prediction script
//  */
// router.post('/predict', (req, res) => {
//   const features = req.body.features;

//   // Ensure that features are provided and have the correct length
//   if (!features || features.length !== 16) {
//     return res.status(400).json({ error: 'Invalid features array. Must contain exactly 16 elements.' });
//   }

//   const pythonProcess = spawn('python3', ['../scripts/predict.py', JSON.stringify(features)]);

//   pythonProcess.stdout.on('data', (data) => {
//     const prediction = data.toString().trim();
//     res.json({ prediction });
//   });

//   pythonProcess.stderr.on('data', (data) => {
//     console.error(`stderr: ${data}`);
//     res.status(500).json({ error: 'Error executing prediction script' });
//   });

//   pythonProcess.on('close', (code) => {
//     if (code !== 0) {
//       console.error(`Python process exited with code ${code}`);
//     }
//   });
// });

// module.exports = router;





// // Function to connect to databases
// async function connectDatabases() {
//   try {
//     await sql.connect(dbConfig.database1); // Replace with your first database config
//     await sql.connect(dbConfig.database2); // Replace with your second database config
//     console.log('Connected to databases.');
//   } catch (err) {
//     console.error('Database connection failed:', err);
//     throw err;
//   }
// }

// // Function to fetch inputs from two databases
// async function fetchInputs() {
//   try {
//     const query1 = 'SELECT input1, input2, ... FROM Database1Table'; // Adjust query as per your database schema
//     const query2 = 'SELECT input3, input4, ... FROM Database2Table'; // Adjust query as per your database schema

//     const results1 = await sql.query(query1);
//     const results2 = await sql.query(query2);

//     // Combine and return inputs
//     return {
//       input1: results1.recordset[0].input1,
//       input2: results1.recordset[0].input2,
//       input3: results2.recordset[0].input3,
//       input4: results2.recordset[0].input4,
//       // Add more inputs as needed
//     };
//   } catch (err) {
//     console.error('Error fetching inputs:', err);
//     throw err;
//   }
// }

// // Function to predict output using Python script
// function predictOutput(inputs) {
//   return new Promise((resolve, reject) => {
//     const pythonProcess = spawn('python3', ['scripts/predict.py', JSON.stringify(inputs)]);

//     pythonProcess.stdout.on('data', (data) => {
//       const prediction = data.toString().trim();
//       resolve(prediction);
//     });

//     pythonProcess.stderr.on('data', (data) => {
//       console.error(`stderr: ${data}`);
//       reject('Error executing prediction script');
//     });
//   });
// }

// // Function to update SinterRDI table with predicted output
// async function updateSinterRDI(prediction) {
//   try {
//     await sql.query`
//       UPDATE SinterRDI
//       SET RDI = ${prediction}
//       WHERE id = 1; // Adjust as per your update condition
//     `;
//     console.log('SinterRDI table updated with predicted output:', prediction);
//   } catch (err) {
//     console.error('Error updating SinterRDI table:', err);
//     throw err;
//   }
// }

// // Route to fetch inputs, predict output, and update SinterRDI table
// router.post('/predictAndUpdate', async (req, res) => {
//   try {
//     // Connect to databases
//     await connectDatabases();

//     // Fetch inputs from two databases
//     const inputs = await fetchInputs();

//     // Predict output based on inputs
//     const prediction = await predictOutput(inputs);

//     // Update SinterRDI table with predicted output
//     await updateSinterRDI(prediction);

//     res.json({ prediction });
//   } catch (err) {
//     console.error('Prediction and update failed:', err);
//     res.status(500).json({ error: 'Prediction and update failed' });
//   } finally {
//     // Close database connections
//     await sql.close();
//     console.log('Database connections closed.');
//   }
// });

// module.exports = router;










//// for the time being

const express = require('express');
const sql = require('mssql');
const { spawn } = require('child_process');
const multer = require('multer');
const xlsx = require('xlsx'); // For handling Excel files
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


// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/Sinter RDI project files/ml-model-backend/uploads'); // Destination folder for uploaded files
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Keep original file name
  }
});

const upload = multer({ storage: storage });

// Root route
router.get('/', (req, res) => {
  res.send('Welcome to the Sinter RDI API!');
});

router.post('/upload', upload.single('file'), async (req, res) => {
  const filePath = req.file.path;

  try {
    // Read Excel file
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    // Insert data into database
    await Promise.all(data.map(async (row) => {
      const keys = Object.keys(row).join(', ');
      const values = Object.values(row).map(value => typeof value === 'string' ? `'${value}'` : value).join(', ');

      const query = `
        INSERT INTO Sinter_RDI.dbo.SinterRDI (${keys})
        VALUES (${values})
      `;
      
      await sql.query(query);
    }));

    res.status(200).send('Data inserted successfully');
  } catch (error) {
    console.error('Error processing file and inserting into database:', error);
    res.status(500).json({ error: 'Failed to process file and insert data into database.' });
  }
});

// Prediction endpoint
router.post('/predict', async (req, res) => {
  try {
    // Fetch the latest row from the database based on Timestamp
    const result = await sql.query(`
      SELECT TOP 1 *
      FROM SinterRDI
      ORDER BY CreatedAt DESC
    `);
    const latestData = result.recordset[0];
   
    // Extract features for prediction
    const features = [
      latestData['Size5mm'],
      latestData['MeanSizeRawMixWet'],
      latestData['ProductSinterAbove40mm'],
      latestData['FeO'],
      latestData['MgO'],
      latestData['CoalCI'],
      latestData['LimeCI'],
      latestData['DolomiteCI'],
      latestData['Basicity'],
      latestData['Al2O3_SiO2_Ratio'],
      latestData['MainFanSpeedRPM'],
      latestData['BTP'],
      latestData['CaO'],
      latestData['BallingIndex'],
      latestData['FCTemp'],
      latestData['MCSpeed'],
      

    ];

    // Spawn a child process to run the Python script
    console.log(JSON.stringify(features));
    try{
      const pythonProcess = spawn('python', ['/Sinter RDI project files/ml-model-backend/scripts/predict.py', JSON.stringify(features)]);

  
    
     
    let dataString = '';

    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
      pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });

      
      
      const prediction = JSON.parse(dataString);
      console.log(prediction);
       
      
    });

  }
  catch(e){
    console.log(e,"error in prediction file hihihih");

  }
    // pythonProcess.stderr.on('data', (data) => {
    //   console.error(`stderr: ${data}`);
    // });

    // pythonProcess.on('close', async (code) => {
    //   if (code !== 0) {
        
    //     res.status(500).json({ error: 'Error in Python script execution.' });
    //     return;
    //   }

    //   try {
    //     const prediction = JSON.parse(dataString);
    //      console.log(prediction);
    //     // Update the latest row with the predicted RDI value
    //     const updateQuery = `
    //       UPDATE SinterRDI
    //       SET RDIValue = ${prediction}
    //       WHERE CreatedAt = '${latestData.Timestamp.toISOString()}'
    //     `;

    //     await sql.query(updateQuery);

    //     res.status(200).json({ prediction });
    //   } catch (error) {
    //     console.error('Error updating prediction in database:', error);
    //     res.status(500).json({ error: 'Failed to update prediction in database.' });
    //   }
    // });
  } 

  catch (error) {
    console.error('Error fetching latest data:', error);
    res.status(500).json({ error: 'Failed to fetch latest data.' });
  }
});

module.exports = router;
