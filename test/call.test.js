'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const db = require('../server/db');

// Set ring timeout short for fast testing
process.env.TEST_RING_TIMEOUT_MS = '200';
const { setupSocket, resetSocketStateForTests } = require('../server/socket');

let server;
let io;
let port;
let aliceToken;
let bobToken;
let clientAlice;
let clientBob;

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

  await db.createUser({ username: 'alice', passwordHash: 'hash' });
  await db.createUser({ username: 'bob', passwordHash: 'hash' });

  const aliceSession = await db.createSession('alice');
  const bobSession = await db.createSession('bob');

  aliceToken = jwt.sign({ username: 'alice', sid: aliceSession.id }, JWT_SECRET);
  bobToken = jwt.sign({ username: 'bob', sid: bobSession.id }, JWT_SECRET);
});

after(async () => {
  if (clientAlice?.connected) clientAlice.disconnect();
  if (clientBob?.connected) clientBob.disconnect();
  if (io) io.close();
  if (server) await new Promise(r => server.close(r));
});

test('call 01: calling when partner is offline fails with call-unavailable and logs [MISSED CALL]', async () => {
  clientAlice = connectClient(aliceToken);
  await new Promise(r => clientAlice.on('connect', r));

  const offlineErrPromise = new Promise(r => clientAlice.on('call-unavailable', r));
  const missedMsgPromise = new Promise(r => clientAlice.on('message', r));

  clientAlice.emit('call-offer', { type: 'voice', sdp: 'fake-sdp-alice' });

  const offlineErr = await offlineErrPromise;
  assert.equal(offlineErr.message, 'Partner is offline');

  const missedMsg = await missedMsgPromise;
  assert.equal(missedMsg.sender, 'alice');
  assert.equal(missedMsg.body, '[MISSED CALL]');
});

test('call 02: connect partner and verify call-offer only reaches the partner', async () => {
  clientBob = connectClient(bobToken);
  await new Promise(r => clientBob.on('connect', r));

  const bobOfferPromise = new Promise(r => clientBob.on('call-offer', r));
  clientAlice.emit('call-offer', { type: 'video', sdp: 'fake-video-sdp' });

  const offer = await bobOfferPromise;
  assert.equal(offer.caller, 'alice');
  assert.equal(offer.type, 'video');
  assert.equal(offer.sdp, 'fake-video-sdp');
});

test('call 03: second call while ringing or active receives call-busy', async () => {
  const busyPromise = new Promise(r => clientAlice.on('call-busy', r));
  clientAlice.emit('call-offer', { type: 'voice', sdp: 'fake-sdp-2' });
  const busy = await busyPromise;
  assert.equal(busy.message, 'Line is busy');
});

test('call 04: callee answers call and caller receives call-answer', async () => {
  const aliceAnswerPromise = new Promise(r => clientAlice.on('call-answer', r));
  clientBob.emit('call-answer', { sdp: 'fake-answer-sdp' });
  const answer = await aliceAnswerPromise;
  assert.equal(answer.callee, 'bob');
  assert.equal(answer.sdp, 'fake-answer-sdp');
});

test('call 05: ICE candidate relays from caller to callee', async () => {
  const bobCandidatePromise = new Promise(r => clientBob.on('call-candidate', r));
  clientAlice.emit('call-candidate', { candidate: { candidate: 'candidate:123' } });
  const cand = await bobCandidatePromise;
  assert.equal(cand.candidate.candidate, 'candidate:123');
});

test('call 06: ICE candidate relays from callee to caller', async () => {
  const aliceCandidatePromise = new Promise(r => clientAlice.on('call-candidate', r));
  clientBob.emit('call-candidate', { candidate: { candidate: 'candidate:456' } });
  const cand = await aliceCandidatePromise;
  assert.equal(cand.candidate.candidate, 'candidate:456');
});

test('call 07: call-hangup relays to partner and resets call state', async () => {
  const aliceHangupPromise = new Promise(r => clientAlice.on('call-hangup', r));
  clientBob.emit('call-hangup', { reason: 'User hung up' });
  const hangup = await aliceHangupPromise;
  assert.equal(hangup.reason, 'User hung up');
});

test('call 08: ring timeout automatically terminates unanswered call and logs missed call', async () => {
  const bobOfferPromise = new Promise(r => clientBob.on('call-offer', r));
  const hangupPromise = new Promise(r => clientAlice.on('call-hangup', r));
  const missedPromise = new Promise(r => clientAlice.on('message', r));

  clientAlice.emit('call-offer', { type: 'voice', sdp: 'sdp-unanswered' });
  await bobOfferPromise;

  const hangup = await hangupPromise;
  assert.equal(hangup.reason, 'No answer');

  const missed = await missedPromise;
  assert.equal(missed.body, '[MISSED CALL]');
});

test('call 09: call-offer rate limit blocks rapid call spam', async () => {
  const errPromise = new Promise(r => clientAlice.on('call-error', r));

  // Limit is 5 per 10s
  for (let i = 0; i < 7; i++) {
    clientAlice.emit('call-offer', { type: 'voice', sdp: `spam-sdp-${i}` });
  }

  const err = await errPromise;
  assert.ok(err.message.includes('rate limit'));
});
