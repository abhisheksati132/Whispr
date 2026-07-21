const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const store = require('./store');
const { initDb, migrateLegacyJson, query } = require('./db');
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

// ── VAPID Keys & Push Setup ────────────────────────────────────────────────
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  vapidKeys = webpush.generateVAPIDKeys();
}
webpush.setVapidDetails(
  'mailto:bestie@chat.local',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// ── SQLite DB Initialization ─────────────────────────────────────────────
(async () => {
  try {
    await initDb();
    await migrateLegacyJson();
    console.log('⚡ SQLite Database & Schema Ready');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
})();

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

app.get('/api/daily-question', (_req, res) => {
  res.json({ question: store.getDailyQuestion() });
});

// ── Web Push Notification Endpoints ─────────────────────────────────────────
app.get('/api/push-vapid-key', (_req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/push-subscribe', async (req, res) => {
  try {
    const { username, subscription } = req.body;
    if (!username || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription details' });
    }
    await query.run(
      'INSERT OR REPLACE INTO push_subscriptions (username, endpoint, keys_json, created_at) VALUES (?, ?, ?, ?)',
      [username, subscription.endpoint, JSON.stringify(subscription.keys || {}), Date.now()]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/push-unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    await query.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function sendPushToRoom(room, senderName, titleText, bodyText) {
  try {
    const onlineUsers = new Set();
    const usersMap = rooms.get(room);
    if (usersMap) {
      for (const u of usersMap.values()) onlineUsers.add(u.name);
    }
    
    const subs = await query.all('SELECT username, endpoint, keys_json FROM push_subscriptions');
    for (const sub of subs) {
      if (sub.username !== senderName && !onlineUsers.has(sub.username)) {
        const payload = JSON.stringify({
          title: titleText,
          body: bodyText,
          icon: '/icon-192.png',
          url: '/'
        });
        const pushSub = {
          endpoint: sub.endpoint,
          keys: JSON.parse(sub.keys_json || '{}')
        };
        webpush.sendNotification(pushSub, payload).catch((err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            query.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]).catch(() => {});
          }
        });
      }
    }
  } catch (err) {
    console.error('Push notification error:', err);
  }
}

// ── OpenGraph Link Scraper ──────────────────────────────────────────────────
app.get('/api/link-preview', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url' });
  try {
    const parsedUrl = new URL(targetUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Invalid protocol' });
    }
    const host = parsedUrl.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
      return res.status(400).json({ error: 'Disallowed host' });
    }
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BestieChatLinkPreview/1.0)' }
    });
    clearTimeout(timer);
    
    if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch link' });
    const html = await response.text();
    
    const getMeta = (propName) => {
      const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${propName}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(regex);
      if (match) return match[1];
      const altRegex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${propName}["']`, 'i');
      const altMatch = html.match(altRegex);
      return altMatch ? altMatch[1] : '';
    };
    
    let title = getMeta('og:title') || getMeta('twitter:title');
    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = titleMatch ? titleMatch[1].trim() : '';
    }
    
    const description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description');
    const image = getMeta('og:image') || getMeta('twitter:image');
    
    res.json({
      title: title || parsedUrl.hostname,
      description: description || '',
      image: image || '',
      url: targetUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── File Upload ────────────────────────────────────────────────────────────
app.post('/api/upload', (req, res) => {
  try {
    const { data, mime, kind } = req.body;
    if (!data || !mime) return res.status(400).json({ error: 'Missing data or mime' });
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/webm', 'audio/ogg'];
    if (!allowed.includes(mime)) return res.status(400).json({ error: 'Unsupported mime type' });
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const base64Data = (data.includes(',') ? data.split(',')[1] : data).trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      return res.status(400).json({ error: 'Invalid base64 payload' });
    }
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
const roomPictionaryState = new Map(); // Map<room, {word, drawer}>

const PICTIONARY_WORDS = [
  'cat', 'sun', 'pizza', 'tree', 'heart', 'coffee', 'star', 'cake', 'rainbow', 'moon',
  'guitar', 'flower', 'butterfly', 'icecream', 'camera', 'cookie', 'balloon', 'house', 'car', 'smile'
];

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

  let msgCount = 0;
  let msgResetAt = Date.now() + 5000;

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
      readBy: roomState.readBy || {},
      diary: roomState.diary || [],
      bucketList: roomState.bucketList || [],
      calendar: roomState.calendar || [],
      glossary: roomState.glossary || [],
      bonsai: roomState.bonsai || { growth: 0, lastWatered: null },
      gameScores: roomState.gameScores || { wins: {}, losses: {} }
    });

    io.to(currentRoom).emit('system', randomJoinMessage(profile.nickname || username));
    broadcastPresence(currentRoom);
  });

  // ── Message ─────────────────────────────────────────────────────────
  socket.on('message', (payload) => {
    if (!username || !currentRoom) return;

    const _now = Date.now();
    if (_now > msgResetAt) { msgCount = 0; msgResetAt = _now + 5000; }
    msgCount++;
    if (msgCount > 10) { socket.emit('rate-limited', { message: 'Slow down! Take a breath.' }); return; }

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
      if (payload.replyTo && msgData && !msgData.replyTo) {
        msgData.replyTo = payload.replyTo;
      }
    } else {
      return;
    }

    const { message, milestone } = store.addMessage(currentRoom, msgData);
    store.setLastSeen(username);
    io.to(currentRoom).emit('message', message);

    // Send push notification to offline bestie
    sendPushToRoom(currentRoom, username, `${store.getProfile(username).nickname || username} 💌`, msgData.text || 'sent a message');

    // Check Pictionary Game Guessing
    const pState = roomPictionaryState.get(currentRoom);
    if (pState && msgData.text && msgData.user !== pState.drawer) {
      const cleanGuess = msgData.text.trim().toLowerCase();
      if (cleanGuess === pState.word.toLowerCase()) {
        roomPictionaryState.delete(currentRoom);
        const profile = store.getProfile(username);
        const display = profile.nickname || username;
        const scores = store.updateGameScore(currentRoom, username);
        io.to(currentRoom).emit('score-update', scores);
        io.to(currentRoom).emit('pictionary-correct', { winner: display, word: pState.word });
        io.to(currentRoom).emit('system', `🎉 ${display} guessed the secret word: "${pState.word}"!! 🏆`);
      }
    }

    if (milestone) {
      io.to(currentRoom).emit('milestone', {
        count: milestone,
        text: MILESTONE_TEXTS[milestone] || `🎉 ${milestone} messages!`
      });
    }
  });

  // ── Secret message ──────────────────────────────────────────────────
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
    if (type === 'pictionary') {
      const word = PICTIONARY_WORDS[Math.floor(Math.random() * PICTIONARY_WORDS.length)];
      const profile = store.getProfile(username);
      const display = profile.nickname || username;
      roomPictionaryState.set(currentRoom, { word, drawer: username });
      socket.emit('pictionary-word', { word });
      io.to(currentRoom).emit('pictionary-start', { drawer: display });
      io.to(currentRoom).emit('system', `🎨 ${display} started Pictionary! Guess their drawing in chat!`);
      return;
    }
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
    sendPushToRoom(currentRoom, username, `${profile.nickname || username} 💓`, 'sent you an empathy pulse');
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

  // ── WebRTC Calling Relays ──────────────────────────────────────────
  socket.on('call-invite', (payload) => {
    if (currentRoom) {
      socket.to(currentRoom).emit('call-invite', { from: username, offer: payload.offer, type: payload.type });
      sendPushToRoom(currentRoom, username, `Incoming ${payload.type || 'voice'} call! 📞`, `From ${username}`);
    }
  });

  socket.on('call-accept', (payload) => {
    if (currentRoom) socket.to(currentRoom).emit('call-accept', { answer: payload.answer });
  });

  socket.on('call-decline', () => {
    if (currentRoom) socket.to(currentRoom).emit('call-decline');
  });

  socket.on('call-candidate', (payload) => {
    if (currentRoom) socket.to(currentRoom).emit('call-candidate', { candidate: payload.candidate });
  });

  socket.on('call-hangup', () => {
    if (currentRoom) socket.to(currentRoom).emit('call-hangup');
  });

  // ── Co-Draw Shared Whiteboard ──
  socket.on('draw-stroke', (data) => {
    if (currentRoom) socket.to(currentRoom).emit('draw-stroke', data);
  });
  socket.on('draw-clear', () => {
    if (currentRoom) socket.to(currentRoom).emit('draw-clear');
  });

  // ── Watch Together synced player ──
  socket.on('watch-sync', (data) => {
    if (currentRoom) socket.to(currentRoom).emit('watch-sync', data);
  });

  // ── Tic-Tac-Toe multiplayer game ──
  socket.on('game-move', (data) => {
    if (currentRoom) socket.to(currentRoom).emit('game-move', data);
  });

  socket.on('game-result', ({ winner } = {}) => {
    if (!currentRoom) return;
    const scores = store.updateGameScore(currentRoom, winner || null);
    io.to(currentRoom).emit('score-update', scores);
  });

  // ── Screen Nudge / Buzz ──
  socket.on('nudge', () => {
    if (currentRoom) socket.to(currentRoom).emit('nudge', { from: username });
  });

  // ── Haptic Touch sync ──
  socket.on('haptic-touch', (data) => {
    if (currentRoom) socket.to(currentRoom).emit('haptic-touch', data);
  });

  // ── Shared Notebook State Syncs ──
  socket.on('update-diary', (diary) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(diary) ? diary : []).map(d => ({
      date: String(d.date || ''),
      text: String(d.text || '').slice(0, 500),
      image: String(d.image || '')
    })).slice(0, 100);
    store.updateRoomMeta(currentRoom, { diary: safe });
    io.to(currentRoom).emit('diary-update', safe);
  });

  socket.on('update-bucketlist', (list) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(list) ? list : []).map(b => ({
      text: String(b.text || '').slice(0, 100),
      done: Boolean(b.done),
      dateCompleted: b.dateCompleted || null
    })).slice(0, 100);
    store.updateRoomMeta(currentRoom, { bucketList: safe });
    io.to(currentRoom).emit('bucketlist-update', safe);
  });

  socket.on('update-calendar', (cal) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(cal) ? cal : []).map(c => ({
      label: String(c.label || '').slice(0, 100),
      date: String(c.date || '')
    })).slice(0, 50);
    store.updateRoomMeta(currentRoom, { calendar: safe });
    io.to(currentRoom).emit('calendar-update', safe);
  });

  socket.on('update-glossary', (words) => {
    if (!currentRoom) return;
    const safe = (Array.isArray(words) ? words : []).map(w => ({
      word: String(w.word || '').toLowerCase().trim().slice(0, 30),
      meaning: String(w.meaning || '').slice(0, 200)
    })).slice(0, 50);
    store.updateRoomMeta(currentRoom, { glossary: safe });
    io.to(currentRoom).emit('glossary-update', safe);
  });

  socket.on('update-bonsai', (bonsaiState) => {
    if (!currentRoom) return;
    const current = store.getRoom(currentRoom).bonsai || { growth: 0, lastWatered: null };
    const growth = typeof bonsaiState.growth === 'number' ? bonsaiState.growth : current.growth;
    const lastWatered = bonsaiState.lastWatered || current.lastWatered;
    const updated = { growth, lastWatered };
    store.updateRoomMeta(currentRoom, { bonsai: updated });
    io.to(currentRoom).emit('bonsai-update', updated);
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

// Clean expired rooms on startup and every 24h
store.cleanExpiredRooms();
setInterval(store.cleanExpiredRooms, 24 * 60 * 60 * 1000);

// ── Start server ───────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Bestie Chat running on port ${PORT}`));
}

module.exports = { app, server };
