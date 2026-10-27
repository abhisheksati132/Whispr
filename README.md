# WHISPR // TERMINAL HUD

Minimal, private, high-contrast terminal chat designed for **exactly two people**.

---

## Architecture & Security Model

- **Two-Account Limit:** The database enforces a hard atomic cap of exactly 2 accounts via a PostgreSQL trigger (`enforce_two_users_limit`). Any 3rd registration attempt is rejected with HTTP `403 Forbidden` (`"link closed"`).
- **Single Direct Stream:** No rooms, channels, groups, or public directories. All communications exist exclusively between the two authenticated partners.
- **Security & Privacy:**
  - Transport Security: TLS 1.3 in transit.
  - Authentication: Passwords hashed with bcrypt (min 8 chars, timing-attack mitigated with dummy hash comparisons). Revocable JWT session tokens.
  - Row Level Security (RLS): Supabase tables have deny-all policies for public/anon roles; the backend server connects exclusively via the Supabase Service Role key.
  - Content Security Policy (CSP): Strict HTTP CSP headers via Helmet (no inline scripts, self-hosted assets only).
  - Uploads: Authenticated endpoints, magic-byte binary header inspection, private storage bucket, 25MB cap.
  - Note: Whispr is **not** client-side end-to-end encrypted (E2EE). Messages are protected by TLS in transit and stored in Supabase with RLS.

---

## Features

- **Text Messaging:** Instant 1:1 stream with reply-to (`re: ...`), edit own messages `(edited)`, and delete `[deleted]`.
- **Delivered & Read Receipts:** `[SENT]`, `[DLVD]`, and `[READ]` status indicators in dim terminal typography.
- **Photos:** Client-side canvas compression, authenticated upload, 1px bordered HUD frame, tap-to-view fullscreen lightbox.
- **Voice Notes:** Built-in `MediaRecorder` with Safari MP4/AAC fallback, live recording timer, max 5 minutes (25MB cap), block-character waveform (`▁▃▅▇▅▃▁`).
- **1:1 Voice & Video Calls:** WebRTC signaling relayed strictly to the partner. 30-second ring timeout, busy detection, offline missed call logging (`[MISSED CALL]`), and in-call controls (`[MUTE]`, `[CAM]`, `[END]`).
- **Presence:** Online status and last-seen timestamp visible only to the conversation partner. Multi-device / multi-tab connection tracking.
- **PWA & Web Push:** Background service worker notifications for incoming messages and missed calls when closed.
- **Terminal HUD Interface:** Self-hosted JetBrains Mono font, amber monochrome palette (`--accent #FFB000`, `--bg #0B0A08`), zero emojis, optional scanlines overlay toggled via `[FX]`.

---

## Setup & Deployment

### 1. Database & Storage Setup (Fresh Supabase Project)

1. **Create Project:** Create a fresh project at [supabase.com](https://supabase.com).
2. **Run Schema:**
   - Go to **SQL Editor** in the Supabase Dashboard.
   - Click **New Query**, copy the entire contents of [`supabase_schema.sql`](./supabase_schema.sql), paste into the editor, and click **Run**.
   - This creates `users` (with atomic `enforce_two_users_limit` trigger and `pg_advisory_xact_lock`), `sessions`, `messages`, and `push_subscriptions`, enables Row Level Security (RLS) on all tables, and revokes anon access.
3. **Create Private Storage Bucket:**
   - In the Supabase Dashboard, click **Storage** in the sidebar.
   - Click **New Bucket**.
   - Set **Bucket Name** to exactly `whispr-media`.
   - **Crucial:** Leave **Public bucket** toggled **OFF** (Private).
   - Click **Save bucket**.
4. **Copy API Keys:**
   - Go to **Project Settings > API**.
   - Copy the **Project URL** (use as `SUPABASE_URL`).
   - Copy the **service_role secret key** (use as `SUPABASE_SERVICE_ROLE_KEY`). *Never expose the service role key to the client.*

### 2. Generate Web Push VAPID Keys

Whispr uses standard Web Push for notifications when the app is in the background or offline:

```bash
npx web-push generate-vapid-keys
```

This will output:
- **Public Key:** Set as `VAPID_PUBLIC_KEY`.
- **Private Key:** Set as `VAPID_PRIVATE_KEY`.
- **Subject:** Set as `VAPID_SUBJECT` (must be a valid URL or mailto, e.g. `https://yourdomain.com` or `mailto:admin@yourdomain.com`).

### 3. WebRTC TURN Server Configuration

Direct peer-to-peer WebRTC connections often fail across mobile carriers (4G/5G/LTE), corporate firewalls, and symmetric NATs. A TURN server relays audio/video streams when P2P is blocked:

Set the following environment variables:
- `TURN_URL`: e.g. `turn:turn.yourdomain.com:3478` (or `turns:turn.yourdomain.com:5349`)
- `TURN_USERNAME`: username for the TURN credential mechanism
- `TURN_CREDENTIAL`: password or auth token for the TURN server

#### TURN Server Options:
- **Option A (Free Managed):** Sign up for [Metered OpenRelay](https://www.metered.ca/tools/openrelay/) or [Twilio Network Traversal](https://www.twilio.com/docs/stun-turn).
- **Option B (Self-Hosted coturn on Linux VPS):**
  ```bash
  sudo apt-get update && sudo apt-get install -y coturn
  ```
  In `/etc/turnserver.conf`:
  ```conf
  listening-port=3478
  fingerprint
  lt-cred-mech
  user=myuser:mypassword
  realm=turn.yourdomain.com
  ```
  Start service: `sudo systemctl restart coturn`.

### 4. Environment Variables Summary

Create a `.env` file from `.env.example`:

```bash
PORT=3000
NODE_ENV=production
JWT_SECRET=generate_a_random_32_character_string_here

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

VAPID_PUBLIC_KEY=your-generated-vapid-public-key
VAPID_PRIVATE_KEY=your-generated-vapid-private-key
VAPID_SUBJECT=https://yourdomain.com

TURN_URL=turn:turn.yourdomain.com:3478
TURN_USERNAME=myuser
TURN_CREDENTIAL=mypassword

ALLOWED_ORIGINS=https://yourdomain.com
```

### 5. Lost Password / Replacing a Person

Because Whispr strictly enforces a hard 2-account limit in the database, if a user loses access, forgets their password, or replaces a device:

Run the administrative CLI tool on the server with environment variables configured:

```bash
node scripts/reset-password.js <username> <new-password>
```

This utility:
1. Validates the username and verifies the new password is >= 8 characters.
2. Hashes the new password with `bcrypt`.
3. Updates the user in PostgreSQL/Supabase.
4. Atomically revokes all active JWT sessions for that user across all devices, forcing a fresh login.

### 4. Deploying to Render

A [`render.yaml`](./render.yaml) blueprint is provided.

1. Connect your repository to [Render.com](https://render.com).
2. Select **New > Blueprint**.
3. Supply the environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_*`, `TURN_*`).
4. Render will run `npm ci --omit=dev` and start `node server/index.js`.

---

## Deletions & Cleanups Completed

The following bloated and extraneous features were completely purged:

- **Rooms & Public Channels:** Purged `rooms`, `room_participants`, `roomAuthz.js`, public legacy rooms, room passwords, and member role management.
- **Legacy Storage:** Deleted `store.js` (unserialized file-based JSON store) and replaced with clean `server/db.js`.
- **Gamification & Social Bloat:** Deleted Pictionary, Drawing, Watch-Sync, Bonsai tree, Diary, Bucket list, Shared Calendar, Glossary, Jokes, Daily Question, Streaks, Mood palette, Feelings tracker, Nudge, and Empathy pulse.
- **Ephemeral & Gimmick Messages:** Deleted Secret messages, Time capsules, View-once messages, and Disappearing messages.
- **External Integrations:** Purged Giphy/Tenor integrations and link preview scrapers.
- **Obsolete Tooling & Dead Configs:** Purged `.kilo/`, `FRONTEND_MIGRATION.md`, `DEPLOY.md`, `SUPABASE_SETUP.md`, `railway.toml`, `Procfile`, Vite/React configs, and redundant base64 endpoints.

---

## Verification & Manual Checklist

- [ ] **Account Gate:** Register 2 accounts; confirm 3rd attempt returns `403 Forbidden` (`"link closed"`).
- [ ] **Cross-Browser Verification:** Test on desktop Chrome and mobile Safari (iOS).
- [ ] **Layout Responsiveness:** Verify 100dvh mobile layout and ensure on-screen virtual keyboard does not obscure input prompt.
- [ ] **PWA Installation:** Install as standalone PWA to home screen; verify terminal icon and theme color.
- [ ] **Push Notifications:** Close the browser/PWA on one device; send a message from the other and confirm background push notification arrives.
- [ ] **Voice Note Playback:** Record and play voice note on both desktop Chrome and iOS Safari.
- [ ] **1:1 Audio/Video Call:** Place a call across two different networks (e.g. WiFi to cellular LTE) and verify TURN relay audio/video streams.
