'use strict';
// mongoStore.js — async data layer using MongoDB (replaces store.js for data ops)
// File uploads still use local filesystem for Railway ephemeral storage
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');
const mongoose= require('mongoose');

const User    = require('./models/User');
const Message = require('./models/Message');
const Room    = require('./models/Room');
const PushSub = require('./models/PushSub');

// ── In-memory caches (Fallback when no MongoDB) ──────────────────────────────
const profileCache  = new Map(); // username → profile obj
const lastSeenCache = new Map(); // username → timestamp
const feelingsCache = new Map(); // username → feeling obj
const activityCache = new Map(); // username → { date, streak }
const memRooms      = new Map(); // roomName → room obj
const memMessages   = new Map(); // roomName → array of messages

// ── MongoDB connection guard ─────────────────────────────────────────────────
function isConnected() {
  return mongoose.connection.readyState === 1;
}

// ── FEELINGS palette ─────────────────────────────────────────────────────────
const FEELINGS = {
  happy:   { emoji: '😊', label: 'Happy' },
  sad:     { emoji: '😢', label: 'Sad' },
  excited: { emoji: '🎉', label: 'Excited' },
  tired:   { emoji: '😴', label: 'Tired' },
  love:    { emoji: '💕', label: 'In Love' },
  anxious: { emoji: '😰', label: 'Anxious' },
  cozy:    { emoji: '🍵', label: 'Cozy' },
  bored:   { emoji: '😑', label: 'Bored' }
};

// ── Default room meta ────────────────────────────────────────────────────────
function defaultRoomMeta(roomName = '') {
  return {
    name: roomName,
    mood: '', jokes: [], countdown: {}, pinnedMessageId: null,
    disappearingTimer: 0, roomPassword: '', messageCount: 0,
    milestonesHit: [], readBy: {}, diary: [], bucketList: [],
    calendar: [], glossary: [], bonsai: { growth: 0, lastWatered: null },
    gameScores: { wins: {}, losses: {} }, sharedPad: '', lastActivity: Date.now()
  };
}

// ── Room operations ──────────────────────────────────────────────────────────
async function getRoomMeta(roomName) {
  if (!roomName) return defaultRoomMeta();
  if (!isConnected()) {
    if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
    return memRooms.get(roomName);
  }
  let room = await Room.findOne({ name: roomName }).lean();
  if (!room) {
    const created = await Room.create({ name: roomName });
    room = created.toObject();
  }
  return room;
}

async function updateRoomMeta(roomName, updates) {
  if (!roomName) return;
  if (!isConnected()) {
    if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
    Object.assign(memRooms.get(roomName), updates, { lastActivity: Date.now() });
    return;
  }
  await Room.findOneAndUpdate(
    { name: roomName },
    { $set: { ...updates, lastActivity: Date.now() } },
    { upsert: true }
  );
}

// ── Message operations ───────────────────────────────────────────────────────
async function getMessages(roomName, limit = 100) {
  if (!isConnected()) {
    return (memMessages.get(roomName) || []).slice(-limit);
  }
  return Message.find({ room: roomName })
    .sort({ time: -1 }).limit(limit).lean().then(r => r.reverse());
}

const MILESTONES = [10, 25, 50, 100, 200, 500, 1000];

async function addMessage(roomName, msgData) {
  const message = {
    id: crypto.randomUUID(),
    ...msgData,
    time: Date.now(),
    reactions: {},
    room: roomName
  };

  if (!isConnected()) {
    if (!memMessages.has(roomName)) memMessages.set(roomName, []);
    memMessages.get(roomName).push(message);
    const count = memMessages.get(roomName).length;
    if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
    const room = memRooms.get(roomName);
    room.messageCount = count;
    room.lastActivity = Date.now();
    
    const milestone = MILESTONES.find(m => m === count && !(room.milestonesHit || []).includes(m));
    if (milestone) {
      if (!room.milestonesHit) room.milestonesHit = [];
      room.milestonesHit.push(milestone);
      return { message, milestone };
    }
    return { message, milestone: null };
  }

  await Message.create({ ...message, room: roomName });
  const count = await Message.countDocuments({ room: roomName });
  const room = await Room.findOneAndUpdate(
    { name: roomName },
    { $set: { messageCount: count, lastActivity: Date.now() } },
    { upsert: true, new: true }
  ).lean();

  const milestone = MILESTONES.find(
    m => m === count && !(room.milestonesHit || []).includes(m)
  );
  if (milestone) {
    await Room.findOneAndUpdate({ name: roomName }, { $addToSet: { milestonesHit: milestone } });
    return { message, milestone };
  }
  return { message, milestone: null };
}

async function editMessage(roomName, messageId, text) {
  const editedAt = Date.now();
  if (!isConnected()) {
    const msgs = memMessages.get(roomName) || [];
    const msg = msgs.find(m => m.id === messageId);
    if (msg) { msg.text = text; msg.editedAt = editedAt; return msg; }
    return null;
  }
  return Message.findOneAndUpdate(
    { id: messageId, room: roomName },
    { $set: { text, editedAt } },
    { new: true }
  ).lean();
}

async function deleteMessage(roomName, messageId) {
  if (!isConnected()) {
    const msgs = memMessages.get(roomName) || [];
    const msg = msgs.find(m => m.id === messageId);
    if (msg) { msg.deleted = true; msg.text = '🗑️ Message deleted'; msg.url = ''; }
    return;
  }
  await Message.findOneAndUpdate(
    { id: messageId, room: roomName },
    { $set: { deleted: true, text: '🗑️ Message deleted', url: '' } }
  );
}

async function clearHistory(roomName) {
  if (!isConnected()) {
    memMessages.set(roomName, []);
    if (memRooms.has(roomName)) {
      const room = memRooms.get(roomName);
      room.messageCount = 0;
      room.milestonesHit = [];
      room.pinnedMessageId = null;
    }
    return;
  }
  await Message.deleteMany({ room: roomName });
  await Room.findOneAndUpdate({ name: roomName }, {
    $set: { messageCount: 0, milestonesHit: [], pinnedMessageId: null }
  });
}

async function pinMessage(roomName, messageId) {
  if (!isConnected()) {
    if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
    memRooms.get(roomName).pinnedMessageId = messageId;
    return;
  }
  await Room.findOneAndUpdate(
    { name: roomName },
    { $set: { pinnedMessageId: messageId } },
    { upsert: true }
  );
}

async function findMessage(roomName, messageId) {
  if (!isConnected()) {
    const msgs = memMessages.get(roomName) || [];
    return msgs.find(m => m.id === messageId) || null;
  }
  return Message.findOne({ id: messageId, room: roomName }).lean();
}

async function updateReadReceipt(roomName, username, messageId) {
  if (!isConnected()) {
    const msgs = memMessages.get(roomName) || [];
    const msg = msgs.find(m => m.id === messageId);
    if (!msg) return {};
    if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
    const room = memRooms.get(roomName);
    if (!room.readBy) room.readBy = {};
    room.readBy[username] = msg.time;
    return room.readBy;
  }
  const msg = await Message.findOne({ id: messageId, room: roomName }).lean();
  if (!msg) return {};
  const update = {};
  update[`readBy.${username}`] = msg.time;
  await Room.findOneAndUpdate({ name: roomName }, { $set: update }, { upsert: true });
  const room = await Room.findOne({ name: roomName }).lean();
  return room ? (room.readBy || {}) : {};
}

async function updateMessageReaction(roomName, messageId, emoji, username, add) {
  if (!isConnected()) {
    const msgs = memMessages.get(roomName) || [];
    const msg = msgs.find(m => m.id === messageId);
    if (!msg) return null;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    
    const idx = msg.reactions[emoji].indexOf(username);
    if (add === false || idx !== -1) {
      msg.reactions[emoji] = msg.reactions[emoji].filter(u => u !== username);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push(username);
    }
    return msg;
  }
  const msg = await Message.findOne({ id: messageId, room: roomName });
  if (!msg) return null;
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

  const idx = msg.reactions[emoji].indexOf(username);
  if (add === false || idx !== -1) {
    msg.reactions[emoji] = msg.reactions[emoji].filter(u => u !== username);
    if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
  } else {
    msg.reactions[emoji].push(username);
  }
  msg.markModified('reactions');
  await msg.save();
  return msg.toObject ? msg.toObject() : msg;
}

// ── Profile operations ───────────────────────────────────────────────────────
async function getProfile(username) {
  if (profileCache.has(username)) return { ...profileCache.get(username) };
  if (isConnected()) {
    const user = await User.findOne({ username: username.toLowerCase() }).lean();
    if (user) {
      const p = { avatar: user.avatar || '✨', color: user.color || '#818cf8', statusBio: user.statusBio || '', nickname: user.nickname || '' };
      profileCache.set(username, p);
      return { ...p };
    }
  }
  const def = { avatar: '✨', color: '#818cf8', statusBio: '', nickname: '' };
  profileCache.set(username, def);
  return { ...def };
}

async function updateProfile(username, updates) {
  const current = await getProfile(username);
  const updated = { ...current, ...updates };
  profileCache.set(username, updated);
  if (isConnected()) {
    await User.findOneAndUpdate({ username: username.toLowerCase() }, { $set: updates }).catch(() => {});
  }
  return updated;
}

// ── Last seen ────────────────────────────────────────────────────────────────
function setLastSeen(username) {
  lastSeenCache.set(username, Date.now());
  if (isConnected()) {
    User.findOneAndUpdate({ username: username.toLowerCase() }, { $set: { lastSeen: Date.now() } }).catch(() => {});
  }
}
function getLastSeen() {
  const obj = {};
  for (const [k, v] of lastSeenCache) obj[k] = v;
  return obj;
}

// ── Activity / streak ────────────────────────────────────────────────────────
function recordActivity(username) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const entry = activityCache.get(username) || { date: null, streak: 0 };
  if (entry.date === today) return entry.streak;
  entry.streak = (entry.date === yesterday) ? entry.streak + 1 : 1;
  entry.date = today;
  activityCache.set(username, entry);
  return entry.streak;
}

// ── Feelings ─────────────────────────────────────────────────────────────────
function setFeeling(username, feelingKey) {
  const feeling = FEELINGS[feelingKey];
  if (!feeling) return null;
  feelingsCache.set(username, { key: feelingKey, ...feeling });
  return { key: feelingKey, ...feeling };
}
function getFeelings() {
  const obj = {};
  for (const [k, v] of feelingsCache) obj[k] = v;
  return obj;
}

// ── Game scores ───────────────────────────────────────────────────────────────
async function updateGameScore(roomName, winner) {
  const room = await getRoomMeta(roomName);
  const scores = room.gameScores || { wins: {}, losses: {} };
  if (winner) scores.wins[winner] = (scores.wins[winner] || 0) + 1;
  await updateRoomMeta(roomName, { gameScores: scores });
  return scores;
}

// ── Daily question ───────────────────────────────────────────────────────────
const DAILY_QUESTIONS = [
  'What made you smile today? 😊',
  'If you could teleport anywhere right now, where would you go? 🌍',
  'What song has been stuck in your head? 🎵',
  "What's something you're looking forward to this week? ✨",
  'Share a random fun fact you learned recently 🧠',
  "What's your comfort food right now? 🍕",
  "What's the last thing that made you laugh out loud? 😂",
  'If today were a movie, what genre would it be? 🎬',
  "What's one small thing that made today better? 🌟",
  'What are you grateful for right now? 💕',
  "What's your dream weekend look like? 🌴",
  "What's your current obsession? 🔥",
  "What's a memory that always makes you happy? 💭",
  'What is your current vibe in one emoji? 🎭',
  'What movie or show should we watch together? 📺',
];
function getDailyQuestion() {
  const day = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (const c of day) hash = (hash * 31 + c.charCodeAt(0)) % 1000;
  return DAILY_QUESTIONS[Math.abs(hash) % DAILY_QUESTIONS.length];
}
function getMotd() { return ''; }

// ── File uploads ─────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
function getUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return UPLOADS_DIR;
}
function saveUpload(buffer, ext) {
  const dir = getUploadsDir();
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

// ── Push subscriptions ───────────────────────────────────────────────────────
async function savePushSub(username, subscription) {
  if (!isConnected()) return;
  await PushSub.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { username, endpoint: subscription.endpoint, keys: subscription.keys || {} },
    { upsert: true }
  );
}
async function deletePushSub(endpoint) {
  if (!isConnected()) return;
  await PushSub.deleteOne({ endpoint });
}
async function getPushSubs() {
  if (!isConnected()) return [];
  return PushSub.find({}).lean();
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanExpiredRooms() {
  if (!isConnected()) return;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const old = await Room.find({ lastActivity: { $lt: cutoff }, type: 'public' }).select('name').lean();
  for (const r of old) {
    await Message.deleteMany({ room: r.name });
    await Room.deleteOne({ name: r.name });
  }
}
async function cleanDisappearingMessages() {
  if (!isConnected()) return;
  const rooms = await Room.find({ disappearingTimer: { $gt: 0 } }).select('name disappearingTimer').lean();
  for (const r of rooms) {
    const cutoff = Date.now() - r.disappearingTimer;
    await Message.deleteMany({ room: r.name, time: { $lt: cutoff }, type: 'text' });
  }
}
function persist() {} // no-op, MongoDB auto-persists

module.exports = {
  FEELINGS,
  getRoomMeta, updateRoomMeta,
  getMessages, addMessage, editMessage, deleteMessage, clearHistory,
  pinMessage, findMessage, updateReadReceipt, updateMessageReaction,
  getProfile, updateProfile,
  setLastSeen, getLastSeen, recordActivity,
  setFeeling, getFeelings,
  updateGameScore,
  getDailyQuestion, getMotd,
  getUploadsDir, saveUpload,
  cleanExpiredRooms, cleanDisappearingMessages, persist,
  savePushSub, deletePushSub, getPushSubs,
};
