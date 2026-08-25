# Frontend Consolidation — Cutover Plan

## Current state (post phase-1)

| Tree | Status | Role |
|---|---|---|
| `public/app.js` | **SHIPS** — loaded by `public/index.html` | Monolithic IIFE (~3.4k lines). Has: IndexedDB fast-render, categorized rail UI, full auth/socket flow. Uses `jsAttr()`/delegated events after the XSS refactor. |
| `public/src/` | **CANONICAL going forward** — linted, not yet loaded | 36 ES modules. Cleaner architecture (delegated events natively, shared `state.js`). Has features `app.js` lacks: E2EE, reactions, doodle, secret mode, media vault, time capsule, push, offline outbox. Lacks: IndexedDB fast-render, categorized rail. Entry: `public/src/init.js` (orphaned). |
| `src/` | **DELETED** (phase 1) | Stale cosmetic duplicate. Was never served or bundled. |

## Phase 1 (done)
- Deleted `src/` — three-way divergence killed.
- `public/src/` now linted (`npm run lint` covers it; 0 errors).
- Fixed a real regex bug found by linting (`ultimate-features.js` YouTube ID extractor).
- Known debt: ~90 warnings (unused vars, `no-useless-assignment`) — cleanup pass required before cutover.

## Phase 2 — feature parity audit (next)
For each module in `public/src/`, diff its behavior against the corresponding
section of `public/app.js`. Record in a checklist:
- [ ] which module features are NEWER (port forward)
- [ ] which app.js features are MISSING from modules (port back: IndexedDB
      fast-render, categorized rail, `jsAttr` XSS hardening — modules still use
      some inline handlers)
- [ ] which overlap exactly (no action)

## Phase 3 — cutover behind a flag
1. Add `?modules=1` query support in `public/index.html`: when present, load
   `<script type="module" src="/src/init.js">` INSTEAD of `/app.js?v=...`
   (never both).
2. Smoke suite (`npm run test:e2e`) runs twice: default + `?modules=1`.
3. Fix parity gaps until both modes pass.
4. Flip the default to modules; keep `?legacy=1` escape hatch for one release.
5. Delete `public/app.js`.

## Rules until cutover completes
- Bug fixes go to BOTH trees only if user-visible in both; otherwise fix in
  `public/app.js` (what ships) and note the module equivalent.
- New features must NOT be added to `app.js` — build them as modules so the
  migration surface stops growing.
