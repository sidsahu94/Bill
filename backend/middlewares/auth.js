// backend/middlewares/auth.js
const jwt = require('jsonwebtoken');
const db = require('../db'); // Injecting DB to verify user existence
require('dotenv').config();

module.exports = async function (req, res, next) {
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
      console.error('[CRITICAL] JWT_SECRET is missing from environment.');
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Internal server configuration error' });
    }

    // Decode the token
    const decoded = jwt.verify(token, secret);

    // ==========================================
    // CRITICAL FIX: "GHOST USER" PREVENTION
    // Ensure the user actually exists in the NEW database.
    // ==========================================
    const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [decoded.id]);
    
    if (rows.length === 0) {
      console.warn(`[AUTH] Ghost Token Detected for User ID: ${decoded.id}. Forcing logout.`);
      return res.status(401).json({ error: 'USER_DELETED', message: 'User account no longer exists. Please re-register.' });
    }

    // Attach verified user to request
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Your session has expired. Please log in again.' });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'TOKEN_INVALID', message: 'Invalid authentication token.' });
    } else {
      console.error('[AUTH MIDDLEWARE ERROR]:', err);
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Authentication failed.' });
    }
  }
};