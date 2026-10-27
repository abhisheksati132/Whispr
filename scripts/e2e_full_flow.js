'use strict';
const http = require('http');
const { io: Client } = require('socket.io-client');
const assert = require('assert/strict');

const BASE = 'http://127.0.0.1:3000';

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data || {});
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, body: b }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function uploadMultipart(token, filename, fileBuffer, mimeType) {
  return new Promise((resolve, reject) => {
    const boundary = '----Boundary' + Math.random().toString(36).slice(2);
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullBody = Buffer.concat([header, fileBuffer, footer]);

    const req = http.request(`${BASE}/api/media/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
        Authorization: `Bearer ${token}`
      }
    }, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    });
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

function getMedia(path, token) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    }, res => {
      const chunks = [];
      res.on('data', c => { chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function connect(token) {
  return Client(BASE, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
}

async function run() {
  console.log('=== STARTING 2-BROWSER E2E INTERACTION REPORT ===');

  // 1. Register User 1
  const u1 = `usr1_${Date.now().toString().slice(-4)}`;
  const reg1 = await post('/api/auth/register', { username: u1, password: 'password123' });
  assert.equal(reg1.status, 201, 'User 1 registration failed');
  const token1 = reg1.body.token;
  console.log(`[PASS] 1. Register user 1 (${u1}) -> HTTP 201 Created`);

  // 2. Register User 2
  const u2 = `usr2_${Date.now().toString().slice(-4)}`;
  const reg2 = await post('/api/auth/register', { username: u2, password: 'password456' });
  assert.equal(reg2.status, 201, 'User 2 registration failed');
  const token2 = reg2.body.token;
  console.log(`[PASS] 2. Register user 2 (${u2}) -> HTTP 201 Created`);

  // 3. 3rd registration rejected
  const reg3 = await post('/api/auth/register', { username: 'intruder', password: 'password789' });
  assert.equal(reg3.status, 403, '3rd registration should be rejected');
  assert.equal(reg3.body.error, 'link closed');
  console.log('[PASS] 3. 3rd registration attempt (intruder) -> HTTP 403 "link closed"');

  // Connect both user sockets
  const client1 = connect(token1);
  const client2 = connect(token2);

  await Promise.all([
    new Promise(r => client1.on('connect', r)),
    new Promise(r => client2.on('connect', r))
  ]);
  console.log('[PASS] Socket connections established for both users');

  // 4. Presence verification
  const presencePromise = new Promise(resolve => {
    client1.on('presence', p => {
      if (p.user === u2 && p.online) resolve(p);
    });
  });
  // Client 2 re-emits or triggers presence
  const c2_tab2 = connect(token2);
  const presEvt = await presencePromise;
  assert.equal(presEvt.user, u2);
  assert.equal(presEvt.online, true);
  c2_tab2.disconnect();
  console.log(`[PASS] 4. Presence: Partner (${u2}) online presence received by (${u1})`);

  // 5. Typing indicator
  const typingPromise = new Promise(resolve => client2.on('typing', resolve));
  client1.emit('typing', { isTyping: true });
  const typing = await typingPromise;
  assert.equal(typing.user, u1);
  assert.equal(typing.isTyping, true);
  console.log(`[PASS] 5. Typing: (${u1} is typing_) relayed to partner (${u2})`);

  // 6. Send text message
  const msg1Promise = new Promise(resolve => client2.on('message', resolve));
  client1.emit('message', { type: 'text', body: 'Hey bestie, terminal link online!' });
  const msg1 = await msg1Promise;
  assert.equal(msg1.sender, u1);
  assert.equal(msg1.body, 'Hey bestie, terminal link online!');
  console.log(`[PASS] 6. Send text: "${msg1.body}" delivered to (${u2})`);

  // 7. Receipts: auto-delivery & manual read
  const readReceiptPromise = new Promise(resolve => {
    client1.on('receipt', r => {
      if (r.type === 'read') resolve(r);
    });
  });
  client2.emit('receipt', { type: 'read' });
  const readReceipt = await readReceiptPromise;
  assert.equal(readReceipt.type, 'read');
  console.log('[PASS] 7. Receipts: Partner read receipt [READ] received');

  // 8. Reply to message
  const replyPromise = new Promise(resolve => client1.on('message', resolve));
  client2.emit('message', {
    type: 'text',
    body: 'Acknowledged, link established.',
    replyTo: msg1.id
  });
  const replyMsg = await replyPromise;
  assert.equal(replyMsg.replyTo, msg1.id);
  console.log(`[PASS] 8. Reply: Reply linked to parent message id ${msg1.id}`);

  // 9. Send authenticated photo
  const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
  const photoUpload = await uploadMultipart(token1, 'photo.png', fakePng, 'image/png');
  assert.equal(photoUpload.status, 201);

  const photoMsgPromise = new Promise(resolve => client2.on('message', resolve));
  client1.emit('message', { type: 'image', mediaPath: photoUpload.body.mediaPath });
  const photoMsg = await photoMsgPromise;
  assert.equal(photoMsg.type, 'image');

  // Client 2 fetches authenticated photo media
  const photoDownload = await getMedia(photoMsg.mediaPath, token2);
  assert.equal(photoDownload.status, 200);
  assert.deepEqual(photoDownload.data, fakePng);
  console.log('[PASS] 9. Send photo: Authenticated upload + dispatch + download verified');

  // 10. Send authenticated voice note
  const fakeWebm = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81]);
  const voiceUpload = await uploadMultipart(token1, 'voice.webm', fakeWebm, 'audio/webm');
  assert.equal(voiceUpload.status, 201);

  const voiceMsgPromise = new Promise(resolve => client2.on('message', resolve));
  client1.emit('message', { type: 'voice', mediaPath: voiceUpload.body.mediaPath, durationMs: 4000 });
  const voiceMsg = await voiceMsgPromise;
  assert.equal(voiceMsg.type, 'voice');

  const voiceDownload = await getMedia(voiceMsg.mediaPath, token2);
  assert.equal(voiceDownload.status, 200);
  assert.deepEqual(voiceDownload.data, fakeWebm);
  console.log('[PASS] 10. Send voice: Authenticated voice note upload + download verified');

  // 11. Edit own message
  const editPromise = new Promise(resolve => client2.on('message-edited', resolve));
  client1.emit('edit-message', { id: msg1.id, text: 'Hey bestie, terminal link online! (updated)' });
  const edited = await editPromise;
  assert.equal(edited.id, msg1.id);
  assert.equal(edited.body, 'Hey bestie, terminal link online! (updated)');
  console.log('[PASS] 11. Edit: Message edited and relayed to partner');

  // 12. Delete own message
  const deletePromise = new Promise(resolve => client2.on('message-deleted', resolve));
  client1.emit('delete-message', { id: msg1.id });
  const deleted = await deletePromise;
  assert.equal(deleted.id, msg1.id);
  console.log('[PASS] 12. Delete: Message deleted and marked for both users');

  // 13. Reload keeps history: disconnect and reconnect client 2
  client2.disconnect();
  const client2Reloaded = connect(token2);
  const historyPromise = new Promise(resolve => client2Reloaded.on('init-messages', resolve));
  const history = await historyPromise;
  assert.ok(Array.isArray(history) && history.length >= 4);
  const foundPhoto = history.find(m => m.type === 'image');
  const foundVoice = history.find(m => m.type === 'voice');
  const foundDeleted = history.find(m => m.id === msg1.id);
  assert.ok(foundPhoto, 'History should contain photo message');
  assert.ok(foundVoice, 'History should contain voice message');
  assert.ok(foundDeleted && foundDeleted.deletedAt, 'History should preserve deleted state');
  console.log(`[PASS] 13. Reload keeps history: Reconnected client received ${history.length} persisted messages`);

  client1.disconnect();
  client2Reloaded.disconnect();
  console.log('=== ALL E2E VERIFICATIONS PASSED CLEANLY ===');
}

run().catch(err => {
  console.error('E2E FAILURE:', err);
  process.exit(1);
});
