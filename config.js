'use strict';
const crypto = require('crypto');

// JWT secret handling – enforce strong secret in production, allow temporary secret in dev/test.
const rawSecret = process.env.JWT_SECRET || '';
let JWT_SECRET;
if (process.env.NODE_ENV === 'production') {
  if (rawSecret.length < 32) {
    console.error('❌ JWT_SECRET must be set to at least 32 characters in production.');
    process.exit(1);
  }
  JWT_SECRET = rawSecret;
} else {
  // Development / test: generate temporary secret if none provided.
  JWT_SECRET = rawSecret.length >= 32 ? rawSecret : crypto.randomBytes(48).toString('hex');
}

module.exports = { JWT_SECRET };