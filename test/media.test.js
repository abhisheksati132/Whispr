'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const db = require('../server/db');
const { createMediaRouter, resetMediaForTests } = require('../server/media');
const { createPushRouter } = require('../server/push');

let server;
let port;
let token;
let pngPath;

function createMediaApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/media', createMediaRouter());
  app.use('/api/push', createPushRouter());
  app.use((err, req, res, _next) => {
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

function uploadMultipart(filename, fileBuffer, mimeType = 'image/png', authToken = token) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullBody = Buffer.concat([header, fileBuffer, footer]);

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/media/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
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
    req.write(fullBody);
    req.end();
  });
}

function getMedia(path, authToken) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => { chunks.push(chunk); });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  db.resetForTests();
  resetMediaForTests();

  const app = createMediaApp();
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  port = server.address().port;

  await db.createUser({ username: 'alice', passwordHash: 'hash' });
  const session = await db.createSession('alice');
  token = jwt.sign({ username: 'alice', sid: session.id }, JWT_SECRET);
});

after(async () => {
  if (server) await new Promise(r => server.close(r));
});

test('media 01: upload without auth token returns 401', async () => {
  const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
  const res = await uploadMultipart('photo.png', validPng, 'image/png', null);
  assert.equal(res.status, 401);
});

test('media 02: disguised HTML / script as .png is rejected via magic-byte check', async () => {
  const fakeFile = Buffer.from('<script>alert("xss")</script>');
  const res = await uploadMultipart('photo.png', fakeFile, 'image/png', token);
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('Invalid file content'));
});

test('media 03: valid JPEG photo upload succeeds', async () => {
  const validJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const res = await uploadMultipart('photo.jpg', validJpg, 'image/jpeg', token);
  assert.equal(res.status, 201);
  assert.equal(res.body.mime, 'image/jpeg');
  assert.ok(res.body.mediaPath.startsWith('/api/media/'));
});

test('media 04: valid PNG photo upload returns 201 and mediaPath', async () => {
  const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
  const res = await uploadMultipart('photo.png', validPng, 'image/png', token);
  assert.equal(res.status, 201);
  assert.equal(res.body.mime, 'image/png');
  assert.ok(res.body.mediaPath.startsWith('/api/media/'));
  pngPath = res.body.mediaPath;
});

test('media 05: valid WebM voice note upload returns 201', async () => {
  const validWebm = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81]);
  const res = await uploadMultipart('voice.webm', validWebm, 'audio/webm', token);
  assert.equal(res.status, 201);
  assert.equal(res.body.mime, 'audio/webm');
});

test('media 06: valid Safari MP4/M4A voice note upload returns 201', async () => {
  const validM4a = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20
  ]);
  const res = await uploadMultipart('voice.m4a', validM4a, 'audio/mp4', token);
  assert.equal(res.status, 201);
  assert.equal(res.body.mime, 'audio/mp4');
});

test('media 07: unauthenticated download returns 401', async () => {
  const res = await getMedia(pngPath, null);
  assert.equal(res.status, 401);
});

test('media 08: authenticated download with Bearer token returns 200 with media buffer', async () => {
  const res = await getMedia(pngPath, token);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.ok(res.data.length > 0);
});

test('media 09: authenticated download with query token parameter returns 200', async () => {
  const res = await getMedia(`${pngPath}?token=${token}`, null);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.ok(res.data.length > 0);
});

test('media 10: download nonexistent file returns 404', async () => {
  const res = await getMedia('/api/media/nonexistent.png', token);
  assert.equal(res.status, 404);
});

test('media 11: push public key endpoint returns VAPID key', async () => {
  const pushKeyRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/api/push/public-key`, res => {
      let b = '';
      res.on('data', chunk => { b += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    }).on('error', reject);
  });
  assert.equal(pushKeyRes.status, 200);
  assert.ok(pushKeyRes.body.publicKey);
});
