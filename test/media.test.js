'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const db = require('../server/db');
const { createMediaRouter, resetMediaForTests } = require('../server/media');
const { createPushRouter } = require('../server/push');

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

function uploadMultipart(port, token, filename, fileBuffer, mimeType = 'image/png') {
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
    req.write(fullBody);
    req.end();
  });
}

function getMedia(port, path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
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

test('media & push suite: upload auth, magic bytes, authenticated download, push registration', async () => {
  db.resetForTests();
  resetMediaForTests();

  const app = createMediaApp();
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  await db.createUser({ username: 'alice', passwordHash: 'hash' });
  const session = await db.createSession('alice');
  const token = jwt.sign({ username: 'alice', sid: session.id }, JWT_SECRET);

  try {
    // 1. Unauthenticated upload fails
    const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    const unauthUpload = await uploadMultipart(port, null, 'photo.png', validPng);
    assert.equal(unauthUpload.status, 401);

    // 2. Upload fake file (client claims image/png, but magic bytes are text/HTML)
    const fakeFile = Buffer.from('<script>alert("xss")</script>');
    const fakeUpload = await uploadMultipart(port, token, 'photo.png', fakeFile);
    assert.equal(fakeUpload.status, 400);
    assert.ok(fakeUpload.body.error.includes('Invalid file content'));

    // 3. Upload valid PNG photo
    const pngUpload = await uploadMultipart(port, token, 'photo.png', validPng);
    assert.equal(pngUpload.status, 201);
    assert.ok(pngUpload.body.mediaPath.startsWith('/api/media/'));
    assert.equal(pngUpload.body.mime, 'image/png');

    // 4. Upload valid WebM voice note
    const validWebm = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81]);
    const voiceUpload = await uploadMultipart(port, token, 'voice.webm', validWebm, 'audio/webm');
    assert.equal(voiceUpload.status, 201);
    assert.equal(voiceUpload.body.mime, 'audio/webm');

    // 5. Upload valid Safari mp4/m4a voice note
    // Offset 4 must contain 'ftyp' (66 74 79 70)
    const validM4a = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20
    ]);
    const m4aUpload = await uploadMultipart(port, token, 'voice.m4a', validM4a, 'audio/mp4');
    assert.equal(m4aUpload.status, 201);
    assert.equal(m4aUpload.body.mime, 'audio/mp4');

    // 6. Unauthenticated download fails
    const unauthGet = await getMedia(port, pngUpload.body.mediaPath, null);
    assert.equal(unauthGet.status, 401);

    // 7. Authenticated download succeeds with correct Content-Type
    const authGet = await getMedia(port, pngUpload.body.mediaPath, token);
    assert.equal(authGet.status, 200);
    assert.equal(authGet.headers['content-type'], 'image/png');
    assert.deepEqual(authGet.data, validPng);

    // 8. Push public key endpoint
    const pushKeyRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/push/public-key`, res => {
        let b = '';
        res.on('data', chunk => { b += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
      }).on('error', reject);
    });
    assert.equal(pushKeyRes.status, 200);
    assert.ok(pushKeyRes.body.publicKey);
  } finally {
    await new Promise(r => server.close(r));
  }
});
