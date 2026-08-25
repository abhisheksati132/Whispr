'use strict';
// Browser smoke suite — boots the real server and drives headless Chrome
// through the critical paths: register/login, message send (dedup), XSS
// payload neutralization, and API authZ basics.
//
//   npm run test:e2e                 # local: uses installed Chrome/Edge if found
//   E2E_STRICT=1 npm run test:e2e    # fail hard when no browser is available (CI)

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3777;
const BASE = `http://127.0.0.1:${PORT}`;

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  // puppeteer (full package) bundles a Chromium — resolve its cache
  try {
    const ppt = require('puppeteer');
    return ppt.executablePath();
  } catch { /* not installed */ }
  return null;
}

function waitForHealth(timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(`${BASE}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.end();
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('server did not become healthy'));
      setTimeout(ping, 300);
    };
    ping();
  });
}

async function main() {
  const results = [];
  let failed = 0;
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  // ── Boot server as a child process (isolation from other tests) ──
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  let browser;
  try {
    await waitForHealth();

    // ── Browser checks (skipped gracefully when no Chrome is available) ──
    const chromePath = findChrome();
    if (!chromePath) {
      const msg = 'no Chrome/Edge/puppeteer browser found';
      if (process.env.E2E_STRICT === '1') {
        check('browser available', false, msg);
      } else {
        console.log(`SKIP  browser checks (${msg})`);
      }
    } else {
      const puppeteer = fs.existsSync(path.join(ROOT, 'node_modules', 'puppeteer'))
        ? require('puppeteer')
        : require('puppeteer-core');
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e.message)));
      await page.setViewport({ width: 1280, height: 800 });

      // Register via API (fast), then log in through the real UI
      await fetch(`${BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'smoker', password: 'smokepass1' }),
      }).catch(() => {}); // 409 on re-run is fine

      await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle2' });
      await page.type('#nameInput', 'smoker');
      await page.type('#passwordInput', 'smokepass1');
      await page.click('#joinBtn');
      await new Promise((r) => setTimeout(r, 2500));

      const loggedIn = await page.evaluate(() => getComputedStyle(document.getElementById('login')).display === 'none');
      check('UI login flow', loggedIn);

      // Open Note to Self and send a unique message
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-room], .dm-row, .chat-list-item')];
        const note = rows.find((r) => /note to self/i.test(r.textContent || ''));
        if (note) note.click();
      });
      await new Promise((r) => setTimeout(r, 1200));
      const marker = 'smoke' + Date.now();
      const input = await page.$('#msgInput');
      check('message input present', !!input);
      if (input) {
        await input.type(marker);
        await page.keyboard.press('Enter');
        await new Promise((r) => setTimeout(r, 1800));
        const count = await page.evaluate((mk) => {
          return [...document.querySelectorAll('[data-msg-id]')].filter((w) => (w.textContent || '').includes(mk)).length;
        }, marker);
        check('message rendered exactly once (dedup)', count === 1, `count=${count}`);

        // XSS payloads must render as text, never execute
        await input.type("');window.__xss=1;//");
        await page.keyboard.press('Enter');
        await input.type('"><img src=x onerror="window.__xss2=1">');
        await page.keyboard.press('Enter');
        await new Promise((r) => setTimeout(r, 1500));
        const xss = await page.evaluate(() => ({
          one: window.__xss || false,
          two: window.__xss2 || false,
          imgs: document.querySelectorAll('#messages img[src="x"]').length,
        }));
        check('XSS payloads neutralized', !xss.one && !xss.two && xss.imgs === 0, JSON.stringify(xss));
      }

      check('zero page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
      await ctx.close();
    }

    // ── API authZ spot checks (no browser needed) ──
    const reg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'smokea' + Math.floor(Math.random() * 1e5), password: 'smokepass1' }),
    });
    const regBody = await reg.json();
    check('register returns token + string sessionId', reg.status === 201 && typeof regBody.token === 'string' && typeof regBody.sessionId === 'string');

    const t = regBody.token;
    const foreignRoom = await fetch(`${BASE}/api/rooms/${encodeURIComponent('dm_nobody_nobodyelse')}/messages`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    check('foreign DM read blocked', foreignRoom.status === 403, `status=${foreignRoom.status}`);

    const exportNoAuth = await fetch(`${BASE}/api/export-chat?room=dm_x_y`);
    check('export-chat requires auth', exportNoAuth.status === 401, `status=${exportNoAuth.status}`);

    const svg = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'PHN2Zz48L3N2Zz4=', mime: 'image/svg+xml' }),
    });
    check('SVG upload blocked', svg.status === 400, `status=${svg.status}`);
  } catch (err) {
    check('suite completed without crash', false, String(err.message || err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} smoke checks passed`);
  process.exit(failed ? 1 : 0);
}

main();
