'use strict';
const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const Room     = require('../models/Room');
const Message  = require('../models/Message');
const User     = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

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
    if (!isMongoReady()) return res.json([]);
    const rooms = await Room.find({
      $or: [{ participants: req.username }, { type: 'public' }]
    }).sort({ lastActivity: -1 }).limit(30).lean();

    const result = await Promise.all(rooms.map(async (room) => {
      const lastMsg = await Message.findOne({ room: room.name, deleted: false })
        .sort({ time: -1 }).lean();
      const readTime = (room.readBy || {})[req.username] || 0;
      const unread = await Message.countDocuments({
        room: room.name, time: { $gt: readTime }, deleted: false
      });
      const otherParticipant = room.type === 'dm'
        ? (room.participants || []).find(p => p !== req.username)
        : null;
      return {
        name: room.name,
        type: room.type,
        participants: room.participants,
        otherParticipant,
        lastMessage: lastMsg ? {
          text: lastMsg.text || (lastMsg.type === 'image' ? '📷 Photo' : lastMsg.type === 'voice' ? '🎤 Voice note' : ''),
          user: lastMsg.user,
          time: lastMsg.time,
          type: lastMsg.type
        } : null,
        unread,
        mood: room.mood,
        lastActivity: room.lastActivity || 0
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/dm — create or get existing DM room
router.post('/dm', authMw, async (req, res) => {
  try {
    const { targetUsername } = req.body;
    if (!targetUsername) return res.status(400).json({ error: 'targetUsername required' });
    const targetClean = targetUsername.toLowerCase();

    const sorted = [req.username, targetClean].sort();
    const dmName = `dm_${sorted.join('_')}`;

    if (isMongoReady()) {
      let room = await Room.findOne({ name: dmName }).lean();
      if (!room) {
        room = await Room.create({ name: dmName, type: 'dm', participants: sorted, lastActivity: Date.now() });
        room = room.toObject ? room.toObject() : room;
      }
    }
    res.json({ roomName: dmName, participants: sorted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/users/search?q=xxx — search users
router.get('/users/search', authMw, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    if (!isMongoReady()) return res.json([]);
    const users = await User.find({
      username: { $regex: q.toLowerCase(), $options: 'i' }
    }).limit(8).select('username avatar color').lean();
    res.json(users.filter(u => u.username !== req.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:roomName/messages?before=timestamp — paginated history
router.get('/:roomName/messages', authMw, async (req, res) => {
  try {
    const { roomName } = req.params;
    if (!isMongoReady()) return res.json([]);
    const query = { room: roomName };
    if (req.query.before) query.time = { $lt: parseInt(req.query.before) };
    const messages = await Message.find(query).sort({ time: -1 }).limit(50).lean();
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = (app) => app.use('/api/rooms', router);
