'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const db = require('./db');

// Precomputed bcrypt hash of a random string for constant-time comparisons when a user doesn't exist
const DUMMY_HASH = '$2a$10$wT8E4m5m0qK1p/mO6qS7rO0y7u0v1w2x3y4z5a6b7c8d9e0f1g2h3';

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.username || !decoded.sid) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    db.isSessionValid(decoded.username, decoded.sid)
      .then(isValid => {
        if (!isValid) {
          return res.status(401).json({ error: 'Session revoked' });
        }
        req.user = { username: decoded.username, sid: decoded.sid };
        next();
      })
      .catch(err => {
        console.error('Session check error:', err);
        res.status(500).json({ error: 'Internal server error' });
      });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function createAuthRouter() {
  const router = express.Router();

  // POST /api/auth/register
  router.post('/register', async (req, res) => {
    try {
      const rawUser = String(req.body.username || '').trim().toLowerCase();
      const rawPass = String(req.body.password || '');

      if (!USERNAME_REGEX.test(rawUser)) {
        return res.status(400).json({
          error: 'Username must be 3-20 characters and contain only lowercase letters, numbers, and underscores'
        });
      }

      if (rawPass.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
      }

      const passwordHash = await bcrypt.hash(rawPass, 10);
      try {
        await db.createUser({ username: rawUser, passwordHash });
      } catch (err) {
        if (err.code === 'LINK_CLOSED' || err.message?.includes('link closed')) {
          return res.status(403).json({ error: 'link closed' });
        }
        if (err.code === 'USERNAME_TAKEN') {
          return res.status(409).json({ error: 'Username already taken' });
        }
        throw err;
      }

      const userAgent = req.headers['user-agent'] || '';
      const ip = req.ip || req.socket.remoteAddress || '';
      const session = await db.createSession(rawUser, userAgent, ip);

      const token = jwt.sign({ username: rawUser, sid: session.id }, JWT_SECRET, { expiresIn: '60d' });
      return res.status(201).json({ token, username: rawUser });
    } catch (err) {
      console.error('Registration error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    try {
      const rawUser = String(req.body.username || '').trim().toLowerCase();
      const rawPass = String(req.body.password || '');

      if (!rawUser || !rawPass) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const user = await db.getUserByUsername(rawUser);
      if (!user) {
        // Run dummy bcrypt compare to eliminate response-timing differences
        await bcrypt.compare(rawPass, DUMMY_HASH);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const match = await bcrypt.compare(rawPass, user.passwordHash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const userAgent = req.headers['user-agent'] || '';
      const ip = req.ip || req.socket.remoteAddress || '';
      const session = await db.createSession(rawUser, userAgent, ip);

      const token = jwt.sign({ username: rawUser, sid: session.id }, JWT_SECRET, { expiresIn: '60d' });
      return res.status(200).json({ token, username: rawUser });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/auth/logout
  router.post('/logout', requireAuth, async (req, res) => {
    try {
      await db.revokeSession(req.user.username, req.user.sid);
      return res.status(200).json({ status: 'ok' });
    } catch (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/auth/me
  router.get('/me', requireAuth, async (req, res) => {
    try {
      const partner = await db.getPartner(req.user.username);
      return res.status(200).json({ username: req.user.username, partner });
    } catch (err) {
      console.error('Get profile error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/auth/status
  router.get('/status', async (req, res) => {
    try {
      const count = await db.getUserCount();
      return res.status(200).json({ registrationOpen: count < 2 });
    } catch (err) {
      console.error('Auth status error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = {
  createAuthRouter,
  requireAuth
};
