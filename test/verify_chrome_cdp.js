'use strict';
const http = require('http');
const { spawn } = require('child_process');

async function getDebuggerUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json/list', res => {
          let b = '';
          res.on('data', c => { b += c; });
          res.on('end', () => resolve(JSON.parse(b)));
        }).on('error', reject);
      });
      if (data && data[0] && data[0].webSocketDebuggerUrl) {
        return data[0].webSocketDebuggerUrl;
      }
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('Failed to connect to Chrome DevTools port');
}

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  try {
    const wsUrl = await getDebuggerUrl();
    console.log('Connected to Chrome DevTools CDP at:', wsUrl);

    // Use native WebSocket
    const ws = new WebSocket(wsUrl);

    await new Promise(resolve => { ws.onopen = resolve; });

    const errors = [];
    const cspViolations = [];

    ws.onmessage = event => {
      const msg = JSON.parse(event.data.toString());
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        if (type === 'error') {
          errors.push(text);
          console.log('[BROWSER CONSOLE ERROR]:', text);
        }
      }
      if (msg.method === 'Log.entryAdded') {
        const entry = msg.params.entry;
        if (entry.level === 'error' || entry.source === 'security') {
          console.log('[BROWSER LOG ENTRY]:', entry.text, entry.source, entry.level);
          if (entry.text.toLowerCase().includes('content security policy') || entry.text.includes('CSP')) {
            cspViolations.push(entry.text);
          }
        }
      }
    };

    let id = 1;
    function send(method, params = {}) {
      ws.send(JSON.stringify({ id: id++, method, params }));
    }

    send('Runtime.enable');
    send('Log.enable');
    send('Page.enable');
    send('Page.navigate', { url: 'http://127.0.0.1:3000' });

    await new Promise(r => setTimeout(r, 3000));

    console.log('--- CSP Violation & Console Audit Report ---');
    console.log(`Total Console Errors: ${errors.length}`);
    console.log(`Total CSP Violations: ${cspViolations.length}`);

    ws.close();
    if (errors.length === 0 && cspViolations.length === 0) {
      console.log('VERIFICATION SUCCESS: ZERO CSP violations or console errors in Chrome!');
    } else {
      console.log('FAILED: Violations found:', { errors, cspViolations });
    }
  } finally {
    chrome.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
