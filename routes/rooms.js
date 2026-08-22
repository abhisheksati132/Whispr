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

// POST /api/rooms/create — create a new group/channel room
router.post('/create', authMw, async (req, res) => {
  try {
    const { name, type, participants, roomPassword } = req.body;
    const roomName = String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '') || 'group-' + Date.now();
    const roomType = ['group', 'channel', 'dm'].includes(type) ? type : 'group';
    
    const existing = await store.getRoomMeta(roomName);
    if (existing && existing.name) {
      return res.status(409).json({ error: 'Room already exists' });
    }

    const participantList = Array.isArray(participants) ? participants.filter(p => p && p !== req.username) : [];
    const allParticipants = [req.username, ...participantList];
    
    await store.updateRoomMeta(roomName, {
      type: roomType,
      participants: allParticipants,
      roomPassword: roomPassword || ''
    });

    for (const p of allParticipants) {
      await store.supabase.from('room_participants').upsert({
        room_name: roomName,
        username: p.toLowerCase(),
        role: p === req.username ? 'owner' : 'member'
      }).catch(() => {});
    }

    res.json({ roomName, type: roomType, participants: allParticipants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/:roomName/members — add member to room
router.post('/:roomName/members', authMw, async (req, res) => {
  try {
    const { roomName } = req.params;
    const { username: newMember } = req.body;
    if (!newMember) return res.status(400).json({ error: 'username required' });
    
    const meta = await store.getRoomMeta(roomName);
    if (!meta || !meta.name) return res.status(404).json({ error: 'Room not found' });
    
    const participants = meta.participants || [];
    if (!participants.includes(newMember.toLowerCase())) {
      participants.push(newMember.toLowerCase());
      await store.updateRoomMeta(roomName, { participants });
    }
    
    await store.supabase.from('room_participants').upsert({
      room_name: roomName,
      username: newMember.toLowerCase(),
      role: 'member'
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/rooms/:roomName/members/:username — remove member from room
router.delete('/:roomName/members/:username', authMw, async (req, res) => {
  try {
    const { roomName, username: memberToRemove } = req.params;
    const meta = await store.getRoomMeta(roomName);
    if (!meta || !meta.name) return res.status(404).json({ error: 'Room not found' });
    
    const participants = (meta.participants || []).filter(p => p !== memberToRemove.toLowerCase());
    await store.updateRoomMeta(roomName, { participants });
    
    await store.supabase.from('room_participants').delete()
      .eq('room_name', roomName)
      .eq('username', memberToRemove.toLowerCase())
      .catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:roomName/search?q=xxx — server-side message search
router.get('/:roomName/search', authMw, async (req, res) => {
  try {
    const { roomName } = req.params;
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);
    
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const { data, error } = await store.supabase
      .from('messages')
      .select('id, "user", text, type, time, url')
      .eq('room', roomName)
      .eq('deleted', false)
      .or(`text.ilike.%${q}%,user.ilike.%${q}%`)
      .order('time', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    res.json((data || []).map(m => ({
      id: m.id,
      user: m.user,
      text: m.text || '',
      type: m.type || 'text',
      time: m.time,
      url: m.url || ''
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blocks — block a user
router.post('/blocks', authMw, async (req, res) => {
  try {
    const { blockedUsername } = req.body;
    if (!blockedUsername) return res.status(400).json({ error: 'blockedUsername required' });
    if (blockedUsername.toLowerCase() === req.username.toLowerCase()) return res.status(400).json({ error: 'Cannot block yourself' });
    
    await store.supabase.from('user_blocks').upsert({
      blocker: req.username.toLowerCase(),
      blocked: blockedUsername.toLowerCase(),
      created_at: Date.now()
    }).catch(() => {});
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/blocks/:username — unblock a user
router.delete('/blocks/:username', authMw, async (req, res) => {
  try {
    const { username: blockedUser } = req.params;
    await store.supabase.from('user_blocks').delete()
      .eq('blocker', req.username.toLowerCase())
      .eq('blocked', blockedUser.toLowerCase())
      .catch(() => {});
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blocks — list blocked users
router.get('/blocks', authMw, async (req, res) => {
  try {
    const { data, error } = await store.supabase
      .from('user_blocks')
      .select('blocked, created_at')
      .eq('blocker', req.username.toLowerCase());
    
    if (error) throw error;
    res.json((data || []).map(b => ({ username: b.blocked, createdAt: b.created_at })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/rooms/:roomName/mute — mute notifications for a room
router.put('/:roomName/mute', authMw, async (req, res) => {
  try {
    const { roomName } = req.params;
    const { muteUntil } = req.body;
    const until = typeof muteUntil === 'number' ? muteUntil : Date.now() + 3600000;
    
    await store.supabase.from('room_participants').upsert({
      room_name: roomName,
      username: req.username.toLowerCase(),
      role: 'member',
      mute_until: until
    }).catch(() => {});
    
    res.json({ ok: true, muteUntil: until });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/rooms/:roomName/mute — unmute notifications for a room
router.delete('/:roomName/mute', authMw, async (req, res) => {
  try {
    const { roomName } = req.params;
    await store.supabase.from('room_participants').update({ mute_until: 0 })
      .eq('room_name', roomName)
      .eq('username', req.username.toLowerCase())
      .catch(() => {});
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/rooms/:roomName — delete a room (owner only)
router.delete('/:roomName', authMw, async (req, res) => {
  try {
    const { roomName } = req.params;
    const { data: participant } = await store.supabase
      .from('room_participants')
      .select('role')
      .eq('room_name', roomName)
      .eq('username', req.username.toLowerCase())
      .single();
    
    if (!participant || participant.role !== 'owner') {
      return res.status(403).json({ error: 'Only room owner can delete' });
    }
    
    await store.supabase.from('rooms').delete().eq('name', roomName).catch(() => {});
    await store.supabase.from('room_participants').delete().eq('room_name', roomName).catch(() => {});
    await store.supabase.from('messages').delete().eq('room', roomName).catch(() => {});
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = (app) => app.use('/api/rooms', router);
