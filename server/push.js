'use strict';
const express = require('express');
const webpush = require('web-push');
const db = require('./db');
const { requireAuth } = require('./auth');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://whispr.app';

let vapidKeys = { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY };

if (process.env.NODE_ENV === 'production') {
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.error('❌ VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured in production.');
  }
} else if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  // Generate transient in-memory keys for development/testing
  vapidKeys = webpush.generateVAPIDKeys();
}

if (vapidKeys.publicKey && vapidKeys.privateKey) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
  } catch (err) {
    console.error('Failed to configure VAPID details:', err);
  }
}

async function sendPushToUser(username, title, body, data = {}) {
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) return;
  try {
    const subs = await db.getPushSubs(username);
    if (!subs || subs.length === 0) return;

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      url: '/',
      data
    });

    const promises = subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys || {} }, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.deletePushSub(sub.endpoint).catch(() => {});
        }
      }
    });

    await Promise.allSettled(promises);
  } catch (err) {
    console.error('Error sending push notification:', err);
  }
}

function createPushRouter() {
  const router = express.Router();

  // GET /api/push/public-key
  router.get('/public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey || null });
  });

  // POST /api/push/subscribe
  router.post('/subscribe', requireAuth, async (req, res) => {
    try {
      const sub = req.body;
      if (!sub || !sub.endpoint) {
        return res.status(400).json({ error: 'Valid subscription required' });
      }
      await db.savePushSub(req.user.username, sub);
      res.json({ status: 'ok' });
    } catch (err) {
      console.error('Push subscribe error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/push/unsubscribe
  router.post('/unsubscribe', requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body || {};
      if (endpoint) {
        await db.deletePushSub(endpoint);
      }
      res.json({ status: 'ok' });
    } catch (err) {
      console.error('Push unsubscribe error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = {
  createPushRouter,
  sendPushToUser,
  vapidKeys
};
