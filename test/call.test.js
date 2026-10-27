'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const db = require('../server/db');
const { setupSocket, resetSocketStateForTests } = require('../server/socket');

function setupTestEnvironment() {
  db.resetForTests();
  resetSocketStateForTests();

  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*' } });
  setupSocket(io);

  return { server, io };
}

function connectClient(port, token) {
  return Client(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
}

test('call signaling suite: offline missed call, offer, answer, candidate relay, busy state, hangup', async () => {
  const { server, io } = setupTestEnvironment();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  await db.createUser({ username: 'alice', passwordHash: 'hash' });
  await db.createUser({ username: 'bob', passwordHash: 'hash' });

  const aliceSession = await db.createSession('alice');
  const bobSession = await db.createSession('bob');

  const aliceToken = jwt.sign({ username: 'alice', sid: aliceSession.id }, JWT_SECRET);
  const bobToken = jwt.sign({ username: 'bob', sid: bobSession.id }, JWT_SECRET);

  let clientAlice, clientBob;

  try {
    // 1. Alice calls when Bob is offline -> call-unavailable and missed call logged
    clientAlice = connectClient(port, aliceToken);
    await new Promise(r => clientAlice.on('connect', r));

    const offlineErrPromise = new Promise(r => clientAlice.on('call-unavailable', r));
    const missedMsgPromise = new Promise(r => clientAlice.on('message', r));

    clientAlice.emit('call-offer', { type: 'voice', sdp: 'fake-sdp-alice' });

    const offlineErr = await offlineErrPromise;
    assert.equal(offlineErr.message, 'Partner is offline');

    const missedMsg = await missedMsgPromise;
    assert.equal(missedMsg.sender, 'alice');
    assert.equal(missedMsg.body, '[MISSED CALL]');

    // 2. Connect Bob
    clientBob = connectClient(port, bobToken);
    await new Promise(r => clientBob.on('connect', r));

    // 3. Alice initiates call -> Bob receives call-offer
    const bobOfferPromise = new Promise(r => clientBob.on('call-offer', r));
    clientAlice.emit('call-offer', { type: 'video', sdp: 'fake-video-sdp' });
    const offer = await bobOfferPromise;
    assert.equal(offer.caller, 'alice');
    assert.equal(offer.type, 'video');
    assert.equal(offer.sdp, 'fake-video-sdp');

    // 4. While ringing, another call attempt receives call-busy
    const busyPromise = new Promise(r => clientAlice.on('call-busy', r));
    clientAlice.emit('call-offer', { type: 'voice', sdp: 'fake-sdp-2' });
    const busy = await busyPromise;
    assert.equal(busy.message, 'Line is busy');

    // 5. Bob answers -> Alice receives call-answer
    const aliceAnswerPromise = new Promise(r => clientAlice.on('call-answer', r));
    clientBob.emit('call-answer', { sdp: 'fake-answer-sdp' });
    const answer = await aliceAnswerPromise;
    assert.equal(answer.callee, 'bob');
    assert.equal(answer.sdp, 'fake-answer-sdp');

    // 6. ICE candidate relay: Alice to Bob
    const bobCandidatePromise = new Promise(r => clientBob.on('call-candidate', r));
    clientAlice.emit('call-candidate', { candidate: { candidate: 'candidate:123' } });
    const candBob = await bobCandidatePromise;
    assert.equal(candBob.candidate.candidate, 'candidate:123');

    // 7. ICE candidate relay: Bob to Alice
    const aliceCandidatePromise = new Promise(r => clientAlice.on('call-candidate', r));
    clientBob.emit('call-candidate', { candidate: { candidate: 'candidate:456' } });
    const candAlice = await aliceCandidatePromise;
    assert.equal(candAlice.candidate.candidate, 'candidate:456');

    // 8. Hangup
    const aliceHangupPromise = new Promise(r => clientAlice.on('call-hangup', r));
    clientBob.emit('call-hangup', { reason: 'User hung up' });
    const hangup = await aliceHangupPromise;
    assert.equal(hangup.reason, 'User hung up');
  } finally {
    if (clientAlice?.connected) clientAlice.disconnect();
    if (clientBob?.connected) clientBob.disconnect();
    io.close();
    await new Promise(r => server.close(r));
  }
});
