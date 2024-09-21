

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
const utc = require('dayjs/plugin/utc');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const { start } = require('repl');

dayjs.extend(utc);
dayjs.extend(timezone);
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
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

// console.log(dbConfig1);
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
async function fetchPredictedRDI(date) {
  try {
    // Calculate the previous date
    const previousDate = new Date(date);
    previousDate.setDate(previousDate.getDate() - 1);
   
    const previousDateString = previousDate.toISOString().split('T')[0]; // Format to 'YYYY-MM-DD'

    const sinterPool = await connectToSqlServer(); // Connect to the Sinter RDI database

    // Use the calculated previous date in the SQL query
    const result = await sinterPool.request()
      .input('previousDate', sql.Date, previousDateString) // Use appropriate data type
      .query(`
        SELECT AVG(RDIValue) as RDI
        FROM Sinter_RDI.dbo.SinterRDI
        WHERE CAST(CreatedAt AS DATE) = @previousDate
      `);
      const test=await sinterPool.request()
      .input('previousDate',sql.Date,previousDateString)
      .query(`SELECT RDIValue as RDI
       FROM Sinter_RDI.dbo.SinterRDI
        WHERE CAST(CreatedAt AS DATE) = @previousDate `)
       
      
  

    if (result.recordset.length === 0) {
      console.log('No data found for the previous date.');
      return null; // Return null or an appropriate value if no data is found
    }

    const actualData = result.recordset[0].RDI;

    return actualData; // Return the average RDI from the result

  } catch (error) {
    console.error('Error fetching Predicted RDI:', error);
    throw error; // Re-throw the error to handle it upstream
  }
}




async function storeInActualRditable(combinedRDIValues) {
  const mappedData = {};

  // Assuming fieldMapping is defined somewhere
  for (const key in fieldMapping) {
    if (combinedRDIValues.hasOwnProperty(key)) {
      mappedData[fieldMapping[key]] = combinedRDIValues[key];
    }
  }

  const actualRDI = mappedData['ActualRDI'];
  const predictedRDI = mappedData['PredictedRDI'];
  console.log(actualRDI, predictedRDI, "sinter ACTUAL RDI");

  try {
    const sinterPool = await connectToSqlServer();
    const request = sinterPool.request();

    // Calculate the date for the previous day
    const previousDate = new Date();
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateString = previousDate.toISOString().split('T')[0]; // Format to 'YYYY-MM-DD'

    // Query the most recent CreatedAt value from ActualSinterRDI
    const { recordset } = await request.query(`
      SELECT TOP 1 CreatedAt
      FROM Sinter_RDI.dbo.ActualSinterRDI
      ORDER BY CreatedAt DESC
    `);

    const mostRecentCreatedAt = recordset.length > 0 ? recordset[0].CreatedAt.toISOString().split('T')[0] : null;

    // Insert if the previousDate is greater than the mostRecentCreatedAt
    if (mostRecentCreatedAt === null || previousDateString > mostRecentCreatedAt) {
      console.log("Entering data");
      const query = `
        INSERT INTO ActualSinterRDI(ActualRDI, PredictedRDI, CreatedAt)
        VALUES (@ActualRDI, @PredictedRDI, @CreatedAt)
      `;

      // Add parameters to the request
      request.input('ActualRDI', sql.Decimal(9, 4), actualRDI); // Use sql.Decimal for decimal types
      request.input('PredictedRDI', sql.Decimal(9, 4), predictedRDI); // Use sql.Decimal for decimal types
      request.input('CreatedAt', sql.DateTime, previousDate); // Use sql.DateTime for datetime

      await request.query(query);
      console.log('Data successfully stored in ActualSinterRDI');
    } else {
      console.log('Data not inserted. The most recent CreatedAt is still current.');
    }
  } catch (error) {
    console.error('Error storing data in ActualSinterRDI:', error);
  }
}


async function fetchActualRDI() {
  try {
    // Connect to the PPMS database
    const ppmsPool = await connectToPPMS();

    // Execute the query to fetch the latest RDI value where RDI > 0
    const result = await ppmsPool.execute(`
      SELECT RDI
      FROM ispat.VW_SIN2_QUALITY_PARAM
      WHERE TRUNC(WORK_DATETIME) = TRUNC(SYSDATE)
        AND RDI IS NOT NULL
      ORDER BY WORK_DATETIME DESC
      FETCH FIRST 1 ROWS ONLY
    `);
   
    // Check if any rows were returned
   
      const PPMSRDI = result.rows[0]; // Access the first row of the result
      return PPMSRDI;
    
  } catch (error) {
    
    console.error('Error fetching PPMS data:', error);
   
    return null;
  }
}


cron.schedule('* * * * *', async () => {
  try {
    const todayDate = getTodayDate(); // Get today's date in YYYY-MM-DD format
    
    const actual_RDI = await fetchActualRDI(todayDate);
    
    const RDI=actual_RDI.RDI;
    if(RDI>0)
      {
        const pred_RDI = await fetchPredictedRDI(todayDate);
        console.log(RDI,pred_RDI);
      // Combine the data from both sources
        const combined_RDI = { RDI,pred_RDI };
         console.log(combined_RDI,"Combined Data");
        // Store the combined data in SinterRDI
        await storeInActualRditable(combined_RDI);
        console.log('Data fetched and updated successfully');

      }
      else{
        console.log("Actual RDI value is not updated yet");
      }
     
   
  } catch (error) {
    console.error('Error in scheduled task:', error);
  }
});





async function fetchPPMSData() {
  try {
    const ppmsPool = await connectToPPMS();
    const result = await ppmsPool.execute(`
      SELECT "P5MM", MEAN_SIZE, "P40MM", FEO, MGO, FUEL, LIMESTONE, DOLOMITE, BASICITY, "Al2O3/SiO2", CAO, BALLING_MILL, WORK_DATETIME, SHIFT
      FROM ispat.VW_SIN2_QUALITY_PARAM
      WHERE TRUNC(WORK_DATETIME) = TRUNC(SYSDATE)  -- Ensures only today's data is fetched
      ORDER BY WORK_DATETIME DESC
      FETCH FIRST 1 ROWS ONLY
    `);
  

    if (result.rows.length === 0) {
      throw new Error('No data found in PPMS.');
    }
   
    let ppmsData = result.rows[0];
    ppmsData.WORK_DATETIME = new Date(ppmsData.WORK_DATETIME.getTime() + 5.5 * 60 * 60 * 1000);
    // console.log(ppmsData,"Initial Data");
     // Adjust WORK_DATETIME by adding 5 hours and 30 minutes
    const currentWorkDate = ppmsData.WORK_DATETIME.toISOString().split('T')[0];
    // console.log(currentWorkDate);

    if (!ppmsData.BALLING_MILL) {
      console.log('BALLING_MILL is null, fetching the last updated BallingIndex from SinterRDI table');
      const sinterPool = await connectToSqlServer();
      const request = sinterPool.request();
  
      const lastBallingIndexResult = await request.query(`
        SELECT TOP 1 BallingIndex
        FROM Sinter_RDI.dbo.SinterRDI
        WHERE BallingIndex IS NOT NULL
        ORDER BY CreatedAt DESC
    `);
  
      if (lastBallingIndexResult.recordset.length > 0) { // Use recordset instead of rows
          // Assign the last fetched BallingIndex to ppmsData
          ppmsData.BALLING_MILL = lastBallingIndexResult.recordset[0].BallingIndex;
          console.log(`Fetched last BallingIndex: ${ppmsData.BALLING_MILL}`);
      } else {
          console.log('No non-null BallingIndex found in SinterRDI table.');
      }
  }
  

    // Check other parameters for null values and fetch the last available non-null values
    const parametersToCheck = ["P5MM", "MEAN_SIZE", "P40MM", "FEO", "MGO", "FUEL", "LIMESTONE", "DOLOMITE", "BASICITY", "Al2O3/SiO2", "CAO"];
    for (const param of parametersToCheck) {
      if (ppmsData[param] === null) {
        const mappedColumn = fieldMapping[param]; // Get the mapped column name
        const sinterPool = await connectToSqlServer();
        const request = sinterPool.request();
        const lastNonNullResult = await request.query(`
         SELECT TOP 1 ${mappedColumn}
          FROM Sinter_RDI.dbo.SinterRDI
          WHERE ${mappedColumn} IS NOT NULL 
          ORDER BY CreatedAt DESC
        `);
    
        if (lastNonNullResult.recordset.length > 0) {
          ppmsData[param] = lastNonNullResult.recordset[0][mappedColumn]; // Set the value in ppmsData
        }
      }
    }

    // console.log('Final PPMS Data:', ppmsData);
    return ppmsData;

  } catch (error) {
    console.error('Error fetching PPMS data:', error);
  }
}



//Fetch PI vision Data using the PI Web Api where time==WORK_DATETIME date.now()==WORKDATETIME fetch from pivision 
async function fetchDataFromPiWebAPI() {
  const names = ['FCTemp', 'BTP', 'MainFanSpeedRPM', 'MCSpeed'];
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

    // console.log('Final PI Web API Data:', result);
    return result;
  } catch (error) {
    console.error('Error in fetchDataFromPiWebAPI:', error.message);
  }
}

// Example usage:
// fetchDataFromPiWebAPI().catch(err => console.error(err));

//Cron to fetch the data from PPMS and store it in sinter db


cron.schedule('* * * * *', async () => {
  try {
    const ppmsData = await fetchPPMSData()
    const piVisionData=await fetchDataFromPiWebAPI();
  // Combine the data from both sources
    const combinedData = { ...ppmsData, ...piVisionData };
    // console.log(combinedData);
    // Store the combined data in SinterRDI
    await storeDataInSinterRDI(combinedData);
    console.log('Data fetched and updated successfully');
  } catch (error) {
    console.error('Error in scheduled task:', error);
  }
});

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
      ORDER BY CreatedAt DESC
    `);
    return result.recordset[0];
  } catch (error) {
    console.error('Error fetching latest Sinter_RDI data:', error);
  }
}



async function getLastUpdatedDate(){
  try{
    const sinterPool=await connectToSqlServer();
    const result=await sinterPool.request().query(`
      SELECT TOP 1 CreatedAt
      FROM SinterRDI
      ORDER BY CreatedAT DESC`);
      return result.recordset[0];
  }catch(error){
    console.log('Error fetching last updated date');
  }
}

async function getAct_PredRDI(startDate,endDate){
  try{
    const sinterPool=await connectToSqlServer(); 
       
    const adjustedStartDate = new Date(new Date(startDate).getTime() + 5.5 * 60 * 60 * 1000); // Adjust the date to match the time zone difference
    const adjustedEndDate = new Date(new Date(endDate).getTime() + 5.5 * 60 * 60 * 1000); // Adjust the date to match the time zone difference

    // Set the start of the day and end of the day for the query
    const startOfDay = new Date(adjustedStartDate.setUTCHours(0, 0, 0, 0));
    const endOfDay = new Date(adjustedEndDate.setUTCHours(23, 59, 59, 999));
    const result=await sinterPool.request()
    .input('startOfDay', sql.DateTime, startOfDay)
    .input('endOfDay', sql.DateTime, endOfDay)
    .query(`SELECT ActualRDI,PredictedRDI,CreatedAt
      FROM Sinter_RDI.dbo.ActualSinterRDI
      WHERE CreatedAt >= @startOfDay AND CreatedAt < @endOfDay `);
      
      console.log(result);
   
    if (result.recordset.length === 0) {
      // Return a special value or throw an error for no records found
      return { status: 404, message: 'No RDI values found for the selected date.' };
    }
    console.log(result.recordset);

    return { status: 200, data: result.recordset };
  }catch(error)
  {
    console.error('Error while fetching the Actual and Predicted RDI values')
  }
}

router.get('/getActRDI_PredRDI', async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const result = await getAct_PredRDI(startDate, endDate);
    res.status(result.status).json(result.data || { message: result.message });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

async function getRDIValues(startDate, endDate) {
  try {
    const sinterPool = await connectToSqlServer();
    console.log(startDate);
    const adjustedStartDate = new Date(new Date(startDate).getTime() + 5.5 * 60 * 60 * 1000); // Adjust the date to match the time zone difference
    const adjustedEndDate = new Date(new Date(endDate).getTime() + 5.5 * 60 * 60 * 1000); // Adjust the date to match the time zone difference

    // Set the start of the day and end of the day for the query
    const startOfDay = new Date(adjustedStartDate.setUTCHours(0, 0, 0, 0));
    const endOfDay = new Date(adjustedEndDate.setUTCHours(23, 59, 59, 999));

    const result = await sinterPool.request()
      .input('startOfDay', sql.DateTime, startOfDay)
      .input('endOfDay', sql.DateTime, endOfDay)
      .query(`
        SELECT RDIValue, CreatedAt
        FROM SinterRDI
        WHERE CreatedAt >= @startOfDay AND CreatedAt < @endOfDay
      `);
      

    if (result.recordset.length === 0) {
      // Return a special value or throw an error for no records found
      return { status: 404, message: 'No RDI values found for the selected date.' };
    }

    return { status: 200, data: result.recordset };
  } catch (error) {
    console.error('Error fetching RDI values:', error);
    throw error; // Let the route handle the error response
  }
}

router.get('/getRDI', async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const result = await getRDIValues(startDate, endDate);
    res.status(result.status).json(result.data || { message: result.message });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});


router.get('/lasteupdatedDate',async(req,res)=>{
  try{
    const data=await getLastUpdatedDate();
    res.json(data);
  }catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });

  }
})



//API to get the latest row inserted from PPMS into the sinter rdi table
router.get('/realtime-data', async (req, res) => {
  try {
    const data = await getLastSinterRDI();
     res.json(data);
  
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

router.get('/specific-realtime-data',async(req,res)=>{
  try{
    const data=await fetchDataFromPiWebAPI();
    res.json(data);
    // console.log(data,"PI data");

  }catch(error)
  {
    res.status(500).json({error:"Failed to fetch data"});
  }
})


// Nodemailer transporter configuration for Outlook
const transporter = nodemailer.createTransport({
  service:"Outlook365",
  host: "smtp.office365.com",
  port: 587,
  secure: false, // true for port 465, false for 587
  auth: {
    user: 'shivakshi.sharma@jsw.in',
    pass: 'Shiv@123'
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 600000, // 60 seconds
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
async function fetchDataAndConvertToCSV (startDate,endDate) {
  try {
    
    const sinterPool = await connectToSqlServer(); // Connect to the Sinter RDI database
      // Define your local time zone, e.g., 'Asia/Kolkata' for IST
     
  
      const adjustedStartDate = new Date(new Date(startDate).getTime() + 5.5 * 60 * 60 * 1000); // Adjust the date to match the time zone difference
      const adjustedEndDate = new Date(new Date(endDate).getTime() + 5.5 * 60 * 60 * 1000); // Adjust the date to match the time zone difference
  
      // Set the start of the day and end of the day for the query
      const startOfDay = new Date(adjustedStartDate.setUTCHours(0, 0, 0, 0));
      const endOfDay = new Date(adjustedEndDate.setUTCHours(23, 59, 59, 999));
  

       // Query to get data from the last 24 hours based on UTC time
       const result = await sinterPool.request()
       .input('startOfDay', sql.DateTime, startOfDay)
       .input('endOfDay', sql.DateTime, endOfDay)
       .query(`
         SELECT *
         FROM SinterRDI
         WHERE CreatedAt >= @startOfDay AND CreatedAt < @endOfDay
       `);
       
    //For testing with the dev data to mail check
    // const result=await sinterPool.request().query(
    //   `SELECT *
    //    FROM SinterRDI
    //    WHERE CAST(CreatedAt AS DATE) = '2024-07-02'`
    // );
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

router.get('/download', async (req, res) => {
  try {
    const { start, end } = req.query; // Ensure you match the parameter names used in Axios

    // Log the received dates for debugging
    console.log("Received dates:", start, end);

    // Validate dates if necessary
    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    // Fetch and convert data to CSV
    const csv = await fetchDataAndConvertToCSV(start, end);
    
    // Set headers for CSV file download
    res.header('Content-Type', 'text/csv');
    res.attachment('previous_results.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// List of recipient emails
const recipients = ['sneha.tyagi@jsw.in', 'snehaaatyagi@gmail.com'];

// Schedule task to send email at the end of the day
// cron.schedule('* * * * *', async () => {
//   try {
//     const csv = await fetchDataAndConvertToCSV();
//     const filePath = path.join(__dirname, 'previous_results.csv');
//     fs.writeFileSync(filePath, csv);

//     // Email options
//     const mailOptions = {
//       from: ' "Shivakshi Sharma" <shivakshi.sharma@jsw.in>', // Display name with email address
//       to: recipients.join(','), // Send to multiple recipients
//       subject: 'Daily Report',
//       text: 'Please find attached the CSV file containing the data from the last 24 hours.',
//       attachments: [
//         {
//           filename: 'previous_results.csv',
//           path: filePath,
//           contentType: 'text/csv' // Set the correct content type
//         },
//       ],
//     };

//     // Send email
//     await transporter.sendMail(mailOptions);
//     console.log('Email sent successfully');
    
//   } catch (error) {
//     console.error('Error sending email:', error);
//   }
// });

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
router.post('/predict-manual', async (req, res) => {
  try {
    // Extract features from the request body
    console.log(req.body);
    const features = req.body.features; // Extract features from the request body
   

    if (!features || !Array.isArray(features) || features.length === 0) {
      return res.status(400).json({ error: 'Features are required for prediction.' });
    }

    // Log the features for debugging
    // console.log('Received features for prediction:', features);
    
    // Spawn a child process to run the Python script
    const pythonProcess = spawn('python', ['/Sinter RDI project files/ml-model-backend/scripts/predict.py', JSON.stringify(features)]);

    let dataString = '';

    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
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

        // Send the prediction value back to the frontend
        res.status(200).json({ prediction: parseFloat(predictionValue) });
      } catch (error) {
        console.error('Error parsing prediction response:', error);
        res.status(500).json({ error: 'Failed to parse prediction response.' });
      }
    });
  } catch (error) {
    console.error('Error in prediction endpoint:', error);
    res.status(500).json({ error: 'Failed to process prediction request.' });
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
    // console.log(JSON.stringify(features));
    
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
