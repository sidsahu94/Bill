// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ensure data dir exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Routes
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/products', require('./backend/routes/products'));
app.use('/api/customers', require('./backend/routes/customers'));
app.use('/api/billing', require('./backend/routes/billing'));
app.use('/api/analytics', require('./backend/routes/analytics'));
app.use('/api/settings', require('./backend/routes/settings')); // <- ensure settings route

// serve frontend static from frontend/
const frontendPath = path.join(__dirname, 'frontend');
app.use(express.static(frontendPath));
app.use('/components', express.static(path.join(frontendPath, 'components')));
app.use('/js', express.static(path.join(frontendPath, 'js')));
app.use('/css', express.static(path.join(frontendPath, 'css')));
app.use('/pages', express.static(path.join(frontendPath, 'pages')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // serve uploaded logos

// SPA / static html fallback: serve matching file if exists or index
app.get(/^\/(?!api).*/, (req, res) => {
  const requested = path.join(frontendPath, req.path);
  if (requested.endsWith('.html') && fs.existsSync(requested)) return res.sendFile(requested);
  return res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
