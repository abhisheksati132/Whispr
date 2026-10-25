'use strict';
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const store   = require('../supabaseStore');
const { JWT_SECRET } = require('../config');
const { isSessionValid, invalidateSessionCache } = require('../sessionGuard');

// Verifies the bearer token AND that its session has not been revoked.
// Returns the decoded payload, or responds 401 and returns null.
async function requireSession(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return null;
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return null;
  }
  if (!(await isSessionValid(decoded.username, decoded.sid))) {
    res.status(401).json({ error: 'Session revoked. Please sign in again.' });
    return null;
  }
  return decoded;
}

const { default: rateLimit, ipKeyGenerator } = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: ipKeyGenerator, message: { error: 'Too many attempts, try again later.' } });
router.use(authLimiter);

function createSession(username, req) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
  return store.createSession(username, userAgent, ip);
}

// POST /api/auth/register — create new account
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, nickname, avatar, bio } = req.body;
    const requiredCode = process.env.CHAT_PASSWORD || process.env.INVITE_CODE;
    if (requiredCode) {
      const providedCode = req.body.chatPassword || req.body.inviteCode || '';
      if (providedCode !== requiredCode) {
        return res.status(403).json({ error: 'Invalid registration password or invite code' });
      }
    }
    const rawPass = password || req.body.pin;
if (!username || !rawPass) {

      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (String(rawPass).trim().length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!clean || clean.length < 2 || clean.length > 25) {
      return res.status(400).json({ error: 'Username must be 2–25 letters, numbers, or underscores' });
    }

    let existing = await store.getUserByUsername(clean);
    if (existing) {
      return res.status(409).json({ error: `Username @${clean} is already taken. Please choose another username or Sign In.` });
    }
    
    if (email && email.trim()) {
      const emailTrimmed = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
      }
      let existingEmail = await store.getUserByEmailOrUsername(emailTrimmed);
      if (existingEmail && existingEmail.email === emailTrimmed) {
        return res.status(409).json({ error: `Email address is already registered.` });
      }
    }

    const pinHash = await bcrypt.hash(String(rawPass), 10);
    const avatarEmoji = avatar || '✨';
    const displayName = (nickname || '').trim() || clean;

    const user = await store.createUser({
      username: clean,
      pinHash,
      email: email,
      avatar: avatarEmoji,
      color: '#3390ec',
      statusBio: (bio || '').trim() || 'Available',
      nickname: displayName
    });

    // Auto-create Saved Messages room for this user
    try {
      await store.getOrCreateDMRoom(clean, clean);
    } catch (e) {
      console.warn('Could not auto-create Saved Messages room on register:', e?.message || e);
    }

    const sessionId = await createSession(clean, req);
    const token = jwt.sign({ username: clean, sid: sessionId }, JWT_SECRET, { expiresIn: '60d' });
    return res.status(201).json({
      token,
      sessionId,
      username: clean,
      avatar: user.avatar || avatarEmoji,
      color: user.color || '#3390ec',
      statusBio: user.statusBio || '',
      nickname: user.nickname || displayName
    });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// POST /api/auth/login — sign in to existing account
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const rawPass = password || req.body.pin;
if (!username || !rawPass) {

      return res.status(400).json({ error: 'Username or Email, and password are required' });
    }
    const identifier = String(username).trim().toLowerCase();
    if (!identifier) return res.status(400).json({ error: 'Please enter a valid username or email' });
    if (identifier.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
      }
    }

    const user = await store.getUserByEmailOrUsername(identifier);
    if (!user) {
      // Do not reveal whether the account exists
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(String(rawPass), user.pinHash || '');
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    store.setLastSeen(user.username);
    try {
      await store.getOrCreateDMRoom(user.username, user.username);
    } catch (e) {
      console.warn('Could not auto-create Saved Messages room on login:', e?.message || e);
    }

    const sessionId = await createSession(user.username, req);
    const token = jwt.sign({ username: user.username, sid: sessionId }, JWT_SECRET, { expiresIn: '60d' });
    res.json({
      token,
      sessionId,
      username: user.username,
      avatar: user.avatar || '✨',
      color: user.color || '#3390ec',
      statusBio: user.statusBio || '',
      nickname: user.nickname || user.username
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me — verify active session token
router.get('/me', async (req, res) => {
  try {
    const decoded = await requireSession(req, res);
    if (!decoded) return;

    const user = await store.getUserByUsername(decoded.username);
    if (!user) return res.status(401).json({ error: 'User account not found' });

    res.json({
      username: user.username,
      avatar: user.avatar || '✨',
      color: user.color || '#818cf8',
      statusBio: user.statusBio || '',
      nickname: user.nickname || user.username
    });
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
});

// POST /api/auth/profile — update profile
router.post('/profile', async (req, res) => {
  try {
    const decoded = await requireSession(req, res);
    if (!decoded) return;

    const { nickname, avatar, statusBio, color } = req.body;
    const updates = {};
    if (typeof nickname === 'string') updates.nickname = nickname.trim();
    if (typeof avatar === 'string') updates.avatar = avatar.trim();
    if (typeof statusBio === 'string') updates.statusBio = statusBio.trim();
    if (typeof color === 'string') updates.color = color.trim();

    const updated = await store.updateProfile(decoded.username, updates);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/auth/sessions — list active sessions
router.get('/sessions', async (req, res) => {
  try {
    const decoded = await requireSession(req, res);
    if (!decoded) return;

    const sessions = await store.getSessions(decoded.username);
    res.json(sessions || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/sessions/:sessionId — revoke a session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const decoded = await requireSession(req, res);
    if (!decoded) return;

    const { sessionId } = req.params;
    await store.revokeSession(decoded.username, sessionId);
    invalidateSessionCache(decoded.username, sessionId);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = (app) => app.use('/api/auth', router);
