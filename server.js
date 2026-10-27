'use strict';
require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const webpush  = require('web-push');
const jwt      = require('jsonwebtoken');
const multer   = require('multer');
const helmet   = require('helmet');
const cors     = require('cors');
const morgan   = require('morgan');
const { default: rateLimit, ipKeyGenerator } = require('express-rate-limit');

const mStore = require('./supabaseStore');
const { isConfigured, checkConnection, supabase } = require('./supabaseClient');
const {
  normalizeRoom, normalizeText, normalizeNickname,
  randomJoinMessage, randomLeaveMessage, randomGamePrompt
} = require('./chat-utils');

const CHAT_PASSWORD = process.env.CHAT_PASSWORD || '';
const { JWT_SECRET } = require('./config');
const { dmMembers, authorizeRoom, isMember, canRead } = require('./roomAuthz');
const { isSessionValid } = require('./sessionGuard');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // Memory mode wipes ALL user data (accounts, messages, sessions) on restart.
  // That is acceptable locally and in tests — never in production.
  if (process.env.NODE_ENV === 'production') {
    console.error('\n❌ REFUSING TO START: NODE_ENV=production without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.');
    console.error('❌ In-memory storage would silently destroy every conversation on restart.');
    console.error('❌ Configure Supabase, or run with NODE_ENV=development for local testing.\n');
    process.exit(1);
  }
  console.warn('⚠️  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — operating in memory-only mode.');
}

let sentryEnabled = false;
try {
  if (process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1, environment: process.env.NODE_ENV || 'development' });
    sentryEnabled = true;
    console.warn('✅ Sentry error tracking initialized');
  }
} catch { /* ignore */ }

// ── Supabase (PostgreSQL) ────────────────────────────────────────────────────
(async () => {
  if (isConfigured()) {
    try {
      console.warn('\n=============================================');
      console.warn('🔄 Checking Supabase connection...');
      const status = await checkConnection();
      if (status.connected) {
        console.warn('✅ Supabase (PostgreSQL) connected successfully!');
      } else {
        console.warn('⚠️  Supabase reachable with notice:', status.reason);
      }
      console.warn('=============================================\n');
    } catch (err) {
      console.error('\n=============================================');
      console.error('❌ SUPABASE INITIALIZATION WARNING:');
      console.error(err.message);
      console.error('---------------------------------------------');
      console.error('👉 Make sure you have run the supabase_schema.sql script in your Supabase SQL Editor!');
      console.error('=============================================\n');
    }
  } else {
    console.warn('\n=============================================');
    console.warn('⚠️  NO SUPABASE_URL or SUPABASE_KEY found in environment!');
    console.warn('⚠️  Operating in resilient in-memory mode.');
    console.warn('⚠️  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to persist data.');
    console.warn('=============================================\n');
  }
})();

// ── VAPID ─────────────────────────────────────────────────────────────────────
let vapidKeys = (() => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) return { publicKey: pub, privateKey: priv };

  const vapidFilePath = path.join(__dirname, 'data', 'vapid.json');
  try {
    if (fs.existsSync(vapidFilePath)) {
      const saved = JSON.parse(fs.readFileSync(vapidFilePath, 'utf8'));
      if (saved.publicKey && saved.privateKey) {
        console.warn('🔑 Loaded persisted VAPID keys from data/vapid.json');
        return saved;
      }
    }
  } catch { /* ignore */ }

  const generated = webpush.generateVAPIDKeys();
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(vapidFilePath, JSON.stringify(generated, null, 2), 'utf8');
    console.warn('🔑 Generated and saved new VAPID keys to data/vapid.json');
  } catch { /* ignore */ }

  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY not found in environment — using auto-generated keys.');
    console.warn('👉 To keep push subscriptions across service redeployments, set in Render Dashboard:');
    console.warn(`   VAPID_PUBLIC_KEY=${generated.publicKey}`);
    console.warn(`   VAPID_PRIVATE_KEY=${generated.privateKey}`);
  }
  return generated;
})();
if (!vapidKeys.publicKey || !vapidKeys.privateKey) vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:whispr@app.local', vapidKeys.publicKey, vapidKeys.privateKey);

// ── Express ───────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : (process.env.NODE_ENV === 'production' ? false : true);

const io     = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.set('trust proxy', true);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '40mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.get('/uploads/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(mStore.getUploadsDir(), filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  try {
    const media = await mStore.getMedia(filename);
    if (media && media.data) {
      res.setHeader('Content-Type', media.mime || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      try { fs.writeFileSync(filePath, media.data); } catch { /* ignore */ }
      return res.send(media.data);
    }
  } catch (e) {
    console.error('Error fetching media from Supabase:', e);
  }
  res.status(404).send('File not found');
});
app.use('/uploads', express.static(mStore.getUploadsDir()));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Auth & Rooms Routes ───────────────────────────────────────────────────────
require('./routes/auth')(app);
require('./routes/rooms')(app);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.send('ok'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: Date.now(), database: isConfigured() ? 'supabase' : 'memory', supabase: isConfigured() }));
app.get('/api/config', (_req, res) => res.json({ passwordRequired: Boolean(CHAT_PASSWORD) }));
app.get('/api/daily-question', (_req, res) => res.json({ question: mStore.getDailyQuestion() }));
app.get('/api/export-chat', async (req, res) => {
  try {
    const requester = await requireAuth(req, res);
    if (!requester) return;
    const room = normalizeRoom(req.query.room);
    if (!room) return res.status(400).json({ error: 'Room parameter required' });
    const access = await authorizeRoom(mStore, room, requester);
    if (!canRead(access)) return res.status(403).json({ error: 'Access denied' });
    const messages = await mStore.getMessages(room, 5000);
    const meta = await mStore.getRoomMeta(room);
    res.json({
      room,
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
      meta
    });
  } catch {
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── OpenGraph Link Preview ───────────────────────────────────────────────────
const linkPreviewCache = new Map();
const LINK_PREVIEW_TTL = 24 * 60 * 60 * 1000; // 24 hours
const LINK_PREVIEW_MAX = 500;

// ── SSRF guards for outbound fetches ──────────────────────────────────────────
const dnsPromises = require('dns').promises;

function isPrivateIp(ip) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;               // this-network, private, loopback
    if (a === 169 && b === 254) return true;                          // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;                 // private
    if (a === 192 && b === 168) return true;                          // private
    if (a === 100 && b >= 64 && b <= 127) return true;                // CGNAT
    if (a >= 224) return true;                                        // multicast / reserved
    return false;
  }
  const lower = String(ip).toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7)); // IPv4-mapped
  if (/^f[cd]/.test(lower)) return true;                               // IPv6 unique-local
  if (/^fe[89ab]/.test(lower)) return true;                            // IPv6 link-local
  return false;
}

// Resolves hostname and rejects if ANY resolved address is private/link-local
// (covers DNS rebinding, IPv6, and non-dotted IP encodings).
async function assertPublicHost(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('Disallowed host');
  }
  const addrs = await dnsPromises.lookup(host, { all: true }).catch(() => null);
  if (!addrs || !addrs.length) throw new Error('Could not resolve host');
  for (const { address } of addrs) {
    if (isPrivateIp(address)) throw new Error('Disallowed host');
  }
}

app.get('/api/link-preview', async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') return res.status(400).json({ error: 'url required' });
    let targetUrl;
    try {
      targetUrl = new URL(rawUrl);
      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        return res.status(400).json({ error: 'Invalid protocol' });
      }
    } catch {
      return res.status(400).json({ error: 'Malformed URL' });
    }

    const cacheKey = targetUrl.href;
    const cached = linkPreviewCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt < LINK_PREVIEW_TTL)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json(cached.data);
    }

    // Fetch with manual redirect handling so EVERY hop is SSRF-validated.
    let response = null;
    let currentUrl = targetUrl.href;
    for (let hop = 0; hop < 3 && currentUrl; hop++) {
      let hopUrl;
      try {
        hopUrl = new URL(currentUrl);
        if (!['http:', 'https:'].includes(hopUrl.protocol)) {
          return res.status(400).json({ error: 'Invalid protocol' });
        }
        await assertPublicHost(hopUrl.hostname);
      } catch {
        return res.status(400).json({ error: 'Disallowed host' });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        response = await fetch(hopUrl.href, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
      } catch {
        response = null;
      } finally {
        clearTimeout(timeout);
      }

      if (response && response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        try {
          currentUrl = new URL(location, hopUrl.href).href;
        } catch {
          currentUrl = null;
        }
        response = null;
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      return res.status(404).json({ error: 'Could not fetch page' });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return res.status(400).json({ error: 'Not an HTML page' });
    }

    const html = await response.text();
    const getMeta = (prop) => {
      const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
                    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["']`, 'i'));
      return match ? match[1] : null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = getMeta('title') || (titleMatch ? titleMatch[1].trim() : targetUrl.hostname);
    const description = getMeta('description') || '';
    let image = getMeta('image') || '';
    if (image && image.startsWith('/')) {
      image = new URL(image, targetUrl.origin).href;
    }
    const siteName = getMeta('site_name') || targetUrl.hostname.replace(/^www\./, '');
    const favicon = `https://www.google.com/s2/favicons?domain=${targetUrl.hostname}&sz=64`;

    const metaData = {
      url: targetUrl.href,
      title: title ? title.slice(0, 140) : targetUrl.hostname,
      description: description ? description.slice(0, 220) : '',
      image: image || '',
      siteName: siteName || targetUrl.hostname,
      favicon
    };

    if (linkPreviewCache.size > LINK_PREVIEW_MAX) {
      const firstKey = linkPreviewCache.keys().next().value;
      linkPreviewCache.delete(firstKey);
    }
    linkPreviewCache.set(cacheKey, { data: metaData, cachedAt: Date.now() });

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json(metaData);
  } catch {
    res.status(500).json({ error: 'Preview failed' });
  }
});

// ── Push endpoints ────────────────────────────────────────────────────────────
app.get('/api/push-vapid-key', (_req, res) => res.json({ publicKey: vapidKeys.publicKey }));

app.post('/api/push-subscribe', async (req, res) => {
  try {
    const username = await requireAuth(req, res);
    if (!username) return;
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing data' });
    await mStore.savePushSub(username, subscription);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/push-unsubscribe', async (req, res) => {
  try {
    const username = await requireAuth(req, res);
    if (!username) return;
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    await mStore.deletePushSub(endpoint);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── File upload ───────────────────────────────────────────────────────────────
// SVG is intentionally NOT allowed (stored-XSS vector when served same-origin).
const UPLOAD_ALLOWED_MIMES = new Set([
  'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
  'audio/webm','audio/ogg','audio/mp3','audio/wav','audio/mpeg','audio/mp4','audio/aac','audio/m4a','audio/x-m4a',
  'video/mp4','video/webm','video/quicktime','video/3gpp','video/ogg',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip','application/x-zip-compressed',
  'text/plain','text/csv'
]);
const MIME_EXT_MAP = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'video/ogg': 'ogv',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
  'text/plain': 'txt', 'text/csv': 'csv'
};

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Too many upload requests. Please try again later.' }
});

app.post('/api/upload', uploadLimiter, async (req, res) => {
  try {
    const username = await requireAuth(req, res);
    if (!username) return;
    const { data, mime, kind, name } = req.body;
    if (!data || !mime) return res.status(400).json({ error: 'Missing data' });
    const cleanMime = String(mime).split(';')[0].trim().toLowerCase();
    if (!UPLOAD_ALLOWED_MIMES.has(cleanMime)) return res.status(400).json({ error: 'Unsupported type: ' + cleanMime });
    const ext = MIME_EXT_MAP[cleanMime] || 'bin';
    const base64Data = (data.includes(',') ? data.split(',')[1] : data).trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) return res.status(400).json({ error: 'Invalid base64' });
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'File too large (max 25MB)' });
    const url = mStore.saveUpload(buffer, ext);
    res.json({ url, kind, name: name || 'file', size: buffer.length });
  } catch (err) { console.error('Upload error:', err); res.status(500).json({ error: 'Upload failed' }); }
});

// ── Multipart file upload ─────────────────────────────────────────────────────
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.post('/api/upload-multipart', uploadLimiter, uploadMiddleware.single('file'), async (req, res) => {
  try {
    const username = await requireAuth(req, res);
    if (!username) return;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { size, mimetype, originalname } = req.file;
    const cleanMime = String(mimetype || '').split(';')[0].trim().toLowerCase();
    if (!UPLOAD_ALLOWED_MIMES.has(cleanMime)) return res.status(400).json({ error: 'Unsupported type: ' + cleanMime });

    // Extension is derived from the VALIDATED mime type — never from the
    // client-controlled filename (prevents .html/.svg extension mismatch).
    const ext = MIME_EXT_MAP[cleanMime] || 'bin';
    const filename = `${crypto.randomUUID()}.${ext}`;
    let thumbnailUrl = '';
    
    if (cleanMime.startsWith('image/')) {
      try {
        const sharp = require('sharp');
        const thumbBuffer = await sharp(req.file.buffer)
          .resize(200, 200, { fit: 'cover', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();
        const thumbFilename = `thumb_${filename}.jpg`;
        if (isConfigured()) {
          await supabase.storage.from('uploads').upload(thumbFilename, thumbBuffer, { contentType: 'image/jpeg', upsert: true }).catch(() => {});
          const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(thumbFilename);
          thumbnailUrl = publicUrl;
        } else {
          thumbnailUrl = mStore.saveUpload(thumbBuffer, 'jpg');
        }
      } catch { /* ignore */ }
    }
    
    if (isConfigured()) {
      try {
        const { data, error } = await supabase.storage
          .from('uploads')
          .upload(filename, req.file.buffer, { contentType: cleanMime, upsert: true });
        if (!error && data) {
          const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(filename);
          return res.json({ url: publicUrl, kind: cleanMime.split('/')[0], name: originalname, size, thumbnailUrl });
        }
      } catch { /* ignore */ }
    }
    
    const url = mStore.saveUpload(req.file.buffer, ext);
    res.json({ url, kind: cleanMime.split('/')[0], name: originalname, size, thumbnailUrl });
  } catch (err) { console.error('Upload error:', err); res.status(500).json({ error: 'Upload failed' }); }
});

// ── GIF search endpoint (Tenor + Giphy with CORS fallback) ────────────────────
app.get('/api/gifs', async (req, res) => {
  const query = (req.query.q || 'cute love').trim();
  const limit = Math.min(24, Math.max(1, parseInt(req.query.limit || '16', 10)));
  
  // 1. Giphy API Key (if provided in env)
  const giphyKey = process.env.GIPHY_API_KEY;
  if (giphyKey) {
    try {
      const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(query)}&limit=${limit}&rating=g`);
      if (response.ok) {
        const data = await response.json();
        const results = (data.data || []).map(g => ({
          id: g.id,
          url: g.images?.fixed_height?.url || g.images?.downsized?.url || g.images?.original?.url,
          title: g.title || query
        })).filter(g => Boolean(g.url));
        if (results.length) return res.json({ results });
      }
    } catch (e) {
      console.warn('Giphy search error:', e);
    }
  }

  // 2. Tenor Public Search Fallback
  try {
    const tenorRes = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=${limit}`);
    if (tenorRes.ok) {
      const data = await tenorRes.json();
      const results = (data.results || []).map(r => ({
        id: r.id,
        url: r.media?.[0]?.gif?.url || r.media?.[0]?.tinygif?.url,
        title: r.title || query
      })).filter(g => Boolean(g.url));
      if (results.length) return res.json({ results });
    }
  } catch (e) {
    console.warn('Tenor fallback error:', e);
  }

  // 3. Guaranteed High-Quality Curated Fallback
  const CURATED_GIFS = [
    { url: 'https://media1.tenor.com/m/3k9413J7RkIAAAAC/cat-love.gif', title: 'cat love' },
    { url: 'https://media1.tenor.com/m/n387vI0y4cAAAAAC/love-hug.gif', title: 'warm hug' },
    { url: 'https://media1.tenor.com/m/w5d3kS7R8KAAAAAC/cute-dance.gif', title: 'happy dance' },
    { url: 'https://media1.tenor.com/m/VFFTr7xZ19YAAAAC/milk-and-mocha-hug.gif', title: 'bear hug' },
    { url: 'https://media1.tenor.com/m/Z62Z7mP7JPAAAAAC/heart-cute.gif', title: 'heart sparkle' },
    { url: 'https://media1.tenor.com/m/7aA4-f2X97AAAAAC/cat-cuddle.gif', title: 'cuddle' },
    { url: 'https://media1.tenor.com/m/HhM9qI72k_AAAAAC/bubu-dudu-kiss.gif', title: 'sweet kiss' },
    { url: 'https://media1.tenor.com/m/0vLhGjBq5v8AAAAC/excited-happy.gif', title: 'excited' }
  ];
  res.json({ results: CURATED_GIFS });
});

// ── Room membership authZ (with short TTL cache to avoid per-message DB hits) ─
const membershipCache = new Map(); // `${room}|${user}` → { status, expires }
const MEMBERSHIP_TTL = 30 * 1000;

async function cachedAuthorize(roomName, username) {
  const key = `${roomName}|${username}`;
  const hit = membershipCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.status;
  const status = await authorizeRoom(mStore, roomName, username);
  membershipCache.set(key, { status, expires: Date.now() + MEMBERSHIP_TTL });
  return status;
}

// ── REST auth helper ──────────────────────────────────────────────────────────
async function requireAuth(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (!(await isSessionValid(decoded.username, decoded.sid))) {
    res.status(401).json({ error: 'Session revoked. Please sign in again.' });
    return null;
  }
  return decoded.username;
}

// ── Online users in-memory ────────────────────────────────────────────────────
const rooms = new Map(); // room → Map<socketId, {name, profile}>
const roomPictionaryState = new Map();
const rateLimitMap = new Map(); // username → { count, resetAt }

const PICTIONARY_WORDS = [
  'cat','sun','pizza','tree','heart','coffee','star','cake','rainbow','moon',
  'guitar','flower','butterfly','icecream','camera','cookie','balloon','house','car','smile'
];

function getRoomUsers(room) {
  if (!rooms.has(room)) rooms.set(room, new Map());
  return rooms.get(room);
}

async function updatePresence(username, socketId) {
  if (!isConfigured() || !username) return;
  try {
    await supabase.from('user_presence').upsert({
      username,
      socket_id: socketId,
      last_heartbeat: Date.now()
    }).catch(() => {});
  } catch { /* ignore */ }
}

async function getOnlineUsers() {
  if (!isConfigured()) return [];
  const cutoff = Date.now() - 60000;
  try {
    const { data } = await supabase
      .from('user_presence')
      .select('username')
      .gt('last_heartbeat', cutoff);
    return (data || []).map(r => r.username);
  } catch {
    return [];
  }
}

async function broadcastPresence(room) {
  const users = getRoomUsers(room);
  const list = []; const profList = [];
  for (const { name, profile } of users.values()) { list.push(name); profList.push({ name, ...profile }); }
  
  const onlineUsers = await getOnlineUsers();
  io.to(room).emit('presence', { room, users: list, profiles: profList, lastSeen: mStore.getLastSeen(), onlineUsers });
  io.emit('global-presence', { lastSeen: mStore.getLastSeen(), onlineUsers });
}

// ── Push helper ───────────────────────────────────────────────────────────────
async function sendPushToRoom(room, senderName, title, body) {
  try {
    const online = new Set();
    const m = rooms.get(room);
    if (m) for (const u of m.values()) online.add(String(u.name).toLowerCase());

    // Only notify actual members of this room — never blast every subscription.
    const dm = dmMembers(room);
    let members;
    if (dm) {
      members = dm;
    } else {
      const meta = await mStore.getRoomMeta(room);
      members = ((meta && meta.participants) || []).map(p => String(p).toLowerCase());
    }
    if (!members || !members.length) return;
    const memberSet = new Set(members);

    const subs = await mStore.getPushSubs();
    const tag = room ? `whispr-room-${room}` : 'whispr-default';
    for (const sub of subs) {
      const un = String(sub.username || '').toLowerCase();
      if (!memberSet.has(un) || un === String(senderName).toLowerCase() || online.has(un)) continue;
      if (room && isConfigured()) {
        try {
          const muted = await supabase.from('room_participants')
            .select('mute_until')
            .eq('room_name', room)
            .eq('username', un)
            .single();
          if (muted.data && muted.data.mute_until && muted.data.mute_until > Date.now()) continue;
        } catch { /* ignore */ }
      }
      const payload = JSON.stringify({ title, body, icon:'/icon-192.png', url:'/', tag });
      webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys || {} }, payload)
        .catch(err => { if (err.statusCode===410||err.statusCode===404) mStore.deletePushSub(sub.endpoint).catch(()=>{}); });
    }
  } catch (err) { console.error('Push error:', err); }
}

// ── Socket auth middleware ────────────────────────────────────────────────────
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!(await isSessionValid(decoded.username, decoded.sid))) {
      return next(new Error('Session revoked'));
    }
    socket.data.authenticatedUser = decoded.username;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const username = socket.data.authenticatedUser;
  let currentRoom = null;

  // ── Join ──────────────────────────────────────────────────────────────────
  socket.on('join', async ({ room, nickname, _password } = {}) => {
    try {
      if (currentRoom) {
        socket.leave(currentRoom);
        const oldUsers = getRoomUsers(currentRoom);
        if (oldUsers) {
          oldUsers.delete(socket.id);
          broadcastPresence(currentRoom);
          if (oldUsers.size === 0) rooms.delete(currentRoom);
        }
      }

      // Identity comes exclusively from the verified JWT — never the client.
      currentRoom = normalizeRoom(room) || `dm_${username.toLowerCase()}_${username.toLowerCase()}`;

      const access = await cachedAuthorize(currentRoom, username);
      if (!canRead(access)) {
        socket.emit('room-error', { error: 'You do not have access to this room.' });
        currentRoom = null;
        return;
      }

      const displayNick = normalizeNickname(nickname, username);
      let profile = await mStore.getProfile(username);
      if (displayNick && displayNick !== username) {
        profile = await mStore.updateProfile(username, { nickname: displayNick });
      }

      socket.join(currentRoom);
      socket.join('user:' + username.toLowerCase());
      getRoomUsers(currentRoom).set(socket.id, { name: username, profile });

      const streak = mStore.recordActivity(username);
      mStore.setLastSeen(username);
      socket.to(currentRoom).emit('streak-update', streak);
      await updatePresence(username, socket.id);

      const roomMeta = await mStore.getRoomMeta(currentRoom);
      const history = await mStore.getMessages(currentRoom, 100);
      const pinnedMsg = roomMeta.pinnedMessageId
        ? history.find(m => m.id === roomMeta.pinnedMessageId) || null : null;

      socket.emit('joined', {
        profile, history,
        mood: roomMeta.mood, jokes: roomMeta.jokes || [], countdown: roomMeta.countdown || {},
        motd: mStore.getMotd(), streak, lastSeen: mStore.getLastSeen(),
        feelingsPalette: mStore.FEELINGS, feelings: mStore.getFeelings(),
        pinnedMsg, readBy: roomMeta.readBy || {},
        diary: roomMeta.diary || [], bucketList: roomMeta.bucketList || [],
        calendar: roomMeta.calendar || [], glossary: roomMeta.glossary || [],
        bonsai: roomMeta.bonsai || { growth:0, lastWatered:null },
        gameScores: roomMeta.gameScores || { wins:{}, losses:{} },
        hasPassword: Boolean(roomMeta.roomPassword),
        disappearingTimer: roomMeta.disappearingTimer || 0,
        dailyQuestionState: await mStore.getDailyQuestionState(currentRoom, username)
      });

      io.to(currentRoom).emit('system', randomJoinMessage(profile.nickname || username));
      broadcastPresence(currentRoom);
    } catch (err) { console.error('join error:', err); }
  });

  // ── Clear history ─────────────────────────────────────────────────────────
  socket.on('clear-history', async () => {
    try {
      if (!currentRoom || !username) return;
      if (!isMember(await cachedAuthorize(currentRoom, username))) {
        return socket.emit('room-error', { error: 'Only room members can clear history.' });
      }
      await mStore.clearHistory(currentRoom);
      io.to(currentRoom).emit('history-cleared');
      io.to(currentRoom).emit('system', '🧹 Chat history was cleared.');
    } catch (err) { console.error('clear-history error:', err); }
  });

  socket.on('set-room-password', async (pass) => {
    try {
      if (!currentRoom || !username) return;
      if (!isMember(await cachedAuthorize(currentRoom, username))) {
        return socket.emit('room-error', { error: 'Only room members can change the room password.' });
      }
      const safePass = String(pass || '').trim();
      await mStore.updateRoomMeta(currentRoom, { roomPassword: safePass });
      socket.emit('password-updated', { hasPassword: Boolean(safePass) });
      io.to(currentRoom).emit('system', safePass ? '🔒 Room password updated.' : '🔓 Room password removed.');
    } catch (err) { console.error('set-room-password error:', err); }
  });

  socket.on('set-disappearing-timer', async (durationMs) => {
    try {
      if (!currentRoom) return;
      const ms = typeof durationMs === 'number' ? Math.max(0, durationMs) : 0;
      await mStore.updateRoomMeta(currentRoom, { disappearingTimer: ms });
      io.to(currentRoom).emit('disappearing-updated', { durationMs: ms });
    } catch (err) { console.error('set-disappearing-timer error:', err); }
  });

  // ── Daily Question Answer to Unlock ───────────────────────────────────────
  socket.on('submit-daily-answer', async ({ answer } = {}) => {
    try {
      if (!currentRoom || !username) return;
      const updatedState = await mStore.saveDailyQuestionAnswer(currentRoom, username, answer);
      io.to(currentRoom).emit('daily-answer-update', updatedState);
      if (updatedState.revealed) {
        io.to(currentRoom).emit('system', '✨ Both answered today\'s question! Answers revealed & saved to Diary!');
      }
    } catch (err) { console.error('submit-daily-answer error:', err); }
  });

  socket.on('get-daily-answer-state', async () => {
    try {
      if (!currentRoom || !username) return;
      const state = await mStore.getDailyQuestionState(currentRoom, username);
      socket.emit('daily-answer-update', state);
    } catch (err) { console.error('get-daily-answer-state error:', err); }
  });

  // ── Message ───────────────────────────────────────────────────────────────
  socket.on('message', async (payload) => {
    // Identity comes exclusively from the verified JWT — never the client.
    const targetRoom = normalizeRoom(payload && payload.room) || currentRoom || `dm_${username.toLowerCase()}_${username.toLowerCase()}`;

    const access = await cachedAuthorize(targetRoom, username);
    if (!canRead(access)) {
      return socket.emit('room-error', { error: 'You cannot send messages to this room.' });
    }
    currentRoom = targetRoom;
    socket.join(targetRoom);
    socket.join('user:' + username.toLowerCase());

    const _now = Date.now();
    const rl = rateLimitMap.get(username);
    if (!rl || _now > rl.resetAt) {
      rateLimitMap.set(username, { count: 1, resetAt: _now + 5000 });
    } else {
      rl.count++;
      if (rl.count > 60) { socket.emit('rate-limited', { message: 'Slow down! Take a breath.' }); return; }
    }

    if (payload && typeof payload === 'object' && payload.user && payload.user !== username) {
      const blocked = await mStore.isUserBlocked(username, payload.user);
      if (blocked) return;
    }

    let msgData;
    if (typeof payload === 'string') {
      const text = normalizeText(payload); if (!text) return;
      msgData = { user: username, text, type: 'text', room: targetRoom };
    } else if (payload && typeof payload === 'object') {
      const type = payload.type || 'text';
      if (type === 'hug') msgData = { user: username, text: 'sent a hug 💌', type: 'hug', room: targetRoom };
      else if (type === 'image') { if (!payload.url) return; msgData = { user: username, text: payload.text||'', url: payload.url, type:'image', viewOnce: Boolean(payload.viewOnce), room: targetRoom }; }
      else if (type === 'media-group') { if (!payload.items || !payload.items.length) return; msgData = { user: username, text: payload.text||'', items: payload.items, type:'media-group', room: targetRoom }; }
      else if (type === 'document') { if (!payload.url) return; msgData = { user: username, url: payload.url, docName: payload.docName||'Document', docSize: payload.docSize||0, type:'document', room: targetRoom }; }
      else if (type === 'voice') { if (!payload.url) return; msgData = { user: username, text:'', url: payload.url, duration: payload.duration||0, type:'voice', viewOnce: Boolean(payload.viewOnce), room: targetRoom }; }
      else if (type === 'video-note') { if (!payload.url) return; msgData = { user: username, text:'', url: payload.url, duration: payload.duration||0, type:'video-note', room: targetRoom }; }
      else if (type === 'time-capsule') {
        msgData = {
          user: username,
          text: payload.text || '',
          url: payload.url || '',
          unlockAt: typeof payload.unlockAt === 'number' ? payload.unlockAt : (Date.now() + 86400000),
          type: 'time-capsule',
          room: targetRoom
        };
      }
      else if (type === 'music') { if (!payload.url) return; msgData = { user: username, text: payload.text||payload.url, url: payload.url, type:'music', room: targetRoom }; }
      else {
        const text = normalizeText(payload.text||''); if (!text) return;
        msgData = { user: username, text, type:'text', room: targetRoom, ...(payload.replyTo ? { replyTo: payload.replyTo } : {}) };
      }
      if (payload.replyTo && msgData && !msgData.replyTo) msgData.replyTo = payload.replyTo;
      if (payload.clientMsgId) msgData.clientMsgId = payload.clientMsgId;
    } else return;

    try {
      let message;
      try {
        const res = await mStore.addMessage(targetRoom, msgData);
        message = res.message;
      } catch (err) {
        console.error('mStore.addMessage error, using fallback:', err.message);
        if (payload && payload.clientMsgId) {
          socket.emit('message-error', { clientMsgId: payload.clientMsgId, error: err.message || 'Failed to send message' });
        }
        message = {
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('msg_' + Date.now()),
          ...msgData,
          time: Date.now(),
          reactions: {},
          room: targetRoom
        };
      }
      mStore.setLastSeen(username);

      io.to(targetRoom).emit('message', message);
      if (targetRoom.startsWith('dm_')) {
        const parts = targetRoom.replace('dm_', '').split('_');
        for (const p of parts) {
          io.to('user:' + p.toLowerCase()).emit('message', message);
          io.to('user:' + p.toLowerCase()).emit('chat-list-update', { roomName: targetRoom });
        }
      }
      if (payload && payload.clientMsgId) {
        socket.emit('message-ack', { clientMsgId: payload.clientMsgId, id: message.id });
      }

      const profile = await mStore.getProfile(username);
      sendPushToRoom(targetRoom, username, `${profile.nickname||username} 💌`, msgData.text || 'sent a message');

      // Pictionary guess check
      const pState = roomPictionaryState.get(targetRoom);
      if (pState && msgData.text && msgData.user !== pState.drawer) {
        if (msgData.text.trim().toLowerCase() === pState.word.toLowerCase()) {
          roomPictionaryState.delete(targetRoom);
          const display = profile.nickname || username;
          const scores = await mStore.updateGameScore(targetRoom, username);
          io.to(targetRoom).emit('score-update', scores);
          io.to(targetRoom).emit('pictionary-correct', { winner: display, word: pState.word });
          io.to(targetRoom).emit('system', `🎉 ${display} guessed the secret word: "${pState.word}"!! 🏆`);
        }
      }
    } catch (err) { console.error('socket message handler error:', err); }
  });

  // ── View-Once Media Opened ───────────────────────────────────────────────
  socket.on('view-once-opened', async ({ messageId } = {}) => {
    try {
      if (!currentRoom || !username || !messageId) return;
      await mStore.markViewOnceOpened(currentRoom, messageId);
      io.to(currentRoom).emit('view-once-opened', { messageId, openedBy: username });
    } catch (err) { console.error('view-once-opened error:', err); }
  });

  // ── Load Older Messages (pagination) ─────────────────────────────────────
  socket.on('load-older-messages', async ({ before, limit } = {}) => {
    try {
      if (!currentRoom || !username) return;
      const messages = await mStore.getRoomMessagesPaginated(currentRoom, before || Date.now(), limit || 50);
      socket.emit('older-messages', { room: currentRoom, messages });
    } catch (err) { console.error('load-older-messages error:', err); }
  });

  // ── Forward Message ──────────────────────────────────────────────────────
  socket.on('forward-message', async ({ messageId, targetRoom, targetUser } = {}) => {
    try {
      if (!messageId || (!targetRoom && !targetUser)) return;
      
      let sourceRoom = currentRoom;
      if (!sourceRoom) return;
      
      const original = await mStore.findMessage(sourceRoom, messageId);
      if (!original) return;
      
      let destRoom = targetRoom;
      if (!destRoom && targetUser) {
        const dm = await mStore.getOrCreateDMRoom(username, targetUser);
        destRoom = dm.roomName;
      }
      if (!destRoom) return;
      
      const forwarded = {
        user: username,
        text: original.text || '',
        type: original.type || 'text',
        url: original.url || '',
        room: destRoom,
        replyTo: null,
        forwardedFrom: { user: original.user, messageId: original.id, type: original.type }
      };
      
      const res = await mStore.addMessage(destRoom, forwarded);
      const message = res.message;
      io.to(destRoom).emit('message', message);
      if (destRoom.startsWith('dm_')) {
        const parts = destRoom.replace('dm_', '').split('_');
        for (const p of parts) {
          io.to('user:' + p.toLowerCase()).emit('message', message);
        }
      }
    } catch (err) { console.error('forward-message error:', err); }
  });

  // ── Granular Presence (typing, recording audio/video, sending media) ──────
  socket.on('presence-status', ({ status } = {}) => {
    try {
      if (!currentRoom || !username) return;
      socket.to(currentRoom).emit('presence-status-update', { user: username, status: status || 'idle' });
    } catch (err) { console.error('presence-status error:', err); }
  });

  // ── Heartbeat (update presence DB + last seen) ────────────────────────────
  socket.on('heartbeat', async () => {
    if (!username) return;
    mStore.setLastSeen(username);
    await updatePresence(username, socket.id);
  });

  // ── Custom User Status (e.g. ☕ In a meeting) ──────────────────────────────
  socket.on('update-custom-status', async ({ status } = {}) => {
    try {
      if (!username) return;
      const safe = normalizeText(status || '');
      await mStore.updateProfile(username, { bio: safe });
      io.emit('user-status-updated', { user: username, status: safe });
    } catch (err) { console.error('update-custom-status error:', err); }
  });

  // ── Create Group Chat / Channel ───────────────────────────────────────────
  socket.on('create-group', async ({ groupName, members, topic } = {}) => {
    try {
      if (!username || !groupName) return;
      const cleanGroupName = normalizeText(groupName);
      if (!cleanGroupName) return;
      const groupRoom = 'group_' + cleanGroupName.toLowerCase().replace(/[^a-z0-9_-]/g, '') + '_' + Date.now().toString(36);
      const allMembers = Array.from(new Set([username.toLowerCase(), ...(Array.isArray(members) ? members.map(m => (m || '').toLowerCase()) : [])]));
      
      await mStore.updateRoomMeta(groupRoom, {
        displayName: cleanGroupName,
        isGroup: true,
        type: 'group',
        topic: topic || '',
        admin: username.toLowerCase(),
        participants: allMembers,
        members: allMembers,
        createdAt: Date.now()
      });

      // Notify all involved users
      io.emit('group-created', { room: groupRoom, name: cleanGroupName, members: allMembers, topic: topic || '' });
    } catch (err) { console.error('create-group error:', err); }
  });

  // ── Star / Bookmark message ───────────────────────────────────────────────
  socket.on('star-message', async ({ messageId, starred } = {}) => {
    try {
      if (!currentRoom || !username || !messageId) return;
      const updated = await mStore.starMessage(currentRoom, messageId, username, starred);
      if (updated) io.to(currentRoom).emit('message-starred', { messageId, starredBy: updated.starredBy });
    } catch (err) { console.error('star-message error:', err); }
  });

  socket.on('get-starred-messages', async (ack) => {
    try {
      if (!currentRoom || !username || typeof ack !== 'function') return;
      const list = await mStore.getStarredMessages(currentRoom, username);
      ack({ messages: list || [] });
    } catch { if (typeof ack === 'function') ack({ messages: [] }); }
  });

  // ── Secret message ────────────────────────────────────────────────────────
  socket.on('secret-message', async ({ text } = {}) => {
    try {
      if (!username || !currentRoom) return;
      const safe = normalizeText(text); if (!safe) return;
      const profile = await mStore.getProfile(username);
      const id = crypto.randomUUID();
      const msg = { id, user: username, text: safe, type:'secret', time: Date.now(), reactions:{}, profile: { avatar: profile.avatar, color: profile.color, nickname: profile.nickname } };
      io.to(currentRoom).emit('message', msg);
      setTimeout(() => io.to(currentRoom).emit('message-deleted', { messageId: id }), 30000);
    } catch (err) { console.error('secret-message error:', err); }
  });

  // ── Edit message ──────────────────────────────────────────────────────────
  socket.on('edit-message', async ({ messageId, text } = {}) => {
    try {
      if (!username || !currentRoom || !messageId) return;
      const safe = normalizeText(text); if (!safe) return;
      const msg = await mStore.findMessage(currentRoom, messageId);
      if (!msg || msg.user !== username || msg.deleted) return;
      const updated = await mStore.editMessage(currentRoom, messageId, safe);
      if (updated) io.to(currentRoom).emit('message-edited', { messageId, text: safe, editedAt: updated.editedAt });
    } catch (err) { console.error('edit-message error:', err); }
  });

  // ── Delete message ────────────────────────────────────────────────────────
  socket.on('delete-message', async ({ messageId } = {}) => {
    try {
      if (!username || !currentRoom || !messageId) return;
      const msg = await mStore.findMessage(currentRoom, messageId);
      if (!msg || msg.user !== username) return;
      await mStore.deleteMessage(currentRoom, messageId);
      io.to(currentRoom).emit('message-deleted', { messageId });
    } catch (err) { console.error('delete-message error:', err); }
  });

  // ── Toggle task checkbox ───────────────────────────────────────────────────
  socket.on('toggle-task', async ({ messageId, taskIndex, checked } = {}) => {
    try {
      if (!username || !currentRoom || !messageId) return;
      const msg = await mStore.findMessage(currentRoom, messageId);
      if (!msg || !msg.text) return;
      
      const lines = msg.text.split('\n');
      let currentTaskIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^-\s*\[([ xX])\]\s*(.*)/.test(lines[i])) {
          if (currentTaskIdx === taskIndex) {
            const taskContent = lines[i].replace(/^-\s*\[([ xX])\]\s*/, '');
            lines[i] = `- [${checked ? 'x' : ' '}] ${taskContent}`;
            break;
          }
          currentTaskIdx++;
        }
      }
      const newText = lines.join('\n');
      const updated = await mStore.editMessage(currentRoom, messageId, newText);
      if (updated) {
        io.to(currentRoom).emit('task-toggled', { messageId, text: newText, taskIndex, checked, user: username });
      }
    } catch (err) { console.error('toggle-task error:', err); }
  });

  // ── Vote on Poll ───────────────────────────────────────────────────────────
  socket.on('vote-poll', async ({ messageId, optionIndex } = {}) => {
    try {
      if (!username || !currentRoom || !messageId || optionIndex === undefined) return;
      const msg = await mStore.findMessage(currentRoom, messageId);
      if (!msg || msg.type !== 'poll' || !Array.isArray(msg.options)) return;

      const votes = Array.isArray(msg.votes) ? [...msg.votes] : [];
      const userVote = votes.find(v => v.user === username);
      if (userVote) {
        if (userVote.optionIndex === optionIndex) {
          const idx = votes.indexOf(userVote);
          if (idx !== -1) votes.splice(idx, 1);
        } else {
          userVote.optionIndex = optionIndex;
        }
      } else {
        votes.push({ user: username, optionIndex });
      }

      await mStore.updatePollVotes(currentRoom, messageId, votes);
      io.to(currentRoom).emit('poll-voted', { messageId, votes });
    } catch (err) { console.error('vote-poll error:', err); }
  });

  // ── Read & Delivery Receipts ──────────────────────────────────────────────
  socket.on('mark-read', async (payload = {}) => {
    try {
      if (!currentRoom || !username) return;
      const ids = Array.isArray(payload.messageIds)
        ? payload.messageIds
        : (payload.messageId ? [payload.messageId] : []);
      if (!ids.length) return;
      let lastId = null;
      for (const id of ids) {
        await mStore.markMessageRead(currentRoom, id, username);
        lastId = id;
      }
      if (lastId) {
        const readBy = await mStore.updateReadReceipt(currentRoom, username, lastId);
        io.to(currentRoom).emit('receipt-update', readBy);
      }
      socket.to(currentRoom).emit('messages-read', { messageIds: ids, reader: username });
    } catch (err) { console.error('mark-read error:', err); }
  });

  socket.on('mark-delivered', async ({ messageId } = {}) => {
    try {
      if (!currentRoom || !username || !messageId) return;
      await mStore.markMessageDelivered(currentRoom, messageId, username);
      socket.to(currentRoom).emit('message-delivered', { messageId, receiver: username });
    } catch (err) { console.error('mark-delivered error:', err); }
  });

  // ── Pin / Unpin ───────────────────────────────────────────────────────────
  socket.on('pin-message', async ({ messageId } = {}) => {
    try {
      if (!currentRoom || !messageId) return;
      await mStore.pinMessage(currentRoom, messageId);
      const history = await mStore.getMessages(currentRoom, 200);
      const msg = history.find(m => m.id === messageId) || null;
      io.to(currentRoom).emit('pinned-update', { messageId, msg });
    } catch (err) { console.error('pin-message error:', err); }
  });

  socket.on('unpin-message', async () => {
    try {
      if (!currentRoom) return;
      await mStore.pinMessage(currentRoom, null);
      io.to(currentRoom).emit('pinned-update', { messageId: null, msg: null });
    } catch (err) { console.error('unpin-message error:', err); }
  });

  // ── Shared pad ────────────────────────────────────────────────────────────
  socket.on('update-pad', ({ text } = {}) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('pad-updated', { text });
  });

  // ── View-once expire ──────────────────────────────────────────────────────
  socket.on('view-once-expire', async ({ messageId } = {}) => {
    try {
      if (!currentRoom || !messageId) return;
      const msg = await mStore.findMessage(currentRoom, messageId);
      if (msg) {
        await mStore.editMessage(currentRoom, messageId, '👁️ Photo expired');
        io.to(currentRoom).emit('view-once-expired', { messageId });
      }
    } catch (err) { console.error('view-once-expire error:', err); }
  });

  // ── Read receipt ──────────────────────────────────────────────────────────
  socket.on('read-receipt', async ({ messageId } = {}) => {
    try {
      if (!username || !currentRoom || !messageId) return;
      const readBy = await mStore.updateReadReceipt(currentRoom, username, messageId);
      io.to(currentRoom).emit('receipt-update', readBy);
    } catch (err) { console.error('read-receipt error:', err); }
  });

  // ── Reactions ─────────────────────────────────────────────────────────────
  socket.on('react', async ({ messageId, emoji, add }) => {
    try {
      if (!username || !currentRoom) return;
      const msg = await mStore.updateMessageReaction(currentRoom, messageId, emoji, username, add);
      if (!msg) return;
      io.to(currentRoom).emit('reaction-update', { messageId, reactions: msg.reactions });
    } catch (err) { console.error('react error:', err); }
  });

  // ── Profile ───────────────────────────────────────────────────────────────
  socket.on('update-profile-bio', async ({ avatar, statusBio, color }) => {
    try {
      if (!username) return;
      const updates = {};
      if (avatar) updates.avatar = avatar;
      if (statusBio !== undefined) updates.statusBio = statusBio;
      if (color) updates.color = color;
      const updated = await mStore.updateProfile(username, updates);
      if (currentRoom) {
        getRoomUsers(currentRoom).set(socket.id, { name: username, profile: updated });
        io.to(currentRoom).emit('profile-updated', { username, profile: updated });
      }
    } catch (err) { console.error('update-profile-bio error:', err); }
  });

  // ── Connect 4 ─────────────────────────────────────────────────────────────
  socket.on('c4-move', ({ col, color }) => { if (currentRoom) socket.to(currentRoom).emit('c4-move', { user: username, col, color }); });

  // ── Typing ────────────────────────────────────────────────────────────────
  socket.on('typing', async () => {
    try {
      if (!username || !currentRoom) return;
      const profile = await mStore.getProfile(username);
      socket.to(currentRoom).emit('typing', profile.nickname || username);
    } catch (err) { console.error('typing error:', err); }
  });

  // ── Heartbeat handled above (merged: presence + lastSeen) ──────────────────

  // ── Games ─────────────────────────────────────────────────────────────────
  socket.on('start-game', async (type) => {
    try {
      if (!username || !currentRoom) return;
      if (type === 'pictionary') {
        const word = PICTIONARY_WORDS[Math.floor(Math.random() * PICTIONARY_WORDS.length)];
        const profile = await mStore.getProfile(username);
        const display = profile.nickname || username;
        roomPictionaryState.set(currentRoom, { word, drawer: username });
        socket.emit('pictionary-word', { word });
        io.to(currentRoom).emit('pictionary-start', { drawer: display });
        io.to(currentRoom).emit('system', `🎨 ${display} started Pictionary! Guess their drawing in chat!`);
        return;
      }
      const prompt = randomGamePrompt(type); if (!prompt) return;
      const profile = await mStore.getProfile(username);
      const display = profile.nickname || username;
      io.to(currentRoom).emit('game-prompt', { from: display, type: prompt.type, question: prompt.text||prompt.q, options: prompt.a ? [prompt.a, prompt.b] : null });
    } catch (err) { console.error('start-game error:', err); }
  });

  // ── Room meta ─────────────────────────────────────────────────────────────
  socket.on('update-mood', async (mood) => { try { if (!currentRoom) return; await mStore.updateRoomMeta(currentRoom, { mood: String(mood||'').slice(0,100) }); io.to(currentRoom).emit('mood-update', mood); } catch (err) { console.error('update-mood error:', err); } });
  socket.on('update-jokes', async (jokes) => { try { if (!currentRoom) return; const safe=(Array.isArray(jokes)?jokes:[]).map(j=>String(j).slice(0,200)).slice(0,20); await mStore.updateRoomMeta(currentRoom,{jokes:safe}); io.to(currentRoom).emit('jokes-update',safe); } catch (err) { console.error('update-jokes error:', err); } });

        socket.on('update-countdown', async ({label,date}={}) => { try { if (!currentRoom) return; const cd={label:String(label||'').slice(0,50),date:date||null}; await mStore.updateRoomMeta(currentRoom,{countdown:cd}); io.to(currentRoom).emit('countdown-update',cd); } catch (err) { console.error('update-countdown error:', err); } });
        socket.on('update-weather', async (city) => { try { if (!currentRoom) return; const c=String(city||'').slice(0,100); await mStore.updateRoomMeta(currentRoom,{weatherCity:c}); io.to(currentRoom).emit('weather-update',c); } catch (err) { console.error('update-weather error:', err); } });

  socket.on('update-nickname', async (nick) => {
    try {
      if (!username) return;
      const safe = normalizeNickname(nick, username);
      await mStore.updateProfile(username, { nickname: safe });
      const userEntry = currentRoom && getRoomUsers(currentRoom).get(socket.id);
      if (userEntry) userEntry.profile.nickname = safe;
      if (currentRoom) broadcastPresence(currentRoom);
    } catch (err) { console.error('update-nickname error:', err); }
  });

  // ── Feelings ──────────────────────────────────────────────────────────────
  socket.on('set-feeling', (feelingKey) => {
    try {
      if (!username) return;
      const f = mStore.setFeeling(username, feelingKey); if (!f) return;
      if (currentRoom) io.to(currentRoom).emit('feelings-update', mStore.getFeelings());
    } catch (err) { console.error('set-feeling error:', err); }
  });

  // ── Empathy pulse ─────────────────────────────────────────────────────────
  socket.on('empathy-pulse', async () => {
    try {
      if (!username || !currentRoom) return;
      const profile = await mStore.getProfile(username);
      socket.to(currentRoom).emit('empathy-pulse', { from: profile.nickname || username });
      sendPushToRoom(currentRoom, username, `${profile.nickname||username} 💓`, 'sent you an empathy pulse');
    } catch (err) { console.error('empathy-pulse error:', err); }
  });

  // ── Poll vote ─────────────────────────────────────────────────────────────
  socket.on('poll-vote', async ({ messageId, option }) => {
    try {
      if (!username || !currentRoom) return;
      const msg = await mStore.findMessage(currentRoom, messageId);
      if (!msg || msg.type !== 'poll') return;
      const votes = msg.votes || {};
      votes[username] = option;
      await mStore.updatePollVotes(currentRoom, messageId, votes);
      io.to(currentRoom).emit('poll-update', { messageId, votes });
    } catch (err) { console.error('poll-vote error:', err); }
  });

  // ── WebRTC Calling ────────────────────────────────────────────────────────
  socket.on('call-invite', async (payload = {}) => {
    try {
      if (!payload.targetUser && !currentRoom) return;
      
      let blocked = false;
      if (payload.targetUser) {
        blocked = await mStore.isUserBlocked(payload.targetUser.toLowerCase(), username);
      } else if (currentRoom && currentRoom.startsWith('dm_')) {
        const parts = currentRoom.replace('dm_', '').split('_');
        for (const p of parts) {
          if (p.toLowerCase() !== (username || '').toLowerCase()) {
            if (await mStore.isUserBlocked(p.toLowerCase(), username)) { blocked = true; break; }
          }
        }
      }
      
      if (blocked) return;
      
      const data = {
        from: username,
        offer: payload.offer,
        type: payload.type || 'audio',
        callerSocketId: socket.id,
        room: currentRoom
      };
      if (payload.targetUser) {
        io.to('user:' + payload.targetUser.toLowerCase()).emit('call-invite', data);
      }
      if (currentRoom) {
        socket.to(currentRoom).emit('call-invite', data);
        if (currentRoom.startsWith('dm_')) {
          const parts = currentRoom.replace('dm_', '').split('_');
          for (const p of parts) {
            if (p.toLowerCase() !== (username || '').toLowerCase()) {
              io.to('user:' + p.toLowerCase()).emit('call-invite', data);
            }
          }
        }
        sendPushToRoom(currentRoom, username, `Incoming ${payload.type||'voice'} call! 📞`, `From ${username}`);
      }
    } catch (err) { console.error('call-invite error:', err); }
  });

  socket.on('call-accept', (payload = {}) => {
    try {
      const data = { answer: payload.answer, from: username, calleeSocketId: socket.id };
      if (payload.callerSocketId) io.to(payload.callerSocketId).emit('call-accept', data);
      if (payload.targetUser) io.to('user:' + payload.targetUser.toLowerCase()).emit('call-accept', data);
      if (currentRoom) socket.to(currentRoom).emit('call-accept', data);
    } catch (err) { console.error('call-accept error:', err); }
  });

  socket.on('call-decline', (payload = {}) => {
    try {
      const data = { from: username };
      if (payload.callerSocketId) io.to(payload.callerSocketId).emit('call-decline', data);
      if (payload.targetUser) io.to('user:' + payload.targetUser.toLowerCase()).emit('call-decline', data);
      if (currentRoom) socket.to(currentRoom).emit('call-decline', data);
    } catch (err) { console.error('call-decline error:', err); }
  });

  socket.on('call-candidate', (payload = {}) => {
    try {
      const data = { candidate: payload.candidate, from: username };
      if (payload.targetSocketId) io.to(payload.targetSocketId).emit('call-candidate', data);
      if (payload.targetUser) io.to('user:' + payload.targetUser.toLowerCase()).emit('call-candidate', data);
      if (currentRoom) socket.to(currentRoom).emit('call-candidate', data);
    } catch (err) { console.error('call-candidate error:', err); }
  });

  socket.on('call-hangup', (payload = {}) => {
    try {
      const data = { from: username };
      if (payload.targetSocketId) io.to(payload.targetSocketId).emit('call-hangup', data);
      if (payload.targetUser) io.to('user:' + payload.targetUser.toLowerCase()).emit('call-hangup', data);
      if (currentRoom) socket.to(currentRoom).emit('call-hangup', data);
    } catch (err) { console.error('call-hangup error:', err); }
  });

  // ── Co-Draw ───────────────────────────────────────────────────────────────
  socket.on('draw-stroke', (data) => { try { if (currentRoom) socket.to(currentRoom).emit('draw-stroke', data); } catch (err) { console.error('draw-stroke error:', err); } });
  socket.on('draw-clear', () => { try { if (currentRoom) socket.to(currentRoom).emit('draw-clear'); } catch (err) { console.error('draw-clear error:', err); } });

  // ── Watch Together ────────────────────────────────────────────────────────
  socket.on('watch-sync', (data) => { try { if (currentRoom) socket.to(currentRoom).emit('watch-sync', data); } catch (err) { console.error('watch-sync error:', err); } });

  // ── Games relay ───────────────────────────────────────────────────────────
  socket.on('game-move', (data) => { try { if (currentRoom) socket.to(currentRoom).emit('game-move', data); } catch (err) { console.error('game-move error:', err); } });
  socket.on('game-result', async ({ winner } = {}) => {
    try {
      if (!currentRoom) return;
      const scores = await mStore.updateGameScore(currentRoom, winner || null);
      io.to(currentRoom).emit('score-update', scores);
    } catch (err) { console.error('game-result error:', err); }
  });

  // ── Nudge / Haptic ────────────────────────────────────────────────────────
  socket.on('nudge', () => { try { if (currentRoom) socket.to(currentRoom).emit('nudge', { from: username }); } catch (err) { console.error('nudge error:', err); } });
  socket.on('haptic-touch', (data) => { try { if (currentRoom) socket.to(currentRoom).emit('haptic-touch', data); } catch (err) { console.error('haptic-touch error:', err); } });

  // ── Shared notebook syncs ─────────────────────────────────────────────────
  socket.on('update-diary', async (diary) => {
    try {
      if (!currentRoom) return;
      const safe = (Array.isArray(diary)?diary:[]).map(d=>({ date:String(d.date||''), text:String(d.text||'').slice(0,500), image:String(d.image||'') })).slice(0,100);
      await mStore.updateRoomMeta(currentRoom, { diary: safe });
      io.to(currentRoom).emit('diary-update', safe);
    } catch (err) { console.error('update-diary error:', err); }
  });
  socket.on('update-bucketlist', async (list) => {
    try {
      if (!currentRoom) return;
      const safe = (Array.isArray(list)?list:[]).map(b=>({ text:String(b.text||'').slice(0,100), done:Boolean(b.done), dateCompleted:b.dateCompleted||null })).slice(0,100);
      await mStore.updateRoomMeta(currentRoom, { bucketList: safe });
      io.to(currentRoom).emit('bucketlist-update', safe);
    } catch (err) { console.error('update-bucketlist error:', err); }
  });
  socket.on('update-calendar', async (cal) => {
    try {
      if (!currentRoom) return;
      const safe = (Array.isArray(cal)?cal:[]).map(c=>({ label:String(c.label||'').slice(0,100), date:String(c.date||'') })).slice(0,50);
      await mStore.updateRoomMeta(currentRoom, { calendar: safe });
      io.to(currentRoom).emit('calendar-update', safe);
    } catch (err) { console.error('update-calendar error:', err); }
  });
  socket.on('update-glossary', async (words) => {
    try {
      if (!currentRoom) return;
      const safe = (Array.isArray(words)?words:[]).map(w=>({ word:String(w.word||'').toLowerCase().trim().slice(0,30), meaning:String(w.meaning||'').slice(0,200) })).slice(0,50);
      await mStore.updateRoomMeta(currentRoom, { glossary: safe });
      io.to(currentRoom).emit('glossary-update', safe);
    } catch (err) { console.error('update-glossary error:', err); }
  });
  socket.on('update-bonsai', async (bonsaiState) => {
    try {
      if (!currentRoom) return;
      const current = (await mStore.getRoomMeta(currentRoom)).bonsai || { growth:0, lastWatered:null };
      const updated = {
        growth: typeof bonsaiState.growth==='number' ? bonsaiState.growth : current.growth,
        lastWatered: bonsaiState.lastWatered || current.lastWatered
      };
      await mStore.updateRoomMeta(currentRoom, { bonsai: updated });
      io.to(currentRoom).emit('bonsai-update', updated);
    } catch (err) { console.error('update-bonsai error:', err); }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    if (username) {
      await updatePresence(username, '').catch(() => {});
    }
    if (username && currentRoom) {
      const roomUsers = getRoomUsers(currentRoom);
      roomUsers.delete(socket.id);
      if (roomUsers.size === 0) rooms.delete(currentRoom);
      mStore.setLastSeen(username);
      socket.to(currentRoom).emit('system', randomLeaveMessage(username));
      broadcastPresence(currentRoom);
    }
  });
});

// ── Periodic cleanup ──────────────────────────────────────────────────────────
setInterval(() => mStore.cleanExpiredRooms().catch(()=>{}), 24 * 60 * 60 * 1000).unref();
setInterval(() => mStore.cleanDisappearingMessages().catch(()=>{}), 60 * 1000).unref();
setInterval(async () => {
  // Evict stale rate-limit and membership-cache entries
  const now = Date.now();
  for (const [k, v] of rateLimitMap) {
    if (now > v.resetAt) rateLimitMap.delete(k);
  }
  for (const [k, v] of membershipCache) {
    if (v.expires <= now) membershipCache.delete(k);
  }
  if (!isConfigured()) return;
  const cutoff = now - 60000;
  try {
    await supabase.from('user_presence').delete().lt('last_heartbeat', cutoff).catch(() => {});
  } catch { /* ignore */ }
}, 60 * 1000).unref();

// ── Error Handling ────────────────────────────────────────────────────────────
if (sentryEnabled) {
  try {
    const Sentry = require('@sentry/node');
    if (typeof Sentry.setupExpressErrorHandler === 'function') {
      Sentry.setupExpressErrorHandler(app);
    }
  } catch (err) {
    console.error('Failed to setup Sentry Express error handler:', err);
  }
}

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return _next(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => console.warn(`✨ Whispr running on port ${PORT}`));
}

// ── Process Lifecycle & Graceful Shutdown ─────────────────────────────────────
function shutdown() {
  console.warn('🛑 Shutdown signal received: closing HTTP and WebSocket servers...');
  io.close(() => {
    console.warn('✅ Server closed cleanly.');
    process.exit(0);
  });
  // io.close() also closes the underlying HTTP server; force-exit as a safety net.
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

module.exports = { app, server };
