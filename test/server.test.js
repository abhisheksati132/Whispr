'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { server } = require('../server/index');

let listening;
let port;

before(async () => {
  listening = server.listen(0, '127.0.0.1');
  await new Promise(r => listening.once('listening', r));
  port = listening.address().port;
});

after(async () => {
  if (listening) {
    await new Promise(r => listening.close(r));
  }
});

test('server 01: /health returns 200 and ok', async () => {
  const health = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/health`, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', reject);
  });
  assert.equal(health.status, 200);
  assert.equal(health.body, 'ok');
});

test('server 02: CSP header is present and enforces default-src self and script-src self', async () => {
  const res = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/health`, r => {
      r.resume();
      r.on('end', () => resolve({ headers: r.headers }));
    }).on('error', reject);
  });
  const csp = res.headers['content-security-policy'];
  assert.ok(csp, 'CSP header must be present');
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("script-src 'self'"));
});

test('server 03: /api/config returns STUN ICE servers', async () => {
  const configRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/api/config`, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    }).on('error', reject);
  });
  assert.equal(configRes.status, 200);
  assert.ok(Array.isArray(configRes.body.iceServers));
  assert.ok(configRes.body.iceServers.length >= 1);
});

test('server 04: request body exceeding 100kb is rejected with 413 Payload Too Large', async () => {
  const largePayload = JSON.stringify({ data: 'x'.repeat(120 * 1024) });
  const limitRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(largePayload)
      }
    }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.write(largePayload);
    req.end();
  });
  assert.equal(limitRes.status, 413);
});

test('server 05: unknown API endpoint returns 404', async () => {
  const res = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/api/unknown-endpoint`, r => {
      r.resume();
      r.on('end', () => resolve({ status: r.statusCode }));
    }).on('error', reject);
  });
  assert.equal(res.status, 404);
});
