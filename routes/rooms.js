'use strict';
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const store   = require('../supabaseStore');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

function authMw(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const decoded = jwt.verify(token, JWT_SECRET);
    req.username = decoded.username;
    next();
  } catch (_) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// GET /api/rooms/list — all rooms the user participates in
router.get('/list', authMw, async (req, res) => {
  try {
    const rooms = await store.listUserRooms(req.username);
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/dm — create or get existing DM room
router.post('/dm', authMw, async (req, res) => {
  try {
    const { targetUsername } = req.body;
    if (!targetUsername) return res.status(400).json({ error: 'targetUsername required' });
    const dm = await store.getOrCreateDMRoom(req.username, targetUsername);
    res.json(dm);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/users/search?q=xxx — search users
router.get('/users/search', authMw, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.length < 2) return res.json([]);
    const users = await store.searchUsers(q, req.username);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:roomName/messages?before=timestamp — paginated history
router.get('/:roomName/messages', authMw, async (req, res) => {
  try {
    const { roomName } = req.params;
    const before = req.query.before ? parseInt(req.query.before, 10) : null;
    const messages = await store.getRoomMessagesPaginated(roomName, before, 50);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = (app) => app.use('/api/rooms', router);
