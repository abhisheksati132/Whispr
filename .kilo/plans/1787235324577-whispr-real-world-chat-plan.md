# Whispr — Real-World Chat App Fix & Architecture Plan

## Current State Assessment

**What you have:** A feature-rich prototype ("Whispr") with Express + Socket.io + Supabase, built as a single-room bestie chat app. It has games, doodling, video calls, daily questions, etc. But it is **not production-ready** and has real bugs.

**What you need:** A Telegram-like multi-user chat app that actually works reliably.

---

## Phase 1 — Fix Critical Bugs (Do First)

These bugs break core functionality right now.

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
| `listUserRooms()` | Fetches ALL rooms from Supabase then filters client-side | Add server-side `.or()` filter on participants array, or maintain a `user_rooms` join table |

### 1.2 Frontend `app.js` has duplicate function definitions
- `togglePushNotifications()` is defined **twice** (lines ~5346 and ~5980). The second definition shadows the first.
- `urlBase64ToUint8Array()` is nested inside the second `togglePushNotifications()` but is needed globally.
- **Fix:** Keep only the first definition (the better one), move `urlBase64ToUint8Array` to module scope, remove the duplicate.

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
- **Fix:** Require valid JWT for socket connection. Reject or restrict anonymous connections. Enforce `roomPassword` check in the `join` handler.

### 1.5 Rate limiting is per-socket, not per-user
A user can open multiple tabs and get multiple sockets, bypassing the 60/5s limit.
- **Fix:** Track rate limits in a `Map<username, {count, resetAt}>` instead of per-socket variables.

### 1.6 Disappearing messages bug
`cleanDisappearingMessages()` in `supabaseStore.js` only deletes `type === 'text'` messages. It should delete **all** message types when expired.
- **Fix:** Remove the `.eq('type', 'text')` filter.

### 1.7 Frontend `sendMessagePayload` does not handle server validation errors
If the server rejects a message (rate limit, auth, etc.), the optimistic local render stays forever with `isPending: true`.
- **Fix:** Listen for `message-error` or rate-limit events and remove/reject the pending message.

---

## Phase 2 — Make It Actually Work (Real-World Reliability)

### 2.1 Replace in-memory rooms with persistent rooms
Currently `rooms` (the Map of online users) and all message history live in memory. Server restart = total data loss for in-memory cache.
- Move `rooms` Map into `supabaseStore.js` as a method `getOnlineUsers(room)` backed by Redis or the database.
- If no Redis, use a heartbeat table in Supabase with TTL.

### 2.2 Multi-room / group chat support
Right now there is only `our-private-space` and DMs. Telegram needs groups.
- Add `POST /api/rooms/create` (group name, participants, type)
- Add `GET /api/rooms` that returns all rooms for a user
- Update `listUserRooms()` to use a proper `room_participants` join table in Supabase
- Frontend: add a "Create Group" flow in the sidebar

### 2.3 Proper message search
Current search is purely client-side over cached messages. If you load a room with 10k messages, search is impossible.
- Add `GET /api/rooms/:room/search?q=xxx` with Supabase full-text search or `ILIKE` queries
- Return paginated results with message context

### 2.4 Media handling for production
- **Problem:** Files are base64-encoded in the HTTP request body. For a 25MB video, this is ~33MB of JSON. This will crash Express's default 100KB body limit (you set 40MB, but it's still wasteful).
- **Fix:** Switch to `multer` for multipart uploads. Store files in Supabase Storage (not `data/uploads/`). Generate signed URLs.
- Add thumbnail generation for images/videos using `sharp`.

### 2.5 Database schema gaps
Run `supabase_schema.sql` and ensure these tables exist:
- `rooms` — ✅ exists
- `messages` — ✅ exists  
- `users` — ✅ exists
- `push_subs` — ✅ exists
- `media` — ✅ exists
- **MISSING:** `room_participants` (for multi-user groups)
- **MISSING:** `message_edits` audit log
- **MISSING:** `user_blocks` (blocking)
- **MISSING:** `reports` (content moderation)

### 2.6 Real E2EE (optional but Telegram-like)
The current "E2EE" is client-side AES via CryptoJS with a shared password. The server still sees plaintext.
- Add proper E2EE using the Web Crypto API (`SubtleCrypto`).
- Keys should never leave the client. Server stores only encrypted blobs.
- This is a major architectural change — plan it as a v2 feature.

---

## Phase 3 — Telegram-like Features To Add

### 3.1 Core messaging
- [ ] **Message forwarding** — `forward-message` socket event + UI
- [ ] **Message reply threading** — partially exists, needs proper thread view
- [ ] **Link previews** — partially exists, needs caching and better OG parsing
- [ ] **Message formatting** — Markdown/bold/italic/code/monospace support
- [ ] **Contact sync** — phone number integration (requires mobile app)
- [ ] **Username search** — discoverable by username, not just exact match

### 3.2 Media & Files
- [ ] **Image/video thumbnails** — generate on upload
- [ ] **File compression** — compress images before upload (partially exists)
- [ ] **Progressive upload** — show upload progress bar
- [ ] **Media gallery per chat** — grid view, full-screen viewer with swipe

### 3.3 User presence & sync
- [ ] **Last seen / online status** — partially exists, needs proper presence
- [ ] **Typing indicators** — partially exists
- [ ] **Read receipts (double blue ticks)** — partially exists
- [ ] **Blocked users** — hide messages, prevent calls

### 3.4 Security & Privacy
- [ ] **Passcode / biometric lock** — partially exists (PIN), needs biometrics
- [ ] **Two-factor auth** — TOTP on login
- [ ] **Session management** — list active sessions, revoke tokens
- [ ] **Disappearing messages** — partially exists, needs timer selector UI
- [ ] **Screen capture prevention** — FLAG_SECURE on Android, CSS `user-select: none` on web

### 3.5 Notifications
- [ ] **Push notifications** — partially exists via web-push
- [ ] **Notification grouping** — by chat
- [ ] **Custom notification sounds** — partially exists
- [ ] **Mute chat** — per-room notification settings

### 3.6 Performance & Scale
- [ ] **Redis adapter for Socket.io** — required for multi-process/PM2 cluster
- [ ] **Message pagination** — load older messages on scroll-up
- [ ] **CDN for media** — serve uploads through Cloudflare/Vercel Edge
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
- [ ] Add `npm run dev` script with `nodemon`

### 5.2 Security hardening
- [ ] `JWT_SECRET` must be 32+ random bytes, not a fallback string
- [ ] Add `cors` config to restrict origins
- [ ] Add `helmet` for security headers
- [ ] Rate limit auth endpoints (`express-rate-limit`)
- [ ] Sanitize all user input before DB queries (Supabase handles most, but verify)
- [ ] Add CSRF protection for REST endpoints

### 5.3 Observability
- [ ] Add request logging (`morgan` or `pino`)
- [ ] Add health check that verifies DB + Socket.io
- [ ] Add error tracking (Sentry)
- [ ] Add metrics (Prometheus / Grafana)

---

## Recommended Execution Order

1. **Fix Phase 1 bugs** (1.1–1.7) — these are showstoppers
2. **Unify store APIs** — make `supabaseStore.js` match `store.js` public interface
3. **Fix tests** — get `npm test` passing
4. **Add multi-room support** — groups + user rooms table
5. **Switch to multipart uploads** — fix media handling
6. **Add message pagination** — scroll-to-top loading
7. **Deploy to staging** — test with real users
8. **Iterate on Telegram features** based on priority

---

## Key Questions For You

Before I write the implementation plan, I need your input on 3 decisions:

1. **Database strategy:** Do you want to stick with Supabase (PostgreSQL) only, or add Redis for presence/sessions? Redis makes Socket.io clustering possible but adds infra cost.

2. **Frontend architecture:** The current app is a single `app.js` (6248 lines) with no framework. Do you want to keep it vanilla JS, or migrate to React/Vue? This affects how we add new features.

3. **Scope for "real world":** Are you targeting:
   - **A)** 1-on-1 bestie chat (small, personal) — keep current scope but fix bugs
   - **B)** Telegram clone (groups, channels, contacts, stories) — massive scope, needs mobile apps
   - **C)** Middle ground: multi-user groups + DMs, web-only, no mobile app yet

**My recommendation:** Start with **C** — fix all bugs, add group chats, add proper media uploads, deploy. Then decide if you need mobile apps.
