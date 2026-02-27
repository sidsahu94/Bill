// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const auth = require('../middlewares/auth');
require('dotenv').config();

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DUMMY_HASH = bcrypt.hashSync('dummy_password_for_timing_attack_prevention', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 20, 
  message: { error: 'RATE_LIMIT', message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, 
  message: { error: 'RATE_LIMIT', message: 'Too many OTP requests. Please wait 15 minutes.' }
});

// ==========================================
// ENTERPRISE SMTP CONFIGURATION
// Dynamic routing for Production Mail Servers
// ==========================================
let transporter = null;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: port === 465, // Use SSL for 465, TLS for 587
      requireTLS: true,
      auth: { 
        user: process.env.SMTP_USER, 
        pass: process.env.SMTP_PASS 
      },
      family: 4, // Force IPv4 to bypass cloud routing issues
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });
  } else {
    console.warn('[AUTH] SMTP credentials missing. Running in simulation mode.');
  }
} catch (err) {
  console.error('[AUTH] Transporter creation failed:', err);
}

async function sendOtpEmail(to, otp) {
  try {
    if (!transporter) {
      console.warn(`[AUTH SIMULATION] SMTP Not Configured. Simulated OTP for ${to}: ${otp}`);
      return;
    }
    const subject = 'Your Executive Verification Sequence';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 500px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 10px;">
        <h2 style="color: #0F172A;">Identity Verification</h2>
        <p>Your secure cryptographic sequence is:</p>
        <div style="background: #F8FAFC; padding: 16px; text-align: center; border-radius: 6px; margin: 24px 0;">
          <h1 style="color: #D4AF37; letter-spacing: 8px; margin: 0; font-family: monospace;">${otp}</h1>
        </div>
        <p style="font-size: 12px; color: #64748B;">This sequence is valid for 15 minutes. If you did not initiate this request, disregard this transmission.</p>
      </div>
    `;
    const info = await transporter.sendMail({ 
      from: `"Bill Executive Platform" <${process.env.SMTP_USER}>`, 
      to, 
      subject, 
      html 
    });
    console.log(`[AUTH] OTP successfully transmitted to ${to}. ID: ${info.messageId}`);
  } catch (err) {
    console.error('[AUTH] sendOtpEmail transmission failure:', err);
  }
}

function generateSecureOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// --- ROUTES ---

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'VALIDATION', message: 'A valid email is required' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'VALIDATION', message: 'Password must be at least 8 characters long' });

    const normEmail = String(email).trim().toLowerCase();
    const { rows } = await db.query('SELECT id, verified FROM users WHERE email = $1', [normEmail]);
    const existing = rows[0];

    if (existing) {
      if (existing.verified === 0) {
        const otp = generateSecureOTP();
        const expiry = Date.now() + OTP_TTL_MS;
        await db.query('UPDATE users SET otp = $1, otp_expiry = $2 WHERE id = $3', [otp, expiry, existing.id]);
        sendOtpEmail(normEmail, otp);
        return res.status(409).json({ error: 'UNVERIFIED_EXISTS', message: 'Account exists but is not verified. A new OTP has been sent.' });
      }
      return res.status(409).json({ error: 'EMAIL_IN_USE', message: 'This email is already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const insertRes = await db.query('INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id', [name || '', normEmail, hash]);
    const userId = insertRes.rows[0].id;

    const otp = generateSecureOTP();
    const expiry = Date.now() + OTP_TTL_MS;
    await db.query('UPDATE users SET otp = $1, otp_expiry = $2 WHERE id = $3', [otp, expiry, userId]);

    sendOtpEmail(normEmail, otp);

    return res.status(201).json({ success: true, message: 'Registration successful. Please verify your OTP.' });
  } catch (err) {
    console.error('[AUTH] register error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'An internal server error occurred.' });
  }
});

router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'VALIDATION', message: 'Email required' });

    const normEmail = String(email).trim().toLowerCase();
    const { rows } = await db.query('SELECT id, verified FROM users WHERE email = $1', [normEmail]);
    const user = rows[0];
    
    if (!user) return res.json({ success: true, message: 'If the email is registered, an OTP was sent.' });
    if (user.verified === 1) return res.status(400).json({ error: 'ALREADY_VERIFIED', message: 'Email is already verified. Please login.' });

    const otp = generateSecureOTP();
    const expiry = Date.now() + OTP_TTL_MS;
    await db.query('UPDATE users SET otp = $1, otp_expiry = $2 WHERE id = $3', [otp, expiry, user.id]);
    sendOtpEmail(normEmail, otp);
    
    return res.json({ success: true, message: 'OTP resent successfully.' });
  } catch (err) {
    console.error('[AUTH] resend-otp error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'VALIDATION', message: 'Valid email and 6-digit OTP required' });

    const normEmail = String(email).trim().toLowerCase();
    const { rows } = await db.query('SELECT id, otp, otp_expiry FROM users WHERE email = $1', [normEmail]);
    const user = rows[0];
    
    if (!user || !user.otp || String(user.otp) !== String(otp)) return res.status(401).json({ error: 'INVALID_OTP', message: 'The OTP entered is incorrect.' });
    if (Date.now() > Number(user.otp_expiry || 0)) return res.status(410).json({ error: 'OTP_EXPIRED', message: 'This OTP has expired. Please request a new one.' });

    await db.query('UPDATE users SET verified = 1, otp = NULL, otp_expiry = NULL WHERE id = $1', [user.id]);
    return res.json({ success: true, message: 'Account verified successfully.' });
  } catch (err) {
    console.error('[AUTH] verify-otp error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'VALIDATION', message: 'Email and password required' });

    const normEmail = String(email).trim().toLowerCase();
    const { rows } = await db.query('SELECT id, password, verified, name FROM users WHERE email = $1', [normEmail]);
    const user = rows[0];
    
    let match = false;
    if (user) {
      match = await bcrypt.compare(password, user.password);
    } else {
      await bcrypt.compare(password, DUMMY_HASH);
    }

    if (!user || !match) return res.status(401).json({ error: 'AUTH_FAILED', message: 'Invalid email or password.' });
    if (user.verified === 0) return res.status(403).json({ error: 'UNVERIFIED', message: 'Account not verified. Please verify your email.' });

    const token = jwt.sign(
      { id: user.id, email: normEmail, name: user.name }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' } 
    );
    
    return res.json({ success: true, token, name: user.name, email: normEmail });
  } catch (err) {
    console.error('[AUTH] login error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'VALIDATION', message: 'Email required' });

    const normEmail = String(email).trim().toLowerCase();
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [normEmail]);
    const user = rows[0];
    
    if (!user) return res.json({ success: true, message: 'If an account exists, an OTP will be sent.' });

    const otp = generateSecureOTP();
    const expiry = Date.now() + OTP_TTL_MS;
    
    await db.query('UPDATE users SET otp = $1, otp_expiry = $2 WHERE id = $3', [otp, expiry, user.id]);
    sendOtpEmail(normEmail, otp);
    
    return res.json({ success: true, message: 'If an account exists, an OTP will be sent.' });
  } catch (err) {
    console.error('[AUTH] forgot error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword || newPassword.length < 8) return res.status(400).json({ error: 'VALIDATION', message: 'Invalid payload. Password must be 8+ chars.' });

    const normEmail = String(email).trim().toLowerCase();
    const { rows } = await db.query('SELECT id, otp, otp_expiry FROM users WHERE email = $1', [normEmail]);
    const user = rows[0];
    
    if (!user || !user.otp || String(user.otp) !== String(otp)) return res.status(401).json({ error: 'INVALID_OTP', message: 'Invalid or incorrect OTP.' });
    if (Date.now() > Number(user.otp_expiry || 0)) return res.status(410).json({ error: 'OTP_EXPIRED', message: 'OTP has expired.' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = $1, otp = NULL, otp_expiry = NULL WHERE id = $2', [hash, user.id]);
    
    return res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('[AUTH] reset error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('[AUTH] profile error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'VALIDATION', message: 'Name required' });
    
    await db.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.user.id]);
    res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    console.error('[AUTH] update profile error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) return res.status(400).json({ error: 'VALIDATION', message: 'Invalid payload' });

    const { rows } = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'AUTH_FAILED', message: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.user.id]);
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('[AUTH] change password error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Server error' });
  }
});

module.exports = router;