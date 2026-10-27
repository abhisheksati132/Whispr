-- ==============================================================================
-- Whispr: Minimal Private Chat for Exactly Two People
-- Database Schema & Security Migration
-- ==============================================================================

-- Drop legacy tables if present
DROP TABLE IF EXISTS room_participants CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS user_presence CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;

-- 1. Users table (Strict 2-person limit enforced atomically by DB trigger)
CREATE TABLE users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE OR REPLACE FUNCTION enforce_two_users_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM users) >= 2 THEN
    RAISE EXCEPTION 'link closed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_enforce_two_users_limit
BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION enforce_two_users_limit();

-- 2. Sessions table (Revocable JWT sessions)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  user_agent TEXT,
  ip TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_sessions_username ON sessions(username);

-- 3. Messages table (Single conversation between the two users)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL REFERENCES users(username),
  type TEXT NOT NULL CHECK (type IN ('text', 'image', 'voice')),
  body TEXT,
  media_path TEXT,
  duration_ms INTEGER,
  reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  edited_at BIGINT,
  deleted_at BIGINT,
  delivered_at BIGINT,
  read_at BIGINT
);

CREATE INDEX idx_messages_created_at ON messages(created_at ASC);

-- 4. Push Subscriptions
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  keys JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_push_subs_username ON push_subscriptions(username);

-- Security: Enable Row Level Security (RLS) on all tables.
-- Deny all direct access to 'anon' and 'authenticated' roles.
-- The Node.js server connects exclusively using the Supabase Service Role Key.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_deny_users ON users FOR ALL TO anon USING (false);
CREATE POLICY anon_deny_sessions ON sessions FOR ALL TO anon USING (false);
CREATE POLICY anon_deny_messages ON messages FOR ALL TO anon USING (false);
CREATE POLICY anon_deny_push_subs ON push_subscriptions FOR ALL TO anon USING (false);
