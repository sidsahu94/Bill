// backend/middlewares/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function (req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'AUTH_MISSING', message: 'No authorization token provided' });
  }

  const parts = String(authHeader).split(' ').filter(Boolean);
  const scheme = (parts[0] || '').toLowerCase();
  const token = (scheme === 'bearer' && parts[1]) ? parts[1] : null;
  
  if (!token) {
    return res.status(401).json({ error: 'AUTH_MALFORMED', message: 'Invalid authorization header format' });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[CRITICAL SECURITY FAULT] JWT_SECRET is missing from environment.');
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Internal server configuration error' });
    }

    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    // Precise error handling for frontend state management
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Your session has expired. Please log in again.' });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'TOKEN_INVALID', message: 'Invalid authentication token.' });
    } else {
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Authentication failed.' });
    }
  }
};