-- ==============================================================================
-- BESTIE CHAT — SUPABASE (POSTGRESQL) SCHEMA SETUP
-- Paste this entire script into your Supabase SQL Editor (Dashboard -> SQL Editor)
-- and click "RUN" to create all tables and indexes.
-- ==============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  avatar TEXT DEFAULT '✨',
  color TEXT DEFAULT '#818cf8',
  status_bio TEXT DEFAULT '',
  nickname TEXT DEFAULT '',
  last_seen BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 2. ROOMS TABLE
CREATE TABLE IF NOT EXISTS rooms (
  name TEXT PRIMARY KEY,
  type TEXT DEFAULT 'public',
  participants JSONB DEFAULT '[]'::jsonb,
  mood TEXT DEFAULT '',
  jokes JSONB DEFAULT '[]'::jsonb,
  countdown JSONB DEFAULT '{}'::jsonb,
  pinned_message_id TEXT DEFAULT NULL,
  disappearing_timer BIGINT DEFAULT 0,
  room_password TEXT DEFAULT '',
  message_count BIGINT DEFAULT 0,
  milestones_hit JSONB DEFAULT '[]'::jsonb,
  read_by JSONB DEFAULT '{}'::jsonb,
  diary JSONB DEFAULT '[]'::jsonb,
  bucket_list JSONB DEFAULT '[]'::jsonb,
  calendar JSONB DEFAULT '[]'::jsonb,
  glossary JSONB DEFAULT '[]'::jsonb,
  bonsai JSONB DEFAULT '{"growth": 0, "lastWatered": null}'::jsonb,
  game_scores JSONB DEFAULT '{"wins": {}, "losses": {}}'::jsonb,
  daily_question_state JSONB DEFAULT '{}'::jsonb,
  shared_pad TEXT DEFAULT '',
  last_activity BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 3. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  "user" TEXT NOT NULL,
  text TEXT DEFAULT '',
  type TEXT DEFAULT 'text',
  url TEXT DEFAULT '',
  duration INT DEFAULT 0,
  reply_to JSONB DEFAULT NULL,
  reactions JSONB DEFAULT '{}'::jsonb,
  votes JSONB DEFAULT '{}'::jsonb,
  delivered_to JSONB DEFAULT '[]'::jsonb,
  read_by_users JSONB DEFAULT '[]'::jsonb,
  starred_by JSONB DEFAULT '[]'::jsonb,
  edited_at BIGINT DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE,
  expired BOOLEAN DEFAULT FALSE,
  time BIGINT NOT NULL
);

-- 4. PUSH SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  keys JSONB DEFAULT '{}'::jsonb,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 5. MEDIA STORAGE TABLE (Fallback when not using Supabase Storage Buckets)
CREATE TABLE IF NOT EXISTS media (
  filename TEXT PRIMARY KEY,
  data TEXT DEFAULT '',
  mime TEXT DEFAULT 'application/octet-stream',
  size BIGINT DEFAULT 0,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 6. ROOM PARTICIPANTS (join table for multi-user groups/channels)
CREATE TABLE IF NOT EXISTS room_participants (
  room_name TEXT NOT NULL REFERENCES rooms(name) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (room_name, username)
);
CREATE INDEX IF NOT EXISTS idx_room_participants_username ON room_participants(username);

-- 7. USER PRESENCE (heartbeat-based online status)
CREATE TABLE IF NOT EXISTS user_presence (
  username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
  last_heartbeat BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  socket_id TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_user_presence_heartbeat ON user_presence(last_heartbeat DESC);

-- 8. USER BLOCKS (blocking relationships)
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (blocker, blocked)
);

-- 9. USER SESSIONS (for session management)
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  user_agent TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  last_active BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  revoked BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_username ON user_sessions(username);

-- Add phone column to users for hybrid auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';

-- Add mute_until to room_participants for per-user mute
ALTER TABLE room_participants ADD COLUMN IF NOT EXISTS mute_until BIGINT DEFAULT 0;

-- ── INDEXES FOR MAXIMUM QUERY SPEED ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room, time DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_push_subs_username ON push_subs(username);

-- ── RLS (Row Level Security) ──────────────────────────────────────────────────
-- We disable RLS or allow service role / public access since our Node backend handles auth & JWTs
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_subs DISABLE ROW LEVEL SECURITY;
ALTER TABLE media DISABLE ROW LEVEL SECURITY;
