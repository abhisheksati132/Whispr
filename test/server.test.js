const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, server } = require('../server');

let listeningServer;

test('health endpoint responds ok', async () => {
  listeningServer = server.listen(0, '127.0.0.1');
  await new Promise((resolve) => listeningServer.once('listening', resolve));

  const address = listeningServer.address();
  const response = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: address.port, path: '/health' }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'ok');

  await new Promise((resolve, reject) => listeningServer.close((err) => (err ? reject(err) : resolve())));
});

test('config endpoint reports password requirement', async () => {
  listeningServer = server.listen(0, '127.0.0.1');
  await new Promise((resolve) => listeningServer.once('listening', resolve));

  const address = listeningServer.address();
  const response = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: address.port, path: '/api/config' }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
  });

  assert.equal(response.statusCode, 200);
  assert.equal(typeof response.body.passwordRequired, 'boolean');

  await new Promise((resolve, reject) => listeningServer.close((err) => (err ? reject(err) : resolve())));
});
