'use strict';
const test = require('node:test');
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

test('auth suite: 2-user limit, password validation, login, session revocation', async () => {
  db.resetForTests();
  const app = createTestServer();
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;

  try {
    // 1. Initial status: registration open
    const st1 = await get(`${base}/status`);
    assert.equal(st1.status, 200);
    assert.equal(st1.body.registrationOpen, true);

    // 2. Validation: password < 8 chars rejected
    const badPass = await post(`${base}/register`, { username: 'alice', password: '123' });
    assert.equal(badPass.status, 400);

    // 3. Validation: invalid username rejected
    const badUser = await post(`${base}/register`, { username: 'al.ice!', password: 'password123' });
    assert.equal(badUser.status, 400);

    // 4. Register User 1: alice
    const reg1 = await post(`${base}/register`, { username: 'alice', password: 'password123' });
    assert.equal(reg1.status, 201);
    assert.equal(reg1.body.username, 'alice');
    assert.ok(reg1.body.token);

    // 5. Register duplicate username rejected with 409
    const dup = await post(`${base}/register`, { username: 'alice', password: 'password456' });
    assert.equal(dup.status, 409);

    // 6. Register User 2: bob
    const reg2 = await post(`${base}/register`, { username: 'bob', password: 'password456' });
    assert.equal(reg2.status, 201);
    assert.equal(reg2.body.username, 'bob');
    assert.ok(reg2.body.token);

    // 7. Status now indicates registration is closed
    const st2 = await get(`${base}/status`);
    assert.equal(st2.status, 200);
    assert.equal(st2.body.registrationOpen, false);

    // 8. Register User 3: rejected with 403 "link closed"
    const reg3 = await post(`${base}/register`, { username: 'charlie', password: 'password789' });
    assert.equal(reg3.status, 403);
    assert.equal(reg3.body.error, 'link closed');

    // 9. Concurrent third attempts all rejected with 403
    const concurrent = await Promise.all([
      post(`${base}/register`, { username: 'dave', password: 'password789' }),
      post(`${base}/register`, { username: 'eve', password: 'password789' })
    ]);
    assert.equal(concurrent[0].status, 403);
    assert.equal(concurrent[1].status, 403);

    // 10. Login with valid credentials
    const loginOk = await post(`${base}/login`, { username: 'alice', password: 'password123' });
    assert.equal(loginOk.status, 200);
    assert.ok(loginOk.body.token);

    // 11. Login with invalid password
    const loginBad = await post(`${base}/login`, { username: 'alice', password: 'wrongpassword' });
    assert.equal(loginBad.status, 401);

    // 12. Login with nonexistent user
    const loginNone = await post(`${base}/login`, { username: 'nobody', password: 'password123' });
    assert.equal(loginNone.status, 401);

    // 13. Profile /me returns user and partner
    const meAlice = await get(`${base}/me`, reg1.body.token);
    assert.equal(meAlice.status, 200);
    assert.equal(meAlice.body.username, 'alice');
    assert.equal(meAlice.body.partner, 'bob');

    // 14. Session revocation on logout
    const logout = await post(`${base}/logout`, {}, reg1.body.token);
    assert.equal(logout.status, 200);

    // Subsequent request with revoked token fails with 401
    const meRevoked = await get(`${base}/me`, reg1.body.token);
    assert.equal(meRevoked.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  }
});
