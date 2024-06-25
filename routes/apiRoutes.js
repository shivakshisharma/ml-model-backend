const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');

// POST request to process input data, predict, and store output data
/**
 * @swagger
 * /input-data:
 *   get:
 *     summary: Retrieve the latest input data
 *     responses:
 *       200:
 *         description: Successfully retrieved input data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 Temperature_C:
 *                   type: number
 *                   example: 25.6
 *                 Oxygen_percent:
 *                   type: number
 *                   example: 21.5
 *                 Sinter_bed_height_m:
 *                   type: number
 *                   example: 2.5
 *                 Blast_pressure:
 *                   type: number
 *                   example: 1.1
 *                 DateCreated:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-06-22T14:48:00.000Z"
 *                 // Add more fields as necessary
 *       500:
 *         description: Internal server error
 */
router.post('/process', dataController.processAndStoreData);
router.get('/input-data', dataController.getInputData);


module.exports = router;
