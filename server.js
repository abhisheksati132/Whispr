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
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(store.getUploadsDir()));

// ── Health & Config ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.send('ok'));

app.get('/api/config', (_req, res) => {
  res.json({
    passwordRequired: Boolean(CHAT_PASSWORD),
    giphyKey: GIPHY_API_KEY
  });
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

// ── Online users per room ────────────────────────────────────────────────
const rooms = new Map(); // Map<room, Map<socketId, {name, profile}>>

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
  io.to(room).emit('presence', { users: list, profiles: profList, lastSeen: store.getLastSeen() });
}

const MILESTONE_TEXTS = {
  10:   '🎉 10 messages! You two are off to a great start!',
  25:   '✨ 25 messages — you really can\'t stop talking, can you? 💕',
  50:   '🔥 50 messages! Officially besties at this point.',
  100:  '💯 100 messages!! This friendship is unstoppable! 🥺',
  200:  '🌟 200 messages — absolute legends.',
  500:  '🚀 500 messages! You two are the definition of besties.',
  1000: '👑 1000 MESSAGES!!! This is love. Pure love.'
};

// ── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let username = null;
  let currentRoom = null;
  let longPressTimer = null;

  // ── Join ──────────────────────────────────────────────────────────────
  socket.on('join', ({ name, room, nickname, password } = {}) => {
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

    const pinnedMsgId = roomState.pinnedMessageId;
    const pinnedMsg = pinnedMsgId ? roomState.messages.find((m) => m.id === pinnedMsgId) || null : null;

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
      feelings: store.getFeelings(),
      pinnedMsg,
      readBy: roomState.readBy || {}
    });

    io.to(currentRoom).emit('system', randomJoinMessage(profile.nickname || username));
    broadcastPresence(currentRoom);
  });

  // ── Message ─────────────────────────────────────────────────────────
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
      } else if (type === 'music') {
        if (!payload.url) return;
        msgData = { user: username, text: payload.text || payload.url, url: payload.url, type: 'music' };
      } else {
        const text = normalizeText(payload.text || '');
        if (!text) return;
        const replyTo = payload.replyTo || null;
        msgData = { user: username, text, type: 'text', ...(replyTo ? { replyTo } : {}) };
      }
      // Attach replyTo for other types too
      if (payload.replyTo && msgData && !msgData.replyTo) {
        msgData.replyTo = payload.replyTo;
      }
    } else {
      return;
    }

    const { message, milestone } = store.addMessage(currentRoom, msgData);
    store.setLastSeen(username);
    io.to(currentRoom).emit('message', message);

    if (milestone) {
      io.to(currentRoom).emit('milestone', {
        count: milestone,
        text: MILESTONE_TEXTS[milestone] || `🎉 ${milestone} messages!`
      });
    }
  });

  // ── Secret message (not persisted, auto-destroys) ───────────────────
  socket.on('secret-message', ({ text } = {}) => {
    if (!username || !currentRoom) return;
    const safe = normalizeText(text);
    if (!safe) return;
    const profile = store.getProfile(username);
    const id = crypto.randomUUID();
    const msg = {
      id,
      user: username,
      text: safe,
      type: 'secret',
      time: Date.now(),
      reactions: {},
      profile: { avatar: profile.avatar, color: profile.color, nickname: profile.nickname }
    };
    io.to(currentRoom).emit('message', msg);
    // Destroy after 30 seconds
    setTimeout(() => {
      io.to(currentRoom).emit('message-deleted', { messageId: id });
    }, 30000);
  });

  // ── Edit message ────────────────────────────────────────────────────
  socket.on('edit-message', ({ messageId, text } = {}) => {
    if (!username || !currentRoom) return;
    const safe = normalizeText(text);
    if (!safe || !messageId) return;
    const roomState = store.getRoom(currentRoom);
    const msg = roomState.messages.find((m) => m.id === messageId);
    if (!msg || msg.user !== username || msg.deleted) return;
    const updated = store.editMessage(currentRoom, messageId, safe);
    if (updated) {
      io.to(currentRoom).emit('message-edited', { messageId, text: safe, editedAt: updated.editedAt });
    }
  });

  // ── Delete message ──────────────────────────────────────────────────
  socket.on('delete-message', ({ messageId } = {}) => {
    if (!username || !currentRoom || !messageId) return;
    const roomState = store.getRoom(currentRoom);
    const msg = roomState.messages.find((m) => m.id === messageId);
    if (!msg || msg.user !== username) return;
    store.deleteMessage(currentRoom, messageId);
    io.to(currentRoom).emit('message-deleted', { messageId });
  });

  // ── Pin / Unpin ─────────────────────────────────────────────────────
  socket.on('pin-message', ({ messageId } = {}) => {
    if (!username || !currentRoom || !messageId) return;
    store.pinMessage(currentRoom, messageId);
    const roomState = store.getRoom(currentRoom);
    const msg = roomState.messages.find((m) => m.id === messageId) || null;
    io.to(currentRoom).emit('pinned-update', { messageId, msg });
  });

  socket.on('unpin-message', () => {
    if (!currentRoom) return;
    store.pinMessage(currentRoom, null);
    io.to(currentRoom).emit('pinned-update', { messageId: null, msg: null });
  });

  // ── Read receipt ────────────────────────────────────────────────────
  socket.on('read-receipt', ({ messageId } = {}) => {
    if (!username || !currentRoom || !messageId) return;
    const readBy = store.updateReadReceipt(currentRoom, username, messageId);
    io.to(currentRoom).emit('receipt-update', readBy);
  });

  // ── Reactions ───────────────────────────────────────────────────────
  socket.on('react', ({ messageId, emoji, add }) => {
    if (!username || !currentRoom) return;
    const msg = store.updateMessageReaction(currentRoom, messageId, emoji, username, add);
    if (!msg) return;
    io.to(currentRoom).emit('reaction-update', { messageId, reactions: msg.reactions });
  });

  // ── Typing ──────────────────────────────────────────────────────────
  socket.on('typing', () => {
    if (!username || !currentRoom) return;
    const profile = store.getProfile(username);
    socket.to(currentRoom).emit('typing', profile.nickname || username);
  });

  // ── Heartbeat ───────────────────────────────────────────────────────
  socket.on('heartbeat', () => {
    if (username) store.setLastSeen(username);
  });

  // ── Games ───────────────────────────────────────────────────────────
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

  // ── Room meta ───────────────────────────────────────────────────────
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
    const userEntry = currentRoom && getRoomUsers(currentRoom).get(socket.id);
    if (userEntry) userEntry.profile.nickname = safe;
    if (currentRoom) broadcastPresence(currentRoom);
  });

  // ── Feelings ────────────────────────────────────────────────────────
  socket.on('set-feeling', (feelingKey) => {
    if (!username) return;
    const f = store.setFeeling(username, feelingKey);
    if (!f) return;
    if (currentRoom) io.to(currentRoom).emit('feelings-update', store.getFeelings());
  });

  // ── Empathy pulse ───────────────────────────────────────────────────
  socket.on('empathy-pulse', () => {
    if (!username || !currentRoom) return;
    const profile = store.getProfile(username);
    socket.to(currentRoom).emit('empathy-pulse', { from: profile.nickname || username });
  });

  // ── Poll vote ───────────────────────────────────────────────────────
  socket.on('poll-vote', ({ messageId, option }) => {
    if (!username || !currentRoom) return;
    const roomState = store.getRoom(currentRoom);
    const msg = roomState.messages.find((m) => m.id === messageId);
    if (!msg || msg.type !== 'poll') return;
    if (!msg.votes) msg.votes = {};
    msg.votes[username] = option;
    store.updateRoomMeta(currentRoom, {});
    io.to(currentRoom).emit('poll-update', { messageId, votes: msg.votes });
  });

  // ── Disconnect ──────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (username && currentRoom) {
      getRoomUsers(currentRoom).delete(socket.id);
      store.setLastSeen(username);
      socket.to(currentRoom).emit('system', randomLeaveMessage(username));
      broadcastPresence(currentRoom);
    }
  });
});

// ── Start server ───────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Bestie Chat running on port ${PORT}`));
}

module.exports = { app, server };
