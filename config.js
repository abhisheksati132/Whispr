'use strict';
const crypto = require('crypto');

const rawSecret = process.env.JWT_SECRET || '';
const JWT_SECRET = rawSecret.length >= 32 ? rawSecret : crypto.randomBytes(48).toString('hex');

if (rawSecret.length < 32) {
  console.warn('⚠️  JWT_SECRET is missing or shorter than 32 characters.');
  console.warn('⚠️  Using an EPHEMERAL random secret — all sessions invalidate on every restart.');
  console.warn('⚠️  Set a strong JWT_SECRET env var in production!');
}

module.exports = { JWT_SECRET };
