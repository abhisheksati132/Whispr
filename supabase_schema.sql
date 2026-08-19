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
