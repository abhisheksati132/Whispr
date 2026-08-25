'use strict';
// supabaseStore.js — asynchronous data layer powered by Supabase (PostgreSQL)
// Complete 1:1 drop-in replacement for mongoStore.js with in-memory resilient caching.
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const { supabase, isConfigured } = require('./supabaseClient');
const { sanitizePostgrestValue } = require('./chat-utils');

// ── In-memory caches (Fallback when no Supabase configured or offline) ────────
const profileCache  = new Map(); // username → profile obj
const lastSeenCache = new Map(); // username → timestamp
const feelingsCache = new Map(); // username → feeling obj
const activityCache = new Map(); // username → { date, streak }
const memRooms      = new Map(); // roomName → room obj
const memMessages   = new Map(); // roomName → array of messages
const memUsers      = new Map(); // username → user obj
const memPushSubs   = new Map(); // endpoint → sub obj
const memMedia      = new Map(); // filename → media obj

function isDbReady() {
  return isConfigured();
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

const MILESTONES = [10, 25, 50, 100, 200, 500, 1000];

const MOTD_PROMPTS = [
  'Tell them one thing you appreciated today 💛',
  'Send a random memory you love 🫶',
  'Share something that made you smile today 😊',
  'Ask your bestie how they really feel right now 💭',
  'Send a song lyric that reminds you of them 🎵',
  'Drop your current mood in one emoji 🎭',
  'Share a photo from your camera roll 📸',
  'Tell them something you are proud of them for ⭐'
];

// ── Data Transform Helpers (CamelCase <-> SnakeCase) ─────────────────────────
function dbRoomToJs(r) {
  if (!r) return null;
  return {
    name:               r.name,
    type:               r.type || 'public',
    participants:       r.participants || [],
    mood:               r.mood || '',
    jokes:              r.jokes || [],
    countdown:          r.countdown || {},
    pinnedMessageId:    r.pinned_message_id || null,
    disappearingTimer:  Number(r.disappearing_timer || 0),
    roomPassword:       r.room_password || '',
    messageCount:       Number(r.message_count || 0),
    milestonesHit:      r.milestones_hit || [],
    readBy:             r.read_by || {},
    diary:              r.diary || [],
    bucketList:         r.bucket_list || [],
    calendar:           r.calendar || [],
    glossary:           r.glossary || [],
    bonsai:             r.bonsai || { growth: 0, lastWatered: null },
    gameScores:         r.game_scores || { wins: {}, losses: {} },
    dailyQuestionState: r.daily_question_state || {},
    sharedPad:          r.shared_pad || '',
    lastActivity:       Number(r.last_activity || Date.now()),
    createdAt:          Number(r.created_at || Date.now())
  };
}

function jsRoomToDb(r) {
  if (!r) return {};
  const out = {};
  if (r.name !== undefined)               out.name = r.name;
  if (r.type !== undefined)               out.type = r.type;
  if (r.participants !== undefined)       out.participants = r.participants;
  if (r.mood !== undefined)               out.mood = r.mood;
  if (r.jokes !== undefined)              out.jokes = r.jokes;
  if (r.countdown !== undefined)          out.countdown = r.countdown;
  if (r.pinnedMessageId !== undefined)    out.pinned_message_id = r.pinnedMessageId;
  if (r.disappearingTimer !== undefined)  out.disappearing_timer = r.disappearingTimer;
  if (r.roomPassword !== undefined)       out.room_password = r.roomPassword;
  if (r.messageCount !== undefined)       out.message_count = r.messageCount;
  if (r.milestonesHit !== undefined)      out.milestones_hit = r.milestonesHit;
  if (r.readBy !== undefined)             out.read_by = r.readBy;
  if (r.diary !== undefined)              out.diary = r.diary;
  if (r.bucketList !== undefined)         out.bucket_list = r.bucketList;
  if (r.calendar !== undefined)           out.calendar = r.calendar;
  if (r.glossary !== undefined)           out.glossary = r.glossary;
  if (r.bonsai !== undefined)             out.bonsai = r.bonsai;
  if (r.gameScores !== undefined)         out.game_scores = r.gameScores;
  if (r.dailyQuestionState !== undefined) out.daily_question_state = r.dailyQuestionState;
  if (r.sharedPad !== undefined)          out.shared_pad = r.sharedPad;
  if (r.lastActivity !== undefined)       out.last_activity = r.lastActivity;
  if (r.createdAt !== undefined)          out.created_at = r.createdAt;
  return out;
}

function dbMsgToJs(m) {
  if (!m) return null;
  return {
    id:           m.id,
    room:         m.room,
    user:         m.user,
    text:         m.text || '',
    type:         m.type || 'text',
    url:          m.url || '',
    duration:     m.duration || 0,
    replyTo:      m.reply_to || null,
    reactions:    m.reactions || {},
    votes:        m.votes || {},
    deliveredTo:  m.delivered_to || [],
    readByUsers:  m.read_by_users || [],
    starredBy:    m.starred_by || [],
    editedAt:     Number(m.edited_at || 0),
    deleted:      Boolean(m.deleted),
    expired:      Boolean(m.expired),
    time:         Number(m.time)
  };
}

function jsMsgToDb(m) {
  if (!m) return {};
  const out = {};
  if (m.id !== undefined)          out.id = m.id;
  if (m.room !== undefined)        out.room = m.room;
  if (m.user !== undefined)        out.user = m.user;
  if (m.text !== undefined)        out.text = m.text;
  if (m.type !== undefined)        out.type = m.type;
  if (m.url !== undefined)         out.url = m.url;
  if (m.duration !== undefined)    out.duration = m.duration;
  if (m.replyTo !== undefined)     out.reply_to = m.replyTo;
  if (m.reactions !== undefined)   out.reactions = m.reactions;
  if (m.votes !== undefined)       out.votes = m.votes;
  if (m.deliveredTo !== undefined) out.delivered_to = m.deliveredTo;
  if (m.readByUsers !== undefined) out.read_by_users = m.readByUsers;
  if (m.starredBy !== undefined)   out.starred_by = m.starredBy;
  if (m.editedAt !== undefined)    out.edited_at = m.editedAt;
  if (m.deleted !== undefined)     out.deleted = m.deleted;
  if (m.expired !== undefined)     out.expired = m.expired;
  if (m.time !== undefined)        out.time = m.time;
  return out;
}

function dbUserToJs(u) {
  if (!u) return null;
  return {
    username:  u.username,
    pinHash:   u.pin_hash,
    avatar:    u.avatar || '✨',
    color:     u.color || '#818cf8',
    statusBio: u.status_bio || '',
    nickname:  u.nickname || '',
    lastSeen:  Number(u.last_seen || Date.now()),
    createdAt: Number(u.created_at || Date.now())
  };
}

// ── Default room meta ────────────────────────────────────────────────────────
function defaultRoomMeta(roomName = '') {
  return {
    name: roomName,
    type: 'public',
    participants: [],
    mood: '', jokes: [], countdown: {}, pinnedMessageId: null,
    disappearingTimer: 0, roomPassword: '', messageCount: 0,
    milestonesHit: [], readBy: {}, diary: [], bucketList: [],
    calendar: [], glossary: [], bonsai: { growth: 0, lastWatered: null },
    gameScores: { wins: {}, losses: {} }, dailyQuestionState: {}, sharedPad: '',
    lastActivity: Date.now(), createdAt: Date.now()
  };
}

// ── Room operations ──────────────────────────────────────────────────────────
async function getRoomMeta(roomName) {
  if (!roomName) return defaultRoomMeta();
  if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
  const memRoom = memRooms.get(roomName);

  if (!isDbReady()) {
    return memRoom;
  }
  try {
    const { data, error } = await supabase.from('rooms').select('*').eq('name', roomName).single();
    if (error && error.code === 'PGRST116') {
      // Row not found -> create default in Supabase
      const newRoom = defaultRoomMeta(roomName);
      await supabase.from('rooms').insert([jsRoomToDb(newRoom)]).catch(() => {});
      return newRoom;
    }
    if (error || !data) {
      return memRoom;
    }
    const jsRoom = dbRoomToJs(data);
    memRooms.set(roomName, jsRoom);
    return jsRoom;
  } catch (err) {
    console.error('getRoomMeta error:', err.message);
    return memRoom;
  }
}

// Pure existence probe — no insert side effects (unlike getRoomMeta).
async function roomExists(roomName) {
  const name = String(roomName || '');
  if (!name) return false;
  if (!isDbReady()) return memRooms.has(name);
  try {
    const { data } = await supabase.from('rooms').select('name').eq('name', name).maybeSingle();
    return Boolean(data) || memRooms.has(name);
  } catch (_) {
    return memRooms.has(name);
  }
}

async function updateRoomMeta(roomName, updates) {
  if (!roomName) return;
  const now = Date.now();
  if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
  Object.assign(memRooms.get(roomName), updates, { lastActivity: now });

  if (isDbReady()) {
    try {
      const dbUpdates = jsRoomToDb({ ...updates, lastActivity: now });
      const { error } = await supabase.from('rooms').upsert({ name: roomName, ...dbUpdates }, { onConflict: 'name' });
      if (error) console.error('updateRoomMeta Supabase notice:', error.message);
    } catch (err) {
      console.error('updateRoomMeta error:', err.message);
    }
  }
}

// ── Message operations ───────────────────────────────────────────────────────
async function getMessages(roomName, limit = 100) {
  if (!memMessages.has(roomName)) memMessages.set(roomName, []);
  const memList = memMessages.get(roomName);

  if (!isDbReady()) {
    return memList.slice(-limit);
  }
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room', roomName)
      .order('time', { ascending: false })
      .limit(limit);

    if (error || !data || data.length === 0) {
      return memList.slice(-limit);
    }
    const dbList = data.map(dbMsgToJs).reverse();
    if (memList.length < dbList.length) {
      memMessages.set(roomName, dbList);
    }
    return dbList;
  } catch (err) {
    console.error('getMessages error:', err.message);
    return memList.slice(-limit);
  }
}

async function addMessage(roomName, msgData) {
  const message = {
    id: crypto.randomUUID(),
    ...msgData,
    time: Date.now(),
    reactions: {},
    votes: {},
    deliveredTo: [],
    readByUsers: [],
    starredBy: [],
    editedAt: 0,
    deleted: false,
    expired: false,
    room: roomName
  };

  // 1. Write to in-memory store immediately so messages NEVER fail or get dropped!
  if (!memMessages.has(roomName)) memMessages.set(roomName, []);
  const msgs = memMessages.get(roomName);
  msgs.push(message);
  if (msgs.length > 500) msgs.shift();
  const count = msgs.length;
  if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
  const room = memRooms.get(roomName);
  room.messageCount = count;
  room.lastActivity = Date.now();

  const milestone = MILESTONES.find(m => m === count && !(room.milestonesHit || []).includes(m));
  if (milestone) {
    if (!room.milestonesHit) room.milestonesHit = [];
    room.milestonesHit.push(milestone);
  }

  // 2. Also persist to Supabase if configured
  if (isDbReady()) {
    try {
      const { error } = await supabase.from('messages').insert([jsMsgToDb(message)]);
      if (error) console.error('Supabase message insert notice:', error.message);

      const roomMeta = await getRoomMeta(roomName);
      const updates = { messageCount: count, lastActivity: Date.now() };
      if (milestone) {
        updates.milestonesHit = [...(roomMeta.milestonesHit || []), milestone];
      }
      await updateRoomMeta(roomName, updates);
    } catch (err) {
      console.error('addMessage Supabase error:', err.message);
    }
  }

  return { message, milestone: milestone || null };
}

async function editMessage(roomName, messageId, text) {
  const editedAt = Date.now();
  const msgs = memMessages.get(roomName) || [];
  const msg = msgs.find(m => m.id === messageId);
  if (msg) { msg.text = text; msg.editedAt = editedAt; }

  if (isDbReady()) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .update({ text, edited_at: editedAt })
        .eq('id', messageId)
        .eq('room', roomName)
        .select()
        .single();

      if (!error && data) return dbMsgToJs(data);
    } catch (err) {
      console.error('editMessage error:', err.message);
    }
  }
  return msg || null;
}

async function markViewOnceOpened(roomName, messageId) {
  const msgs = memMessages.get(roomName) || [];
  const msg = msgs.find(m => m.id === messageId);
  if (msg) { msg.opened = true; msg.url = ''; }

  if (isDbReady()) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .update({ url: '' })
        .eq('id', messageId)
        .eq('room', roomName)
        .select()
        .single();

      if (!error && data) return dbMsgToJs(data);
    } catch (err) {
      console.error('markViewOnceOpened error:', err.message);
    }
  }
  return msg || null;
}

async function deleteMessage(roomName, messageId) {
  const msgs = memMessages.get(roomName) || [];
  const msg = msgs.find(m => m.id === messageId);
  if (msg) { msg.deleted = true; msg.text = '🗑️ Message deleted'; msg.url = ''; }

  if (isDbReady()) {
    try {
      await supabase
        .from('messages')
        .update({ deleted: true, text: '🗑️ Message deleted', url: '' })
        .eq('id', messageId)
        .eq('room', roomName);
    } catch (err) {
      console.error('deleteMessage error:', err.message);
    }
  }
  return msg || null;
}

async function clearHistory(roomName) {
  memMessages.set(roomName, []);
  if (memRooms.has(roomName)) {
    const room = memRooms.get(roomName);
    room.messageCount = 0;
    room.milestonesHit = [];
    room.pinnedMessageId = null;
  }

  if (isDbReady()) {
    try {
      await supabase.from('messages').delete().eq('room', roomName);
      await updateRoomMeta(roomName, { messageCount: 0, milestonesHit: [], pinnedMessageId: null });
    } catch (err) {
      console.error('clearHistory error:', err.message);
    }
  }
}

async function pinMessage(roomName, messageId) {
  await updateRoomMeta(roomName, { pinnedMessageId: messageId });
}

async function findMessage(roomName, messageId) {
  const msgs = memMessages.get(roomName) || [];
  const local = msgs.find(m => m.id === messageId);
  if (local) return local;

  if (isDbReady()) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .eq('room', roomName)
        .single();

      if (!error && data) return dbMsgToJs(data);
    } catch {
      return null;
    }
  }
  return null;
}

async function updateReadReceipt(roomName, username, messageId) {
  if (!memRooms.has(roomName)) memRooms.set(roomName, defaultRoomMeta(roomName));
  const room = memRooms.get(roomName);
  if (!room.readBy) room.readBy = {};
  const msgs = memMessages.get(roomName) || [];
  const msg = msgs.find(m => m.id === messageId);
  if (msg) room.readBy[username] = msg.time;

  if (isDbReady()) {
    try {
      const dbMsg = await findMessage(roomName, messageId);
      const meta = await getRoomMeta(roomName);
      const readBy = meta.readBy || {};
      if (dbMsg) readBy[username] = dbMsg.time;
      await updateRoomMeta(roomName, { readBy });
      return readBy;
    } catch (err) {
      console.error('updateReadReceipt error:', err.message);
    }
  }
  return room.readBy;
}

async function updateMessageReaction(roomName, messageId, emoji, username, add) {
  const msg = await findMessage(roomName, messageId);
  if (!msg) return null;

  const reactions = msg.reactions || {};
  if (!reactions[emoji]) reactions[emoji] = [];

  const idx = reactions[emoji].indexOf(username);
  if (add === false || idx !== -1) {
    reactions[emoji] = reactions[emoji].filter(u => u !== username);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji].push(username);
  }
  msg.reactions = reactions;

  if (isDbReady()) {
    try {
      await supabase.from('messages').update({ reactions }).eq('id', messageId).eq('room', roomName);
    } catch (err) {
      console.error('updateMessageReaction error:', err.message);
    }
  }
  return msg;
}

async function updatePollVotes(roomName, messageId, votes) {
  const msgs = memMessages.get(roomName) || [];
  const msg = msgs.find(m => m.id === messageId);
  if (msg) msg.votes = votes;

  if (isDbReady()) {
    try {
      await supabase.from('messages').update({ votes }).eq('id', messageId);
    } catch (err) {
      console.error('updatePollVotes error:', err.message);
    }
  }
  return votes;
}

// ── Profile operations ───────────────────────────────────────────────────────
async function getProfile(username) {
  const clean = String(username || '').toLowerCase();
  if (profileCache.has(clean)) return { ...profileCache.get(clean) };
  if (profileCache.has(username)) return { ...profileCache.get(username) };
  if (isDbReady()) {
    try {
      const { data } = await supabase.from('users').select('*').eq('username', clean).single();
      if (data) {
        const p = {
          avatar:    data.avatar || '✨',
          color:     data.color || '#818cf8',
          statusBio: data.status_bio || '',
          nickname:  data.nickname || ''
        };
        profileCache.set(clean, p);
        return { ...p };
      }
    } catch { /* ignore */ }
  }
  if (memUsers.has(clean)) {
    const u = memUsers.get(clean);
    const p = {
      avatar:    u.avatar || '✨',
      color:     u.color || '#818cf8',
      statusBio: u.statusBio || '',
      nickname:  u.nickname || ''
    };
    profileCache.set(clean, p);
    return { ...p };
  }
  const def = { avatar: '✨', color: '#818cf8', statusBio: '', nickname: '' };
  profileCache.set(clean, def);
  return { ...def };
}

async function updateProfile(username, updates) {
  const clean = String(username || '').toLowerCase();
  const current = await getProfile(clean);
  const updated = { ...current, ...updates };
  profileCache.set(clean, updated);
  profileCache.delete(username);
  if (memUsers.has(clean)) {
    Object.assign(memUsers.get(clean), updates);
  }
  if (isDbReady()) {
    try {
      const dbUpdates = {};
      if (updates.avatar !== undefined)    dbUpdates.avatar = updates.avatar;
      if (updates.color !== undefined)     dbUpdates.color = updates.color;
      if (updates.statusBio !== undefined) dbUpdates.status_bio = updates.statusBio;
      if (updates.nickname !== undefined)  dbUpdates.nickname = updates.nickname;
      await supabase.from('users').update(dbUpdates).eq('username', clean);
    } catch { /* ignore */ }
  }
  return updated;
}

// ── User management ─────────────────────────────────────────────────────────
async function getUserByUsername(username) {
  const clean = String(username || '').trim().toLowerCase();
  if (!clean) return null;
  if (!isDbReady()) {
    return memUsers.get(clean) || null;
  }
  try {
    const { data, error } = await supabase.from('users').select('*').eq('username', clean).single();
    if (error || !data) return memUsers.get(clean) || null;
    return dbUserToJs(data);
  } catch (_) {
    return memUsers.get(clean) || null;
  }
}

async function getUserByEmailOrUsername(identifier) {
  const clean = String(identifier || '').trim().toLowerCase();
  if (!clean) return null;
  if (!isDbReady()) {
    // Fallback: search memUsers by username or email
    for (const [uname, u] of memUsers.entries()) {
      if (uname === clean || (u.email && u.email === clean)) return u;
    }
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${sanitizePostgrestValue(clean)},email.eq.${sanitizePostgrestValue(clean)}`)
      .limit(1);
    if (error || !data || data.length === 0) return await getUserByUsername(clean);
    return dbUserToJs(data[0]);
  } catch (_) {
    return await getUserByUsername(clean);
  }
}

async function createUser(userData) {
  const clean = String(userData.username || '').trim().toLowerCase();
  const user = {
    username:  clean,
    pinHash:   userData.pinHash || '',
    email:     userData.email ? String(userData.email).trim().toLowerCase() : null,
    avatar:    userData.avatar || '✨',
    color:     userData.color || '#3390ec',
    statusBio: userData.statusBio || '',
    nickname:  userData.nickname || '',
    lastSeen:  Date.now(),
    createdAt: Date.now()
  };

  memUsers.set(clean, user);
  profileCache.set(clean, {
    avatar:    user.avatar,
    color:     user.color,
    statusBio: user.statusBio,
    nickname:  user.nickname
  });
  if (isDbReady()) {
    try {
      await supabase.from('users').upsert({
        username:   user.username,
        pin_hash:   user.pinHash,
        email:      user.email,
        avatar:     user.avatar,
        color:      user.color,
        status_bio: user.statusBio,
        nickname:   user.nickname,
        last_seen:  user.lastSeen,
        created_at: user.createdAt
      }, { onConflict: 'username' });
    } catch (err) {
      console.error('createUser error:', err.message);
    }
  }
  return user;
}

// ── Last seen ────────────────────────────────────────────────────────────────
function setLastSeen(username) {
  const now = Date.now();
  lastSeenCache.set(username, now);
  if (isDbReady()) {
    supabase.from('users').update({ last_seen: now }).eq('username', username.toLowerCase()).catch(() => {});
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
  if (entry.date === today) return { days: entry.streak, lastDate: entry.date };
  entry.streak = (entry.date === yesterday) ? entry.streak + 1 : 1;
  entry.date = today;
  activityCache.set(username, entry);
  return { days: entry.streak, lastDate: entry.date };
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

function saveUpload(buffer, ext, mime = 'application/octet-stream') {
  const dir = getUploadsDir();
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  try {
    fs.writeFileSync(path.join(dir, filename), buffer);
  } catch { /* ignore */ }

  if (isDbReady()) {
    const base64Data = buffer.toString('base64');
    supabase.from('media').insert([{
      filename,
      data: base64Data,
      mime,
      size: buffer.length,
      created_at: Date.now()
    }]).catch(err => {
      console.error('Failed to save media to Supabase:', err.message);
    });
  }
  return `/uploads/${filename}`;
}

async function getMedia(filename) {
  if (!isDbReady()) return memMedia.get(filename) || null;
  try {
    const { data, error } = await supabase.from('media').select('*').eq('filename', filename).single();
    if (error || !data) return null;
    return {
      filename: data.filename,
      data: Buffer.from(data.data || '', 'base64'),
      mime: data.mime,
      size: data.size
    };
  } catch (_) {
    return null;
  }
}

// ── Push subscriptions ───────────────────────────────────────────────────────
async function savePushSub(username, subscription) {
  if (!isDbReady()) {
    memPushSubs.set(subscription.endpoint, { username, endpoint: subscription.endpoint, keys: subscription.keys || {} });
    return;
  }
  try {
    await supabase.from('push_subs').upsert({
      endpoint: subscription.endpoint,
      username,
      keys: subscription.keys || {},
      created_at: Date.now()
    }, { onConflict: 'endpoint' });
  } catch { /* ignore */ }
}

async function deletePushSub(endpoint) {
  if (!isDbReady()) {
    memPushSubs.delete(endpoint);
    return;
  }
  try {
    await supabase.from('push_subs').delete().eq('endpoint', endpoint);
  } catch { /* ignore */ }
}

async function getPushSubs() {
  if (!isDbReady()) return Array.from(memPushSubs.values());
  try {
    const { data } = await supabase.from('push_subs').select('*');
    return data || [];
  } catch (_) {
    return [];
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanExpiredRooms() {
  if (!isDbReady()) return;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  try {
    const { data: oldRooms } = await supabase
      .from('rooms')
      .select('name')
      .lt('last_activity', cutoff)
      .eq('type', 'temp')
      .not('name', 'in', '("default")');

    if (oldRooms && oldRooms.length) {
      for (const r of oldRooms) {
        await supabase.from('messages').delete().eq('room', r.name);
        await supabase.from('rooms').delete().eq('name', r.name);
      }
    }
  } catch { /* ignore */ }
}

async function cleanDisappearingMessages() {
  if (!isDbReady()) return;
  try {
    const { data: rooms } = await supabase
      .from('rooms')
      .select('name, disappearing_timer')
      .gt('disappearing_timer', 0);

    if (rooms && rooms.length) {
      for (const r of rooms) {
        const cutoff = Date.now() - Number(r.disappearing_timer);
        await supabase
          .from('messages')
          .delete()
          .eq('room', r.name)
          .lt('time', cutoff);
      }
    }
  } catch { /* ignore */ }
}

// ── Message receipts & stars ─────────────────────────────────────────────────
async function markMessageDelivered(roomName, messageId, username) {
  const msg = await findMessage(roomName, messageId);
  if (!msg) return null;
  const delivered = msg.deliveredTo || [];
  if (username && !delivered.includes(username)) delivered.push(username);
  msg.deliveredTo = delivered;

  if (isDbReady()) {
    supabase.from('messages').update({ delivered_to: delivered }).eq('id', messageId).catch(() => {});
  }
  return msg;
}

async function markMessageRead(roomName, messageId, username) {
  const msg = await findMessage(roomName, messageId);
  if (!msg) return null;
  const readBy = msg.readByUsers || [];
  if (username && !readBy.includes(username)) readBy.push(username);
  msg.readByUsers = readBy;

  if (isDbReady()) {
    supabase.from('messages').update({ read_by_users: readBy }).eq('id', messageId).catch(() => {});
  }
  return msg;
}

async function starMessage(roomName, messageId, username, starred) {
  const msg = await findMessage(roomName, messageId);
  if (!msg) return null;
  let starredBy = msg.starredBy || [];
  if (starred) {
    if (!starredBy.includes(username)) starredBy.push(username);
  } else {
    starredBy = starredBy.filter(u => u !== username);
  }
  msg.starredBy = starredBy;

  if (isDbReady()) {
    supabase.from('messages').update({ starred_by: starredBy }).eq('id', messageId).catch(() => {});
  }
  return msg;
}

async function getStarredMessages(roomName, username) {
  if (!isDbReady()) {
    const msgs = memMessages.get(roomName) || [];
    return msgs.filter(m => !m.deleted && m.starredBy && m.starredBy.includes(username));
  }
  try {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('room', roomName)
      .eq('deleted', false)
      .contains('starred_by', [username]);

    return (data || []).map(dbMsgToJs);
  } catch (_) {
    return [];
  }
}

// ── Daily Question Answers ────────────────────────────────────────────────────
async function getDailyQuestionState(roomName, username) {
  const today = new Date().toISOString().slice(0, 10);
  const meta = await getRoomMeta(roomName);
  const dq = meta.dailyQuestionState;
  if (!dq || dq.date !== today) {
    return {
      date: today,
      question: getDailyQuestion(),
      answers: {},
      revealed: false,
      answeredUsers: []
    };
  }

  const userCount = Object.keys(dq.answers || {}).length;
  if (userCount >= 2 && !dq.revealed) {
    dq.revealed = true;
    await updateRoomMeta(roomName, { dailyQuestionState: dq });
  }

  if (!dq.revealed) {
    const maskedAnswers = {};
    for (const [user, val] of Object.entries(dq.answers || {})) {
      if (user === username) {
        maskedAnswers[user] = val;
      } else {
        maskedAnswers[user] = { locked: true, time: val.time };
      }
    }
    return {
      date: dq.date,
      question: dq.question,
      answers: maskedAnswers,
      revealed: false,
      answeredUsers: Object.keys(dq.answers || {})
    };
  }

  return {
    date: dq.date,
    question: dq.question,
    answers: dq.answers || {},
    revealed: true,
    answeredUsers: Object.keys(dq.answers || {})
  };
}

async function saveDailyQuestionAnswer(roomName, username, answer) {
  const today = new Date().toISOString().slice(0, 10);
  const meta = await getRoomMeta(roomName);
  let dq = meta.dailyQuestionState;
  if (!dq || dq.date !== today) {
    dq = {
      date: today,
      question: getDailyQuestion(),
      answers: {},
      revealed: false
    };
  }
  if (!dq.answers) dq.answers = {};
  dq.answers[username] = {
    text: String(answer || '').trim().slice(0, 500),
    time: Date.now()
  };
  const answeredUsers = Object.keys(dq.answers);
  if (answeredUsers.length >= 2) {
    dq.revealed = true;
    if (!meta.diary) meta.diary = [];
    const combinedDiaryEntry = {
      date: today,
      text: `✨ Daily Q: "${dq.question}"\n` + answeredUsers.map(u => `• ${u}: "${dq.answers[u].text}"`).join('\n'),
      image: ''
    };
    if (!meta.diary.some(d => d.text && d.text.includes(dq.question))) {
      meta.diary.unshift(combinedDiaryEntry);
    }
  }
  meta.dailyQuestionState = dq;
  await updateRoomMeta(roomName, { dailyQuestionState: dq, diary: meta.diary });
  return getDailyQuestionState(roomName, username);
}

// ── Multi-Room & DM queries ──────────────────────────────────────────────────
async function listUserRooms(username) {
  const clean = String(username || '').toLowerCase();
  if (!clean) return [];
  const savedRoomName = `dm_${clean}_${clean}`;

  // Ensure Saved Messages room exists in memory
  if (!memRooms.has(savedRoomName)) {
    memRooms.set(savedRoomName, { ...defaultRoomMeta(savedRoomName), type: 'dm', participants: [clean, clean] });
  }

  let roomNames = [];
  if (isDbReady()) {
    try {
      const { data: parts } = await supabase
        .from('room_participants')
        .select('room_name')
        .eq('username', clean);
      if (parts && parts.length) {
        roomNames = parts.map(p => p.room_name);
      }
    } catch { /* ignore */ }
  }

  // Fallback to old JSONB filtering if join table is empty (during migration)
  if (roomNames.length === 0 && isDbReady()) {
    try {
      const { data: rooms } = await supabase
        .from('rooms')
        .select('*')
        .order('last_activity', { ascending: false })
        .limit(60);
      if (rooms) {
        const allRooms = rooms.map(dbRoomToJs).filter(r => (r.participants && r.participants.map(p => String(p).toLowerCase()).includes(clean)));
        roomNames = allRooms.map(r => r.name);
      }
    } catch { /* ignore */ }
  }

  // Merge with memRooms
  for (const [rName, rMeta] of memRooms.entries()) {
    if (rMeta.participants && rMeta.participants.map(p => String(p).toLowerCase()).includes(clean)) {
      if (!roomNames.includes(rName)) {
        roomNames.push(rName);
      }
    }
  }

  // Ensure saved room is in list
  if (!roomNames.includes(savedRoomName)) {
    roomNames.unshift(savedRoomName);
  }

  const result = await Promise.all(roomNames.map(async (roomName) => {
    const isSaved = roomName === savedRoomName;
    let roomMeta = memRooms.get(roomName);
    if (!roomMeta || !roomMeta.participants) {
      if (isDbReady()) {
        try {
          roomMeta = await getRoomMeta(roomName);
        } catch (_) {
          roomMeta = defaultRoomMeta(roomName);
        }
      } else {
        roomMeta = defaultRoomMeta(roomName);
      }
    }
    if (isSaved) {
      roomMeta = { ...roomMeta, type: 'dm', participants: [clean, clean] };
    }

    let lastMsg = null;
    const msgs = memMessages.get(roomName) || [];
    if (msgs.length > 0) {
      lastMsg = msgs[msgs.length - 1];
    } else if (isDbReady()) {
      try {
        const { data: lastMsgs } = await supabase
          .from('messages')
          .select('*')
          .eq('room', roomName)
          .eq('deleted', false)
          .order('time', { ascending: false })
          .limit(1);
        if (lastMsgs && lastMsgs[0]) lastMsg = dbMsgToJs(lastMsgs[0]);
      } catch { /* ignore */ }
    }

    const otherParticipant = isSaved
      ? 'Saved Messages'
      : ((roomMeta.participants || []).find(p => String(p).toLowerCase() !== clean) || roomName.replace('dm_', '').split('_').find(p => String(p).toLowerCase() !== clean) || 'Contact');

    const otherProfile = isSaved ? { avatar: '🔖', nickname: 'Saved Messages' } : await getProfile(otherParticipant);

    return {
      name: roomName,
      type: roomMeta.type || 'dm',
      isSaved,
      participants: roomMeta.participants || [clean],
      otherParticipant,
      otherProfile,
      lastMessage: lastMsg ? {
        text: lastMsg.text || (lastMsg.type === 'image' ? '📷 Photo' : lastMsg.type === 'voice' ? '🎤 Voice note' : lastMsg.type === 'document' ? '📄 Document' : '💬 Message'),
        user: lastMsg.user,
        time: lastMsg.time,
        type: lastMsg.type
      } : null,
      unread: 0,
      lastActivity: (lastMsg ? lastMsg.time : 0) || roomMeta.lastActivity || 0
    };
  }));

  // Sort: Saved messages first, then by lastActivity DESC
  result.sort((a, b) => {
    if (a.isSaved) return -1;
    if (b.isSaved) return 1;
    return (b.lastActivity || 0) - (a.lastActivity || 0);
  });

  return result;
}

async function searchUsers(query, excludeUsername) {
  const cleanQ = String(query || '').trim().toLowerCase().replace(/^@+/, '');
  const exclude = String(excludeUsername || '').toLowerCase();

  const userMap = new Map();

  // 1. Check in-memory users
  for (const u of memUsers.values()) {
    const un = (u.username || '').toLowerCase();
    if (un && un !== exclude) {
      if (!cleanQ || un.includes(cleanQ) || (u.nickname && u.nickname.toLowerCase().includes(cleanQ))) {
        userMap.set(un, {
          username: u.username,
          nickname: u.nickname || u.username,
          avatar: u.avatar || '✨',
          color: u.color || '#3390ec',
          statusBio: u.statusBio || ''
        });
      }
    }
  }

  // 2. Check Supabase DB if ready
  if (isDbReady()) {
    try {
      let builder = supabase
        .from('users')
        .select('username, nickname, avatar, color, status_bio')
        .limit(30);

      if (cleanQ) {
        builder = builder.or(`username.ilike.%${sanitizePostgrestValue(cleanQ)}%,nickname.ilike.%${sanitizePostgrestValue(cleanQ)}%`);
      }

      const { data, error } = await builder;
      if (!error && Array.isArray(data)) {
        for (const u of data) {
          const un = (u.username || '').toLowerCase();
          if (un && un !== exclude) {
            userMap.set(un, {
              username: u.username,
              nickname: u.nickname || u.username,
              avatar: u.avatar || '✨',
              color: u.color || '#3390ec',
              statusBio: u.status_bio || ''
            });
          }
        }
      }
    } catch { /* ignore */ }
  }

  return Array.from(userMap.values()).slice(0, 30);
}

async function getOrCreateDMRoom(user1, user2) {
  const sorted = [user1.toLowerCase(), user2.toLowerCase()].sort();
  const dmName = `dm_${sorted.join('_')}`;

  if (!isDbReady()) {
    if (!memRooms.has(dmName)) {
      memRooms.set(dmName, { ...defaultRoomMeta(dmName), type: 'dm', participants: sorted });
    }
    return { roomName: dmName, participants: sorted };
  }
  try {
    const meta = await getRoomMeta(dmName);
    if (!meta || meta.type !== 'dm') {
      await updateRoomMeta(dmName, { type: 'dm', participants: sorted });
    }
    for (const p of sorted) {
      await supabase.from('room_participants').upsert({ room_name: dmName, username: p, role: p === user1.toLowerCase() ? 'owner' : 'member' }).catch(() => {});
    }
    return { roomName: dmName, participants: sorted };
  } catch (_) {
    return { roomName: dmName, participants: sorted };
  }
}

async function getRoomMessagesPaginated(roomName, beforeTime, limit = 50) {
  if (!isDbReady()) {
    let msgs = memMessages.get(roomName) || [];
    if (beforeTime) msgs = msgs.filter(m => m.time < beforeTime);
    return msgs.slice(-limit);
  }
  try {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('room', roomName)
      .order('time', { ascending: false })
      .limit(limit);

    if (beforeTime) {
      query = query.lt('time', beforeTime);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(dbMsgToJs).reverse();
  } catch (err) {
    console.error('getRoomMessagesPaginated error:', err.message);
    return [];
  }
}

async function isUserBlocked(blocker, blocked) {
  if (!isDbReady()) return false;
  try {
    const { data } = await supabase
      .from('user_blocks')
      .select('blocker')
      .eq('blocker', blocker.toLowerCase())
      .eq('blocked', blocked.toLowerCase())
      .limit(1);
    return (data || []).length > 0;
  } catch (_) {
    return false;
  }
}

async function getBlockedUsers(username) {
  if (!isDbReady()) return [];
  try {
    const { data } = await supabase
      .from('user_blocks')
      .select('blocked, created_at')
      .eq('blocker', username.toLowerCase());
    return (data || []).map(b => ({ username: b.blocked, createdAt: b.created_at }));
  } catch (_) {
    return [];
  }
}

async function blockUser(blocker, blocked) {
  if (!isDbReady()) return { ok: true };
  try {
    await supabase.from('user_blocks').upsert({
      blocker: blocker.toLowerCase(),
      blocked: blocked.toLowerCase(),
      created_at: Date.now()
    }).catch(() => {});
    return { ok: true };
  } catch (_) {
    return { ok: true };
  }
}

async function unblockUser(blocker, blocked) {
  if (!isDbReady()) return { ok: true };
  try {
    await supabase.from('user_blocks').delete()
      .eq('blocker', blocker.toLowerCase())
      .eq('blocked', blocked.toLowerCase())
      .catch(() => {});
    return { ok: true };
  } catch (_) {
    return { ok: true };
  }
}

// ── Streak & Activity ─────────────────────────────────────────────────────────
function getStreak() {
  return {
    days: activityCache.size ? Math.max(...Array.from(activityCache.values()).map(a => a.streakDays || 0)) : 0,
    lastDate: activityCache.size ? Array.from(activityCache.values()).some(a => a.lastDate === new Date().toISOString().slice(0, 10)) ? new Date().toISOString().slice(0, 10) : null : null,
    usersToday: Array.from(activityCache.entries()).filter(([_, a]) => a.lastDate === new Date().toISOString().slice(0, 10)).map(([u, _]) => u)
  };
}

// ── Room helpers ──────────────────────────────────────────────────────────────
function getRoom(roomName) {
  return getRoomMeta(roomName);
}

function clearFeeling(username) {
  feelingsCache.delete(username);
}

function resetForTests() {
  profileCache.clear();
  lastSeenCache.clear();
  feelingsCache.clear();
  activityCache.clear();
  memRooms.clear();
  memMessages.clear();
  memUsers.clear();
  memPushSubs.clear();
  memMedia.clear();
}

function persist() {} // no-op, Supabase auto-persists

async function createSession(username, userAgent, ip) {
  if (!isDbReady()) return 'local-session';
  try {
    const sessionId = crypto.randomUUID();
    await supabase.from('user_sessions').insert({
      id: sessionId,
      username: username.toLowerCase(),
      user_agent: String(userAgent || '').slice(0, 200),
      ip: String(ip || '').slice(0, 45),
      created_at: Date.now(),
      last_active: Date.now(),
      revoked: false
    }).catch(() => {});
    return sessionId;
  } catch (_) {
    return 'local-session';
  }
}

async function getSessions(username) {
  if (!isDbReady()) return [];
  try {
    const { data } = await supabase
      .from('user_sessions')
      .select('id, user_agent, ip, created_at, last_active')
      .eq('username', username.toLowerCase())
      .eq('revoked', false)
      .order('last_active', { ascending: false });
    return (data || []).map(s => ({
      id: s.id,
      userAgent: s.user_agent,
      ip: s.ip,
      createdAt: s.created_at,
      lastActive: s.last_active
    }));
  } catch (_) {
    return [];
  }
}

async function revokeSession(username, sessionId) {
  if (!isDbReady()) return;
  try {
    await supabase.from('user_sessions')
      .update({ revoked: true })
      .eq('id', sessionId)
      .eq('username', username.toLowerCase())
      .catch(() => {});
  } catch { /* ignore */ }
}

module.exports = {
  FEELINGS,
  MILESTONES,
  MOTD_PROMPTS,
  isDbReady,
  getRoomMeta, getRoom, updateRoomMeta,
  getMessages, addMessage, editMessage, deleteMessage, markViewOnceOpened, clearHistory,
  pinMessage, findMessage, updateReadReceipt, updateMessageReaction, updatePollVotes,
  getProfile, updateProfile, getUserByUsername, getUserByEmailOrUsername, createUser,
  setLastSeen, getLastSeen, recordActivity, getStreak,
  setFeeling, clearFeeling, getFeelings,
  updateGameScore,
  getDailyQuestion, getDailyQuestionState, saveDailyQuestionAnswer, getMotd,
  getUploadsDir, saveUpload, getMedia,
  cleanExpiredRooms, cleanDisappearingMessages, persist,
  savePushSub, deletePushSub, getPushSubs,
  markMessageDelivered, markMessageRead, starMessage, getStarredMessages,
  listUserRooms, searchUsers, getOrCreateDMRoom, getRoomMessagesPaginated, roomExists,
  isUserBlocked, getBlockedUsers, blockUser, unblockUser,
  createSession, getSessions, revokeSession,
  resetForTests,
  supabase
};
