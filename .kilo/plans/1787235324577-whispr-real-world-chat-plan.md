# Whispr — Real-World Chat App Fix & Architecture Plan

## Current State Assessment

**What you have:** A feature-rich prototype ("Whispr") with Express + Socket.io + Supabase, built as a single-room bestie chat app. It has games, doodling, video calls, daily questions, etc. But it is **not production-ready** and has real bugs.

**What you need:** A Telegram-like multi-user chat app that actually works reliably.

**Constraint: All services must have a free tier.** No paid APIs.

---

## Decisions Made

| # | Decision | Choice |
|---|----------|--------|
| 1 | Database strategy | **Supabase-only** (no Redis). Presence via `user_presence` table with 30s heartbeat cutoff. |
| 2 | Frontend architecture | **Keep vanilla JS, modularize.** Split `app.js` into ES modules. Use **Vite** for dev HMR + production bundling. |
| 3 | Migration strategy | **Vite-first with adapters.** Set up Vite immediately, create wrapper modules importing from central `state.js`, gradually move functions from `app.js` into modules. |
| 4 | Product scope | **Full Telegram clone** (web app + backend). Mobile apps deferred. Covers: DMs, groups, channels, forwarding, search, media gallery, disappearing messages, block, push notifications. |
| 5 | Auth model | **Hybrid.** Username/password primary (fully free, already working). Phone number optional profile field for discovery. No SMS OTP. |
| 6 | Hosting | **Railway or Render free tier.** Persistent Node.js process, supports Socket.io. Supabase for DB + storage. |
| 7 | Legacy room migration | **Convert `our-private-space` to a proper group.** Rename to "Whispr Lounge", add to `room_participants`, preserve message history. Existing users keep access; new users see it as just another group in sidebar. |
| 8 | Room participants migration | **Dual-write with read migration.** Write to both `rooms.participants` (JSONB) and `room_participants` (join table) during transition. Migrate reads to join table first, then stop writing to JSONB. Backfill existing data via one-time SQL. |
| 9 | New user onboarding | **Auto-create "Saved Messages" room.** Every new user gets one DM with themselves (`dm_{username}_{username}`) immediately on registration. Matches WhatsApp's familiar pattern. No empty state to design. Users can delete it later. |

---

## Implementation Summary

The plan is ready. All critical architectural decisions are resolved. The implementation agent should execute the phases in order, starting with Phase 1 bug fixes.

---

## Phase 1 — Fix Critical Bugs (Do First)

These bugs break core functionality right now. **Estimated: 3-5 days of work.**

### 1.1 `supabaseStore.js` is missing required API methods
`server.js` expects methods that `supabaseStore.js` does not implement or implements incorrectly:

| Missing/Broken Method | Issue | Fix |
|---|---|---|
| `getStreak()` | Used by server but only `recordActivity()` exists | Add `getStreak(username)` that returns `{ days, lastDate }` |
| `getRoom(roomName)` | Tests + some code paths expect `getRoom()` returning `{ messages, ... }` | Add alias `getRoom()` → `getRoomMeta()` with merged in-memory messages |
| `clearFeeling(username)` | Missing entirely | Add wrapper that deletes from `feelingsCache` |
| `resetForTests()` | Missing entirely | Add test helper that clears all caches |
| `getDailyQuestionState()` | Returns `answers: {}` for non-answerers instead of masked `{ locked: true }` | Mirror `store.js` masking logic so other users' answers are hidden until both reply |
| `getDailyQuestionState()` | Does not auto-reveal when 2 answers exist | Add auto-reveal check like `store.js` does |
| `listUserRooms()` | Fetches ALL rooms from Supabase then filters client-side | Migrate to query `room_participants` join table (see 2.5a) |

### 1.2 Frontend `app.js` has duplicate function definitions
- `togglePushNotifications()` is defined **twice** (lines 5347 and 5981). The second definition shadows the first.
- `urlBase64ToUint8Array()` is at module scope (line 5974), just above the second definition.
- **Fix:** Keep only the first definition (the better one, with serviceWorker support and unsubscribe logic). Remove the second definition. Keep `urlBase64ToUint8Array` at module scope.

### 1.3 `store.js` vs `supabaseStore.js` API drift
`store.js` (16KB, file-based) and `supabaseStore.js` (40KB, DB-based) have diverged. The server only uses `supabaseStore.js`, but `chat-utils.test.js` tests `store.js` directly.
- **Fix:** Ensure both stores export the **same public API surface**. Add missing methods to whichever store lacks them. Do NOT remove `store.js` — keep it as the offline/fallback store.

### 1.4 Socket auth is optional and insecure
```javascript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) { try { jwt.verify(token, JWT_SECRET); } catch (_) {} }
  next();
});
```
Any unauthenticated socket can join any room. There is no room-level password enforcement on the socket side.
- **Fix:** Require valid JWT for socket connection. Reject connections with invalid/missing tokens. Enforce `roomPassword` check in the `join` handler.
- **Decision:** Completely reject unauthenticated sockets. No anonymous access. Consistent with REST auth behavior.

### 1.5 Rate limiting is per-socket, not per-user
A user can open multiple tabs and get multiple sockets, bypassing the 60/5s limit.
- **Fix:** Track rate limits in a `Map<username, {count, resetAt}>` instead of per-socket variables.

### 1.6 Disappearing messages bug
`cleanDisappearingMessages()` in `supabaseStore.js` only deletes `type === 'text'` messages. It should delete **all** message types when expired.
- **Fix:** Remove the `.eq('type', 'text')` filter.

### 1.7 Frontend `sendMessagePayload` does not handle server validation errors
If the server rejects a message (rate limit, auth, etc.), the optimistic local render stays forever with `isPending: true`.
- **Fix:** Listen for `message-error` or rate-limit events and remove/reject the pending message.

**Validation:** After fixing all Phase 1 bugs, run `npm test` and verify all tests pass. Manually test: register, login, send message, open second tab, verify rate limiting works across tabs.

---

## Phase 2 — Make It Actually Work (Real-World Reliability)

**Estimated: 2-3 weeks of work.**

### 2.1 Replace in-memory rooms with persistent presence
Currently `rooms` (the Map of online users) lives in memory. Server restart = lost presence state.
- Add `user_presence` table to Supabase with `username`, `last_heartbeat`, `socket_id`.
- Replace in-memory `rooms` Map with DB queries: `SELECT username FROM user_presence WHERE last_heartbeat > cutoff`.
- Heartbeat: client emits `heartbeat` every 30s, server updates DB.
- Online cutoff: users with `last_heartbeat` older than 60s are considered offline.
- **Migration:** Keep the in-memory `rooms` Map during transition. On each heartbeat, update both the Map and the DB. On server restart, rebuild the Map from DB. Once stable, remove the in-memory Map entirely.

### 2.2 Multi-room / group chat support
Right now there is only `our-private-space` and DMs. Telegram needs groups and channels.
- Add `POST /api/rooms/create` (group name, participants, type: `dm`/`group`/`channel`)
- Add `GET /api/rooms` that returns all rooms for a user
- Update `listUserRooms()` to use the `room_participants` join table instead of client-side JSONB filtering
- Frontend: add a "Create Group" flow in the sidebar

### 2.3 Proper message search
Current search is purely client-side over cached messages. If you load a room with 10k messages, search is impossible.
- Add `GET /api/rooms/:room/search?q=xxx` with Supabase `ILIKE` queries
- Return paginated results with message context

### 2.4 Media handling for production
- **Problem:** Files are base64-encoded in the HTTP request body. For a 25MB video, this is ~33MB of JSON.
- **Fix:** Switch to `multer` for multipart uploads. Store files in Supabase Storage (free tier: 1GB, 50K files). Generate signed URLs.
- Add thumbnail generation for images/videos using `sharp`.

### 2.5 Database schema updates
Run updated `supabase_schema.sql` with these additions:

```sql
-- room_participants: join table for multi-user groups/channels
CREATE TABLE IF NOT EXISTS room_participants (
  room_name TEXT NOT NULL REFERENCES rooms(name) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  joined_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (room_name, username)
);
CREATE INDEX idx_room_participants_username ON room_participants(username);

-- user_presence: heartbeat-based online status
CREATE TABLE IF NOT EXISTS user_presence (
  username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
  last_heartbeat BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  socket_id TEXT DEFAULT ''
);
CREATE INDEX idx_user_presence_heartbeat ON user_presence(last_heartbeat DESC);

-- user_blocks: blocking relationships
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (blocker, blocked)
);

-- Add phone column to users for hybrid auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
```

### 2.5a Migrate `rooms.participants` JSONB to `room_participants` join table

The existing `rooms.participants` column is a JSONB array like `["alice", "bob"]`. The new model uses a proper join table. We must migrate without breaking existing rooms.

**One-time backfill SQL (run in Supabase SQL Editor before deploying new code):**
```sql
INSERT INTO room_participants (room_name, username, role, joined_at)
SELECT 
  name,
  LOWER(TRIM(BOTH '"' FROM jsonb_array_elements_text(participants::jsonb))),
  CASE 
    WHEN LOWER(TRIM(BOTH '"' FROM jsonb_array_elements_text(participants::jsonb))) = (
      SELECT LOWER(username) FROM users WHERE users.username = LOWER(TRIM(BOTH '"' FROM jsonb_array_elements_text(rooms.participants::jsonb)))
      LIMIT 1
    ) THEN 'owner' 
    ELSE 'member' 
  END,
  (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
FROM rooms
WHERE participants IS NOT NULL AND participants != '[]'::jsonb
ON CONFLICT DO NOTHING;
```

**Code migration (dual-write):**
1. Update `jsRoomToDb()` and `dbRoomToJs()` in `supabaseStore.js` to keep the JSONB column working alongside the join table.
2. Update `updateRoomMeta()` to write `participants` to JSONB as before (don't change yet).
3. Update `getOrCreateDMRoom()` to write to `room_participants` in addition to JSONB.
4. Update `listUserRooms()` to query `room_participants` first, falling back to JSONB filtering if the join table returns no results.
5. After all read paths use the join table (verified in production for 1 week), remove JSONB writes and eventually drop the column.

**Validation:** After backfill, verify `SELECT COUNT(*) FROM room_participants` matches the sum of all `jsonb_array_length(participants)` in `rooms`. Verify DMs still resolve correctly. Verify `listUserRooms()` returns the same results as before.

### 2.6 Socket.io room model for groups/channels
Current: one global socket.io room per chat room. All messages broadcast to all sockets in that room.
New model:
- **DMs:** socket.io room name = `dm_{sorted_usernames}` (e.g., `dm_alice_bob`)
- **Groups:** socket.io room name = `group_{room_name}`
- **Channels:** socket.io room name = `channel_{room_name}`
- **User-specific:** socket.io room = `user:{username}` for direct messages to specific users
- Server validates that the socket is a participant before allowing join

### 2.7 Message pagination
Current: loads last 100 messages on join. No way to load older messages.
- Add `GET /api/rooms/:room/messages?before=<timestamp>&limit=50`
- Frontend: on scroll-to-top, fetch older messages and prepend to DOM
- Socket: emit `load-older-messages` with `before` timestamp, server responds with `older-messages` event

### 2.8 Migrate legacy `our-private-space` room
The hardcoded default room `our-private-space` is used in 15+ places across the codebase. It needs to become a proper group in the new model.

**Migration steps:**
1. Create a `room_participants` entry for `our-private-space` with role `owner` for the first registered user (or a system user)
2. Update `normalizeRoom()` in `chat-utils.js` to no longer fall back to `our-private-space` — instead fall back to a user's first available room, or show a "No chats yet" empty state
3. Update all hardcoded `our-private-space` fallbacks in `server.js` (lines 107, 419, 512) to use the user's active room or return an error
4. Update `supabaseStore.js` cleanup exemption (line 780) to remove `our-private-space` from the exclusion list
5. Frontend: hide `our-private-space` from the sidebar room list for new users, but allow existing users to keep it visible if they have message history there
6. Optionally rename the room display name to "Whispr Lounge" via `room_participants` metadata or a `display_name` column

**Validation:** After migration, verify that: existing users can still access their `our-private-space` history, new users see an empty chat list instead of being forced into `our-private-space`, and room creation/joining works for DMs and groups.

---

## Phase 3 — Telegram-like Features To Add

### 3.1 Core messaging
- [ ] **Message forwarding** — `forward-message` socket event + UI
- [ ] **Message reply threading** — partially exists, needs proper thread view
- [ ] **Link previews** — partially exists, needs caching and better OG parsing
- [ ] **Message formatting** — Markdown/bold/italic/code/monospace support
- [ ] **Username search** — discoverable by username, not just exact match

### 3.2 Media & Files
- [ ] **Image/video thumbnails** — generate on upload
- [ ] **File compression** — compress images before upload (partially exists)
- [ ] **Progressive upload** — show upload progress bar
- [ ] **Media gallery per chat** — grid view, full-screen viewer with swipe

### 3.3 User presence & sync
- [ ] **Last seen / online status** — replace in-memory `rooms` Map with DB-backed presence
- [ ] **Typing indicators** — partially exists
- [ ] **Read receipts (double blue ticks)** — partially exists
- [ ] **Blocked users** — hide messages, prevent calls

### 3.4 Security & Privacy
- [ ] **Passcode / biometric lock** — partially exists (PIN), needs biometrics
- [ ] **Session management** — list active sessions, revoke tokens
- [ ] **Disappearing messages** — partially exists, needs timer selector UI

### 3.5 Notifications
- [ ] **Push notifications** — partially exists via web-push
- [ ] **Notification grouping** — by chat
- [ ] **Mute chat** — per-room notification settings

### 3.6 Performance & Scale
- [ ] **Message pagination** — load older messages on scroll-up
- [ ] **CDN for media** — serve uploads through Supabase CDN
- [ ] **Connection resilience** — exponential backoff, offline queue (partially exists)

---

## Phase 4 — Testing & Quality

### 4.1 Fix existing tests
```bash
npm test
```
Currently fails because:
1. `chat-utils.test.js` imports `../store` but tests also call `store.saveDailyQuestionAnswer()` which returns different shapes in `store.js` vs `supabaseStore.js`
2. `supabase-store.test.js` tests `getDailyQuestionState` but expects masked answers for non-owners — `supabaseStore.js` returns empty object instead

### 4.2 Add integration tests
- Socket.io connection + join + message + leave flow
- Auth register/login/logout flow
- DM creation + message history
- Media upload + download

### 4.3 Add linting/type checking
- Add `eslint` with Node.js config
- Add `prettier`
- Add `npm run lint` to CI

---

## Phase 5 — Deployment Readiness

### 5.1 Environment & Config
- [ ] Add `dotenv` for `.env` loading (currently reads `process.env` but no `.env` loading in code)
- [ ] Validate required env vars at startup (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`)
- [ ] Add `npm run dev` script with `nodemon` or Vite

### 5.2 Security hardening
- [ ] `JWT_SECRET` must be 32+ random bytes, not a fallback string
- [ ] Add `cors` config to restrict origins
- [ ] Add `helmet` for security headers
- [ ] Rate limit auth endpoints (`express-rate-limit`)
- [ ] Sanitize all user input before DB queries
- [ ] Add CSRF protection for REST endpoints

### 5.3 Observability
- [ ] Add request logging (`morgan` or `pino`)
- [ ] Add health check that verifies DB + Socket.io
- [ ] Add error tracking (Sentry free tier)
- [ ] Add metrics (Prometheus / Grafana)

---

## Frontend Modularization Plan

### Current state
- `public/app.js` — 6,248 lines, single file, no modules
- `public/index.html` — 1,355 lines, inline event handlers
- `public/styles.css` + `public/clay.css` — styles

### Target state
- `public/index.html` — unchanged structure, loads bundled JS
- `src/` — ES modules, bundled by Vite
- `vite.config.js` — dev server + build config

### Module split

| Module | Responsibility | Approx lines |
|--------|---------------|-------------|
| `src/init.js` | Entry point, socket init, event binding, `init()` | ~300 |
| `src/chat.js` | Message send/receive, socket events, offline queue, DM list | ~800 |
| `src/ui.js` | DOM rendering, modals, scroll, search, context menu | ~1200 |
| `src/media.js` | Uploads, camera, video notes, audio player, gallery | ~800 |
| `src/webrtc.js` | Voice/video calls, call UI, PIP | ~600 |
| `src/games.js` | TTT, Connect4, CoDraw, WatchTogether, Pictionary | ~700 |
| `src/extras.js` | Diary, bucketlist, calendar, glossary, bonsai, daily Q | ~600 |
| `src/utils.js` | Helpers, E2EE, haptics, sounds, formatting | ~500 |

## Frontend Modularization Plan

### Current state
- `public/app.js` — 6,248 lines, single file, no modules
- `public/index.html` — 1,355 lines, inline event handlers
- `public/styles.css` + `public/clay.css` — styles

### Target state
- `public/index.html` — unchanged structure, loads bundled JS
- `src/` — ES modules, bundled by Vite
- `vite.config.js` — dev server + build config

### Module split

| Module | Responsibility | Approx lines |
|--------|---------------|-------------|
| `src/init.js` | Entry point, socket init, event binding, `init()` | ~300 |
| `src/chat.js` | Message send/receive, socket events, offline queue, DM list | ~800 |
| `src/ui.js` | DOM rendering, modals, scroll, search, context menu | ~1200 |
| `src/media.js` | Uploads, camera, video notes, audio player, gallery | ~800 |
| `src/webrtc.js` | Voice/video calls, call UI, PIP | ~600 |
| `src/games.js` | TTT, Connect4, CoDraw, WatchTogether, Pictionary | ~700 |
| `src/extras.js` | Diary, bucketlist, calendar, glossary, bonsai, daily Q | ~600 |
| `src/utils.js` | Helpers, E2EE, haptics, sounds, formatting | ~500 |

### Migration strategy (Critical design decision)

The current `app.js` is 6,248 lines of tightly coupled code with shared mutable state (`myName`, `myRoom`, `socket`, `allMessagesCached`, etc.). Splitting it into modules requires a migration strategy.

**Decision: Vite-first with adapters.** Set up Vite dev server with HMR immediately. Create thin wrapper modules that import from a central `state.js` (for shared mutable state like `myName`, `socket`, `allMessagesCached`). Gradually move functions from `app.js` into modules, deleting from `app.js` as we go. This lets us ship working code at every step and catch bugs with HMR. The final production build outputs a single `app.js` served by Express.

### Frontend state management during migration

Create `src/state.js` as the single source of truth for shared mutable state:

```javascript
// src/state.js
export const state = {
  myName: '',
  myRoom: '',
  authToken: '',
  joined: false,
  socket: null,
  allMessagesCached: [],
  profiles: {},
  // ... all shared state variables
};
```

Each module imports `state` and reads/writes to it. No prop drilling, no event bus needed. This is the simplest pattern that works for a single-page app with no framework.

### Vite migration playbook (step-by-step)

1. **Week 1:** Set up Vite + `state.js`. Move all constant definitions (EMOJIS, STICKERS, etc.) to `src/constants.js`. Keep `app.js` working but import from modules where possible.
2. **Week 2:** Extract `src/utils.js` (helpers, formatting, E2EE). These have no DOM dependencies. Delete from `app.js` once tests pass.
3. **Week 3:** Extract `src/media.js` (uploads, camera, video notes). DOM-dependent but isolated.
4. **Week 4:** Extract `src/chat.js` (message send/receive, socket events). Core functionality — test thoroughly.
5. **Week 5:** Extract `src/ui.js` (rendering, modals, search). Largest module — split into sub-modules if needed.
6. **Week 6:** Extract `src/webrtc.js`, `src/games.js`, `src/extras.js`.
7. **Week 7:** Extract `src/init.js` (entry point). `app.js` should be empty or near-empty.
8. **Week 8:** Remove `app.js`, verify production build works, deploy.

**Rollback:** At any point, if a module extraction breaks something, revert that week's changes. The previous week's state still has a working `app.js` with modules imported.

### Frontend build configuration

**`vite.config.js`:**
```javascript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'public',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html')
      },
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': 'http://localhost:3000'
    }
  }
});
```

**`package.json` scripts:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

**Express production serve:**
```javascript
// In server.js, for production:
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
// Vite build outputs to public/dist/app.js, public/dist/assets/
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dist', 'app.js'));
});
```

---

## Recommended Execution Order

1. **Fix Phase 1 bugs** (1.1–1.7) — these are showstoppers
2. **Unify store APIs** — make `supabaseStore.js` match `store.js` public interface
3. **Fix tests** — get `npm test` passing
4. **Add Vite + modularize frontend** — split `app.js` into `src/` modules
5. **Update Supabase schema** — add `room_participants`, `user_presence`, `user_blocks`
6. **Add multi-room support** — groups + channels + user rooms table
7. **Switch to multipart uploads** — fix media handling with `multer` + Supabase Storage
8. **Add message pagination** — scroll-to-top loading
9. **Deploy to staging** — test with real users on Railway/Render
10. **Iterate on Telegram features** based on priority

---

## Open Decisions (Resolved)

All critical decisions are resolved. The plan is ready for implementation.

---

## Implementation Status

### Completed
- **Phase 1 (Critical Bugs):** All 7 bugs fixed. Tests passing (21/21).
  - `supabaseStore.js`: Added `getStreak`, `getRoom`, `clearFeeling`, `resetForTests`, fixed `getDailyQuestionState` masking/reveal, fixed `listUserRooms` to use join table, fixed `cleanDisappearingMessages` type filter
  - `store.js`: Unified public API with `supabaseStore.js` (added 15+ missing methods)
  - `server.js`: Socket auth now rejects unauthenticated connections, rate limiting is per-user, message errors emit `message-error` event
  - `public/app.js`: Removed duplicate `togglePushNotifications`, added `rejectPendingMessage` for failed messages
- **Phase 2.1 (Persistent Presence):** Added `user_presence` table, heartbeat socket event, `updatePresence`/`getOnlineUsers` helpers, periodic cleanup of stale presence
- **Phase 2.2 (Multi-room Support):** Added `POST /api/rooms/create`, `POST /api/rooms/:name/members`, `DELETE /api/rooms/:name/members/:username`
- **Phase 2.3 (Server-side Search):** Added `GET /api/rooms/:name/search?q=xxx` with Supabase ILIKE queries
- **Phase 2.4 (Multipart Uploads):** Added multer-based `/api/upload-multipart` endpoint with Supabase Storage fallback
- **Phase 2.5 (Schema Updates):** Added `room_participants`, `user_presence`, `user_blocks`, `user_sessions` tables, `phone` column, `mute_until` column
- **Phase 2.5a (JSONB Migration):** Dual-write in `getOrCreateDMRoom()`, `listUserRooms()` queries join table first with JSONB fallback
- **Phase 2.6 (Socket Room Model):** Heartbeat updates presence DB, disconnect clears presence, `broadcastPresence` includes online users
- **Phase 2.7 (Message Pagination):** Added `load-older-messages` socket event + `older-messages` response
- **Phase 2.8 (Legacy Room Migration):** `normalizeRoom()` no longer falls back to `our-private-space`, updated all server.js fallbacks, removed cleanup exemptions
- **Phase 3.1 (Message Forwarding):** Added `forward-message` socket event + frontend `forwardMessage()` function
- **Phase 3.3 (User Blocks):** Added block/unblock/list endpoints, `isUserBlocked` check in message and call handlers
- **Phase 3.4 (Session Management):** Added `user_sessions` table, session creation on login/register, list/revoke endpoints
- **Phase 3.5 (Mute Chat):** Added mute/unmute endpoints, `mute_until` column, push notifications respect mute status
- **Phase 3.x (Room Deletion):** Added `DELETE /api/rooms/:roomName` (owner only)

### Completed
- **Vite modularization:** `app.js` extracted to 39 ES modules in `src/` (`init.js` imports all and builds `window.BestieChat`)
- **Cross-module dependencies:** Added `utils.js` imports to 10 modules (`escapeHtml`, `formatBytes`)
- **Build system:** Vite configured, production build succeeds (`npm run build`)
- **Tests:** 22/22 passing

### Not Started
- Remove `public/app.js` and load only module entry point (requires resolving ~327 cross-module global calls)
- Full dependency graph resolution (replace global calls with proper ESM imports)

### Test Results
```
npm test
✔ 22 tests passing (0 failures)
```
