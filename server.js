const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const store = require('./store');
const {
  normalizeName,
  normalizeRoom,
  normalizeText,
  normalizeNickname,
  randomJoinMessage,
  randomLeaveMessage,
  randomGamePrompt
} = require('./chat-utils');

const CHAT_PASSWORD = process.env.CHAT_PASSWORD || '';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(store.getUploadsDir()));

// ── Health & Config ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.send('ok'));

app.get('/api/config', (_req, res) => {
  res.json({ passwordRequired: Boolean(CHAT_PASSWORD) });
});

// ── File Upload ────────────────────────────────────────────────────────────
app.post('/api/upload', (req, res) => {
  try {
    const { data, mime, kind } = req.body;
    if (!data || !mime) return res.status(400).json({ error: 'Missing data or mime' });
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/webm', 'audio/ogg'];
    if (!allowed.includes(mime)) return res.status(400).json({ error: 'Unsupported mime type' });
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'File too large' });
    const url = store.saveUpload(buffer, ext);
    res.json({ url, kind });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ── Track online users per room ────────────────────────────────────────────
// Map<room, Map<socketId, {name, profile}>>
const rooms = new Map();

function getRoomUsers(room) {
  if (!rooms.has(room)) rooms.set(room, new Map());
  return rooms.get(room);
}

function broadcastPresence(room) {
  const users = getRoomUsers(room);
  const list = [];
  const profList = [];
  for (const { name, profile } of users.values()) {
    list.push(name);
    profList.push({ name, ...profile });
  }
  const lastSeen = store.getLastSeen();
  io.to(room).emit('presence', { users: list, profiles: profList, lastSeen });
}

// ── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let username = null;
  let currentRoom = null;

  socket.on('join', ({ name, room, nickname, password } = {}) => {
    // Password guard
    if (CHAT_PASSWORD && password !== CHAT_PASSWORD) {
      socket.emit('join-error', 'Wrong password — ask your bestie!');
      return;
    }

    username = normalizeName(name);
    currentRoom = normalizeRoom(room || 'just-us');
    const displayNick = normalizeNickname(nickname, username);

    const profile = store.getProfile(username);
    if (displayNick && displayNick !== username) {
      store.updateProfile(username, { nickname: displayNick });
      profile.nickname = displayNick;
    }

    socket.join(currentRoom);
    getRoomUsers(currentRoom).set(socket.id, { name: username, profile });

    const roomState = store.getRoom(currentRoom);
    const streak = store.recordActivity(username);
    store.setLastSeen(username);

    socket.emit('joined', {
      profile,
      history: roomState.messages.slice(-100),
      mood: roomState.mood,
      jokes: roomState.jokes,
      countdown: roomState.countdown,
      motd: store.getMotd(),
      streak,
      lastSeen: store.getLastSeen(),
      feelingsPalette: store.FEELINGS,
      feelings: store.getFeelings()
    });

    const joinMsg = randomJoinMessage(profile.nickname || username);
    io.to(currentRoom).emit('system', joinMsg);

    broadcastPresence(currentRoom);
  });

  socket.on('message', (payload) => {
    if (!username || !currentRoom) return;

    let msgData;
    if (typeof payload === 'string') {
      const text = normalizeText(payload);
      if (!text) return;
      msgData = { user: username, text, type: 'text' };
    } else if (payload && typeof payload === 'object') {
      const type = payload.type || 'text';
      if (type === 'hug') {
        msgData = { user: username, text: 'sent a hug 💌', type: 'hug' };
      } else if (type === 'image') {
        if (!payload.url) return;
        msgData = { user: username, text: payload.text || '', url: payload.url, type: 'image' };
      } else if (type === 'voice') {
        if (!payload.url) return;
        msgData = { user: username, text: '', url: payload.url, duration: payload.duration || 0, type: 'voice' };
      } else {
        const text = normalizeText(payload.text || '');
        if (!text) return;
        msgData = { user: username, text, type: 'text' };
      }
    } else {
      return;
    }

    const { message, milestone } = store.addMessage(currentRoom, msgData);
    store.setLastSeen(username);
    io.to(currentRoom).emit('message', message);

    if (milestone) {
      const milestoneTexts = {
        10: '🎉 10 messages! You two are off to a great start!',
        25: '✨ 25 messages — you really can\'t stop talking, can you? 💕',
        50: '🔥 50 messages! Officially besties at this point.',
        100: '💯 100 messages!! This friendship is unstoppable! 🥺',
        200: '🌟 200 messages — absolute legends.',
        500: '🚀 500 messages! You two are the definition of besties.',
        1000: '👑 1000 MESSAGES!!! This is love. Pure love.'
      };
      io.to(currentRoom).emit('milestone', {
        count: milestone,
        text: milestoneTexts[milestone] || `🎉 ${milestone} messages!`
      });
    }
  });

  socket.on('react', ({ messageId, emoji, add }) => {
    if (!username || !currentRoom) return;
    const msg = store.updateMessageReaction(currentRoom, messageId, emoji, username, add);
    if (!msg) return;
    io.to(currentRoom).emit('reaction-update', { messageId, reactions: msg.reactions });
  });

  socket.on('typing', () => {
    if (!username || !currentRoom) return;
    const profile = store.getProfile(username);
    socket.to(currentRoom).emit('typing', profile.nickname || username);
  });

  socket.on('heartbeat', () => {
    if (username) store.setLastSeen(username);
  });

  socket.on('start-game', (type) => {
    if (!username || !currentRoom) return;
    const prompt = randomGamePrompt(type);
    if (!prompt) return;
    const profile = store.getProfile(username);
    const display = profile.nickname || username;
    io.to(currentRoom).emit('game-prompt', {
      from: display,
      type: prompt.type,
      question: prompt.text || prompt.q,
      options: prompt.a ? [prompt.a, prompt.b] : null
    });
  });

  socket.on('update-mood', (mood) => {
    if (!currentRoom) return;
    store.updateRoomMeta(currentRoom, { mood: String(mood || '').slice(0, 100) });
    io.to(currentRoom).emit('mood-update', mood);
  });

  socket.on('update-jokes', (jokes) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(jokes) ? jokes : []).map((j) => String(j).slice(0, 200)).slice(0, 20);
    store.updateRoomMeta(currentRoom, { jokes: safe });
    io.to(currentRoom).emit('jokes-update', safe);
  });

  socket.on('update-countdown', ({ label, date } = {}) => {
    if (!currentRoom) return;
    const cd = { label: String(label || '').slice(0, 50), date: date || null };
    store.updateRoomMeta(currentRoom, { countdown: cd });
    io.to(currentRoom).emit('countdown-update', cd);
  });

  socket.on('update-nickname', (nick) => {
    if (!username) return;
    const safe = normalizeNickname(nick, username);
    store.updateProfile(username, { nickname: safe });
    const userEntry = getRoomUsers(currentRoom || '').get(socket.id);
    if (userEntry) userEntry.profile.nickname = safe;
    if (currentRoom) broadcastPresence(currentRoom);
  });

  socket.on('set-feeling', (feelingKey) => {
    if (!username) return;
    const f = store.setFeeling(username, feelingKey);
    if (!f) return;
    const updated = store.getFeelings();
    if (currentRoom) io.to(currentRoom).emit('feelings-update', updated);
  });

  socket.on('empathy-pulse', () => {
    if (!username || !currentRoom) return;
    const profile = store.getProfile(username);
    const display = profile.nickname || username;
    socket.to(currentRoom).emit('empathy-pulse', { from: display });
  });

  socket.on('poll-vote', ({ messageId, option }) => {
    if (!username || !currentRoom) return;
    const state = store.getRoom(currentRoom);
    const msg = state.messages.find((m) => m.id === messageId);
    if (!msg || msg.type !== 'poll') return;
    if (!msg.votes) msg.votes = {};
    msg.votes[username] = option;
    // persist via store internals — call updateRoomMeta to trigger persist
    store.updateRoomMeta(currentRoom, {});
    io.to(currentRoom).emit('poll-update', { messageId, votes: msg.votes });
  });

  socket.on('disconnect', () => {
    if (username && currentRoom) {
      getRoomUsers(currentRoom).delete(socket.id);
      store.setLastSeen(username);
      socket.to(currentRoom).emit('system', randomLeaveMessage(username));
      broadcastPresence(currentRoom);
    }
  });
});

// ── Start server (only when run directly, not when required by tests) ──────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Bestie Chat running on port ${PORT}`));
}

module.exports = { app, server };
