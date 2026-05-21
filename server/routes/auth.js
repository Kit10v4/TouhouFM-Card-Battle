const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { hashPassword, comparePassword } = require('../utils/password');
const { signJwt, verifyJwt } = require('../utils/jwt');

const router = express.Router();

// 8-character security key shown once at registration. Used instead of email
// to reset the password later (Render free tier blocks outbound SMTP).
// Charset excludes ambiguous chars (0/O/1/I/L) for easier manual entry.
const KEY_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateSecurityKey() {
  const bytes = crypto.randomBytes(8);
  let key = '';
  for (let i = 0; i < 8; i++) {
    key += KEY_CHARSET[bytes[i] % KEY_CHARSET.length];
  }
  return key;
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

// POST /api/register
// Creates the account immediately (no email verification) and returns a
// one-time security key. The client must show it to the user to save.
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

    // Hash password, generate + hash the security key
    const passwordHash = await hashPassword(password);
    const securityKey = generateSecurityKey();
    const securityKeyHash = await hashPassword(securityKey);

    await pool.query(
      'INSERT INTO users (email, username, password_hash, security_key_hash) VALUES ($1, $2, $3, $4)',
      [email, username, passwordHash, securityKeyHash]
    );

    res.json({
      success: true,
      message: 'Account created. Save your security key to recover your password.',
      securityKey
    });

  } catch (error) {
    console.error('Register error:', error);
    res.json({ success: false, message: 'Registration failed' });
  }
});

// POST /api/reset-password
// Reset the password using the username + the security key issued at registration.
router.post('/reset-password', async (req, res) => {
  try {
    const { username, securityKey, newPassword } = req.body;

    if (!username || !securityKey || !newPassword) {
      return res.json({ success: false, message: 'Username, security key and new password required' });
    }

    if (newPassword.length < 6) {
      return res.json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Find user by username or email
    const { rows: users } = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (users.length === 0) {
      return res.json({ success: false, message: 'Invalid username or security key' });
    }

    const user = users[0];

    if (!user.security_key_hash) {
      return res.json({ success: false, message: 'This account has no security key on file' });
    }

    const keyValid = await comparePassword(securityKey.trim().toUpperCase(), user.security_key_hash);
    if (!keyValid) {
      return res.json({ success: false, message: 'Invalid username or security key' });
    }

    const newHash = await hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, user.id]
    );

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.json({ success: false, message: 'Password reset failed' });
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
