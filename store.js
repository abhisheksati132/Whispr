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
  fs.renameSync(tmp, DATA_FILE);
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
  persist();
  return state.readBy;
}

function recordActivity(username) {
  const today = new Date().toISOString().slice(0, 10);
  const streak = data.streak;
  if (streak.lastDate !== today) {
    if (streak.lastDate && streak.usersToday.length >= 2) {
      const yesterday = new Date(streak.lastDate);
      const expected = new Date(yesterday);
      expected.setDate(expected.getDate() + 1);
      if (expected.toISOString().slice(0, 10) === today) {
        streak.days += 1;
      } else {
        streak.days = 1;
      }
    } else if (!streak.lastDate) {
      streak.days = 1;
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

function getMotd() {
  const day = new Date().toISOString().slice(0, 10);
  const idx = hashName(day) % MOTD_PROMPTS.length;
  return MOTD_PROMPTS[idx];
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
  'What made you smile today? smile',
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
  const EXPIRY_DAYS = parseInt(process.env.ROOM_EXPIRY_DAYS || '7', 10);
  const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  for (const [roomName, room] of Object.entries(data.rooms)) {
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
    console.log('Cleaned ' + cleaned + ' expired room(s)');
  }
}

function updateGameScore(room, winner) {
  const state = getRoom(room);
  if (!state.gameScores) state.gameScores = { wins: {}, losses: {} };
  if (!winner) return state.gameScores;
  state.gameScores.wins[winner] = (state.gameScores.wins[winner] || 0) + 1;
function clearHistory(room) {
  const state = getRoom(room);
  state.messages = [];
  state.messageCount = 0;
  state.pinnedMessageId = null;
  state.readBy = {};
  persist();
  return state;
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

module.exports = {
  getProfile,
  updateProfile,
  getRoom,
  addMessage,
  editMessage,
  deleteMessage,
  updateMessageReaction,
  updateRoomMeta,
  pinMessage,
  updateReadReceipt,
  recordActivity,
  getStreak,
  setLastSeen,
  getLastSeen,
  getMotd,
  saveUpload,
  getUploadsDir,
  resetForTests,
  setFeeling,
  clearFeeling,
  getFeelings,
  getDailyQuestion,
  cleanExpiredRooms,
  updateGameScore,
  clearHistory,
  cleanDisappearingMessages,
  MOTD_PROMPTS,
  MILESTONES,
  FEELINGS
};
