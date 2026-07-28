'use strict';
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, pin, avatar } = req.body;
    if (!username || !pin) return res.status(400).json({ error: 'Username and PIN required' });
    if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });

    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!clean || clean.length < 2 || clean.length > 20) {
      return res.status(400).json({ error: 'Username must be 2–20 letters, numbers or underscores' });
    }
    if (await User.findOne({ username: clean })) {
      return res.status(409).json({ error: 'Username already taken — try another!' });
    }

    const pinHash = await bcrypt.hash(String(pin), 10);
    const user = await User.create({ username: clean, pinHash, avatar: avatar || '✨' });

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username, avatar: user.avatar, color: user.color, statusBio: '', nickname: '' });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) return res.status(400).json({ error: 'Username and PIN required' });
    const clean = username.trim().toLowerCase();

    const user = await User.findOne({ username: clean });
    if (!user) return res.status(401).json({ error: 'User not found. Please register first.' });

    const match = await bcrypt.compare(String(pin), user.pinHash);
    if (!match) return res.status(401).json({ error: 'Wrong PIN — try again.' });

    user.lastSeen = Date.now();
    await user.save();

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username, avatar: user.avatar, color: user.color, statusBio: user.statusBio, nickname: user.nickname });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/auth/me  (verify token)
router.get('/me', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ username: decoded.username }).lean();
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ username: user.username, avatar: user.avatar, color: user.color, statusBio: user.statusBio, nickname: user.nickname });
  } catch (err) {
    res.status(401).json({ error: 'Token invalid or expired — please log in again.' });
  }
});

module.exports = (app) => app.use('/api/auth', router);
