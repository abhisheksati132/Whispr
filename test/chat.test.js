'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { JWT_SECRET } = require('../config');
const db = require('../server/db');
const { setupSocket, resetSocketStateForTests } = require('../server/socket');

let server;
let io;
let port;
let aliceToken;
let bobToken;
let revokedToken;
let clientAlice1;
let clientAlice2;
let clientBob;
let lastMessageId;

function connectClient(token) {
  return Client(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
}

before(async () => {
  db.resetForTests();
  resetSocketStateForTests();

  server = http.createServer();
  io = new Server(server, { cors: { origin: '*' } });
  setupSocket(io);

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  port = server.address().port;

  const passHash = await bcrypt.hash('password123', 10);
  await db.createUser({ username: 'alice', passwordHash: passHash });
  await db.createUser({ username: 'bob', passwordHash: passHash });

  const aliceSession = await db.createSession('alice');
  const bobSession = await db.createSession('bob');
  const tempSession = await db.createSession('alice');

  aliceToken = jwt.sign({ username: 'alice', sid: aliceSession.id }, JWT_SECRET);
  bobToken = jwt.sign({ username: 'bob', sid: bobSession.id }, JWT_SECRET);
  revokedToken = jwt.sign({ username: 'alice', sid: tempSession.id }, JWT_SECRET);

  // Revoke temp session immediately
  await db.revokeSession('alice', tempSession.id);
});

after(async () => {
  if (clientAlice1?.connected) clientAlice1.disconnect();
  if (clientAlice2?.connected) clientAlice2.disconnect();
  if (clientBob?.connected) clientBob.disconnect();
  if (io) io.close();
  if (server) await new Promise(r => server.close(r));
});

test('chat 01: connection without auth token is rejected', async () => {
  const client = connectClient(null);
  const err = await new Promise(resolve => client.on('connect_error', resolve));
  assert.ok(err.message.includes('Authentication required'));
  client.disconnect();
});

test('chat 02: connection with unknown user is rejected', async () => {
  const fakeToken = jwt.sign({ username: 'charlie', sid: 'fake-sid' }, JWT_SECRET);
  const client = connectClient(fakeToken);
  const err = await new Promise(resolve => client.on('connect_error', resolve));
  assert.ok(err.message.includes('User not found'));
  client.disconnect();
});

test('chat 03: revoked session cannot connect to socket', async () => {
  const client = connectClient(revokedToken);
  const err = await new Promise(resolve => client.on('connect_error', resolve));
  assert.ok(err.message.includes('Session revoked'));
  client.disconnect();
});

test('chat 04: connecting user receives partner-status event', async () => {
  clientBob = connectClient(bobToken);
  const statusPromise = new Promise(resolve => clientBob.on('partner-status', resolve));
  await new Promise(resolve => clientBob.on('connect', resolve));
  const status = await statusPromise;
  assert.equal(status.partner, 'alice');
  assert.equal(status.online, false);
});

test('chat 05: connecting user notifies partner of online presence', async () => {
  const presencePromise = new Promise(resolve => {
    clientBob.on('presence', p => {
      if (p.user === 'alice' && p.online) resolve(p);
    });
  });

  clientAlice1 = connectClient(aliceToken);
  await new Promise(resolve => clientAlice1.on('connect', resolve));
  const presence = await presencePromise;
  assert.equal(presence.user, 'alice');
  assert.equal(presence.online, true);
});

test('chat 06: message sent by alice is received by bob', async () => {
  const msgPromise = new Promise(resolve => clientBob.on('message', resolve));
  clientAlice1.emit('message', { type: 'text', body: 'Hello Bob from Terminal' });
  const received = await msgPromise;
  assert.equal(received.sender, 'alice');
  assert.equal(received.body, 'Hello Bob from Terminal');
  lastMessageId = received.id;
});

test('chat 07: online partner generates automatic delivery receipt', async () => {
  const receiptPromise = new Promise(resolve => clientAlice1.on('receipt', resolve));
  clientAlice1.emit('message', { type: 'text', body: 'Receipt check' });
  const receipt = await receiptPromise;
  assert.equal(receipt.type, 'delivered');
});

test('chat 08: partner manual read receipt is relayed back to sender', async () => {
  const receiptPromise = new Promise(resolve => clientAlice1.on('receipt', resolve));
  clientBob.emit('receipt', { type: 'read' });
  const receipt = await receiptPromise;
  assert.equal(receipt.type, 'read');
});

test('chat 09: owner can edit own text message', async () => {
  const editPromise = new Promise(resolve => clientBob.on('message-edited', resolve));
  clientAlice1.emit('edit-message', { id: lastMessageId, text: 'Hello Bob (edited)' });
  const edited = await editPromise;
  assert.equal(edited.id, lastMessageId);
  assert.equal(edited.body, 'Hello Bob (edited)');
});

test('chat 10: non-owner cannot edit partner message', async () => {
  clientBob.emit('edit-message', { id: lastMessageId, text: 'Hacked by Bob' });
  await new Promise(r => setTimeout(r, 60));
  const msgCheck = await db.findMessage(lastMessageId);
  assert.equal(msgCheck.body, 'Hello Bob (edited)');
});

test('chat 11: non-owner cannot delete partner message', async () => {
  clientBob.emit('delete-message', { id: lastMessageId });
  await new Promise(r => setTimeout(r, 60));
  const msgCheck = await db.findMessage(lastMessageId);
  assert.equal(msgCheck.deletedAt, null);
});

test('chat 12: owner can delete own message', async () => {
  const deletePromise = new Promise(resolve => clientBob.on('message-deleted', resolve));
  clientAlice1.emit('delete-message', { id: lastMessageId });
  const deleted = await deletePromise;
  assert.equal(deleted.id, lastMessageId);
});

test('chat 13: typing indicator is relayed to partner', async () => {
  const typingPromise = new Promise(resolve => clientBob.on('typing', resolve));
  clientAlice1.emit('typing', { isTyping: true });
  const typing = await typingPromise;
  assert.equal(typing.user, 'alice');
  assert.equal(typing.isTyping, true);
});

test('chat 14: typing indicator spam is rate limited silently', async () => {
  let typingCount = 0;
  const handler = () => { typingCount++; };
  clientBob.on('typing', handler);

  // Send 25 typing events rapidly (limit is 15 per 5s)
  for (let i = 0; i < 25; i++) {
    clientAlice1.emit('typing', { isTyping: true });
  }
  await new Promise(r => setTimeout(r, 80));
  clientBob.off('typing', handler);
  assert.ok(typingCount <= 15, `Expected <= 15 typing events, got ${typingCount}`);
});

test('chat 15: message spam triggers rate limit error notice', async () => {
  const errorPromise = new Promise(resolve => clientAlice1.on('error-notice', resolve));

  // Send 35 messages rapidly (limit is 30 per 5s)
  for (let i = 0; i < 35; i++) {
    clientAlice1.emit('message', { type: 'text', body: `spam ${i}` });
  }

  const err = await errorPromise;
  assert.ok(err.error.includes('Rate limit exceeded'));
});

test('chat 16: multi-device: closing 1 of 2 tabs keeps user online', async () => {
  // Connect Alice tab 2
  clientAlice2 = connectClient(aliceToken);
  await new Promise(resolve => clientAlice2.on('connect', resolve));

  let aliceWentOffline = false;
  const presenceHandler = p => {
    if (p.user === 'alice' && !p.online) aliceWentOffline = true;
  };
  clientBob.on('presence', presenceHandler);

  // Disconnect tab 1
  clientAlice1.disconnect();
  await new Promise(r => setTimeout(r, 100));

  clientBob.off('presence', presenceHandler);
  assert.equal(aliceWentOffline, false, 'User must remain online while second tab is connected');
});

test('chat 17: multi-device: closing last tab emits offline presence with lastSeen', async () => {
  const offlinePromise = new Promise(resolve => {
    clientBob.on('presence', p => {
      if (p.user === 'alice' && !p.online) resolve(p);
    });
  });

  clientAlice2.disconnect();
  const offlineEvt = await offlinePromise;
  assert.equal(offlineEvt.user, 'alice');
  assert.equal(offlineEvt.online, false);
  assert.ok(typeof offlineEvt.lastSeen === 'number');
});
