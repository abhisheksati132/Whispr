'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const db = require('../server/db');
const { createAuthRouter } = require('../server/auth');

function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter());
  app.use((err, req, res, _next) => {
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

function post(url, data, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data || {});
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

let server;
let base;
let aliceToken;
let _bobToken;

before(async () => {
  db.resetForTests();
  const app = createTestServer();
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => {
  if (server) {
    await new Promise(r => server.close(r));
  }
});

test('auth 01: registration is initially open', async () => {
  const st = await get(`${base}/status`);
  assert.equal(st.status, 200);
  assert.equal(st.body.registrationOpen, true);
});

test('auth 02: password shorter than 8 chars is rejected with 400', async () => {
  const res = await post(`${base}/register`, { username: 'alice', password: '123' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('8 characters'));
});

test('auth 03: invalid username format is rejected with 400', async () => {
  const res = await post(`${base}/register`, { username: 'al.ice!', password: 'password123' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('Username must be'));
});

test('auth 04: missing credentials return 400', async () => {
  const res = await post(`${base}/register`, {});
  assert.equal(res.status, 400);
});

test('auth 05: first user (alice) registers successfully', async () => {
  const res = await post(`${base}/register`, { username: 'alice', password: 'password123' });
  assert.equal(res.status, 201);
  assert.equal(res.body.username, 'alice');
  assert.ok(res.body.token);
  aliceToken = res.body.token;
});

test('auth 06: duplicate username registration is rejected with 409', async () => {
  const res = await post(`${base}/register`, { username: 'alice', password: 'password999' });
  assert.equal(res.status, 409);
  assert.ok(res.body.error.includes('taken'));
});

test('auth 07: second user (bob) registers successfully', async () => {
  const res = await post(`${base}/register`, { username: 'bob', password: 'password456' });
  assert.equal(res.status, 201);
  assert.equal(res.body.username, 'bob');
  assert.ok(res.body.token);
  _bobToken = res.body.token;
});

test('auth 08: registration status reports closed after 2 users', async () => {
  const st = await get(`${base}/status`);
  assert.equal(st.status, 200);
  assert.equal(st.body.registrationOpen, false);
});

test('auth 09: 3rd user registration is rejected with 403 link closed', async () => {
  const res = await post(`${base}/register`, { username: 'charlie', password: 'password789' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'link closed');
});

test('auth 10: concurrent registration attempts after limit return 403', async () => {
  const results = await Promise.all([
    post(`${base}/register`, { username: 'dave', password: 'password789' }),
    post(`${base}/register`, { username: 'eve', password: 'password789' })
  ]);
  assert.equal(results[0].status, 403);
  assert.equal(results[1].status, 403);
});

test('auth 11: login with valid credentials succeeds and returns JWT', async () => {
  const res = await post(`${base}/login`, { username: 'alice', password: 'password123' });
  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'alice');
  assert.ok(res.body.token);
});

test('auth 12: login with wrong password returns 401', async () => {
  const res = await post(`${base}/login`, { username: 'alice', password: 'wrongpassword' });
  assert.equal(res.status, 401);
  assert.ok(res.body.error.includes('Invalid'));
});

test('auth 13: login with nonexistent user returns 401', async () => {
  const res = await post(`${base}/login`, { username: 'nobody', password: 'password123' });
  assert.equal(res.status, 401);
  assert.ok(res.body.error.includes('Invalid'));
});

test('auth 14: /me endpoint returns user and assigned partner', async () => {
  const res = await get(`${base}/me`, aliceToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'alice');
  assert.equal(res.body.partner, 'bob');
});

test('auth 15: /me without auth token returns 401', async () => {
  const res = await get(`${base}/me`);
  assert.equal(res.status, 401);
});

test('auth 16: logout revokes session and subsequent requests return 401', async () => {
  const logoutRes = await post(`${base}/logout`, {}, aliceToken);
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.body.status, 'ok');

  const meRevoked = await get(`${base}/me`, aliceToken);
  assert.equal(meRevoked.status, 401);
  assert.equal(meRevoked.body.error, 'Session revoked');
});

test('auth 17: resetUserPassword CLI utility updates password and revokes all active sessions', async () => {
  const { resetUserPassword } = require('../scripts/reset-password');
  const res = await resetUserPassword('bob', 'brandnewpassword123');
  assert.equal(res.status, 'password_reset_and_sessions_revoked');

  // Old password must fail
  const oldLogin = await post(`${base}/login`, { username: 'bob', password: 'password456' });
  assert.equal(oldLogin.status, 401);

  // New password must succeed
  const newLogin = await post(`${base}/login`, { username: 'bob', password: 'brandnewpassword123' });
  assert.equal(newLogin.status, 200);
  assert.ok(newLogin.body.token);
});
