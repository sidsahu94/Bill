// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// CRITICAL FIX: TRUST PROXY FOR RENDER
// This tells express-rate-limit that it is 
// running safely behind Render's load balancer.
// ==========================================
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Static File Serving (Frontend)
app.use(express.static(path.join(__dirname, 'frontend')));

// Routes
const authRoutes = require('./backend/routes/auth');
const productRoutes = require('./backend/routes/products');
const customerRoutes = require('./backend/routes/customers');
const billingRoutes = require('./backend/routes/billing');
const analyticsRoutes = require('./backend/routes/analytics');
const settingsRoutes = require('./backend/routes/settings');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// SPA Fallback for Frontend Routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Initialize Server
app.listen(PORT, () => {
  console.log(`[CORE] Enterprise Engine active on port ${PORT}`);
});