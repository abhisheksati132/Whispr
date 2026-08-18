'use strict';
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const User     = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

// In-memory fallback user store when MongoDB is connecting or disconnected
const memoryUsers = new Map();

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, avatar } = req.body;
    const rawPass = req.body.password || req.body.pin;
    if (!username || !rawPass) return res.status(400).json({ error: 'Username and password required' });
    if (String(rawPass).trim().length < 3) return res.status(400).json({ error: 'Password must be at least 3 characters' });

    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!clean || clean.length < 2 || clean.length > 25) {
      return res.status(400).json({ error: 'Username must be 2–25 letters, numbers or underscores' });
    }

    const pinHash = await bcrypt.hash(String(rawPass), 10);
    const avatarEmoji = avatar || '✨';

    let user = null;
    if (isMongoReady()) {
      const existing = await User.findOne({ username: clean });
      if (existing) {
        // If existing user's password matches, log them in!
        const match = await bcrypt.compare(String(rawPass), existing.pinHash || '');
        if (match) {
          const token = jwt.sign({ username: existing.username }, JWT_SECRET, { expiresIn: '60d' });
          return res.json({ token, username: existing.username, avatar: existing.avatar, color: existing.color, statusBio: existing.statusBio || '', nickname: existing.nickname || '' });
        }
        return res.status(401).json({ error: 'Incorrect password for this username. Please try again.' });
      }

      user = await User.create({ username: clean, pinHash, avatar: avatarEmoji }).catch(() => null);
    }

    if (!user) {
      if (memoryUsers.has(clean)) {
        const existingMem = memoryUsers.get(clean);
        const match = await bcrypt.compare(String(rawPass), existingMem.pinHash || '');
        if (match) {
          const token = jwt.sign({ username: clean }, JWT_SECRET, { expiresIn: '60d' });
          return res.json({ token, username: clean, avatar: existingMem.avatar, color: existingMem.color, statusBio: '', nickname: '' });
        }
        return res.status(401).json({ error: 'Incorrect password for this username. Please try again.' });
      }
      user = { username: clean, pinHash, avatar: avatarEmoji, color: '#D97757', statusBio: '', nickname: '' };
      memoryUsers.set(clean, user);
    }

    const token = jwt.sign({ username: clean }, JWT_SECRET, { expiresIn: '60d' });
    return res.json({
      token,
      username: clean,
      avatar: user.avatar || avatarEmoji,
      color: user.color || '#D97757',
      statusBio: user.statusBio || '',
      nickname: user.nickname || ''
    });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Authentication error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;
    const rawPass = req.body.password || req.body.pin;
    if (!username || !rawPass) return res.status(400).json({ error: 'Username and password required' });
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!clean) return res.status(400).json({ error: 'Username required' });

    let user = null;
    if (isMongoReady()) {
      user = await User.findOne({ username: clean });
    }
    if (!user && memoryUsers.has(clean)) {
      user = memoryUsers.get(clean);
    }

    if (!user) {
      // Auto-register if user doesn't exist yet!
      const pinHash = await bcrypt.hash(String(rawPass), 10);
      if (isMongoReady()) {
        user = await User.create({ username: clean, pinHash, avatar: '✨' }).catch(() => null);
      }
      if (!user) {
        user = { username: clean, pinHash, avatar: '✨', color: '#D97757', statusBio: '', nickname: '' };
        memoryUsers.set(clean, user);
      }
      const token = jwt.sign({ username: clean }, JWT_SECRET, { expiresIn: '60d' });
      return res.json({
        token,
        username: clean,
        avatar: user.avatar || '✨',
        color: user.color || '#D97757',
        statusBio: user.statusBio || '',
        nickname: user.nickname || ''
      });
    }

    // Check existing password
    const match = await bcrypt.compare(String(rawPass), user.pinHash || '');
    if (!match) return res.status(401).json({ error: 'Incorrect password for this username. Please try again.' });

    if (isMongoReady() && user.save) {
      user.lastSeen = Date.now();
      await user.save().catch(() => {});
    }

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '60d' });
    res.json({
      token,
      username: user.username,
      avatar: user.avatar || '✨',
      color: user.color || '#D97757',
      statusBio: user.statusBio || '',
      nickname: user.nickname || ''
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Login error. Please try again.' });
  }
});

// GET /api/auth/me (verify token)
router.get('/me', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);

    let user = null;
    if (isMongoReady()) {
      user = await User.findOne({ username: decoded.username }).lean();
    }
    if (!user && memoryUsers.has(decoded.username)) {
      user = memoryUsers.get(decoded.username);
    }

    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({
      username: user.username,
      avatar: user.avatar || '✨',
      color: user.color || '#818cf8',
      statusBio: user.statusBio || '',
      nickname: user.nickname || ''
    });
  } catch (err) {
    res.status(401).json({ error: 'Token invalid or expired — please log in again.' });
  }
});

module.exports = (app) => app.use('/api/auth', router);
