'use strict';
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

// Service-role Supabase client (server-side only, bypasses RLS)
const supabase = isConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

// ==============================================================================
// IN-MEMORY TEST DOUBLE (TEST / DEVELOPMENT ONLY)
// Active only when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is omitted.
// ==============================================================================
const memUsers = new Map();
const memSessions = new Map();
const memMessages = [];
const memPushSubs = new Map();

// Session validity cache: `${username}|${sid}` -> { valid: boolean, expires: number }
const sessionCache = new Map();
const SESSION_CACHE_TTL = 30 * 1000;

function resetForTests() {
  memUsers.clear();
  memSessions.clear();
  memMessages.length = 0;
  memPushSubs.clear();
  sessionCache.clear();
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function getUserCount() {
  if (isConfigured()) {
    const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (error) throw new Error('Database error counting users');
    return count || 0;
  }
  return memUsers.size;
}

async function createUser({ username, passwordHash }) {
  const clean = String(username).toLowerCase().trim();
  const now = Date.now();

  if (isConfigured()) {
    const { error } = await supabase.from('users').insert({
      username: clean,
      password_hash: passwordHash,
      created_at: now
    });
    if (error) {
      if (error.message?.includes('link closed') || error.code === 'P0001') {
        const err = new Error('link closed');
        err.code = 'LINK_CLOSED';
        throw err;
      }
      if (error.code === '23505') {
        const err = new Error('Username taken');
        err.code = 'USERNAME_TAKEN';
        throw err;
      }
      throw new Error('Database error creating user');
    }
    return { username: clean, createdAt: now };
  }

  // In-Memory Test Double
  if (memUsers.size >= 2) {
    const err = new Error('link closed');
    err.code = 'LINK_CLOSED';
    throw err;
  }
  if (memUsers.has(clean)) {
    const err = new Error('Username taken');
    err.code = 'USERNAME_TAKEN';
    throw err;
  }

  const user = { username: clean, passwordHash, createdAt: now };
  memUsers.set(clean, user);
  return { username: clean, createdAt: now };
}

async function getUserByUsername(username) {
  const clean = String(username).toLowerCase().trim();
  if (!clean) return null;

  if (isConfigured()) {
    const { data, error } = await supabase
      .from('users')
      .select('username, password_hash, created_at')
      .eq('username', clean)
      .maybeSingle();
    if (error || !data) return null;
    return {
      username: data.username,
      passwordHash: data.password_hash,
      createdAt: Number(data.created_at)
    };
  }

  const u = memUsers.get(clean);
  if (!u) return null;
  return { ...u };
}

async function getPartner(username) {
  const clean = String(username).toLowerCase().trim();
  if (isConfigured()) {
    const { data } = await supabase
      .from('users')
      .select('username')
      .neq('username', clean)
      .limit(1)
      .maybeSingle();
    return data ? data.username : null;
  }

  for (const u of memUsers.keys()) {
    if (u !== clean) return u;
  }
  return null;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

async function createSession(username, userAgent = '', ip = '') {
  const clean = String(username).toLowerCase().trim();
  const sessionId = crypto.randomUUID();
  const now = Date.now();

  if (isConfigured()) {
    const { error } = await supabase.from('sessions').insert({
      id: sessionId,
      username: clean,
      user_agent: userAgent,
      ip,
      created_at: now
    });
    if (error) throw new Error('Database error creating session');
  } else {
    memSessions.set(sessionId, { id: sessionId, username: clean, userAgent, ip, createdAt: now });
  }

  sessionCache.set(`${clean}|${sessionId}`, { valid: true, expires: now + SESSION_CACHE_TTL });
  return { id: sessionId, username: clean, createdAt: now };
}

async function isSessionValid(username, sid) {
  const clean = String(username).toLowerCase().trim();
  if (!clean || !sid) return false;

  const cacheKey = `${clean}|${sid}`;
  const hit = sessionCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    return hit.valid;
  }

  let isValid;
  if (isConfigured()) {
    try {
      const { data } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', sid)
        .eq('username', clean)
        .maybeSingle();
      isValid = Boolean(data);
    } catch {
      isValid = false;
    }
  } else {
    const s = memSessions.get(sid);
    isValid = Boolean(s && s.username === clean);
  }

  sessionCache.set(cacheKey, { valid: isValid, expires: Date.now() + SESSION_CACHE_TTL });
  return isValid;
}

async function revokeSession(username, sid) {
  const clean = String(username).toLowerCase().trim();
  if (!sid) return;

  sessionCache.delete(`${clean}|${sid}`);
  if (isConfigured()) {
    await supabase.from('sessions').delete().eq('id', sid).eq('username', clean);
  } else {
    memSessions.delete(sid);
  }
}

async function revokeAllUserSessions(username) {
  const clean = String(username).toLowerCase().trim();
  for (const key of sessionCache.keys()) {
    if (key.startsWith(`${clean}|`)) {
      sessionCache.delete(key);
    }
  }

  if (isConfigured()) {
    const { error } = await supabase.from('sessions').delete().eq('username', clean);
    if (error) throw new Error('Database error revoking sessions');
  } else {
    for (const [sid, sess] of memSessions.entries()) {
      if (sess.username === clean) {
        memSessions.delete(sid);
      }
    }
  }
}

async function updateUserPassword(username, passwordHash) {
  const clean = String(username).toLowerCase().trim();
  if (isConfigured()) {
    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('username', clean);
    if (error) throw new Error('Database error updating password');
  } else {
    const u = memUsers.get(clean);
    if (!u) throw new Error('User not found');
    u.passwordHash = passwordHash;
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

async function addMessage({ id, sender, type, body, mediaPath, durationMs, replyTo }) {
  const msgId = id || crypto.randomUUID();
  const now = Date.now();
  const message = {
    id: msgId,
    sender: String(sender).toLowerCase(),
    type: type || 'text',
    body: body || null,
    mediaPath: mediaPath || null,
    durationMs: durationMs || null,
    replyTo: replyTo || null,
    createdAt: now,
    editedAt: null,
    deletedAt: null,
    deliveredAt: null,
    readAt: null
  };

  if (isConfigured()) {
    const { error } = await supabase.from('messages').insert({
      id: message.id,
      sender: message.sender,
      type: message.type,
      body: message.body,
      media_path: message.mediaPath,
      duration_ms: message.durationMs,
      reply_to: message.replyTo,
      created_at: message.createdAt,
      edited_at: null,
      deleted_at: null,
      delivered_at: null,
      read_at: null
    });
    if (error) throw new Error('Database error saving message');
  } else {
    memMessages.push({ ...message });
  }

  return message;
}

async function getMessages(limit = 100, before = null) {
  const max = Math.min(Math.max(1, limit), 200);

  if (isConfigured()) {
    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(max);
    if (before) {
      query = query.lt('created_at', before);
    }
    const { data, error } = await query;
    if (error) throw new Error('Database error loading messages');
    return (data || [])
      .map(m => ({
        id: m.id,
        sender: m.sender,
        type: m.type,
        body: m.deleted_at ? null : m.body,
        mediaPath: m.deleted_at ? null : m.media_path,
        durationMs: m.duration_ms,
        replyTo: m.reply_to,
        createdAt: Number(m.created_at),
        editedAt: m.edited_at ? Number(m.edited_at) : null,
        deletedAt: m.deleted_at ? Number(m.deleted_at) : null,
        deliveredAt: m.delivered_at ? Number(m.delivered_at) : null,
        readAt: m.read_at ? Number(m.read_at) : null
      }))
      .reverse();
  }

  let filtered = memMessages;
  if (before) {
    filtered = filtered.filter(m => m.createdAt < before);
  }
  const slice = filtered.slice(-max);
  return slice.map(m => ({
    ...m,
    body: m.deletedAt ? null : m.body,
    mediaPath: m.deletedAt ? null : m.mediaPath
  }));
}

async function findMessage(id) {
  if (isConfigured()) {
    const { data } = await supabase.from('messages').select('*').eq('id', id).maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      sender: data.sender,
      type: data.type,
      body: data.body,
      mediaPath: data.media_path,
      durationMs: data.duration_ms,
      replyTo: data.reply_to,
      createdAt: Number(data.created_at),
      editedAt: data.edited_at ? Number(data.edited_at) : null,
      deletedAt: data.deleted_at ? Number(data.deleted_at) : null,
      deliveredAt: data.delivered_at ? Number(data.delivered_at) : null,
      readAt: data.read_at ? Number(data.read_at) : null
    };
  }

  const m = memMessages.find(msg => msg.id === id);
  return m ? { ...m } : null;
}

async function editMessage(id, sender, newBody) {
  const cleanSender = String(sender).toLowerCase();
  const now = Date.now();

  if (isConfigured()) {
    const { data, error } = await supabase
      .from('messages')
      .update({ body: newBody, edited_at: now })
      .eq('id', id)
      .eq('sender', cleanSender)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      sender: data.sender,
      body: data.body,
      editedAt: Number(data.edited_at)
    };
  }

  const m = memMessages.find(msg => msg.id === id && msg.sender === cleanSender && !msg.deletedAt);
  if (!m) return null;
  m.body = newBody;
  m.editedAt = now;
  return { id: m.id, sender: m.sender, body: m.body, editedAt: now };
}

async function deleteMessage(id, sender) {
  const cleanSender = String(sender).toLowerCase();
  const now = Date.now();

  if (isConfigured()) {
    const { data, error } = await supabase
      .from('messages')
      .update({ deleted_at: now, body: null, media_path: null })
      .eq('id', id)
      .eq('sender', cleanSender)
      .select('*')
      .maybeSingle();
    if (error || !data) return false;
    return true;
  }

  const m = memMessages.find(msg => msg.id === id && msg.sender === cleanSender);
  if (!m) return false;
  m.deletedAt = now;
  m.body = null;
  m.mediaPath = null;
  return true;
}

async function markDelivered(reader) {
  const cleanReader = String(reader).toLowerCase();
  const now = Date.now();

  if (isConfigured()) {
    await supabase
      .from('messages')
      .update({ delivered_at: now })
      .neq('sender', cleanReader)
      .is('delivered_at', null);
  } else {
    for (const m of memMessages) {
      if (m.sender !== cleanReader && !m.deliveredAt) {
        m.deliveredAt = now;
      }
    }
  }
  return now;
}

async function markRead(reader) {
  const cleanReader = String(reader).toLowerCase();
  const now = Date.now();

  if (isConfigured()) {
    await supabase
      .from('messages')
      .update({ delivered_at: now, read_at: now })
      .neq('sender', cleanReader)
      .is('read_at', null);
  } else {
    for (const m of memMessages) {
      if (m.sender !== cleanReader && !m.readAt) {
        if (!m.deliveredAt) m.deliveredAt = now;
        m.readAt = now;
      }
    }
  }
  return now;
}

// ── Push Subscriptions ────────────────────────────────────────────────────────

async function savePushSub(username, sub) {
  const clean = String(username).toLowerCase().trim();
  if (!sub || !sub.endpoint) return;
  const now = Date.now();

  if (isConfigured()) {
    await supabase.from('push_subscriptions').upsert({
      endpoint: sub.endpoint,
      username: clean,
      keys: sub.keys || {},
      created_at: now
    });
  } else {
    memPushSubs.set(sub.endpoint, { endpoint: sub.endpoint, username: clean, keys: sub.keys || {}, createdAt: now });
  }
}

async function deletePushSub(endpoint) {
  if (!endpoint) return;
  if (isConfigured()) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  } else {
    memPushSubs.delete(endpoint);
  }
}

async function getPushSubs(username) {
  const clean = String(username).toLowerCase().trim();
  if (isConfigured()) {
    const { data } = await supabase.from('push_subscriptions').select('*').eq('username', clean);
    return (data || []).map(s => ({ endpoint: s.endpoint, username: s.username, keys: s.keys }));
  }

  const result = [];
  for (const s of memPushSubs.values()) {
    if (s.username === clean) result.push({ ...s });
  }
  return result;
}

module.exports = {
  isConfigured,
  supabase,
  resetForTests,
  getUserCount,
  createUser,
  getUserByUsername,
  getPartner,
  createSession,
  isSessionValid,
  revokeSession,
  revokeAllUserSessions,
  updateUserPassword,
  addMessage,
  getMessages,
  findMessage,
  editMessage,
  deleteMessage,
  markDelivered,
  markRead,
  savePushSub,
  deletePushSub,
  getPushSubs
};
