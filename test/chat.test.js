'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

test('socket chat suite: auth, messaging, receipts, edit/delete ownership, multi-device presence', async () => {
  const { server, io } = setupTestEnvironment();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  // Create users alice & bob
  const passHash = await bcrypt.hash('password123', 10);
  await db.createUser({ username: 'alice', passwordHash: passHash });
  await db.createUser({ username: 'bob', passwordHash: passHash });

  const aliceSession = await db.createSession('alice');
  const bobSession = await db.createSession('bob');

  const aliceToken = jwt.sign({ username: 'alice', sid: aliceSession.id }, JWT_SECRET);
  const bobToken = jwt.sign({ username: 'bob', sid: bobSession.id }, JWT_SECRET);

  let clientAlice1, clientAlice2, clientBob;

  try {
    // 1. Connection without token rejected
    const badClient = connectClient(port, null);
    const connErr = await new Promise(resolve => badClient.on('connect_error', resolve));
    assert.ok(connErr.message.includes('Authentication required'));
    badClient.disconnect();

    // 2. Third user rejected
    const fakeToken = jwt.sign({ username: 'charlie', sid: 'fake-sid' }, JWT_SECRET);
    const charlieClient = connectClient(port, fakeToken);
    const charlieErr = await new Promise(resolve => charlieClient.on('connect_error', resolve));
    assert.ok(charlieErr.message.includes('User not found'));
    charlieClient.disconnect();

    // 3. Connect Bob first
    clientBob = connectClient(port, bobToken);
    await new Promise(resolve => clientBob.on('connect', resolve));

    // Listen for Alice's presence on Bob's socket
    const aliceOnlinePromise = new Promise(resolve => {
      clientBob.on('presence', p => {
        if (p.user === 'alice' && p.online) resolve(p);
      });
    });

    // 4. Connect Alice (tab 1)
    clientAlice1 = connectClient(port, aliceToken);
    await new Promise(resolve => clientAlice1.on('connect', resolve));

    const onlineEvt = await aliceOnlinePromise;
    assert.equal(onlineEvt.user, 'alice');
    assert.equal(onlineEvt.online, true);

    // 5. Connect Alice (tab 2) - multi-device
    clientAlice2 = connectClient(port, aliceToken);
    await new Promise(resolve => clientAlice2.on('connect', resolve));

    // 6. Send message from Alice
    const bobMsgPromise = new Promise(resolve => clientBob.on('message', resolve));
    const aliceReceiptPromise = new Promise(resolve => clientAlice1.on('receipt', resolve));

    clientAlice1.emit('message', { type: 'text', body: 'Hello Bob from Terminal' });

    const bobReceived = await bobMsgPromise;
    assert.equal(bobReceived.sender, 'alice');
    assert.equal(bobReceived.body, 'Hello Bob from Terminal');

    // Bob is online, so auto-delivery receipt was generated
    const receipt = await aliceReceiptPromise;
    assert.equal(receipt.type, 'delivered');

    // 7. Bob sends read receipt
    const readReceiptPromise = new Promise(resolve => clientAlice1.on('receipt', resolve));
    clientBob.emit('receipt', { type: 'read' });
    const readReceipt = await readReceiptPromise;
    assert.equal(readReceipt.type, 'read');

    // 8. Edit own message (Alice edits her message)
    const aliceEditPromise = new Promise(resolve => clientBob.on('message-edited', resolve));
    clientAlice1.emit('edit-message', { id: bobReceived.id, text: 'Hello Bob (edited)' });
    const edited = await aliceEditPromise;
    assert.equal(edited.id, bobReceived.id);
    assert.equal(edited.body, 'Hello Bob (edited)');

    // 9. Unauthorized edit (Bob tries to edit Alice's message)
    clientBob.emit('edit-message', { id: bobReceived.id, text: 'Hacked by Bob' });
    await new Promise(r => setTimeout(r, 100)); // give time for potential erroneous emit
    const msgCheck = await db.findMessage(bobReceived.id);
    assert.equal(msgCheck.body, 'Hello Bob (edited)');

    // 10. Unauthorized delete (Bob tries to delete Alice's message)
    clientBob.emit('delete-message', { id: bobReceived.id });
    await new Promise(r => setTimeout(r, 100));
    const msgCheck2 = await db.findMessage(bobReceived.id);
    assert.equal(msgCheck2.deletedAt, null);

    // 11. Authorized delete (Alice deletes her own message)
    const bobDeletePromise = new Promise(resolve => clientBob.on('message-deleted', resolve));
    clientAlice1.emit('delete-message', { id: bobReceived.id });
    const deleted = await bobDeletePromise;
    assert.equal(deleted.id, bobReceived.id);

    // 12. Typing indicator
    const typingPromise = new Promise(resolve => clientBob.on('typing', resolve));
    clientAlice1.emit('typing', { isTyping: true });
    const typing = await typingPromise;
    assert.equal(typing.user, 'alice');
    assert.equal(typing.isTyping, true);

    // 13. Multi-device presence test: Disconnect Alice tab 1 -> Alice still online
    let aliceOfflineFired = false;
    clientBob.on('presence', p => {
      if (p.user === 'alice' && !p.online) aliceOfflineFired = true;
    });
    clientAlice1.disconnect();
    await new Promise(r => setTimeout(r, 150));
    assert.equal(aliceOfflineFired, false, 'Alice should remain online while tab 2 is open');

    // Disconnect Alice tab 2 -> Now Alice goes offline
    const aliceOfflinePromise = new Promise(resolve => {
      clientBob.on('presence', p => {
        if (p.user === 'alice' && !p.online) resolve(p);
      });
    });
    clientAlice2.disconnect();
    const offlineEvt = await aliceOfflinePromise;
    assert.equal(offlineEvt.user, 'alice');
    assert.equal(offlineEvt.online, false);
    assert.ok(typeof offlineEvt.lastSeen === 'number');
  } finally {
    if (clientAlice1?.connected) clientAlice1.disconnect();
    if (clientAlice2?.connected) clientAlice2.disconnect();
    if (clientBob?.connected) clientBob.disconnect();
    io.close();
    await new Promise(r => server.close(r));
  }
});
