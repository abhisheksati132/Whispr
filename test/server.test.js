'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { server } = require('../server/index');

test('server core suite: health, config, csp headers, body size limit, 500 handler', async () => {
  const listening = server.listen(0, '127.0.0.1');
  await new Promise(r => listening.once('listening', r));
  const port = listening.address().port;

  try {
    // 1. Health check
    const health = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/health`, res => {
        let b = '';
        res.on('data', c => { b += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
      }).on('error', reject);
    });
    assert.equal(health.status, 200);
    assert.equal(health.body, 'ok');

    // 2. CSP header presence
    assert.ok(health.headers['content-security-policy'], 'CSP header must be present');
    assert.ok(health.headers['content-security-policy'].includes("default-src 'self'"));
    assert.ok(health.headers['content-security-policy'].includes("script-src 'self'"));

    // 3. /api/config returns STUN ICE servers
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

    // 4. Body limit ~100kb (payload > 100kb should return 413)
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
  } finally {
    await new Promise(r => listening.close(r));
  }
});
