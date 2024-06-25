const sql = require('mssql');
const dbConfig = require('../db.config');

const getInputData = async () => {
  try {
    await sql.connect(dbConfig);
    const request = new sql.Request();
    const inputQuery = `
      SELECT TOP 1 *
      FROM InputData
      ORDER BY DateCreated DESC
    `;
    const result = await request?.query(inputQuery);
    return result?.recordset[0];
  } catch (error) {
    throw new Error(`Error fetching input data: ${error.message}`);
  } finally {
    await sql.close();
  }
};

const storeData = async (outputData) => {
  try {
    await sql.connect(dbConfig);
    const request = new sql.Request();
    const insertQuery = `
      INSERT INTO OutputData (column1, column2, ...)
      VALUES (@value1, @value2, ...)
    `;
    // Add input parameters here, e.g.,
    request?.input('value1', sql.VarChar, outputData.value1);
    // ...
    await request?.query(insertQuery);
  } catch (error) {
    throw new Error(`Error storing data: ${error.message}`);
  } finally {
    await sql.close();
  }
};

module.exports = {
  getInputData,
  storeData
};
