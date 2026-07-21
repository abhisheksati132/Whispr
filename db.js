const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;
let useSqlite = false;

try {
  const sqlite3 = require('sqlite3').verbose();
  const DB_FILE = path.join(DB_DIR, 'bestie.sqlite');
  db = new sqlite3.Database(DB_FILE);
  useSqlite = true;
} catch (err) {
  console.warn('⚠️ Native SQLite bindings unavailable (' + err.message + '). Operating with fallback store engine.');
}

// Fallback JSON push subscription persistence
const PUSH_FILE = path.join(DB_DIR, 'push-subscriptions.json');

function loadPushSubs() {
  if (!fs.existsSync(PUSH_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PUSH_FILE, 'utf8')); }
  catch { return []; }
}

function savePushSubs(subs) {
  const tmp = PUSH_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(subs, null, 2));
  fs.renameSync(tmp, PUSH_FILE);
}

// Initialize Tables
function initDb() {
  if (!useSqlite) return Promise.resolve();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Rooms table
      db.run(`CREATE TABLE IF NOT EXISTS rooms (
        name TEXT PRIMARY KEY,
        mood TEXT DEFAULT '',
        jokes_json TEXT DEFAULT '[]',
        countdown_json TEXT DEFAULT '{}',
        bonsai_json TEXT DEFAULT '{}',
        created_at INTEGER
      )`);

      // Messages table
      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room TEXT,
        user TEXT,
        text TEXT,
        type TEXT DEFAULT 'text',
        url TEXT DEFAULT '',
        duration INTEGER DEFAULT 0,
        reply_to_json TEXT DEFAULT 'null',
        reactions_json TEXT DEFAULT '{}',
        votes_json TEXT DEFAULT '{}',
        edited_at INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0,
        time INTEGER
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room, time)`);

      // Profiles table
      db.run(`CREATE TABLE IF NOT EXISTS profiles (
        name TEXT PRIMARY KEY,
        nickname TEXT DEFAULT '',
        avatar TEXT DEFAULT '✨',
        color TEXT DEFAULT '#8b5cf6',
        last_seen INTEGER DEFAULT 0,
        streak_json TEXT DEFAULT '{}'
      )`);

      // Notebooks
      db.run(`CREATE TABLE IF NOT EXISTS notebooks (
        room TEXT,
        type TEXT,
        data_json TEXT DEFAULT '[]',
        PRIMARY KEY (room, type)
      )`);

      // Game Scores
      db.run(`CREATE TABLE IF NOT EXISTS game_scores (
        room TEXT PRIMARY KEY,
        wins_json TEXT DEFAULT '{}'
      )`);

      // Push Subscriptions
      db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
        username TEXT,
        endpoint TEXT PRIMARY KEY,
        keys_json TEXT,
        created_at INTEGER
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// Migrate from legacy JSON data
async function migrateLegacyJson() {
  if (!useSqlite) return;
  const jsonPath = path.join(DB_DIR, 'bestie-data.json');
  if (!fs.existsSync(jsonPath)) return;

  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw);

    const count = await new Promise((res) => {
      db.get('SELECT COUNT(*) as cnt FROM messages', (err, row) => {
        res(row ? row.cnt : 0);
      });
    });

    if (count > 0) return;

    console.log('📦 Migrating legacy bestie-data.json into SQLite...');

    db.serialize(() => {
      if (data.profiles) {
        const stmt = db.prepare('INSERT OR REPLACE INTO profiles (name, nickname, avatar, color, last_seen, streak_json) VALUES (?, ?, ?, ?, ?, ?)');
        for (const [name, p] of Object.entries(data.profiles)) {
          stmt.run(name, p.nickname || '', p.avatar || '✨', p.color || '#8b5cf6', p.lastSeen || 0, JSON.stringify(p.streak || {}));
        }
        stmt.finalize();
      }

      if (data.rooms) {
        const roomStmt = db.prepare('INSERT OR REPLACE INTO rooms (name, mood, jokes_json, countdown_json, bonsai_json, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        const msgStmt = db.prepare('INSERT OR REPLACE INTO messages (id, room, user, text, type, url, duration, reply_to_json, reactions_json, votes_json, edited_at, deleted, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const noteStmt = db.prepare('INSERT OR REPLACE INTO notebooks (room, type, data_json) VALUES (?, ?, ?)');
        const scoreStmt = db.prepare('INSERT OR REPLACE INTO game_scores (room, wins_json) VALUES (?, ?)');

        for (const [roomName, r] of Object.entries(data.rooms)) {
          roomStmt.run(roomName, r.mood || '', JSON.stringify(r.jokes || []), JSON.stringify(r.countdown || {}), JSON.stringify(r.bonsai || {}), r.createdAt || Date.now());

          if (Array.isArray(r.messages)) {
            for (const m of r.messages) {
              msgStmt.run(
                m.id, roomName, m.user, m.text || '', m.type || 'text', m.url || '', m.duration || 0,
                JSON.stringify(m.replyTo || null), JSON.stringify(m.reactions || {}), JSON.stringify(m.votes || {}),
                m.editedAt || 0, m.deleted ? 1 : 0, m.time || Date.now()
              );
            }
          }

          if (r.diary) noteStmt.run(roomName, 'diary', JSON.stringify(r.diary));
          if (r.bucketList) noteStmt.run(roomName, 'bucketList', JSON.stringify(r.bucketList));
          if (r.glossary) noteStmt.run(roomName, 'glossary', JSON.stringify(r.glossary));
          if (r.calendar) noteStmt.run(roomName, 'calendar', JSON.stringify(r.calendar));

          if (r.gameScores) scoreStmt.run(roomName, JSON.stringify(r.gameScores.wins || {}));
        }

        roomStmt.finalize();
        msgStmt.finalize();
        noteStmt.finalize();
        scoreStmt.finalize();
      }
    });

    const bakPath = path.join(DB_DIR, 'bestie-data.json.bak');
    fs.renameSync(jsonPath, bakPath);
    console.log('✅ SQLite migration complete! Backup saved as bestie-data.json.bak');
  } catch (err) {
    console.error('Migration error:', err);
  }
}

// Query helper wrappers with fallback
const query = {
  get: (sql, params = []) => {
    if (useSqlite) {
      return new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
    }
    return Promise.resolve(null);
  },
  all: (sql, params = []) => {
    if (useSqlite) {
      return new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
    }
    if (sql.includes('push_subscriptions')) {
      const subs = loadPushSubs();
      return Promise.resolve(subs);
    }
    return Promise.resolve([]);
  },
  run: (sql, params = []) => {
    if (useSqlite) {
      return new Promise((res, rej) => db.run(sql, params, function (err) { err ? rej(err) : res(this); }));
    }
    if (sql.includes('INSERT OR REPLACE INTO push_subscriptions')) {
      const [username, endpoint, keys_json, created_at] = params;
      let subs = loadPushSubs().filter((s) => s.endpoint !== endpoint);
      subs.push({ username, endpoint, keys_json, created_at });
      savePushSubs(subs);
      return Promise.resolve();
    }
    if (sql.includes('DELETE FROM push_subscriptions')) {
      const [endpoint] = params;
      let subs = loadPushSubs().filter((s) => s.endpoint !== endpoint);
      savePushSubs(subs);
      return Promise.resolve();
    }
    return Promise.resolve();
  }
};

module.exports = { db, initDb, migrateLegacyJson, query };
