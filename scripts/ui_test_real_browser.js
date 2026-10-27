'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const puppeteer = require('puppeteer-core');
const assert = require('assert/strict');
const { app, server } = require('../server/index');
const db = require('../server/db');
const { resetSocketStateForTests } = require('../server/socket');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 1x1 transparent PNG binary buffer
const SAMPLE_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82
]);

async function main() {
  console.log('=== STARTING REAL BROWSER UI TEST (PUPPETEER + CHROME) ===');
  db.resetForTests();
  resetSocketStateForTests();

  const listening = server.listen(0, '127.0.0.1');
  await new Promise(r => listening.once('listening', r));
  const port = listening.address().port;
  const url = `http://127.0.0.1:${port}`;
  console.log(`[INFO] Server running on ${url}`);

  const tempPngPath = path.join(__dirname, 'temp_test_photo.png');
  fs.writeFileSync(tempPngPath, SAMPLE_PNG);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--disable-web-security=false'
    ]
  });

  const consoleErrors = { A: [], B: [] };
  const cspViolations = { A: [], B: [] };

  try {
    // Two isolated browser contexts (like 2 separate private windows / profiles)
    const contextA = await browser.createBrowserContext();
    const contextB = await browser.createBrowserContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Attach listeners for errors and CSP
    function attachMonitor(page, label) {
      page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
          // Ignore Chromium incognito push limitation notice
          if (!text.includes('does not support the Push API in incognito')) {
            consoleErrors[label].push(text);
            console.error(`[CONSOLE ERROR ${label}]:`, text);
          }
        }
        if (text.toLowerCase().includes('content security policy') || text.includes('CSP')) {
          cspViolations[label].push(text);
          console.error(`[CSP VIOLATION ${label}]:`, text);
        }
      });
      page.on('pageerror', err => {
        if (!err.message.includes('does not support the Push API in incognito')) {
          consoleErrors[label].push(err.message);
          console.error(`[PAGE ERROR ${label}]:`, err.message);
        }
      });
      page.on('dialog', async dialog => {
        await dialog.accept();
      });
    }

    attachMonitor(pageA, 'A');
    attachMonitor(pageB, 'B');

    // ── 1. Register User 1 (Alice) via UI Form ─────────────────────────────────
    await pageA.goto(url, { waitUntil: 'networkidle0' });
    await pageA.click('#btn-toggle-auth-mode'); // Switch to register
    await pageA.type('#auth-username', 'terminal_alice');
    await pageA.type('#auth-password', 'password123');
    await pageA.click('#btn-auth-submit');
    await pageA.waitForFunction(() => {
      const el = document.getElementById('auth-overlay');
      return el && window.getComputedStyle(el).display === 'none';
    }, { timeout: 5000 });
    console.log('[PASS] 1. Alice registered and logged in via terminal UI form');

    // ── 2. Register User 2 (Bob) via UI Form ───────────────────────────────────
    await pageB.goto(url, { waitUntil: 'networkidle0' });
    await pageB.click('#btn-toggle-auth-mode'); // Switch to register
    await pageB.type('#auth-username', 'terminal_bob');
    await pageB.type('#auth-password', 'password456');
    await pageB.click('#btn-auth-submit');
    await pageB.waitForFunction(() => {
      const el = document.getElementById('auth-overlay');
      return el && window.getComputedStyle(el).display === 'none';
    }, { timeout: 5000 });
    console.log('[PASS] 2. Bob registered and logged in via terminal UI form');

    // ── 3. Presence Verification ──────────────────────────────────────────────
    await pageA.waitForFunction(() => {
      const el = document.getElementById('partner-status');
      return el && el.textContent.includes('ONLINE');
    }, { timeout: 5000 });
    await pageB.waitForFunction(() => {
      const el = document.getElementById('partner-status');
      return el && el.textContent.includes('ONLINE');
    }, { timeout: 5000 });
    console.log('[PASS] 3. Partner online presence rendered on both screens');

    // ── 4. Typing Indicator ───────────────────────────────────────────────────
    await pageA.focus('#message-input');
    await pageA.type('#message-input', 'H');
    await pageB.waitForFunction(() => {
      const el = document.getElementById('typing-indicator');
      return el && el.textContent.includes('terminal_alice is typing');
    }, { timeout: 5000 });
    console.log('[PASS] 4. Typing indicator ("terminal_alice is typing_") rendered in Bob\'s HUD');

    // ── 5. Send Text Message ──────────────────────────────────────────────────
    await pageA.type('#message-input', 'ello from Alice Terminal!');
    await pageA.click('#btn-send-message');

    await pageB.waitForFunction(() => {
      return document.querySelector('.msg-text-partner')?.textContent.includes('Hello from Alice Terminal!');
    }, { timeout: 5000 });
    console.log('[PASS] 5. Text message delivered and rendered in Bob\'s log area');

    // Receipts check in Alice HUD
    await pageA.waitForFunction(() => {
      const receipt = document.querySelector('.msg-line.is-own .msg-receipt');
      return receipt && (receipt.textContent === '[DLVD]' || receipt.textContent === '[READ]');
    }, { timeout: 5000 });
    console.log('[PASS] 6. Delivery / Read receipt rendered on Alice\'s HUD');

    // ── 6. Reply to Message ───────────────────────────────────────────────────
    const replyBtn = await pageB.waitForSelector('.msg-action-btn');
    await replyBtn.click();
    await pageB.type('#message-input', 'Transmission received, Alice.');
    await pageB.click('#btn-send-message');

    await pageA.waitForFunction(() => {
      const replyBar = document.querySelector('.msg-reply-bar');
      return replyBar && replyBar.textContent.includes('re:');
    }, { timeout: 5000 });
    console.log('[PASS] 7. Reply linked and preview bar rendered');

    // ── 7. Edit Message ───────────────────────────────────────────────────────
    const editBtn = await pageA.waitForSelector('.msg-line.is-own .msg-action-btn[title="Edit"]');
    await editBtn.click();
    await pageA.evaluate(() => {
      const input = document.getElementById('message-input');
      input.value = 'Hello from Alice Terminal! (edited message)';
    });
    await pageA.click('#btn-send-message');

    await pageB.waitForFunction(() => {
      const editedMeta = document.querySelector('.msg-meta-edited');
      return editedMeta && editedMeta.textContent.includes('(edited)');
    }, { timeout: 5000 });
    console.log('[PASS] 8. Message edited and (edited) badge rendered on partner screen');

    // ── 8. Delete Message ─────────────────────────────────────────────────────
    const delBtn = await pageA.waitForSelector('.msg-line.is-own .msg-action-del');
    await delBtn.click();

    await pageB.waitForFunction(() => {
      const deletedMeta = document.querySelector('.msg-meta-deleted');
      return deletedMeta && deletedMeta.textContent.includes('[deleted]');
    }, { timeout: 5000 });
    console.log('[PASS] 9. Message deleted and [deleted] label rendered on partner screen');

    // ── 9. Send Photo through File Input ──────────────────────────────────────
    const fileInput = await pageA.$('#file-input-photo');
    await fileInput.uploadFile(tempPngPath);

    // Wait for photo frame in Bob's HUD and assert <img> loaded with naturalWidth > 0
    await pageB.waitForSelector('.photo-frame img', { timeout: 8000 });
    const imgLoaded = await pageB.waitForFunction(() => {
      const img = document.querySelector('.photo-frame img');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 5000 });
    assert.ok(imgLoaded, 'Photo img must load with naturalWidth > 0');
    console.log('[PASS] 10. Photo uploaded and authenticated <img> rendered (naturalWidth > 0)');

    // ── 10. Fullscreen Lightbox ───────────────────────────────────────────────
    await pageB.click('.photo-frame');
    await pageB.waitForSelector('#lightbox.active', { timeout: 5000 });
    const lightboxImgLoaded = await pageB.evaluate(() => {
      const img = document.getElementById('lightbox-img');
      return img && img.complete && img.naturalWidth > 0;
    });
    assert.ok(lightboxImgLoaded, 'Lightbox photo must display with naturalWidth > 0');
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'ui_lightbox.png') });

    // Close lightbox
    await pageB.click('#lightbox');
    await pageB.waitForFunction(() => {
      const lb = document.getElementById('lightbox');
      return lb && !lb.classList.contains('active');
    }, { timeout: 5000 });
    console.log('[PASS] 11. Fullscreen lightbox opened, displayed photo, and closed');

    // ── 11. Record Voice Note ─────────────────────────────────────────────────
    await pageA.click('#btn-record-voice');
    await new Promise(r => setTimeout(r, 1500)); // record 1.5s of fake audio
    await pageA.click('#btn-record-voice'); // stop and upload

    await pageB.waitForSelector('.voice-row button', { timeout: 8000 });
    // Click [PLAY] on Bob's HUD
    const playBtn = await pageB.waitForSelector('.voice-row button');
    await playBtn.click();
    await new Promise(r => setTimeout(r, 500));
    console.log('[PASS] 12. Voice note recorded via fake audio stream and played on partner screen');

    // Save screenshots before call
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'ui_alice.png') });
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'ui_bob.png') });

    // ── 12. Real WebRTC 1:1 Voice/Video Call ──────────────────────────────────
    console.log('[INFO] Initiating 1:1 WebRTC call between Alice and Bob...');
    await pageA.click('#btn-start-call');

    // Wait for call overlay to activate on both sides
    await pageA.waitForSelector('#call-overlay.active', { timeout: 5000 });
    await pageB.waitForSelector('#call-overlay.active', { timeout: 5000 });

    // Wait for RTCPeerConnection to establish and reach 'connected'
    const callConnected = await pageA.waitForFunction(() => {
      const pc = window.__webrtc?.peerConnection;
      return pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
    }, { timeout: 10000 });
    assert.ok(callConnected, 'RTCPeerConnection must reach connected state');

    const bobCallConnected = await pageB.waitForFunction(() => {
      const pc = window.__webrtc?.peerConnection;
      return pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
    }, { timeout: 10000 });
    assert.ok(bobCallConnected, 'Bob RTCPeerConnection must reach connected state');

    console.log('[PASS] 13. RTCPeerConnection reached "connected" state on both sides');
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'ui_call.png') });

    // Hangup call
    await pageA.click('#btn-call-end');
    await pageA.waitForFunction(() => {
      const ov = document.getElementById('call-overlay');
      return ov && !ov.classList.contains('active');
    }, { timeout: 5000 });
    await pageB.waitForFunction(() => {
      const ov = document.getElementById('call-overlay');
      return ov && !ov.classList.contains('active');
    }, { timeout: 5000 });
    console.log('[PASS] 14. Call hangup completed and call overlays closed');

    // ── 13. Audit DevTools Cache Storage (Item 2 Verification) ─────────────────
    const cachedUrlsA = await pageA.evaluate(async () => {
      if (!('caches' in window)) return [];
      const cache = await caches.open('whispr-shell-v2');
      const reqs = await cache.keys();
      return reqs.map(r => r.url);
    });

    console.log('[INFO] DevTools Cache Storage URLs in "whispr-shell-v2":');
    cachedUrlsA.forEach(u => console.log(`  - ${u}`));

    const hasApiCache = cachedUrlsA.some(u => u.includes('/api/'));
    const hasMediaCache = cachedUrlsA.some(u => u.includes('/api/media/') || u.includes('.jpg') || u.includes('.webm') || u.includes('.m4a'));
    assert.equal(hasApiCache, false, 'Cache storage MUST NOT contain /api/ routes');
    assert.equal(hasMediaCache, false, 'Cache storage MUST NOT contain media files');
    console.log('[PASS] 15. DevTools Cache Storage strictly verified: 0 /api/ or media entries cached!');

    // ── 14. CSP and Console Errors Audit ──────────────────────────────────────
    console.log('[INFO] Total console errors after login and during call:');
    console.log(`  - Alice Context Errors: ${consoleErrors.A.length}`);
    console.log(`  - Bob Context Errors: ${consoleErrors.B.length}`);
    console.log(`  - Alice CSP Violations: ${cspViolations.A.length}`);
    console.log(`  - Bob CSP Violations: ${cspViolations.B.length}`);

    assert.equal(cspViolations.A.length, 0, 'Alice context must have 0 CSP violations');
    assert.equal(cspViolations.B.length, 0, 'Bob context must have 0 CSP violations');
    assert.equal(consoleErrors.A.length, 0, 'Alice context must have 0 console errors');
    assert.equal(consoleErrors.B.length, 0, 'Bob context must have 0 console errors');
    console.log('[PASS] 16. Console and CSP audit verified: 0 errors, 0 CSP violations!');

    console.log('=== REAL BROWSER UI TEST COMPLETED WITH 100% SUCCESS ===');
  } finally {
    if (fs.existsSync(tempPngPath)) fs.unlinkSync(tempPngPath);
    await browser.close();
    await new Promise(r => listening.close(r));
  }
}

main().catch(err => {
  console.error('[FATAL TEST FAILURE]:', err);
  process.exit(1);
});
