const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bestie-data.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const AVATARS = ['🐱', '🦋', '🌸', '🐻', '🌙', '✨', '🍓', '🐰', '💫', '🌈', '🦄', '🐼'];
const COLORS = ['#8b5cf6', '#ff6fae', '#f59e0b', '#06b6d4', '#84cc16', '#ec4899', '#a78bfa', '#fb7185'];

// Feelings palette: each feeling carries a glow color so the other person's
// screen can visually shift to reflect it — the core of "feel what they feel".
const FEELINGS = {
  happy: { emoji: '😊', label: 'Happy', color: '#fbbf24' },
  excited: { emoji: '🤩', label: 'Excited', color: '#fb923c' },
  loved: { emoji: '🥰', label: 'Loved', color: '#ff6fae' },
  calm: { emoji: '😌', label: 'Calm', color: '#60a5fa' },
  tired: { emoji: '😴', label: 'Tired', color: '#818cf8' },
  sad: { emoji: '😢', label: 'Sad', color: '#60a5fa' },
  anxious: { emoji: '😟', label: 'Anxious', color: '#a78bfa' },
  stressed: { emoji: '😩', label: 'Stressed', color: '#f87171' },
  lonely: { emoji: '🥺', label: 'Missing you', color: '#c084fc' },
  grateful: { emoji: '🙏', label: 'Grateful', color: '#34d399' }
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
    return { ...defaultData(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    const data = defaultData();
    saveData(data);
    return data;
  }
}

function saveData(data) {
  ensureDirs();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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

function defaultRoom() {
  return {
    messages: [],
    mood: '',
    jokes: [],
    countdown: { label: '', date: null },
    messageCount: 0,
    milestonesHit: []
  };
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
  // Auto-expire feelings after 6 hours so an old mood doesn't linger forever
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

module.exports = {
  getProfile,
  updateProfile,
  getRoom,
  addMessage,
  updateMessageReaction,
  updateRoomMeta,
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
  MOTD_PROMPTS,
  MILESTONES,
  FEELINGS
};
