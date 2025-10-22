// backend/middlewares/auth.js
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

module.exports = function (req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });

  // Accept "Bearer <token>" (case-insensitive)
  const parts = String(authHeader).split(' ').filter(Boolean);
  const scheme = (parts[0] || '').toLowerCase();
  const token = (scheme === 'bearer' && parts[1]) ? parts[1] : null;
  if (!token) return res.status(401).json({ message: 'Invalid authorization header' });

  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-please-change';
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
