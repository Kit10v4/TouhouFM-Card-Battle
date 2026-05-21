const express = require('express');
const { pool } = require('../db');
const { hashPassword, comparePassword } = require('../utils/password');
const { signJwt, verifyJwt } = require('../utils/jwt');
const nodemailer = require('nodemailer');

const router = express.Router();

// Load email config.
// Priority: environment variables (Render/Vercel) -> local email-config.js (dev).
let emailConfig;
let emailFrom;
if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  const port = Number(process.env.EMAIL_PORT) || 587;
  emailConfig = {
    host: process.env.EMAIL_HOST,
    port,
    secure: port === 465, // true for 465 (SMTPS), false for 587 (STARTTLS)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  };
  emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;
} else {
  try {
    emailConfig = require('../../email-config.js');
    emailFrom = emailConfig.auth?.user;
  } catch (error) {
    console.warn('Email config not found, email features disabled');
  }
}

// Generate 6-digit verification code
function generateVerifyCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getCookieConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = process.env.COOKIE_SAMESITE || (isProduction ? 'none' : 'lax');
  const secure =
    process.env.COOKIE_SECURE != null
      ? process.env.COOKIE_SECURE === 'true'
      : isProduction;

  return { secure, sameSite };
}

// Send verification email
async function sendVerificationEmail(email, code) {
  if (!emailConfig) {
    console.log(`[DEV] Verification code for ${email}: ${code}`);
    return;
  }

  const transporter = nodemailer.createTransport(emailConfig);

  await transporter.sendMail({
    from: emailFrom,
    to: email,
    subject: 'Game Account Verification',
    html: `
      <h2>Welcome to Game!</h2>
      <p>Your verification code is: <strong>${code}</strong></p>
      <p>This code will expire in 10 minutes.</p>
    `
  });
}

// POST /api/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    // Basic validation
    if (!username || !password || !email) {
      return res.json({ success: false, message: 'All fields required' });
    }

    if (username.length < 3) {
      return res.json({ success: false, message: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({ success: false, message: 'Invalid email format' });
    }

    // Check if user already exists
    const { rows: existingUsers } = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUsers.length > 0) {
      return res.json({ success: false, message: 'Email or username already exists' });
    }

    // Check pending users
    const { rows: pendingUsers } = await pool.query(
      'SELECT id FROM pending_users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (pendingUsers.length > 0) {
      // Remove old pending registration
      await pool.query(
        'DELETE FROM pending_users WHERE email = $1 OR username = $2',
        [email, username]
      );
    }

    // Hash password and generate code
    const passwordHash = await hashPassword(password);
    const verifyCode = generateVerifyCode();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Insert pending user
    await pool.query(
      'INSERT INTO pending_users (email, username, password_hash, verify_code, expire_at) VALUES ($1, $2, $3, $4, $5)',
      [email, username, passwordHash, verifyCode, expireAt]
    );

    // Send verification email
    try {
      await sendVerificationEmail(email, verifyCode);
    } catch (emailError) {
      console.error('Email send failed:', emailError);
      // Continue anyway for dev purposes
    }

    res.json({ success: true, message: 'Verification code sent to email' });

  } catch (error) {
    console.error('Register error:', error);
    res.json({ success: false, message: 'Registration failed' });
  }
});

// POST /api/verify
router.post('/verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.json({ success: false, message: 'Email and code required' });
    }

    // Find pending user
    const { rows: pendingUsers } = await pool.query(
      'SELECT * FROM pending_users WHERE email = $1 AND verify_code = $2 AND expire_at > NOW()',
      [email, code]
    );

    if (pendingUsers.length === 0) {
      return res.json({ success: false, message: 'Invalid or expired verification code' });
    }

    const pendingUser = pendingUsers[0];

    // Create actual user
    await pool.query(
      'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3)',
      [pendingUser.email, pendingUser.username, pendingUser.password_hash]
    );

    // Remove pending user
    await pool.query(
      'DELETE FROM pending_users WHERE id = $1',
      [pendingUser.id]
    );

    res.json({ success: true, message: 'Account verified successfully' });

  } catch (error) {
    console.error('Verify error:', error);
    res.json({ success: false, message: 'Verification failed' });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ success: false, message: 'Username and password required' });
    }

    // Find user by username or email
    const { rows: users } = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, username]
    );

    if (users.length === 0) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    const user = users[0];

    // Check password
    const passwordValid = await comparePassword(password, user.password_hash);
    if (!passwordValid) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = signJwt({ userId: user.id });

    // Set HTTP-only cookie
    const cookieConfig = getCookieConfig();
    res.cookie('token', token, {
      httpOnly: true,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user info
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar || null
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, message: 'Login failed' });
  }
});

// POST /api/logout
router.post('/logout', (req, res) => {
  const cookieConfig = getCookieConfig();
  res.clearCookie('token', {
    httpOnly: true,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    path: '/'
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// Middleware to verify JWT token
function requireAuth(req, res, next) {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const decoded = verifyJwt(token);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// GET /api/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: users[0]
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user info' });
  }
});

module.exports = router;
