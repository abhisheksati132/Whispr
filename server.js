'use strict';
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const crypto   = require('crypto');
const webpush  = require('web-push');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');

const mStore = require('./mongoStore');
const {
  normalizeName, normalizeRoom, normalizeText, normalizeNickname,
  randomJoinMessage, randomLeaveMessage, randomGamePrompt
} = require('./chat-utils');

const CHAT_PASSWORD = process.env.CHAT_PASSWORD || '';
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';
const JWT_SECRET    = process.env.JWT_SECRET || 'fallback-secret-change-me';

// ── MongoDB ──────────────────────────────────────────────────────────────────
(async () => {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      console.log('\n=============================================');
      console.log('🔄 Attempting to connect to MongoDB...');
      console.log('🔗 URI provided: ', uri.substring(0, 20) + '... (hidden for security)');
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log('✅ MongoDB connected successfully!');
      console.log('=============================================\n');
    } catch (err) {
      console.error('\n=============================================');
      console.error('❌ MONGODB CONNECTION FATAL ERROR:');
      console.error(err.message);
      console.error('---------------------------------------------');
      console.error('👉 If this says "bad auth" -> Your database password in the URL is wrong or has special characters (like @ or #) that need to be URL encoded.');
      console.error('👉 If this says "querySrv ENOTFOUND" -> The cluster name in your URL is wrong.');
      console.error('👉 If this says "timeout" -> Your MongoDB Atlas Network Access (IP Whitelist) is NOT set to 0.0.0.0/0. Railway IPs change, so you MUST allow access from anywhere!');
      console.error('=============================================\n');
    }
  } else {
    console.warn('\n=============================================');
    console.warn('⚠️  NO MONGODB_URI FOUND in environment variables!');
    console.warn('⚠️  Data will NOT persist across server restarts.');
    console.warn('=============================================\n');
  }
})();

// ── VAPID ─────────────────────────────────────────────────────────────────────
let vapidKeys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
if (!vapidKeys.publicKey || !vapidKeys.privateKey) vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:bestie@chat.local', vapidKeys.publicKey, vapidKeys.privateKey);

// ── Express ───────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(mStore.getUploadsDir()));

// ── Auth & Rooms Routes ───────────────────────────────────────────────────────
require('./routes/auth')(app);
require('./routes/rooms')(app);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.send('ok'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: Date.now(), mongo: mongoose.connection.readyState === 1 }));
app.get('/api/config', (_req, res) => res.json({ passwordRequired: Boolean(CHAT_PASSWORD), giphyKey: GIPHY_API_KEY }));
app.get('/api/daily-question', (_req, res) => res.json({ question: mStore.getDailyQuestion() }));

// ── Push endpoints ────────────────────────────────────────────────────────────
app.get('/api/push-vapid-key', (_req, res) => res.json({ publicKey: vapidKeys.publicKey }));

app.post('/api/push-subscribe', async (req, res) => {
  try {
    const { username, subscription } = req.body;
    if (!username || !subscription?.endpoint) return res.status(400).json({ error: 'Missing data' });
    await mStore.savePushSub(username, subscription);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/push-unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    await mStore.deletePushSub(endpoint);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Link preview ──────────────────────────────────────────────────────────────
app.get('/api/link-preview', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url' });
  let timer;
  try {
    const parsedUrl = new URL(targetUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return res.status(400).json({ error: 'Invalid protocol' });
    const host = parsedUrl.hostname.toLowerCase();
    if (
      host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') ||
      /^10\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)
    ) {
      return res.status(400).json({ error: 'Disallowed host' });
    }
    const ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), 3000);
    const response = await fetch(targetUrl, { signal: ctrl.signal, redirect: 'manual', headers: { 'User-Agent': 'BestieChatBot/1.0' } });
    if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch preview' });
    const html = await response.text();
    const getMeta = (n) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)["']`, 'i'));
      if (m) return m[1];
      const m2 = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${n}["']`, 'i'));
      return m2 ? m2[1] : '';
    };
    let title = getMeta('og:title') || getMeta('twitter:title');
    if (!title) { const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); title = tm ? tm[1].trim() : ''; }
    res.json({ title: title || parsedUrl.hostname, description: getMeta('og:description') || getMeta('description') || '', image: getMeta('og:image') || getMeta('twitter:image') || '', url: targetUrl });
  } catch (err) {
    res.status(500).json({ error: 'Could not generate link preview' });
  } finally {
    if (timer) clearTimeout(timer);
  }
});

// ── File upload ───────────────────────────────────────────────────────────────
app.post('/api/upload', (req, res) => {
  try {
    const { data, mime, kind } = req.body;
    if (!data || !mime) return res.status(400).json({ error: 'Missing data' });
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','audio/webm','audio/ogg'];
    if (!allowed.includes(mime)) return res.status(400).json({ error: 'Unsupported type' });
    const ext = mime.split('/')[1].replace('jpeg','jpg');
    const base64Data = (data.includes(',') ? data.split(',')[1] : data).trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) return res.status(400).json({ error: 'Invalid base64' });
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'File too large' });
    const url = mStore.saveUpload(buffer, ext);
    res.json({ url, kind });
  } catch (err) { res.status(500).json({ error: 'Upload failed' }); }
});

// ── Online users in-memory ────────────────────────────────────────────────────
const rooms = new Map(); // room → Map<socketId, {name, profile}>
const roomPictionaryState = new Map();

const PICTIONARY_WORDS = [
  'cat','sun','pizza','tree','heart','coffee','star','cake','rainbow','moon',
  'guitar','flower','butterfly','icecream','camera','cookie','balloon','house','car','smile'
];

function getRoomUsers(room) {
  if (!rooms.has(room)) rooms.set(room, new Map());
  return rooms.get(room);
}

async function broadcastPresence(room) {
  const users = getRoomUsers(room);
  const list = []; const profList = [];
  for (const { name, profile } of users.values()) { list.push(name); profList.push({ name, ...profile }); }
  io.to(room).emit('presence', { users: list, profiles: profList, lastSeen: mStore.getLastSeen() });
}

const MILESTONE_TEXTS = {
  10:'🎉 10 messages! You two are off to a great start!',
  25:'✨ 25 messages — you really can\'t stop talking, can you? 💕',
  50:'🔥 50 messages! Officially besties at this point.',
  100:'💯 100 messages!! This friendship is unstoppable! 🥺',
  200:'🌟 200 messages — absolute legends.',
  500:'🚀 500 messages! You two are the definition of besties.',
  1000:'👑 1000 MESSAGES!!! This is love. Pure love.'
};

// ── Push helper ───────────────────────────────────────────────────────────────
async function sendPushToRoom(room, senderName, title, body) {
  try {
    const online = new Set();
    const m = rooms.get(room);
    if (m) for (const u of m.values()) online.add(u.name);
    const subs = await mStore.getPushSubs();
    for (const sub of subs) {
      if (sub.username === senderName || online.has(sub.username)) continue;
      const payload = JSON.stringify({ title, body, icon:'/icon-192.png', url:'/' });
      webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys || {} }, payload)
        .catch(err => { if (err.statusCode===410||err.statusCode===404) mStore.deletePushSub(sub.endpoint).catch(()=>{}); });
    }
  } catch (err) { console.error('Push error:', err); }
}

// ── Socket auth middleware ────────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.data.authenticatedUser = decoded.username;
    } catch (_) { /* proceed without auth */ }
  }
  next();
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let username = null;
  let currentRoom = null;
  let msgCount = 0, msgResetAt = Date.now() + 5000;

  // ── Join ──────────────────────────────────────────────────────────────────
  socket.on('join', async ({ name, room, nickname, password } = {}) => {
    try {
      if (currentRoom) {
        socket.leave(currentRoom);
        const oldUsers = getRoomUsers(currentRoom);
        if (oldUsers) {
          oldUsers.delete(socket.id);
          broadcastPresence(currentRoom);
          if (oldUsers.size === 0) rooms.delete(currentRoom);
        }
      }

      username = normalizeName(name) || socket.data.authenticatedUser || 'Bestie';
      currentRoom = normalizeRoom(room || 'our-private-space');

      const displayNick = normalizeNickname(nickname, username);
      let profile = await mStore.getProfile(username);
      if (displayNick && displayNick !== username) {
        profile = await mStore.updateProfile(username, { nickname: displayNick });
      }

      socket.join(currentRoom);
      getRoomUsers(currentRoom).set(socket.id, { name: username, profile });

      const streak = mStore.recordActivity(username);
      mStore.setLastSeen(username);

      const roomMeta = await mStore.getRoomMeta(currentRoom);
      const history = await mStore.getMessages(currentRoom, 100);
      const pinnedMsg = roomMeta.pinnedMessageId
        ? history.find(m => m.id === roomMeta.pinnedMessageId) || null : null;

      socket.emit('joined', {
        profile, history,
        mood: roomMeta.mood, jokes: roomMeta.jokes || [], countdown: roomMeta.countdown || {},
        motd: mStore.getMotd(), streak, lastSeen: mStore.getLastSeen(),
        feelingsPalette: mStore.FEELINGS, feelings: mStore.getFeelings(),
        pinnedMsg, readBy: roomMeta.readBy || {},
        diary: roomMeta.diary || [], bucketList: roomMeta.bucketList || [],
        calendar: roomMeta.calendar || [], glossary: roomMeta.glossary || [],
        bonsai: roomMeta.bonsai || { growth:0, lastWatered:null },
        gameScores: roomMeta.gameScores || { wins:{}, losses:{} },
        hasPassword: Boolean(roomMeta.roomPassword),
        disappearingTimer: roomMeta.disappearingTimer || 0
      });

      io.to(currentRoom).emit('system', randomJoinMessage(profile.nickname || username));
      broadcastPresence(currentRoom);
    } catch (err) { console.error('join error:', err); }
  });

  // ── Clear history ─────────────────────────────────────────────────────────
  socket.on('clear-history', async () => {
    if (!currentRoom) return;
    await mStore.clearHistory(currentRoom);
    io.to(currentRoom).emit('history-cleared');
    io.to(currentRoom).emit('system', '🧹 Chat history was cleared.');
  });

  socket.on('set-room-password', async (pass) => {
    if (!currentRoom) return;
    const safePass = String(pass || '').trim();
    await mStore.updateRoomMeta(currentRoom, { roomPassword: safePass });
    socket.emit('password-updated', { hasPassword: Boolean(safePass) });
    io.to(currentRoom).emit('system', safePass ? '🔒 Room password updated.' : '🔓 Room password removed.');
  });

  socket.on('set-disappearing-timer', async (durationMs) => {
    if (!currentRoom) return;
    const ms = typeof durationMs === 'number' ? Math.max(0, durationMs) : 0;
    await mStore.updateRoomMeta(currentRoom, { disappearingTimer: ms });
    io.to(currentRoom).emit('disappearing-updated', { durationMs: ms });
  });

  // ── Message ───────────────────────────────────────────────────────────────
  socket.on('message', async (payload) => {
    if (!username || !currentRoom) return;
    const _now = Date.now();
    if (_now > msgResetAt) { msgCount = 0; msgResetAt = _now + 5000; }
    msgCount++;
    if (msgCount > 10) { socket.emit('rate-limited', { message: 'Slow down! Take a breath.' }); return; }

    let msgData;
    if (typeof payload === 'string') {
      const text = normalizeText(payload); if (!text) return;
      msgData = { user: username, text, type: 'text' };
    } else if (payload && typeof payload === 'object') {
      const type = payload.type || 'text';
      if (type === 'hug') msgData = { user: username, text: 'sent a hug 💌', type: 'hug' };
      else if (type === 'image') { if (!payload.url) return; msgData = { user: username, text: payload.text||'', url: payload.url, type:'image' }; }
      else if (type === 'voice') { if (!payload.url) return; msgData = { user: username, text:'', url: payload.url, duration: payload.duration||0, type:'voice' }; }
      else if (type === 'music') { if (!payload.url) return; msgData = { user: username, text: payload.text||payload.url, url: payload.url, type:'music' }; }
      else {
        const text = normalizeText(payload.text||''); if (!text) return;
        msgData = { user: username, text, type:'text', ...(payload.replyTo ? { replyTo: payload.replyTo } : {}) };
      }
      if (payload.replyTo && msgData && !msgData.replyTo) msgData.replyTo = payload.replyTo;
    } else return;

    try {
      const { message, milestone } = await mStore.addMessage(currentRoom, msgData);
      mStore.setLastSeen(username);
      io.to(currentRoom).emit('message', message);
      const profile = await mStore.getProfile(username);
      sendPushToRoom(currentRoom, username, `${profile.nickname||username} 💌`, msgData.text || 'sent a message');

      // Pictionary guess check
      const pState = roomPictionaryState.get(currentRoom);
      if (pState && msgData.text && msgData.user !== pState.drawer) {
        if (msgData.text.trim().toLowerCase() === pState.word.toLowerCase()) {
          roomPictionaryState.delete(currentRoom);
          const display = profile.nickname || username;
          const scores = await mStore.updateGameScore(currentRoom, username);
          io.to(currentRoom).emit('score-update', scores);
          io.to(currentRoom).emit('pictionary-correct', { winner: display, word: pState.word });
          io.to(currentRoom).emit('system', `🎉 ${display} guessed the secret word: "${pState.word}"!! 🏆`);
        }
      }

      if (milestone) io.to(currentRoom).emit('milestone', { count: milestone, text: MILESTONE_TEXTS[milestone] || `🎉 ${milestone} messages!` });
    } catch (err) { console.error('message error:', err); }
  });

  // ── Secret message ────────────────────────────────────────────────────────
  socket.on('secret-message', async ({ text } = {}) => {
    if (!username || !currentRoom) return;
    const safe = normalizeText(text); if (!safe) return;
    const profile = await mStore.getProfile(username);
    const id = crypto.randomUUID();
    const msg = { id, user: username, text: safe, type:'secret', time: Date.now(), reactions:{}, profile: { avatar: profile.avatar, color: profile.color, nickname: profile.nickname } };
    io.to(currentRoom).emit('message', msg);
    setTimeout(() => io.to(currentRoom).emit('message-deleted', { messageId: id }), 30000);
  });

  // ── Edit message ──────────────────────────────────────────────────────────
  socket.on('edit-message', async ({ messageId, text } = {}) => {
    if (!username || !currentRoom || !messageId) return;
    const safe = normalizeText(text); if (!safe) return;
    const msg = await mStore.findMessage(currentRoom, messageId);
    if (!msg || msg.user !== username || msg.deleted) return;
    const updated = await mStore.editMessage(currentRoom, messageId, safe);
    if (updated) io.to(currentRoom).emit('message-edited', { messageId, text: safe, editedAt: updated.editedAt });
  });

  // ── Delete message ────────────────────────────────────────────────────────
  socket.on('delete-message', async ({ messageId } = {}) => {
    if (!username || !currentRoom || !messageId) return;
    const msg = await mStore.findMessage(currentRoom, messageId);
    if (!msg || msg.user !== username) return;
    await mStore.deleteMessage(currentRoom, messageId);
    io.to(currentRoom).emit('message-deleted', { messageId });
  });

  // ── Pin / Unpin ───────────────────────────────────────────────────────────
  socket.on('pin-message', async ({ messageId } = {}) => {
    if (!currentRoom || !messageId) return;
    await mStore.pinMessage(currentRoom, messageId);
    const history = await mStore.getMessages(currentRoom, 200);
    const msg = history.find(m => m.id === messageId) || null;
    io.to(currentRoom).emit('pinned-update', { messageId, msg });
  });

  socket.on('unpin-message', async () => {
    if (!currentRoom) return;
    await mStore.pinMessage(currentRoom, null);
    io.to(currentRoom).emit('pinned-update', { messageId: null, msg: null });
  });

  // ── Shared pad ────────────────────────────────────────────────────────────
  socket.on('update-pad', ({ text } = {}) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('pad-updated', { text });
  });

  // ── View-once expire ──────────────────────────────────────────────────────
  socket.on('view-once-expire', async ({ messageId } = {}) => {
    if (!currentRoom || !messageId) return;
    const msg = await mStore.findMessage(currentRoom, messageId);
    if (msg) {
      await mStore.editMessage(currentRoom, messageId, '👁️ Photo expired');
      io.to(currentRoom).emit('view-once-expired', { messageId });
    }
  });

  // ── Read receipt ──────────────────────────────────────────────────────────
  socket.on('read-receipt', async ({ messageId } = {}) => {
    if (!username || !currentRoom || !messageId) return;
    const readBy = await mStore.updateReadReceipt(currentRoom, username, messageId);
    io.to(currentRoom).emit('receipt-update', readBy);
  });

  // ── Reactions ─────────────────────────────────────────────────────────────
  socket.on('react', async ({ messageId, emoji, add }) => {
    if (!username || !currentRoom) return;
    const msg = await mStore.updateMessageReaction(currentRoom, messageId, emoji, username, add);
    if (!msg) return;
    io.to(currentRoom).emit('reaction-update', { messageId, reactions: msg.reactions });
  });

  // ── Profile ───────────────────────────────────────────────────────────────
  socket.on('update-profile-bio', async ({ avatar, statusBio, color }) => {
    if (!username) return;
    const updates = {};
    if (avatar) updates.avatar = avatar;
    if (statusBio !== undefined) updates.statusBio = statusBio;
    if (color) updates.color = color;
    const updated = await mStore.updateProfile(username, updates);
    if (currentRoom) {
      getRoomUsers(currentRoom).set(socket.id, { name: username, profile: updated });
      io.to(currentRoom).emit('profile-updated', { username, profile: updated });
    }
  });

  // ── Connect 4 ─────────────────────────────────────────────────────────────
  socket.on('c4-move', ({ col, color }) => { if (currentRoom) socket.to(currentRoom).emit('c4-move', { user: username, col, color }); });

  // ── Typing ────────────────────────────────────────────────────────────────
  socket.on('typing', async () => {
    if (!username || !currentRoom) return;
    const profile = await mStore.getProfile(username);
    socket.to(currentRoom).emit('typing', profile.nickname || username);
  });

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  socket.on('heartbeat', () => { if (username) mStore.setLastSeen(username); });

  // ── Games ─────────────────────────────────────────────────────────────────
  socket.on('start-game', async (type) => {
    if (!username || !currentRoom) return;
    if (type === 'pictionary') {
      const word = PICTIONARY_WORDS[Math.floor(Math.random() * PICTIONARY_WORDS.length)];
      const profile = await mStore.getProfile(username);
      const display = profile.nickname || username;
      roomPictionaryState.set(currentRoom, { word, drawer: username });
      socket.emit('pictionary-word', { word });
      io.to(currentRoom).emit('pictionary-start', { drawer: display });
      io.to(currentRoom).emit('system', `🎨 ${display} started Pictionary! Guess their drawing in chat!`);
      return;
    }
    const prompt = randomGamePrompt(type); if (!prompt) return;
    const profile = await mStore.getProfile(username);
    const display = profile.nickname || username;
    io.to(currentRoom).emit('game-prompt', { from: display, type: prompt.type, question: prompt.text||prompt.q, options: prompt.a ? [prompt.a, prompt.b] : null });
  });

  // ── Room meta ─────────────────────────────────────────────────────────────
  socket.on('update-mood', async (mood) => { if (!currentRoom) return; await mStore.updateRoomMeta(currentRoom, { mood: String(mood||'').slice(0,100) }); io.to(currentRoom).emit('mood-update', mood); });
  socket.on('update-jokes', async (jokes) => { if (!currentRoom) return; const safe=(Array.isArray(jokes)?jokes:[]).map(j=>String(j).slice(0,200)).slice(0,20); await mStore.updateRoomMeta(currentRoom,{jokes:safe}); io.to(currentRoom).emit('jokes-update',safe); });
  socket.on('update-countdown', async ({label,date}={}) => { if (!currentRoom) return; const cd={label:String(label||'').slice(0,50),date:date||null}; await mStore.updateRoomMeta(currentRoom,{countdown:cd}); io.to(currentRoom).emit('countdown-update',cd); });

  socket.on('update-nickname', async (nick) => {
    if (!username) return;
    const safe = normalizeNickname(nick, username);
    await mStore.updateProfile(username, { nickname: safe });
    const userEntry = currentRoom && getRoomUsers(currentRoom).get(socket.id);
    if (userEntry) userEntry.profile.nickname = safe;
    if (currentRoom) broadcastPresence(currentRoom);
  });

  // ── Feelings ──────────────────────────────────────────────────────────────
  socket.on('set-feeling', (feelingKey) => {
    if (!username) return;
    const f = mStore.setFeeling(username, feelingKey); if (!f) return;
    if (currentRoom) io.to(currentRoom).emit('feelings-update', mStore.getFeelings());
  });

  // ── Empathy pulse ─────────────────────────────────────────────────────────
  socket.on('empathy-pulse', async () => {
    if (!username || !currentRoom) return;
    const profile = await mStore.getProfile(username);
    socket.to(currentRoom).emit('empathy-pulse', { from: profile.nickname || username });
    sendPushToRoom(currentRoom, username, `${profile.nickname||username} 💓`, 'sent you an empathy pulse');
  });

  // ── Poll vote ─────────────────────────────────────────────────────────────
  socket.on('poll-vote', async ({ messageId, option }) => {
    try {
      if (!username || !currentRoom) return;
      const msg = await mStore.findMessage(currentRoom, messageId);
      if (!msg || msg.type !== 'poll') return;
      const votes = msg.votes || {};
      votes[username] = option;
      const MsgDoc = require('./models/Message');
      if (mongoose.connection.readyState === 1) {
        await MsgDoc.findOneAndUpdate({ id: messageId }, { $set: { votes } });
      } else {
        msg.votes = votes;
      }
      io.to(currentRoom).emit('poll-update', { messageId, votes });
    } catch (err) { console.error('poll-vote error:', err); }
  });

  // ── WebRTC ────────────────────────────────────────────────────────────────
  socket.on('call-invite', (payload) => { if (currentRoom) { socket.to(currentRoom).emit('call-invite', { from: username, offer: payload.offer, type: payload.type }); sendPushToRoom(currentRoom, username, `Incoming ${payload.type||'voice'} call! 📞`, `From ${username}`); } });
  socket.on('call-accept', (payload) => { if (currentRoom) socket.to(currentRoom).emit('call-accept', { answer: payload.answer }); });
  socket.on('call-decline', () => { if (currentRoom) socket.to(currentRoom).emit('call-decline'); });
  socket.on('call-candidate', (payload) => { if (currentRoom) socket.to(currentRoom).emit('call-candidate', { candidate: payload.candidate }); });
  socket.on('call-hangup', () => { if (currentRoom) socket.to(currentRoom).emit('call-hangup'); });

  // ── Co-Draw ───────────────────────────────────────────────────────────────
  socket.on('draw-stroke', (data) => { if (currentRoom) socket.to(currentRoom).emit('draw-stroke', data); });
  socket.on('draw-clear', () => { if (currentRoom) socket.to(currentRoom).emit('draw-clear'); });

  // ── Watch Together ────────────────────────────────────────────────────────
  socket.on('watch-sync', (data) => { if (currentRoom) socket.to(currentRoom).emit('watch-sync', data); });

  // ── Games relay ───────────────────────────────────────────────────────────
  socket.on('game-move', (data) => { if (currentRoom) socket.to(currentRoom).emit('game-move', data); });
  socket.on('game-result', async ({ winner } = {}) => {
    if (!currentRoom) return;
    const scores = await mStore.updateGameScore(currentRoom, winner || null);
    io.to(currentRoom).emit('score-update', scores);
  });

  // ── Nudge / Haptic ────────────────────────────────────────────────────────
  socket.on('nudge', () => { if (currentRoom) socket.to(currentRoom).emit('nudge', { from: username }); });
  socket.on('haptic-touch', (data) => { if (currentRoom) socket.to(currentRoom).emit('haptic-touch', data); });

  // ── Shared notebook syncs ─────────────────────────────────────────────────
  socket.on('update-diary', async (diary) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(diary)?diary:[]).map(d=>({ date:String(d.date||''), text:String(d.text||'').slice(0,500), image:String(d.image||'') })).slice(0,100);
    await mStore.updateRoomMeta(currentRoom, { diary: safe });
    io.to(currentRoom).emit('diary-update', safe);
  });
  socket.on('update-bucketlist', async (list) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(list)?list:[]).map(b=>({ text:String(b.text||'').slice(0,100), done:Boolean(b.done), dateCompleted:b.dateCompleted||null })).slice(0,100);
    await mStore.updateRoomMeta(currentRoom, { bucketList: safe });
    io.to(currentRoom).emit('bucketlist-update', safe);
  });
  socket.on('update-calendar', async (cal) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(cal)?cal:[]).map(c=>({ label:String(c.label||'').slice(0,100), date:String(c.date||'') })).slice(0,50);
    await mStore.updateRoomMeta(currentRoom, { calendar: safe });
    io.to(currentRoom).emit('calendar-update', safe);
  });
  socket.on('update-glossary', async (words) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(words)?words:[]).map(w=>({ word:String(w.word||'').toLowerCase().trim().slice(0,30), meaning:String(w.meaning||'').slice(0,200) })).slice(0,50);
    await mStore.updateRoomMeta(currentRoom, { glossary: safe });
    io.to(currentRoom).emit('glossary-update', safe);
  });
  socket.on('update-bonsai', async (bonsaiState) => {
    if (!currentRoom) return;
    const current = (await mStore.getRoomMeta(currentRoom)).bonsai || { growth:0, lastWatered:null };
    const updated = {
      growth: typeof bonsaiState.growth==='number' ? bonsaiState.growth : current.growth,
      lastWatered: bonsaiState.lastWatered || current.lastWatered
    };
    await mStore.updateRoomMeta(currentRoom, { bonsai: updated });
    io.to(currentRoom).emit('bonsai-update', updated);
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (username && currentRoom) {
      const roomUsers = getRoomUsers(currentRoom);
      roomUsers.delete(socket.id);
      if (roomUsers.size === 0) rooms.delete(currentRoom);
      mStore.setLastSeen(username);
      socket.to(currentRoom).emit('system', randomLeaveMessage(username));
      broadcastPresence(currentRoom);
    }
  });
});

// ── Periodic cleanup ──────────────────────────────────────────────────────────
setInterval(() => mStore.cleanExpiredRooms().catch(()=>{}), 24 * 60 * 60 * 1000);
setInterval(() => mStore.cleanDisappearingMessages().catch(()=>{}), 60 * 1000);

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`✨ hmmumm running on port ${PORT}`));
}

module.exports = { app, server };
