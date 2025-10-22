// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); // sqlite better-sqlite3
const nodemailer = require('nodemailer');
require('dotenv').config();

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

// transporter: make creation safe even when env not set
let transporter = null;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    console.warn('[AUTH] SMTP not configured - emails will be skipped (dev only).');
  }
} catch (err) {
  console.error('[AUTH] Transporter creation failed:', err);
  transporter = null;
}

async function sendOtpEmail(to, otp) {
  try {
    if (!transporter) {
      console.log(`[AUTH] (dev) OTP for ${to}: ${otp}`);
      return;
    }
    const subject = 'Your Bill App verification code';
    const text = `Your OTP is ${otp}. It is valid for 15 minutes.`;
    const html = `<p>Your OTP is <strong>${otp}</strong>. It is valid for 15 minutes.</p>`;
    await transporter.sendMail({ from: process.env.SMTP_USER, to, subject, text, html });
    console.log(`[AUTH] OTP email sent to ${to}`);
  } catch (err) {
    console.error('[AUTH] sendOtpEmail error:', err);
    // don't rethrow — OTP still stored in DB; just log
  }
}

// Debug helper - remove in production
function debugLogRoute(routeName, req) {
  try {
    console.log(`[AUTH][${routeName}] ${req.method} ${req.originalUrl} body:`, req.body);
  } catch (e) { /* ignore */ }
}

// REGISTER: create user and send OTP
router.post('/register', async (req, res) => {
  debugLogRoute('register', req);
  try {
    const { name, email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const normEmail = String(email).trim().toLowerCase();

    // check existing user
    const existing = db.prepare('SELECT id, verified FROM users WHERE email = ?').get(normEmail);
    if (existing) {
      if (existing.verified === 0) {
        // update OTP & expiry and resend
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expiry = Date.now() + OTP_TTL_MS;
        db.prepare('UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?').run(otp, expiry, existing.id);
        sendOtpEmail(normEmail, otp).catch(err => console.error('[AUTH] OTP send err', err));
        return res.status(400).json({ message: 'Email already registered but not verified. OTP resent.' });
      }
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    // create user
    const info = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name || '', normEmail, hash);
    const userId = info.lastInsertRowid;

    // generate OTP and store
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = Date.now() + OTP_TTL_MS;
    db.prepare('UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?').run(otp, expiry, userId);

    // attempt to send OTP (non-blocking)
    sendOtpEmail(normEmail, otp).catch(err => console.error('[AUTH] OTP send err', err));

    return res.json({ message: 'Registered. OTP sent to email (or logged if SMTP not configured).' });
  } catch (err) {
    console.error('[AUTH] register error:', err);
    // SQLite unique constraint or other DB errors may show as err.code === 'SQLITE_CONSTRAINT'
    if (err && err.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ message: 'Email already registered' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// RESEND OTP
router.post('/resend-otp', (req, res) => {
  debugLogRoute('resend-otp', req);
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email required' });

    const normEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, verified FROM users WHERE email = ?').get(normEmail);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Do not resend if user is already verified
    if (user.verified === 1) return res.status(400).json({ message: 'Email already verified. Please login.' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = Date.now() + OTP_TTL_MS;
    db.prepare('UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?').run(otp, expiry, user.id);
    sendOtpEmail(normEmail, otp).catch(err => console.error('[AUTH] resend OTP error', err));
    return res.json({ message: 'OTP resent' });
  } catch (err) {
    console.error('[AUTH] resend-otp error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// VERIFY OTP
router.post('/verify-otp', (req, res) => {
  debugLogRoute('verify-otp', req);
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

    const normEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, otp, otp_expiry FROM users WHERE email = ?').get(normEmail);
    if (!user) return res.status(400).json({ message: 'Invalid user' });

    if (!user.otp || String(user.otp) !== String(otp)) return res.status(400).json({ message: 'Invalid OTP' });
    if (Date.now() > Number(user.otp_expiry || 0)) return res.status(400).json({ message: 'OTP expired' });

    db.prepare('UPDATE users SET verified = 1, otp = NULL, otp_expiry = NULL WHERE id = ?').run(user.id);
    return res.json({ message: 'Verified' });
  } catch (err) {
    console.error('[AUTH] verify-otp error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// LOGIN (only if verified)
router.post('/login', async (req, res) => {
  debugLogRoute('login', req);
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const normEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, password, verified, name FROM users WHERE email = ?').get(normEmail);
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    if (user.verified === 0) return res.status(403).json({ message: 'Email not verified' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const payload = { id: user.id, email: normEmail, name: user.name };
    if (!process.env.JWT_SECRET) {
      console.warn('[AUTH] JWT_SECRET not set! using dev fallback (not for production).');
      process.env.JWT_SECRET = 'dev-secret-please-change';
    }
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token, name: user.name });
  } catch (err) {
    console.error('[AUTH] login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
