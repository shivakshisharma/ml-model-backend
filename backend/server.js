const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');

const app = express();
const port = 5000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

app.post('/predict', (req, res) => {
  const features = req.body.features;

  const pythonProcess = spawn('python3', ['../scripts/predict.py', JSON.stringify(features)]);

  pythonProcess.stdout.on('data', (data) => {
    const prediction = data.toString().trim();
    res.json({ prediction });
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
    res.status(500).json({ error: 'Error executing prediction script' });
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
