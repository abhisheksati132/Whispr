# Whispr 💭

A private, real-time encrypted messaging and collaborative space. Fast, zero noise, with WebRTC voice/video calling, ephemeral media, and Supabase (PostgreSQL) persistence.

## Features
- **Real-Time Messaging**: Instant full-duplex WebSocket messaging with Socket.io.
- **WebRTC Calling**: Peer-to-peer crystal-clear Voice & Video calls with Picture-in-Picture support.
- **Client-Side E2E Encryption**: AES-GCM + PBKDF2 Web Crypto API encryption.
- **Supabase Backend**: Reliable PostgreSQL persistence for chat history, shared notes, and user accounts.
- **PWA & Offline Ready**: Progressive Web App with Service Worker caching and VAPID Web Push notifications.
- **Modern Themes**: Claude Warm Paper, Apple iMessage (iOS), and Dark Mode.
- **Multi-Room Chat**: Groups, channels, and DMs with persistent presence.
- **Message Forwarding**: Forward messages between chats.
- **User Blocks**: Block unwanted users.
- **Session Management**: View and revoke active sessions.
- **Mute Chats**: Per-room mute with push notification respect.
- **Server-Side Search**: Search messages across chat history.
- **Message Pagination**: Load older messages on scroll.
- **Multipart Uploads**: Large file support with Supabase Storage.

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm start
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `JWT_SECRET` | Secret for JWT tokens |
| `GIPHY_API_KEY` | Optional GIPHY API key |
| `CHAT_PASSWORD` | Optional global chat password |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |

## Database Setup

Run the SQL schema in your Supabase SQL Editor:

```bash
# See supabase_schema.sql
```

## Deployment

### Railway
1. Connect your GitHub repo to Railway
2. Add environment variables from `.env.example`
3. Deploy — Railway auto-detects `Procfile` and `railway.toml`

### Render
1. Connect your GitHub repo to Render
2. Use the provided `render.yaml` for Blueprint deployment
3. Add environment variables

### Docker
```bash
docker build -t whispr .
docker run -p 3000:3000 -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... whispr
```

## Tests

```bash
npm test
```

## Tech Stack
- **Backend**: Node.js, Express, Socket.io
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Vanilla JS (ES modules ready)
- **Real-Time**: Socket.io with heartbeat presence
- **Storage**: Supabase Storage + local fallback
- **Push**: Web Push API with VAPID
