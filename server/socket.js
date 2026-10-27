'use strict';
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const db = require('./db');
let pushModule = null;
try {
  pushModule = require('./push');
} catch {
  // Push optional / mockable in tests
}

// Map<username, Set<socketId>>
const userConnections = new Map();
// Map<username, timestamp>
const lastSeenMap = new Map();
// Rate limit per user: Map<username, { count: number, resetAt: number }>
const rateLimits = new Map();

// Active call state
let currentCall = null; // { caller, callee, type, timer, active: boolean }

function isUserOnline(username) {
  const set = userConnections.get(String(username).toLowerCase());
  return Boolean(set && set.size > 0);
}

function getLastSeen(username) {
  return lastSeenMap.get(String(username).toLowerCase()) || null;
}

function clearCurrentCall(io, reason = 'Call ended') {
  if (!currentCall) return;
  if (currentCall.timer) clearTimeout(currentCall.timer);
  const { caller, callee } = currentCall;
  currentCall = null;
  if (io) {
    io.to('user:' + caller).emit('call-hangup', { reason });
    io.to('user:' + callee).emit('call-hangup', { reason });
  }
}

function setupSocket(io) {
  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded || !decoded.username || !decoded.sid) {
        return next(new Error('Invalid token'));
      }

      const cleanUser = String(decoded.username).toLowerCase().trim();
      const user = await db.getUserByUsername(cleanUser);
      if (!user) {
        return next(new Error('User not found'));
      }

      const isValidSession = await db.isSessionValid(cleanUser, decoded.sid);
      if (!isValidSession) {
        return next(new Error('Session revoked'));
      }

      socket.data.authenticatedUser = cleanUser;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const username = socket.data.authenticatedUser;
    const partner = await db.getPartner(username);

    // Track connections for multi-device presence
    if (!userConnections.has(username)) {
      userConnections.set(username, new Set());
    }
    const conns = userConnections.get(username);
    const wasOffline = conns.size === 0;
    conns.add(socket.id);

    socket.join('user:' + username);

    // If newly online, notify partner
    if (wasOffline && partner) {
      io.to('user:' + partner).emit('presence', { user: username, online: true });
    }

    // Send initial partner status and recent messages to connecting socket
    if (partner) {
      socket.emit('partner-status', {
        partner,
        online: isUserOnline(partner),
        lastSeen: getLastSeen(partner)
      });
    }

    // Send recent messages
    try {
      const history = await db.getMessages(100);
      socket.emit('init-messages', history);
    } catch (err) {
      console.error('Error fetching message history:', err);
    }

    // ── Message Handler ───────────────────────────────────────────────────────
    socket.on('message', async (payload, ack) => {
      try {
        // Rate limiting: max 60 messages per 5 seconds
        const now = Date.now();
        const rl = rateLimits.get(username);
        if (!rl || now > rl.resetAt) {
          rateLimits.set(username, { count: 1, resetAt: now + 5000 });
        } else {
          rl.count++;
          if (rl.count > 60) {
            socket.emit('error-notice', { error: 'Rate limit exceeded. Please wait a moment.' });
            return;
          }
        }

        const type = payload?.type || 'text';
        if (!['text', 'image', 'voice'].includes(type)) {
          return socket.emit('error-notice', { error: 'Invalid message type' });
        }

        const body = typeof payload?.body === 'string' ? payload.body.trim().slice(0, 5000) : null;
        const mediaPath = typeof payload?.mediaPath === 'string' ? payload.mediaPath.trim() : null;
        const durationMs = typeof payload?.durationMs === 'number' ? Math.max(0, payload.durationMs) : null;
        const replyTo = typeof payload?.replyTo === 'string' ? payload.replyTo : null;

        if (type === 'text' && !body) return;
        if ((type === 'image' || type === 'voice') && !mediaPath) return;

        const message = await db.addMessage({
          sender: username,
          type,
          body,
          mediaPath,
          durationMs,
          replyTo
        });

        // Relay to both users
        io.to('user:' + username).emit('message', message);
        if (partner) {
          io.to('user:' + partner).emit('message', message);

          // If partner is online, mark as delivered
          if (isUserOnline(partner)) {
            const deliveredAt = await db.markDelivered(partner);
            io.to('user:' + username).emit('receipt', { type: 'delivered', upTo: deliveredAt });
          } else if (pushModule && typeof pushModule.sendPushToUser === 'function') {
            const snippet = type === 'image' ? '[Photo]' : (type === 'voice' ? '[Voice note]' : body);
            pushModule.sendPushToUser(partner, `${username}`, snippet).catch(() => {});
          }
        }

        if (typeof ack === 'function') ack({ status: 'ok', id: message.id });
      } catch (err) {
        console.error('Socket message error:', err);
        socket.emit('error-notice', { error: 'Failed to send message' });
      }
    });

    // ── Edit Message ──────────────────────────────────────────────────────────
    socket.on('edit-message', async ({ id, text } = {}) => {
      try {
        if (!id || typeof text !== 'string') return;
        const cleanText = text.trim().slice(0, 5000);
        if (!cleanText) return;

        const updated = await db.editMessage(id, username, cleanText);
        if (updated) {
          io.to('user:' + username).emit('message-edited', updated);
          if (partner) io.to('user:' + partner).emit('message-edited', updated);
        }
      } catch (err) {
        console.error('Socket edit-message error:', err);
      }
    });

    // ── Delete Message ────────────────────────────────────────────────────────
    socket.on('delete-message', async ({ id } = {}) => {
      try {
        if (!id) return;
        const deleted = await db.deleteMessage(id, username);
        if (deleted) {
          const payload = { id, deletedAt: Date.now() };
          io.to('user:' + username).emit('message-deleted', payload);
          if (partner) io.to('user:' + partner).emit('message-deleted', payload);
        }
      } catch (err) {
        console.error('Socket delete-message error:', err);
      }
    });

    // ── Delivery / Read Receipts ──────────────────────────────────────────────
    socket.on('receipt', async ({ type } = {}) => {
      try {
        if (!partner) return;
        if (type === 'read') {
          const readAt = await db.markRead(username);
          io.to('user:' + partner).emit('receipt', { user: username, type: 'read', upTo: readAt });
        } else if (type === 'delivered') {
          const deliveredAt = await db.markDelivered(username);
          io.to('user:' + partner).emit('receipt', { user: username, type: 'delivered', upTo: deliveredAt });
        }
      } catch (err) {
        console.error('Socket receipt error:', err);
      }
    });

    // ── Typing Indicator ──────────────────────────────────────────────────────
    socket.on('typing', ({ isTyping } = {}) => {
      if (partner) {
        io.to('user:' + partner).emit('typing', { user: username, isTyping: Boolean(isTyping) });
      }
    });

    // ── 1:1 WebRTC Call Signaling ─────────────────────────────────────────────
    socket.on('call-offer', async ({ type, sdp } = {}) => {
      try {
        if (!partner) {
          return socket.emit('call-error', { message: 'No partner configured' });
        }

        if (currentCall) {
          return socket.emit('call-busy', { message: 'Line is busy' });
        }

        if (!isUserOnline(partner)) {
          // Log missed call in message stream
          const missedMsg = await db.addMessage({
            sender: username,
            type: 'text',
            body: '[MISSED CALL]'
          });
          io.to('user:' + username).emit('message', missedMsg);
          if (pushModule && typeof pushModule.sendPushToUser === 'function') {
            pushModule.sendPushToUser(partner, `Missed call from ${username}`, '[MISSED CALL]').catch(() => {});
          }
          return socket.emit('call-unavailable', { message: 'Partner is offline' });
        }

        // Start 30-second ring timeout
        const timer = setTimeout(async () => {
          if (currentCall && !currentCall.active) {
            clearCurrentCall(io, 'No answer');
            const missedMsg = await db.addMessage({
              sender: username,
              type: 'text',
              body: '[MISSED CALL]'
            });
            io.to('user:' + username).emit('message', missedMsg);
            io.to('user:' + partner).emit('message', missedMsg);
          }
        }, 30000);

        currentCall = {
          caller: username,
          callee: partner,
          type: type || 'voice',
          timer,
          active: false
        };

        io.to('user:' + partner).emit('call-offer', {
          caller: username,
          type: currentCall.type,
          sdp
        });
      } catch (err) {
        console.error('Call offer error:', err);
        socket.emit('call-error', { message: 'Failed to initiate call' });
      }
    });

    socket.on('call-answer', ({ sdp } = {}) => {
      if (!currentCall || currentCall.callee !== username) return;
      if (currentCall.timer) clearTimeout(currentCall.timer);
      currentCall.timer = null;
      currentCall.active = true;

      io.to('user:' + currentCall.caller).emit('call-answer', {
        callee: username,
        sdp
      });
    });

    socket.on('call-candidate', ({ candidate } = {}) => {
      if (!currentCall || !candidate) return;
      const target = currentCall.caller === username ? currentCall.callee : currentCall.caller;
      io.to('user:' + target).emit('call-candidate', { candidate });
    });

    socket.on('call-hangup', ({ reason } = {}) => {
      if (!currentCall) return;
      if (currentCall.caller === username || currentCall.callee === username) {
        clearCurrentCall(io, reason || 'Call ended');
      }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const uConns = userConnections.get(username);
      if (uConns) {
        uConns.delete(socket.id);
        if (uConns.size === 0) {
          userConnections.delete(username);
          const now = Date.now();
          lastSeenMap.set(username, now);

          // If this user was on an ongoing/ringing call, end it
          if (currentCall && (currentCall.caller === username || currentCall.callee === username)) {
            clearCurrentCall(io, 'Partner disconnected');
          }

          if (partner) {
            io.to('user:' + partner).emit('presence', {
              user: username,
              online: false,
              lastSeen: now
            });
          }
        }
      }
    });
  });
}

function resetSocketStateForTests() {
  userConnections.clear();
  lastSeenMap.clear();
  rateLimits.clear();
  if (currentCall?.timer) clearTimeout(currentCall.timer);
  currentCall = null;
}

module.exports = {
  setupSocket,
  isUserOnline,
  getLastSeen,
  resetSocketStateForTests
};
