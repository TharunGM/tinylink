const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// API routes
const linksRouter = require('./routes/links');
app.use('/api', linksRouter);

// Stats page
app.get('/code/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'code.html'));
});

// Health check
app.get('/healthz', (req, res) => {
  res.json({ ok: true, version: "1.0" });
});

// Fallback redirect (handled in routes/links.js)
app.use('/', linksRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
