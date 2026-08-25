const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bestie-data.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const AVATARS = ['🐱', '🦋', '🌸', '🐻', '🌙', '✨', '🍓', '🐰', '💫', '🌈', '🦄', '🐼'];
const COLORS = ['#8b5cf6', '#ff6fae', '#f59e0b', '#06b6d4', '#84cc16', '#ec4899', '#a78bfa', '#fb7185'];

const FEELINGS = {
  happy:    { emoji: '😊', label: 'Happy',      color: '#fbbf24' },
  excited:  { emoji: '🤩', label: 'Excited',    color: '#fb923c' },
  loved:    { emoji: '🥰', label: 'Loved',      color: '#ff6fae' },
  calm:     { emoji: '😌', label: 'Calm',       color: '#60a5fa' },
  tired:    { emoji: '😴', label: 'Tired',      color: '#818cf8' },
  sad:      { emoji: '😢', label: 'Sad',        color: '#60a5fa' },
  anxious:  { emoji: '😟', label: 'Anxious',    color: '#a78bfa' },
  stressed: { emoji: '😩', label: 'Stressed',   color: '#f87171' },
  lonely:   { emoji: '🥺', label: 'Missing you',color: '#c084fc' },
  grateful: { emoji: '🙏', label: 'Grateful',   color: '#34d399' }
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

const defaultData = () => ({
  rooms: {},
  profiles: {},
  streak: { days: 0, lastDate: null, usersToday: [] },
  lastSeen: {},
  feelings: {}
});

function defaultRoom() {
  return {
    messages: [],
    mood: '',
    jokes: [],
    countdown: { label: '', date: null },
    messageCount: 0,
    milestonesHit: [],
    pinnedMessageId: null,
    readBy: {},
    diary: [],
    bucketList: [],
    calendar: [],
    glossary: [],
    bonsai: { growth: 0, lastWatered: null },
    gameScores: { wins: {}, losses: {} }
  };
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function loadData() {
  ensureDirs();
  if (!fs.existsSync(DATA_FILE)) {
    const data = defaultData();
    saveData(data);
    return data;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Migrate rooms to have new fields
    if (parsed.rooms) {
      for (const room of Object.values(parsed.rooms)) {
        if (room.pinnedMessageId === undefined) room.pinnedMessageId = null;
        if (!room.readBy) room.readBy = {};
        if (!room.diary) room.diary = [];
        if (!room.bucketList) room.bucketList = [];
        if (!room.calendar) room.calendar = [];
        if (!room.glossary) room.glossary = [];
        if (!room.bonsai) room.bonsai = { growth: 0, lastWatered: null };
        if (!room.gameScores) room.gameScores = { wins: {}, losses: {} };
      }
    }
    return { ...defaultData(), ...parsed };
  } catch {
    const data = defaultData();
    saveData(data);
    return data;
  }
}

function saveData(data) {
  ensureDirs();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  // Windows: the destination file can be briefly locked (antivirus scan,
  // concurrent reader). Retry the atomic rename a few times before failing.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, DATA_FILE);
      break;
    } catch (err) {
      if (attempt >= 4 || (err.code !== 'EPERM' && err.code !== 'EACCES')) {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        throw err;
      }
      const until = Date.now() + 50 * (attempt + 1);
      while (Date.now() < until) { /* brief backoff */ }
    }
  }
}

let data = loadData();

function persist() {
  saveData(data);
}

function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

function getProfile(name) {
  if (!data.profiles[name]) {
    const h = hashName(name);
    data.profiles[name] = {
      avatar: AVATARS[h % AVATARS.length],
      color: COLORS[h % COLORS.length],
      nickname: name
    };
    persist();
  }
  return data.profiles[name];
}

function updateProfile(name, updates) {
  const profile = getProfile(name);
  Object.assign(profile, updates);
  persist();
  return profile;
}

function getRoom(room) {
  if (!data.rooms[room]) {
    data.rooms[room] = defaultRoom();
    persist();
  }
  return data.rooms[room];
}

function getRoomMeta(room) {
  return getRoom(room);
}

function getMessages(room, limit = 100) {
  const state = getRoom(room);
  return (state.messages || []).slice(-limit);
}

function newMessageId() {
  return crypto.randomUUID();
}

function addMessage(room, msg) {
  const state = getRoom(room);
  const full = {
    id: newMessageId(),
    reactions: {},
    type: 'text',
    ...msg,
    time: msg.time || Date.now()
  };
  state.messages.push(full);
  if (state.messages.length > 500) state.messages.shift();
  state.messageCount += 1;
  persist();
  return { message: full, milestone: checkMilestone(state) };
}

function editMessage(room, msgId, newText) {
  const state = getRoom(room);
  const msg = state.messages.find((m) => m.id === msgId);
  if (!msg || msg.deleted) return null;
  msg.text = newText;
  msg.editedAt = Date.now();
  persist();
  return msg;
}

function deleteMessage(room, msgId) {
  const state = getRoom(room);
  const msg = state.messages.find((m) => m.id === msgId);
  if (!msg) return null;
  msg.deleted = true;
  msg.text = '';
  delete msg.url;
  persist();
  return msg;
}

function markViewOnceOpened(room, messageId) {
  const state = getRoom(room);
  const msg = state.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  msg.opened = true;
  msg.url = '';
  persist();
  return msg;
}

function findMessage(room, messageId) {
  const state = getRoom(room);
  return state.messages.find((m) => m.id === messageId) || null;
}

function checkMilestone(state) {
  for (const n of MILESTONES) {
    if (state.messageCount >= n && !state.milestonesHit.includes(n)) {
      state.milestonesHit.push(n);
      persist();
      return n;
    }
  }
  return null;
}

function updateMessageReaction(room, messageId, emoji, username, add) {
  const state = getRoom(room);
  const msg = state.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  if (add) {
    if (!msg.reactions[emoji].includes(username)) msg.reactions[emoji].push(username);
  } else {
    msg.reactions[emoji] = msg.reactions[emoji].filter((u) => u !== username);
    if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
  }
  persist();
  return msg;
}

function updateRoomMeta(room, updates) {
  const state = getRoom(room);
  Object.assign(state, updates);
  persist();
  return state;
}

function pinMessage(room, msgId) {
  const state = getRoom(room);
  state.pinnedMessageId = msgId || null;
  persist();
}

function updateReadReceipt(room, username, messageId) {
  const state = getRoom(room);
  if (!state.readBy) state.readBy = {};
  state.readBy[username] = messageId;
  
  if (messageId) {
    for (const msg of state.messages) {
      if (!msg.readByUsers) msg.readByUsers = [];
      if (!msg.readByUsers.includes(username)) msg.readByUsers.push(username);
      if (msg.id === messageId) break;
    }
  }
  persist();
  return state.readBy;
}

function markMessageDelivered(room, messageId, username) {
  const state = getRoom(room);
  const msg = state.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  if (!msg.deliveredTo) msg.deliveredTo = [];
  if (username && !msg.deliveredTo.includes(username)) {
    msg.deliveredTo.push(username);
    persist();
  }
  return msg;
}

function markMessageRead(room, messageId, username) {
  const state = getRoom(room);
  const msg = state.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  if (!msg.readByUsers) msg.readByUsers = [];
  if (username && !msg.readByUsers.includes(username)) {
    msg.readByUsers.push(username);
    persist();
  }
  return msg;
}

function starMessage(room, messageId, username, starred) {
  const state = getRoom(room);
  const msg = state.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  if (!msg.starredBy) msg.starredBy = [];
  if (starred) {
    if (!msg.starredBy.includes(username)) msg.starredBy.push(username);
  } else {
    msg.starredBy = msg.starredBy.filter((u) => u !== username);
  }
  persist();
  return msg;
}

function getStarredMessages(room, username) {
  const state = getRoom(room);
  return state.messages.filter((m) => !m.deleted && m.starredBy && m.starredBy.includes(username));
}

function recordActivity(username) {
  const today = new Date().toISOString().slice(0, 10);
  const streak = data.streak;
  if (streak.lastDate !== today) {
    const bothActiveYesterday = streak.lastDate && streak.usersToday.length >= 2;
    if (bothActiveYesterday) {
      const yesterday = new Date(streak.lastDate);
      const expected = new Date(yesterday);
      expected.setDate(expected.getDate() + 1);
      streak.days = expected.toISOString().slice(0, 10) === today ? streak.days + 1 : 1;
    } else {
      streak.days = 1;
    }
    streak.lastDate = today;
    streak.usersToday = [];
  }
  if (!streak.usersToday.includes(username)) {
    streak.usersToday.push(username);
  }
  persist();
  return streak;
}

function getStreak() {
  return data.streak;
}

function setLastSeen(username) {
  data.lastSeen[username] = Date.now();
  persist();
}

function getLastSeen() {
  return { ...data.lastSeen };
}

function setFeeling(username, feelingKey) {
  if (!FEELINGS[feelingKey]) return null;
  data.feelings[username] = { key: feelingKey, updatedAt: Date.now() };
  persist();
  return data.feelings[username];
}

function clearFeeling(username) {
  delete data.feelings[username];
  persist();
}

function getFeelings() {
  const EXPIRY = 6 * 60 * 60 * 1000;
  const now = Date.now();
  let changed = false;
  for (const [name, f] of Object.entries(data.feelings)) {
    if (now - f.updatedAt > EXPIRY) {
      delete data.feelings[name];
      changed = true;
    }
  }
  if (changed) persist();
  return { ...data.feelings };
}

function saveUpload(buffer, ext) {
  ensureDirs();
  const id = crypto.randomUUID();
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

function getUploadsDir() {
  ensureDirs();
  return UPLOADS_DIR;
}

function resetForTests() {
  data = defaultData();
  persist();
}

const DAILY_QUESTIONS = [
  'What made you smile today?',
  'If you could teleport anywhere right now, where would you go?',
  'What song has been stuck in your head?',
  "What's something you're looking forward to this week?",
  'Share a random fun fact you learned recently',
  "What's your comfort food right now?",
  "What's the last thing that made you laugh out loud?",
  'If today were a movie, what genre would it be?',
  "What's one small thing that made today better?",
  'What are you grateful for right now?',
  "What's your dream weekend look like?",
  "What habit are you trying to build?",
  "What's a skill you wish you had?",
  "What's the best thing you ate this week?",
  'What is your current vibe in one emoji?',
  'What movie or show should we watch together?',
  "What's something you've been overthinking?",
  "What's a place that feels like home to you?",
  "Tell me something you've never told anyone",
  "What's the nicest thing someone did for you recently?",
  'What are you procrastinating on right now?',
  "What's your go-to way to cheer yourself up?",
  "What's one thing you want to accomplish this month?",
  "What's a memory that always makes you happy?",
  'If you could have any superpower today, what would you pick?',
  "What's your current obsession?",
  "What's something beautiful you noticed today?",
  "What's a compliment you'll never forget?",
  'What would your perfect morning look like?',
  "What's something you want to learn this year?"
];

function getDailyQuestion() {
  const day = new Date().toISOString().slice(0, 10);
  const idx = hashName(day) % DAILY_QUESTIONS.length;
  return DAILY_QUESTIONS[idx];
}

function cleanExpiredRooms() {
  const EXPIRY_DAYS = parseInt(process.env.ROOM_EXPIRY_DAYS || '30', 10);
  const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  for (const [roomName, room] of Object.entries(data.rooms)) {
    if (roomName === 'default') continue;
    const lastMsgTime = room.messages.length > 0
      ? room.messages[room.messages.length - 1].time
      : 0;
    if (lastMsgTime > 0 && lastMsgTime < cutoff) {
      delete data.rooms[roomName];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    persist();
    console.warn('Cleaned ' + cleaned + ' expired room(s)');
  }
}

function updateGameScore(room, winner) {
  const state = getRoom(room);
  if (!state.gameScores) state.gameScores = { wins: {}, losses: {} };
  if (!winner) return state.gameScores;
  state.gameScores.wins[winner] = (state.gameScores.wins[winner] || 0) + 1;
  persist();
  return state.gameScores;
}

function clearHistory(room) {
  const state = getRoom(room);
  state.messages = [];
  state.messageCount = 0;
  state.pinnedMessageId = null;
  state.readBy = {};
  persist();
  return state;
}

function getDailyQuestionState(room, username) {
  const state = getRoom(room);
  const today = new Date().toISOString().slice(0, 10);
  if (!state.dailyQuestion || state.dailyQuestion.date !== today) {
    state.dailyQuestion = {
      date: today,
      question: getDailyQuestion(),
      answers: {},
      revealed: false
    };
    persist();
  }
  
  const dq = state.dailyQuestion;
  const userCount = Object.keys(dq.answers || {}).length;
  if (userCount >= 2 && !dq.revealed) {
    dq.revealed = true;
    persist();
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
    answers: dq.answers,
    revealed: true,
    answeredUsers: Object.keys(dq.answers || {})
  };
}

function saveDailyQuestionAnswer(room, username, answer) {
  const state = getRoom(room);
  const today = new Date().toISOString().slice(0, 10);
  if (!state.dailyQuestion || state.dailyQuestion.date !== today) {
    state.dailyQuestion = {
      date: today,
      question: getDailyQuestion(),
      answers: {},
      revealed: false
    };
  }

  state.dailyQuestion.answers[username] = {
    text: String(answer || '').trim().slice(0, 500),
    time: Date.now()
  };

  const answeredUsers = Object.keys(state.dailyQuestion.answers);
  if (answeredUsers.length >= 2) {
    state.dailyQuestion.revealed = true;
    if (!state.diary) state.diary = [];
    const combinedDiaryEntry = {
      date: today,
      text: `✨ Daily Q: "${state.dailyQuestion.question}"\n` +
            answeredUsers.map(u => `• ${u}: "${state.dailyQuestion.answers[u].text}"`).join('\n'),
      image: ''
    };
    if (!state.diary.some(d => d.text.includes(state.dailyQuestion.question))) {
      state.diary.unshift(combinedDiaryEntry);
    }
  }

  persist();
  return getDailyQuestionState(room, username);
}

function cleanDisappearingMessages() {
  const now = Date.now();
  let changed = false;
  for (const room of Object.values(data.rooms)) {
    if (room.disappearingTimer && room.disappearingTimer > 0) {
      const cutoff = now - room.disappearingTimer;
      const initialCount = room.messages.length;
      room.messages = room.messages.filter((m) => m.time > cutoff);
      if (room.messages.length !== initialCount) changed = true;
    }
  }
  if (changed) persist();
}

function isDbReady() { return true; }

function getUserByUsername(username) {
  return data.profiles[username] || null;
}

function getUserByEmailOrUsername(identifier) {
  for (const u of Object.values(data.profiles)) {
    if (u.username === identifier || u.email === identifier) return u;
  }
  return null;
}

function createUser({ username, pinHash, email, avatar, color, statusBio, nickname }) {
  data.profiles[username] = {
    username, pinHash, email, avatar: avatar || '✨', color: color || '#818cf8',
    statusBio: statusBio || '', nickname: nickname || username, createdAt: Date.now()
  };
  persist();
  return data.profiles[username];
}

function updatePollVotes(room, messageId, optionIndex, username) {
  const state = getRoom(room);
  const msg = state.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  if (!msg.votes) msg.votes = {};
  msg.votes[username] = optionIndex;
  persist();
  return msg;
}

function getMedia() { return []; }

function savePushSub(_username, _subscription) { return; }
function deletePushSub(_endpoint) { return; }
function getPushSubs(_username) { return []; }

function listUserRooms(username) {
  const clean = String(username || '').toLowerCase();
  if (!clean) return [];
  const savedRoomName = `dm_${clean}_${clean}`;
  const result = [];
  for (const [name, room] of Object.entries(data.rooms)) {
    if (room.participants && room.participants.map(p => String(p).toLowerCase()).includes(clean)) {
      result.push({ name, type: room.type || 'dm', participants: room.participants, lastActivity: room.lastActivity || 0 });
    }
  }
  if (!result.some(r => r.name === savedRoomName)) {
    result.unshift({ name: savedRoomName, type: 'dm', participants: [clean, clean], lastActivity: 0 });
  }
  return result;
}

function searchUsers(query, excludeUsername) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  return Object.values(data.profiles)
    .filter(u => u.username !== excludeUsername && (u.username.includes(q) || (u.nickname && u.nickname.toLowerCase().includes(q))))
    .map(u => ({ username: u.username, nickname: u.nickname || u.username, avatar: u.avatar || '✨', color: u.color || '#818cf8', statusBio: u.statusBio || '' }));
}

function getOrCreateDMRoom(user1, user2) {
  const sorted = [user1.toLowerCase(), user2.toLowerCase()].sort();
  const dmName = `dm_${sorted.join('_')}`;
  if (!data.rooms[dmName]) {
    data.rooms[dmName] = { ...defaultRoom(), type: 'dm', participants: sorted };
    persist();
  }
  return { roomName: dmName, participants: sorted };
}

function getRoomMessagesPaginated(roomName, beforeTime, limit = 50) {
  const state = getRoom(roomName);
  let msgs = state.messages || [];
  if (beforeTime) msgs = msgs.filter(m => m.time < beforeTime);
  return msgs.slice(-limit);
}

function roomExists(roomName) {
  return Boolean(roomName) && Boolean(data.rooms[roomName]);
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
  getDailyQuestion,
  cleanExpiredRooms,
  updateGameScore,
  cleanDisappearingMessages,
  markMessageDelivered,
  markMessageRead,
  starMessage,
  getStarredMessages,
  getDailyQuestionState,
  saveDailyQuestionAnswer,
  getUploadsDir, saveUpload, getMedia,
  savePushSub, deletePushSub, getPushSubs,
  listUserRooms, searchUsers, getOrCreateDMRoom, getRoomMessagesPaginated, roomExists,
  resetForTests
};
