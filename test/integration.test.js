'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { io: Client } = require('socket.io-client');

const HOST = process.env.TEST_HOST || 'http://localhost:3000';

let server;
let client1, client2;

function request(path, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, HOST);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {}
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function register(username, password) {
  const body = JSON.stringify({ username, password });
  const opts = {
    hostname: new URL(HOST).hostname,
    port: new URL(HOST).port,
    path: '/api/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('Socket.io Integration', () => {
  before(async () => {
    // Start server if not running
    server = require('../server');
  });

  after(async () => {
    if (client1) client1.disconnect();
    if (client2) client2.disconnect();
  });

  it('register + login + join + send message flow', async () => {
    const username = 'integuser_' + Date.now();
    const password = 'testpass123';

    const reg = await register(username, password);
    assert.equal(reg.status, 201, 'register should succeed');
    const token = reg.data.token;
    assert.ok(token, 'should return token');

    client1 = Client(HOST, { auth: { token } });
    client2 = Client(HOST, { auth: { token } });

    const joinPromise1 = new Promise((resolve) => client1.on('joined', resolve));
    const joinPromise2 = new Promise((resolve) => client2.on('joined', resolve));

    const room = `dm_${username.toLowerCase()}_${username.toLowerCase()}`;
    client1.emit('join', { name: username, room, nickname: username });
    client2.emit('join', { name: username, room, nickname: username });

    await joinPromise1;
    await joinPromise2;

    const msgPromise = new Promise((resolve) => client1.on('message', (msg) => {
      if (msg && msg.text === 'Hello integration') resolve(msg);
    }));

    client2.emit('message', { text: 'Hello integration', room });
    const msg = await msgPromise;
    assert.ok(msg, 'message should be received');
    assert.equal(msg.text, 'Hello integration');
  });

  it('blocked user cannot send messages', async () => {
    const user1 = 'blocker_' + Date.now();
    const user2 = 'blocked_' + Date.now();
    const password = 'testpass123';

    await register(user1, password);
    const reg2 = await register(user2, password);
    const token2 = reg2.data.token;

    client1 = Client(HOST, { auth: { token: await (await register(user1, password)).data.token } });
    client2 = Client(HOST, { auth: { token: token2 } });

    const join1 = new Promise((resolve) => client1.on('joined', resolve));
    const join2 = new Promise((resolve) => client2.on('joined', resolve));
    const room = `dm_${user1.toLowerCase()}_${user2.toLowerCase()}`;

    client1.emit('join', { name: user1, room });
    client2.emit('join', { name: user2, room });
    await join1;
    await join2;

    // Block user2 from client1
    await request(`/api/rooms/blocks?blockedUsername=${user2}`, (await (await register(user1, password)).data.token));

    let blocked = false;
    const checkPromise = new Promise((resolve) => {
      client2.on('message', (msg) => {
        if (msg && msg.text === 'should be blocked') {
          blocked = true;
          resolve();
        }
      });
      setTimeout(resolve, 500);
    });

    client1.emit('message', { text: 'should be blocked', room });
    await checkPromise;
    assert.equal(blocked, false, 'blocked user should not receive messages');
  });
});
