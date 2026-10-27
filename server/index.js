'use strict';
require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { default: rateLimit } = require('express-rate-limit');

const { createAuthRouter } = require('./auth');
const { createMediaRouter } = require('./media');
const { createPushRouter } = require('./push');
const { setupSocket } = require('./socket');

// ── Sentry Initialization ─────────────────────────────────────────────────────
let sentryEnabled = false;
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV || 'development'
    });
    sentryEnabled = true;
  } catch (err) {
    console.error('Sentry init error:', err);
  }
}

// ── App & Server ──────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Exact hop count (1 for Render / single reverse proxy)
app.set('trust proxy', 1);

// Allowed origins for CORS and Socket.io
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : (process.env.NODE_ENV === 'production' ? false : true);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// Setup Socket.io handlers
setupSocket(io);

// ── Content Security Policy ───────────────────────────────────────────────────
let cspSupabaseHost = '';
if (process.env.SUPABASE_URL) {
  try {
    cspSupabaseHost = new URL(process.env.SUPABASE_URL).host;
  } catch { /* ignore */ }
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'blob:', 'data:', ...(cspSupabaseHost ? [`https://${cspSupabaseHost}`] : [])],
      mediaSrc: ["'self'", 'blob:', ...(cspSupabaseHost ? [`https://${cspSupabaseHost}`] : [])],
      connectSrc: ["'self'", 'ws:', 'wss:', ...(cspSupabaseHost ? [`https://${cspSupabaseHost}`] : [])],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({ origin: allowedOrigins, credentials: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Global JSON body limit ~100kb
app.use(express.json({ limit: '100kb' }));

// Static frontend assets
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload rate limit exceeded' }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, createAuthRouter());
app.use('/api/media', uploadLimiter, createMediaRouter());
app.use('/api/push', createPushRouter());

// Health check
app.get('/health', (_req, res) => res.send('ok'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: Math.floor(process.uptime()) }));

// ICE Server configuration for WebRTC
app.get('/api/config', (_req, res) => {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ];
  if (process.env.TURN_URL) {
    const urls = process.env.TURN_URL.split(',').map(s => s.trim()).filter(Boolean);
    if (urls.length > 0) {
      iceServers.push({
        urls,
        username: process.env.TURN_USERNAME || '',
        credential: process.env.TURN_CREDENTIAL || ''
      });
    }
  }
  res.json({ iceServers });
});

// Serve frontend shell for any non-API GET route
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Error Handling ────────────────────────────────────────────────────────────
if (sentryEnabled) {
  try {
    const Sentry = require('@sentry/node');
    if (typeof Sentry.setupExpressErrorHandler === 'function') {
      Sentry.setupExpressErrorHandler(app);
    }
  } catch (err) {
    console.error('Failed to setup Sentry error handler:', err);
  }
}

app.use((err, req, res, _next) => {
  const status = typeof err.status === 'number' ? err.status : (typeof err.statusCode === 'number' ? err.statusCode : 500);
  if (res.headersSent) return _next(err);
  if (status >= 500) {
    console.error('Unhandled server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
  return res.status(status).json({ error: err.message || 'Request error' });
});

// ── Process Lifecycle ─────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.warn(`✨ Whispr Terminal HUD running on port ${PORT}`);
  });
}

function shutdown() {
  console.warn('🛑 Shutting down server...');
  io.close(() => {
    server.close(() => {
      console.warn('✅ Server shut down cleanly');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

module.exports = { app, server, io };
