# Frontend Consolidation — Decision & Plan

## Phase 1 (done)
- Deleted `src/` (stale duplicate) — three-way divergence killed.
- `public/src/` linted (0 errors); fixed a real regex bug found by linting.
- Hardened `store.js` atomic write (transient Windows EPERM retries).

## Phase 2 audit verdict (evidence-based)

**`public/src/` cannot ship — it is a non-running skeleton.** Audit findings:

1. **Wrong DOM contract.** The modules query ~35 element IDs that don't exist in
   `public/index.html` (`gifPanel`, `contextMenu`, `doodleCanvas`, `extrasPanel`,
   `diaryList`…). They were written against a different HTML document.
2. **~50 undeclared shared globals.** Modules reference bare identifiers
   (`els`, `socket`, `authToken`, `myName`, `webrtcConn`…) that no module
   declares or imports — each is a `ReferenceError` on first touch. `state.js`
   exports a `state` object that nothing reads.
3. **No bootstrap.** The real bootstrapper (`ultimate-features.js init()`) is
   never invoked; `init.js` only assigns `window.BestieChat` properties.
4. **Weaker XSS hygiene than app.js.** Module `escapeHtml` skips quotes and
   several modules interpolate into inline handlers — the exact class we just
   eliminated from `app.js`.

**Decision: `public/app.js` is the shipping tree. `public/src/` is demoted to a
feature reference library.** The `?modules=1` cutover is shelved until someone
does a full wiring pass (shared state via `state.js`, missing imports, companion
HTML, init invocation, security pass) — that is a multi-week project with
product-level scope, not a migration step.

## What the audit found worth porting (into app.js, incrementally)

Each of these exists, working, in the modules — and beats what ships. Port one
per PR, using app.js's `jsAttr()`/delegated-event patterns:

| Priority | Feature | Source module |
|---|---|---|
| 1 | True read receipts (sent/delivered/read ticks, IntersectionObserver batched mark-read) — app.js currently fakes ✓✓ | `ui.js:78-159` |
| 2 | Ack/rate-limit UX (pending bubble → rejection on `message-error`) | `socket.js:206-244` |
| 3 | Reactions + double-tap ❤️ | `reactions.js`, `ui.js:394-437` |
| 4 | Context menu (long-press) + swipe-right-to-reply | `context-menu.js`, `ui.js` |
| 5 | GIF/sticker panel (`/api/gifs` already served) | `emoji-games-gif.js` |
| 6 | Durable offline outbox (localStorage queue, flushed on reconnect, 120s TTL) — app.js's `offlineOutbox` is dead code that silently eats messages | `offline.js:150-166` |
| 7 | VAPID push notifications (server endpoints already live) | `ultimate-features.js:1536-1590` |
| 8 | Daily-question card + streak confetti (the retention loop) | `ui.js`, `ui-updates.js` |
| 9 | Exponential-backoff reconnect (16s cap) | `socket.js:28-33` |
| 10 | PIP calls + flip camera (if calls stay) | `webrtc.js:283-434` |

## Security rules when porting
- Never copy module rendering code verbatim: re-express through `jsAttr()` /
  `data-action` delegation. Module `escapeHtml` (utils.js) must NOT be used —
  it doesn't escape quotes.
- `formatMarkdown` in utils.js has a link-attribute injection
  (`href="$2"` unescaped) — do not port.
- app.js's intro card claims "AES-256 Direct Encrypted" with zero crypto behind
  it — remove the claim or implement real E2EE (WebCrypto, not CryptoJS).

## Cleanup TODOs in app.js found by the audit
- `offlineOutbox` (line ~23): pushed but never drained — wire to the module
  outbox pattern or delete.
- Read-receipt ticks: show sent (✓) only until real receipts arrive.
