#!/usr/bin/env node
'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../server/db');

async function resetUserPassword(username, newPassword) {
  const cleanUser = String(username || '').trim().toLowerCase();
  const rawPass = String(newPassword || '');

  if (!cleanUser) {
    throw new Error('Username is required');
  }
  if (!rawPass || rawPass.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  const user = await db.getUserByUsername(cleanUser);
  if (!user) {
    throw new Error(`User "${cleanUser}" not found`);
  }

  const passwordHash = await bcrypt.hash(rawPass, 10);
  await db.updateUserPassword(cleanUser, passwordHash);
  await db.revokeAllUserSessions(cleanUser);

  return { username: cleanUser, status: 'password_reset_and_sessions_revoked' };
}

if (require.main === module) {
  const [,, userArg, passArg] = process.argv;
  if (!userArg || !passArg) {
    console.error('Usage: node scripts/reset-password.js <username> <new-password>');
    process.exit(1);
  }

  resetUserPassword(userArg, passArg)
    .then((res) => {
      console.log(`[OK] Password reset successful for user "${res.username}".`);
      console.log('[OK] All existing sessions have been revoked.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    });
}

module.exports = { resetUserPassword };
