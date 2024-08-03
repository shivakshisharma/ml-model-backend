

const express = require('express');
const sql = require('mssql');
const https = require('https');
const { spawn } = require('child_process');
const multer = require('multer');
const xlsx = require('xlsx'); // For handling Excel files
const router = express.Router();
const dbConfig = require('../config/db.config');
const dbConfig1=require('../config/db.config1');
const {fieldMapping}=require('../Mapping/Mapping')
const { Parser } = require('json2csv');
const path=require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const oracledb = require('oracledb');
const axios = require('axios');
const btoa = require('btoa'); // This is used for base64 encoding
const basicAuth=require('basic-auth-header');
const request = require('request');
const ntlm = require('request-ntlm');
const kerberos = require('kerberos');
const crypto = require('crypto');
// Connect to the database
oracledb.externalAuth = false;
oracledb.outFormat=oracledb.OUT_FORMAT_OBJECT;
async function initOracleClient() {
  try {
      await oracledb.initOracleClient({ libDir: 'C:/instant_client_fornode/instantclient_23_4' }); // Replace with your Oracle Client library path
      console.log('Oracle Client initialized successfully');
  } catch (err) {
      console.error('Error initializing Oracle Client:', err);
  }
}

// Call initOracleClient() before establishing any database connections
initOracleClient();
async function connectToSqlServer() {
  try {
    const pool = await sql.connect(dbConfig);
    return pool;
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}
console.log(dbConfig1);
async function connectToPPMS() {
  try {
    const pool =await oracledb.getConnection( dbConfig1);
   console.log('Connected to PPMS database.');
    return pool;
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}




//Fetch the data from the PPMS database 

async function fetchPPMSData() {
  try {
    const ppmsPool = await connectToPPMS();
    const result = await ppmsPool.execute(`
      SELECT "P5MM", MEAN_SIZE, "P40MM", FEO, MGO, FUEL, LIMESTONE, DOLOMITE, BASICITY, "Al2O3/SiO2", CAO, BALLING_MILL, WORK_DATETIME, SHIFT
      FROM ispat.VW_SIN2_QUALITY_PARAM
      ORDER BY WORK_DATETIME DESC 
      FETCH FIRST 1 ROWS ONLY
    `);

    if (result.rows.length === 0) {
      throw new Error('No data found in PPMS.');
    }

    let ppmsData = result.rows[0];
    // console.log('Initial PPMS Data:', ppmsData);

    const previousDayWorkDate = ppmsData.WORK_DATETIME.toISOString().split('T')[0];

    // If the shift is not 'A' and BallingIndex is null, fetch the BallingIndex from the previous day's shift A
    if (ppmsData.SHIFT !== 'A' && !ppmsData.BALLING_MILL) {
      console.log('Fetching BALLING_MILL for previous day shift A, WORK_DATETIME:', previousDayWorkDate);

      const previousDayResult = await ppmsPool.execute(`
        SELECT BALLING_MILL
        FROM ispat.VW_SIN2_QUALITY_PARAM
        WHERE SHIFT = 'A' AND WORK_DATETIME < TO_DATE(:WORK_DATETIME, 'YYYY-MM-DD')
        ORDER BY WORK_DATETIME DESC
        FETCH FIRST 1 ROWS ONLY
      `, { WORK_DATETIME: previousDayWorkDate });

      // console.log('Previous Day Result:', previousDayResult);

      if (previousDayResult.rows.length > 0) {
        ppmsData.BALLING_MILL = previousDayResult.rows[0].BALLING_MILL;
      }
    }

    // Check other parameters for null values and fetch the last available non-null values
    const parametersToCheck = ["P5MM", "MEAN_SIZE", "P40MM", "FEO", "MGO", "FUEL", "LIMESTONE", "DOLOMITE", "BASICITY", "Al2O3/SiO2", "CAO"];
    for (const param of parametersToCheck) {
      if (ppmsData[param] === null) {
        const lastNonNullResult = await ppmsPool.execute(`
          SELECT ${param}
          FROM ispat.VW_SIN2_QUALITY_PARAM
          WHERE ${param} IS NOT NULL AND WORK_DATETIME < TO_DATE(:WORK_DATETIME, 'YYYY-MM-DD')
          ORDER BY WORK_DATETIME DESC
          FETCH FIRST 1 ROWS ONLY
        `, { WORK_DATETIME: previousDayWorkDate });

        // console.log(`Last Non-Null Result for ${param}:`, lastNonNullResult);

        if (lastNonNullResult.rows.length > 0) {
          ppmsData[param] = lastNonNullResult.rows[0][param];
        }
      }
    }
    console.log('Final PPMS Data:', ppmsData);

    return ppmsData;

  } catch (error) {
    console.error('Error fetching PPMS data:', error);
  }
}


//Fetch PI vision Data using the PI Web Api where time==WORK_DATETIME date.now()==WORKDATETIME fetch from pivision 
async function fetchDataFromPiWebAPI() {
  const names = ['AvgFCtemp', 'AcgBTP', 'MainFanSpeedRPM', 'MCspeedM'];
  const webIds = [
    "F1AbEN7eKxJfieEajjsXzDckv6AJOH1_iD06xGSGpQYgnoTMg7g9XFQzySE2HutOcmIIDjgSlNXU0wtRE9MLVBJLUFGXFdFQkFQSVxKU1dcU0lQfEFWR0ZDVEVNUA",  // Avg Furnace Temp
    "F1AbEN7eKxJfieEajjsXzDckv6AJOH1_iD06xGSGpQYgnoTMgUFsw6Np1O02Yerqy6C0r5wSlNXU0wtRE9MLVBJLUFGXFdFQkFQSVxKU1dcU0lQfEFDR0JUUA",   // Avg BTP
    "F1AbEN7eKxJfieEajjsXzDckv6AJOH1_iD06xGSGpQYgnoTMgJslMk2G4yEmmCyxS-HFM5ASlNXU0wtRE9MLVBJLUFGXFdFQkFQSVxKU1dcU0lQfE1BSU5GQU5TUEVFRFJQTQ", // Main Fan Speed RPM
    "F1AbEN7eKxJfieEajjsXzDckv6AJOH1_iD06xGSGpQYgnoTMgZsagC0QwJEaTLusxERYyIQSlNXU0wtRE9MLVBJLUFGXFdFQkFQSVxKU1dcU0lQfE1DU1BFRURN"   // Machine Speed
  ];

  const username = "pi_developer1";
  const password = "Jsw@2020";
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');

  // Disable SSL certificate verification (NOT recommended for production)
  const agent = new https.Agent({
    rejectUnauthorized: false
  });

  const fetchDataForWebId = async (webId) => {
    const url = `https://jswsl-dol-pi-af.jsw.in/piwebapi/streams/${webId}/value`;

    try {
      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        }
      });
      return response.data.Value;  // Adjust this based on the actual response structure
    } catch (error) {
      console.error('Error fetching data:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return null;
    }
  };

  try {
    const promises = webIds.map(webId => fetchDataForWebId(webId));
    const values = await Promise.all(promises);

    // Constructing the final object
    const result = {};
    names.forEach((name, index) => {
      result[name] = values[index];
    });

    console.log('Final PI Web API Data:', result);
    return result;
  } catch (error) {
    console.error('Error in fetchDataFromPiWebAPI:', error.message);
  }
}

// Example usage:
// fetchDataFromPiWebAPI().catch(err => console.error(err));

//Cron to fetch the data from PPMS and store it in sinter db

// cron.schedule('10 * * * *', async () => {
//   try {
//     const ppmsData = await fetchPPMSData()
//     const piVisionData=await fetchDataFromPiWebAPI();
//   // Combine the data from both sources
//     const combinedData = { ...ppmsData, ...piVisionData };
//     console.log(combinedData);
//     // Store the combined data in SinterRDI
//     await storeDataInSinterRDI(combinedData);
//     console.log('Data fetched and updated successfully');
//   } catch (error) {
//     console.error('Error in scheduled task:', error);
//   }
// });

//Map the data from PPMS and store in my database Sinter_rdi
async function storeDataInSinterRDI(combinedData) {
  const mappedData = {};
  for (const key in fieldMapping) {
    if (combinedData.hasOwnProperty(key)) {
      mappedData[fieldMapping[key]] = combinedData[key];
    }
  }

  try {
    const sinterPool = await connectToSqlServer();
    const request = sinterPool.request();

    // Query the most recent CreatedAt value from SinterRDI
    const { recordset } = await request.query(`
      SELECT TOP 1 CreatedAt
      FROM SinterRDI
      ORDER BY CreatedAt DESC
    `);

    const mostRecentCreatedAt = recordset.length > 0 ? recordset[0].CreatedAt : null;

    // Compare WORK_DATETIME with the most recent CreatedAt
    if (!mostRecentCreatedAt || new Date( combinedData.WORK_DATETIME) > new Date(mostRecentCreatedAt)) {
      // Add input parameters for each field
      Object.keys(mappedData).forEach(key => {
        request.input(key, mappedData[key]);
      });
      request.input('CreatedAt', sql.DateTime,  combinedData.WORK_DATETIME);

      const query = `
        INSERT INTO SinterRDI (Size5mm, MeanSizeRawMixWet, ProductSinterAbove40mm, FeO, MgO, CoalCI, LimeCI, DolomiteCI, Basicity, Al2O3_SiO2_Ratio, CaO, BallingIndex,FCTemp,MCSpeed,MainFanSpeedRPM,BTP,CreatedAt)
        VALUES (@Size5mm, @MeanSizeRawMixWet, @ProductSinterAbove40mm, @FeO, @MgO, @CoalCI, @LimeCI, @DolomiteCI, @Basicity, @Al2O3_SiO2_Ratio, @CaO, @BallingIndex,@FCTemp,@MCSpeed,@MainFanSpeedRPM,@BTP,@CreatedAt)
      `;

      await request.query(query);
      console.log('Data successfully stored in SinterRDI');
    } else {
      console.log('No new data to insert based on WORK_DATETIME');
    }
  } catch (error) {
    console.error('Error storing data in SinterRDI:', error);
  }
}



//Get latest data from sinter rdi to show in frontend
async function getLastSinterRDI() {
  try {
    const sinterPool = await connectToSqlServer(); // Connect to the Sinter RDI database
    // Fetch the latest data from PPMS_TABLE
    const result = await sinterPool.request().query(`
      SELECT TOP 1 Size5mm, MeanSizeRawMixWet, ProductSinterAbove40mm, FeO, MgO, CoalCI, LimeCI, DolomiteCI, Basicity, Al2O3_SiO2_Ratio, CaO, BallingIndex,FCTemp,MCSpeed,MainFanSpeedRPM,BTP
      FROM SinterRDI
      ORDER BY CreatedAt ASC
    `);
    return result.recordset[0];
  } catch (error) {
    console.error('Error fetching latest Sinter_RDI data:', error);
  }
}

//API to get the latest row inserted from PPMS into the sinter rdi table
router.get('/realtime-data', async (req, res) => {
  try {
    const data = await getLastSinterRDI();
     res.json(data);
    //  console.log(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});


// Nodemailer transporter configuration for Outlook
const transporter = nodemailer.createTransport({
  service:"gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for port 465, false for 587
  auth: {
    user: 'shivakshisharma2000@gmail.com',
    pass: 'Almighty@123'
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 60000, // 60 seconds
  logger: true, // Enable logging
  debug: true // Enable debug output
});


// Ensure the upload directory exists
const uploadDir = path.resolve(__dirname, '/Sinter RDI project files/ml-model-backend/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
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

// Fetch data from the last 24 hours and convert to CSV
const fetchDataAndConvertToCSV = async () => {
  try {
    const sinterPool = await connectToSqlServer(); // Connect to the Sinter RDI database
    // const result = await sinterPool.request().query(`     
    //   SELECT *
    //   FROM SinterRDI
    //   WHERE CreatedAt >= DATEADD(day, -1, GETDATE())
    // `);  //For testing with the dev data to mail check
    const result=await sinterPool.request().query(
      `SELECT *
       FROM SinterRDI
       WHERE CAST(CreatedAt AS DATE) = '2024-07-02'`
    );
    if (result.recordset.length === 0) {
      throw new Error('No data available');
    }
    const json2csvParser = new Parser();
    return json2csvParser.parse(result.recordset);
  } catch (error) {
    console.error('Error fetching data:', error);
    throw new Error('Failed to fetch data');
  }
};

// Route to download CSV file
router.get('/download', async (req, res) => {
  try {
    const csv = await fetchDataAndConvertToCSV();
    res.header('Content-Type', 'text/csv');
    res.attachment('previous_results.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// List of recipient emails
const recipients = ['shivakshisharma2000@gmail.com', 'snehaaatyagi@gmail.com'];

// Schedule task to send email at the end of the day
cron.schedule('* * * * *', async () => {
  try {
    const csv = await fetchDataAndConvertToCSV();
    const filePath = path.join(__dirname, 'previous_results.csv');
    fs.writeFileSync(filePath, csv);

    // Email options
    const mailOptions = {
      from: ' "Shivakshi sharma_544" <shivakshisharma2000@gmail.com>', // Display name with email address
      to: recipients.join(','), // Send to multiple recipients
      subject: 'Daily Report',
      text: 'Please find attached the CSV file containing the data from the last 24 hours.',
      attachments: [
        {
          filename: 'previous_results.csv',
          path: filePath,
          contentType: 'text/csv' // Set the correct content type
        },
      ],
    };

    // Send email
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
    
  } catch (error) {
    console.error('Error sending email:', error);
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {

   
  try {
    // Read Excel file
    const sinterPool = await connectToSqlServer(); // Connect to the Sinter RDI database
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

     const filePath = req.file.path;

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

     // Get the last row of the data
     const lastRow = data[data.length - 1];

     // Prepare the keys and values for the last row
     const keys = Object.keys(lastRow).join(', ');
     const values = Object.values(lastRow).map(value => typeof value === 'string' ? `'${value}'` : value).join(', ');

    // Construct the SQL query to insert the last row
     const query = `
    INSERT INTO Sinter_RDI.dbo.SinterRDI (${keys})
    VALUES (${values})
     `;
  
     // Execute the query
     await sinterPool.request().query(query);

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
    const sinterPool = await connectToSqlServer(); // Connect to the Sinter RDI database
      const result = await sinterPool.request().query(`
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
    
    const pythonProcess = spawn('python', ['/Sinter RDI project files/ml-model-backend/scripts/predict.py', JSON.stringify(features)]);

  
    
     
    let dataString = '';

    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
      pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
      });

      
       
      
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
      if (code !== 0) {
        
        res.status(500).json({ error: 'Error in Python script execution.' });
        return;
      }

      try {
       

        const prediction = JSON.parse(dataString);
        console.log('Raw prediction:', prediction);

        // Extract the prediction value from the object
        const predictionValue = prediction.prediction;
        console.log('Parsed prediction value:', predictionValue);

        if (isNaN(predictionValue)) {
          throw new Error(`Prediction value is not a number: ${predictionValue}`);
        }
        

        // Update the latest row with the predicted RDI value
        const updateQuery = `
          UPDATE SinterRDI
          SET RDIValue = @RDIValue
          WHERE CreatedAt = @CreatedAt
        `;

        const request = sinterPool.request();
        request.input('RDIValue', sql.Decimal(9, 4), parseFloat(predictionValue)); // Ensure the type matches your database column
        request.input('CreatedAt', sql.DateTime, latestData.CreatedAt);

        await request.query(updateQuery);

        res.status(200).json({ prediction: parseFloat(predictionValue) });
      } catch (error) {
        console.error('Error updating prediction in database:', error);
        res.status(500).json({ error: 'Failed to update prediction in database.' });
      }
    });
  } 

  catch (error) {
    console.error('Error fetching latest data:', error);
    res.status(500).json({ error: 'Failed to fetch latest data.' });
  }
});

module.exports = router;
