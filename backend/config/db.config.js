module.exports = {
  user: 'sa',
  password: 'admin@123',
  server: 'STEELDNA',
  database: 'Sinter_RDI',
  options: {
    encrypt: false, // Use true if you're on Azure
    enableArithAbort: true,
    trustServerCertificate: true, // Add this option if you're dealing with self-signed certificates
    driver: 'tedious' // Specify the driver
  }
};
