<div align="center">

# Whispr

### A minimal, high-performance workspace for private communication and deep collaboration.

[![Status](https://img.shields.io/badge/status-active-34d399?style=flat-square)](https://chat-jh59.onrender.com)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P_Audio%20%26%20Video-6366f1?style=flat-square)](https://chat-jh59.onrender.com)
[![Encryption](https://img.shields.io/badge/Security-AES--GCM%20E2EE-10b981?style=flat-square)](https://chat-jh59.onrender.com)
[![PWA](https://img.shields.io/badge/PWA-Offline%20First-f59e0b?style=flat-square)](https://chat-jh59.onrender.com)

[**Live Experience →**](https://chat-jh59.onrender.com)

</div>

---

## 💭 About

**Whispr** is an intimate, distraction-free messaging and collaboration platform crafted for speed, privacy, and aesthetic clarity. 

Designed around a fluid monochrome palette with glassmorphic depth, it strips away the noise of modern communication suites to deliver a focused environment for direct conversations, group channels, peer-to-peer calling, and encrypted personal notes.

---

## ✨ Highlights

### 🔒 Privacy & Encryption
- **Client-Side E2EE**: Secure room-level message payloads encrypted directly in the browser via AES-GCM (256-bit) and PBKDF2 key derivation.
- **View-Once & Ephemeral Modes**: Send self-destructing media and disappearing messages on custom expiry timers.
- **Zero Tracker Footprint**: No telemetry, third-party analytics, or behavioral trackers.

### 📞 Peer-to-Peer Voice & Video
- **Crystal-Clear WebRTC Calling**: Full-duplex voice and HD video calling with multi-server STUN fallback routing.
- **Adaptive Stream Handling**: Dynamic track negotiation with picture-in-picture local preview and background audio playback.
- **Call History & In-Call Utilities**: Live mute, camera toggling, screen sharing, and audio diagnostics.

### ⚡ Real-Time Collaboration
- **Direct Messages & Group Channels**: Multi-participant communication with live typing indicators and presence detection.
- **Voice Studio**: Native audio recording with visual waveform scrubbers, pause/resume studio controls, and speed multipliers.
- **Rich Media & File Engine**: Drag-and-drop document sharing, automatic client-side photo compression, and lightbox galleries.
- **Note to Self**: A dedicated, end-to-end encrypted private cloud notebook accessible across all your devices.

### 📱 Native Mobile & PWA Experience
- **Offline-First Architecture**: Powered by client-side IndexedDB caching and Service Worker background synchronization.
- **Fluid Micro-Interactions**: Gesture-driven navigation, bottom mobile docks, and viewport handling (`100dvh`) optimized for iOS and Android.
- **Web Push Notifications**: Background message alerts with custom vibration patterns and badge counters.

---

## 🛠️ Architecture & Technologies

- **Frontend**: Vanilla JavaScript (ES6+), Glassmorphic CSS3, IndexedDB Local Cache, Web Audio API, WebRTC MediaStream API.
- **Real-Time Engine**: Socket.io with heartbeat presence discovery and candidate queuing.
- **Backend & Storage**: Node.js, Express, Multer stream processing, Supabase (PostgreSQL) persistence with in-memory resilient fallback.
- **Security**: Web Crypto API (AES-GCM, PBKDF2), JWT session authentication, and CSP headers.

---

<div align="center">
  <sub>Crafted for focus, privacy, and seamless connection.</sub>
</div>
