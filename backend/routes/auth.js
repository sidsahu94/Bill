// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // NEW: For CSPRNG OTP generation
const db = require('../db');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const auth = require('../middlewares/auth');
require('dotenv').config();

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

// --- Dummy Hash for Timing Attack Mitigation ---
// Pre-calculate a dummy hash so the server always takes ~100ms to respond to bad logins
const DUMMY_HASH = bcrypt.hashSync('dummy_password_for_timing_attack_prevention', 10);

// --- Security Middleware ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: { error: 'RATE_LIMIT', message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3, 
  message: { error: 'RATE_LIMIT', message: 'Too many OTP requests. Please wait 15 minutes.' }
});

// --- Utilities ---
let transporter = null;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
} catch (err) {
  console.error('[AUTH] Transporter creation failed:', err);
}

async function sendOtpEmail(to, otp) {
  try {
    if (!transporter) {
      console.log(`[AUTH] (DEV MODE) OTP for ${to}: ${otp}`);
      return;
    }
    const subject = 'Your Bill SaaS Verification Code';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Authentication Request</h2>
        <p>Your one-time password (OTP) is:</p>
        <h1 style="color: #4f46e5; letter-spacing: 2px;">${otp}</h1>
        <p>This code expires in 15 minutes. Do not share it with anyone.</p>
      </div>
    `;
    await transporter.sendMail({ from: `"Bill SaaS" <${process.env.SMTP_USER}>`, to, subject, html: html });
  } catch (err) {
    console.error('[AUTH] sendOtpEmail error:', err);
  }
}

// Generate Cryptographically Secure 6-Digit OTP
function generateSecureOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// --- ROUTES ---

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    
    // Strict Backend Validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'VALIDATION', message: 'A valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'VALIDATION', message: 'Password must be at least 8 characters long' });
    }

    const normEmail = String(email).trim().toLowerCase();

    // Check existing
    const existing = db.prepare('SELECT id, verified FROM users WHERE email = ?').get(normEmail);
    if (existing) {
      if (existing.verified === 0) {
        const otp = generateSecureOTP();
        const expiry = Date.now() + OTP_TTL_MS;
        db.prepare('UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?').run(otp, expiry, existing.id);
        sendOtpEmail(normEmail, otp);
        return res.status(409).json({ error: 'UNVERIFIED_EXISTS', message: 'Account exists but is not verified. A new OTP has been sent.' });
      }
      return res.status(409).json({ error: 'EMAIL_IN_USE', message: 'This email is already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const info = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name || '', normEmail, hash);
    const userId = info.lastInsertRowid;

    const otp = generateSecureOTP();
    const expiry = Date.now() + OTP_TTL_MS;
    db.prepare('UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?').run(otp, expiry, userId);

    sendOtpEmail(normEmail, otp);

    return res.status(201).json({ success: true, message: 'Registration successful. Please verify your OTP.' });
  } catch (err) {
    console.error('[AUTH] register error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal server error occurred.' });
  }
});

// RESEND OTP
router.post('/resend-otp', otpLimiter, (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'VALIDATION', message: 'Email required' });

    const normEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, verified FROM users WHERE email = ?').get(normEmail);
    
    // Generic response to prevent email enumeration
    if (!user) return res.json({ success: true, message: 'If the email is registered, an OTP was sent.' });
    if (user.verified === 1) return res.status(400).json({ error: 'ALREADY_VERIFIED', message: 'Email is already verified. Please login.' });

    const otp = generateSecureOTP();
    const expiry = Date.now() + OTP_TTL_MS;
    db.prepare('UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?').run(otp, expiry, user.id);
    sendOtpEmail(normEmail, otp);
    
    return res.json({ success: true, message: 'OTP resent successfully.' });
  } catch (err) {
    console.error('[AUTH] resend-otp error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

// VERIFY OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'VALIDATION', message: 'Valid email and 6-digit OTP required' });
    }

    const normEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, otp, otp_expiry FROM users WHERE email = ?').get(normEmail);
    
    if (!user || !user.otp || String(user.otp) !== String(otp)) {
      return res.status(401).json({ error: 'INVALID_OTP', message: 'The OTP entered is incorrect.' });
    }
    if (Date.now() > Number(user.otp_expiry || 0)) {
      return res.status(410).json({ error: 'OTP_EXPIRED', message: 'This OTP has expired. Please request a new one.' });
    }

    // OTP is valid. Verify user and clear OTP to prevent reuse.
    db.prepare('UPDATE users SET verified = 1, otp = NULL, otp_expiry = NULL WHERE id = ?').run(user.id);
    return res.json({ success: true, message: 'Account verified successfully.' });
  } catch (err) {
    console.error('[AUTH] verify-otp error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

// LOGIN (With Timing Attack Mitigation)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'VALIDATION', message: 'Email and password required' });

    const normEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, password, verified, name FROM users WHERE email = ?').get(normEmail);
    
    let match = false;

    // Timing Attack Prevention: Always execute a bcrypt compare
    if (user) {
      match = await bcrypt.compare(password, user.password);
    } else {
      await bcrypt.compare(password, DUMMY_HASH); // Balances CPU time
    }

    if (!user || !match) {
      return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid email or password.' });
    }

    if (user.verified === 0) {
      return res.status(403).json({ error: 'UNVERIFIED', message: 'Account not verified. Please verify your email.' });
    }

    const token = jwt.sign(
      { id: user.id, email: normEmail, name: user.name }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1d' } // Consider '1h' and refresh tokens for ultra-high security
    );
    
    return res.json({ success: true, token, name: user.name, email: normEmail });
  } catch (err) {
    console.error('[AUTH] login error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

// FORGOT PASSWORD
router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'VALIDATION', message: 'Email required' });

    const normEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normEmail);
    
    if (!user) return res.json({ success: true, message: 'If an account exists, an OTP will be sent.' });

    const otp = generateSecureOTP();
    const expiry = Date.now() + OTP_TTL_MS;
    
    db.prepare('UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?').run(otp, expiry, user.id);
    sendOtpEmail(normEmail, otp);
    
    return res.json({ success: true, message: 'If an account exists, an OTP will be sent.' });
  } catch (err) {
    console.error('[AUTH] forgot error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

// RESET PASSWORD
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'VALIDATION', message: 'Invalid payload. Password must be 8+ chars.' });
    }

    const normEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, otp, otp_expiry FROM users WHERE email = ?').get(normEmail);
    
    if (!user || !user.otp || String(user.otp) !== String(otp)) {
      return res.status(401).json({ error: 'INVALID_OTP', message: 'Invalid or incorrect OTP.' });
    }
    if (Date.now() > Number(user.otp_expiry || 0)) {
      return res.status(410).json({ error: 'OTP_EXPIRED', message: 'OTP has expired.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, otp = NULL, otp_expiry = NULL WHERE id = ?').run(hash, user.id);
    
    return res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('[AUTH] reset error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

// GET PROFILE & CHANGE PASSWORD logic remains identical...
// (Ensure your previous /me and /change-password endpoints are appended here)

module.exports = router;