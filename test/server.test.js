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

test('unhandled express error returns generic 500', async () => {
  const stack = app.router?.stack || app._router?.stack || [];
  const errHandlers = [];
  while (stack.length > 0 && stack[stack.length - 1].handle && stack[stack.length - 1].handle.length === 4) {
    errHandlers.unshift(stack.pop());
  }

  app.get('/test-unhandled-error', () => {
    throw new Error('Database password leaked');
  });

  for (const handler of errHandlers) {
    stack.push(handler);
  }

  listeningServer = server.listen(0, '127.0.0.1');
  await new Promise((resolve) => listeningServer.once('listening', resolve));

  const address = listeningServer.address();
  const response = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: address.port, path: '/test-unhandled-error' }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: 'Internal server error' });

  await new Promise((resolve, reject) => listeningServer.close((err) => (err ? reject(err) : resolve())));
});
