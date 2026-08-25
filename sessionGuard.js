'use strict';
// Session guard — enforces session revocation. JWTs carry a `sid` claim;
// a revoked session invalidates the token before its 60-day expiry.
// Lookups are cached briefly to avoid a DB round-trip on every request.

const store = require('./supabaseStore');

const cache = new Map(); // `${username}|${sid}` → { ok, expires }
const TTL = 30 * 1000;

async function isSessionValid(username, sid) {
  // Memory mode and legacy tokens (no sid) stay valid.
  if (!username || !sid || sid === 'local-session') return true;
  const key = `${username}|${sid}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.ok;
  let ok = true;
  try {
    const sessions = await store.getSessions(username);
    ok = sessions.some((s) => s.id === sid);
  } catch {
    ok = true; // fail open on store errors — availability over strictness
  }
  cache.set(key, { ok, expires: Date.now() + TTL });
  return ok;
}

function invalidateSessionCache(username, sid) {
  if (username && sid) cache.delete(`${username}|${sid}`);
}

module.exports = { isSessionValid, invalidateSessionCache };
