# chat 💭

A private, real-time encrypted messaging and collaborative space. Fast, zero noise, with WebRTC voice/video calling, ephemeral media, and Supabase (PostgreSQL) persistence.

## Features
- **Real-Time Messaging**: Instant full-duplex WebSocket messaging with Socket.io.
- **WebRTC Calling**: Peer-to-peer crystal-clear Voice & Video calls with Picture-in-Picture support.
- **Client-Side E2E Encryption**: AES-GCM + PBKDF2 Web Crypto API encryption.
- **Supabase Backend**: Reliable PostgreSQL persistence for chat history, shared notes, and user accounts.
- **PWA & Offline Ready**: Progressive Web App with Service Worker caching and VAPID Web Push notifications.
- **Modern Themes**: Claude Warm Paper, Apple iMessage (iOS), and Dark Mode.

## Run Locally
```bash
npm install
npm start
```
Then open `http://localhost:3000` in your browser.

## Deployment (Render)
1. Push this repository to GitHub.
2. Create a Web Service on [Render](https://render.com).
3. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
4. Build command: `npm install`
5. Start command: `node server.js`
