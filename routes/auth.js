'use strict';
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const store   = require('../supabaseStore');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

const authLimiter = require('express-rate-limit')({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts, try again later.' } });
router.use(authLimiter);

function createSession(username, req) {
  const sessionId = crypto.randomUUID();
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
  store.supabase.from('user_sessions').upsert({
    id: sessionId,
    username: username.toLowerCase(),
    user_agent: userAgent.slice(0, 200),
    ip: String(ip).slice(0, 45),
    created_at: Date.now(),
    last_active: Date.now(),
    revoked: false
  }).catch(() => {});
  return sessionId;
}

// POST /api/auth/register — create new account
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, nickname, avatar, bio } = req.body;
    const rawPass = password || req.body.pin;
    if (!username || !rawPass) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (String(rawPass).trim().length < 3) {
      return res.status(400).json({ error: 'Password must be at least 3 characters long' });
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
      let existingEmail = await store.getUserByEmailOrUsername(email);
      if (existingEmail && existingEmail.email === email.trim().toLowerCase()) {
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
    await store.getOrCreateDMRoom(clean, clean);

    const token = jwt.sign({ username: clean }, JWT_SECRET, { expiresIn: '60d' });
    const sessionId = createSession(clean, req);
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

    let user = await store.getUserByEmailOrUsername(identifier);
    if (!user) {
      return res.status(404).json({ error: `Account not found. Please check your credentials or register.` });
    }

    const match = await bcrypt.compare(String(rawPass), user.pinHash || '');
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    store.setLastSeen(user.username);
    await store.getOrCreateDMRoom(user.username, user.username);

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '60d' });
    const sessionId = createSession(user.username, req);
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
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await store.getUserByUsername(decoded.username);
    if (!user) return res.status(401).json({ error: 'User account not found' });

    res.json({
      username: user.username,
      avatar: user.avatar || '✨',
      color: user.color || '#818cf8',
      statusBio: user.statusBio || '',
      nickname: user.nickname || user.username
    });
  } catch (err) {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
});

// POST /api/auth/profile — update profile
router.post('/profile', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);

    const { nickname, avatar, statusBio, color } = req.body;
    const updates = {};
    if (typeof nickname === 'string') updates.nickname = nickname.trim();
    if (typeof avatar === 'string') updates.avatar = avatar.trim();
    if (typeof statusBio === 'string') updates.statusBio = statusBio.trim();
    if (typeof color === 'string') updates.color = color.trim();

    const updated = await store.updateProfile(decoded.username, updates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/auth/sessions — list active sessions
router.get('/sessions', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);

    const { data, error } = await store.supabase
      .from('user_sessions')
      .select('id, user_agent, ip, created_at, last_active')
      .eq('username', decoded.username)
      .eq('revoked', false)
      .order('last_active', { ascending: false });

    if (error) throw error;
    res.json((data || []).map(s => ({
      id: s.id,
      userAgent: s.user_agent,
      ip: s.ip,
      createdAt: s.created_at,
      lastActive: s.last_active
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/sessions/:sessionId — revoke a session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);

    const { sessionId } = req.params;
    await store.supabase.from('user_sessions')
      .update({ revoked: true })
      .eq('id', sessionId)
      .eq('username', decoded.username)
      .catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = (app) => app.use('/api/auth', router);
