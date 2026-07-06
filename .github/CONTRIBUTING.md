# Contributing to Receipt Wrecker

Thanks for your interest in contributing! This is a small, deliberately simple project — one HTML file, no dependencies, no build step. The entire app is [`public/index.html`](../public/index.html): inline CSS plus a single vanilla-JS IIFE. Keep it that way and you'll fit right in.

Contributions are accepted under the project's [MIT License](../LICENSE). There is **no CLA** — by opening a pull request you agree your contribution is licensed under MIT. That's it.

---

## Getting Started

There is **no build step** and nothing to install to run the app. Pick whichever loop is easiest:

```bash
git clone https://github.com/shamu4life/receipt-wrecker.git
cd receipt-wrecker

# Option A — just open the file. The whole app is one HTML file.
open public/index.html          # or double-click it in your file manager

# Option B — live-reload preview of public/ via the Cloudflare CLI
npx wrangler dev                # serves public/ as static assets, with live reload

npm test                        # run the unit tests (Node built-in runner, zero deps)
npx wrangler deploy             # publish to production
```

To make a change: edit `public/index.html`, reload the browser. That's the whole loop. `npx wrangler dev` serves `public/` exactly as it ships — there is no bundler and no compile step; the file you edit is the file that runs.

### Tests

The **pure glyph-engine functions** have unit tests using Node's built-in test runner — there is nothing to `npm install` to run them:

```bash
npm test         # node --test → runs test/*.test.mjs, which extract and test the inline script from public/index.html
```

The suite (`test/_harness.mjs`) **extracts the inline `<script>` from `public/index.html`** and runs it in a `node:vm` sandbox against a minimal null-DOM proxy, then exercises the pure pipeline helpers directly (`quantizeTone`, `quantizeBinary`, `ditherFloydSteinberg`, `lumaToDots`, `packBraille`, `render`, `packageCheer`, `buildCensus`, and friends). Those functions are made reachable through an **inert `module.exports` hook at the end of the IIFE** — it is guarded by `typeof module !== "undefined"`, so it does nothing in a browser (where `module` is undefined) and only takes effect under Node's test runner. The script ships and runs unchanged in the browser; the hook is invisible there.

The canvas-rasterizing functions (`rasterizeText`, `rasterizeImage`, `computeGrid`) and all DOM wiring in `init()` need a real canvas/DOM and are **not** unit-tested — verify those by hand in a browser (see below).

When you extend the glyph engine, export the new pure helper through the `module.exports` hook and add a case to the suite. Assert what the code *actually* does, not an idealized version — e.g. `render` never emits a space for the "off" cell (a run of spaces would collapse and shear the grid), and `MAX_CHARS` counts Unicode code points, not bytes (there are tests that pin this).

### A change is shippable when:

```bash
npm test                            # unit tests pass
npx wrangler deploy --dry-run       # config + assets validate
```

both pass, **and** you've smoke-tested the change in a browser (open `public/index.html` or `npx wrangler dev`, try Big Text and Image modes, and confirm the preview and copy button behave). Don't claim "tested" beyond what the suite covers — the unit tests cover the pure glyph engine; canvas rasterization, clipboard, and UI wiring are verified by hand in the browser, so say so and say how.

If your change touches the glyph engine's actual rendering behavior on a real
receipt printer, the ultimate verification is a **Census print** on the target
rig (see `README.md`) — but that's not something most contributors can do, and
it's not required for a PR.

---

## Self-Hosting (running your own instance)

Receipt Wrecker is just static files, so hosting it is trivial. There are three ways:

1. **Cloudflare Workers static assets.** The repo is wired for this. `wrangler.jsonc` serves the `public/` directory as [static assets](https://developers.cloudflare.com/workers/static-assets/) — there is no Worker script, just files. Deploy with:

   ```bash
   npx wrangler deploy
   ```

   Cloudflare credentials are managed via `wrangler login`. There are no secrets, no KV namespaces, and no environment variables to configure.

2. **Any static host.** Drop `public/index.html` on GitHub Pages, Netlify, an S3 bucket, your own web server — anywhere that serves a file over HTTP.

3. **Just open the file.** Because the app is one self-contained HTML file with no network calls, you can open `public/index.html` straight from disk — no server required, even offline.

---

## Workflow

1. Fork the repo (or, if you have write access, branch directly) and create a branch from `main`.
2. Make your change in `public/index.html`. See [`CLAUDE.md`](../CLAUDE.md) for the full architecture, the pure-core/glue split, and the payload/glyph constraints.
3. **Never push to `main`.** A push to `main` triggers a **production deploy** to Cloudflare. All work goes through a branch and a PR.
4. Smoke-test in a browser and run `npm test`.
5. Follow the **versioning**, **documentation**, and **changelog** requirements below.
6. Open a pull request with a clear description (the PR template will prompt you).

---

## House Rules

These are the non-negotiables. They are what make Receipt Wrecker what it is. A PR that breaks one of them won't be merged without a very good reason:

- **Stay single-file.** All CSS and JS stay **inline** in `public/index.html`. No separate `.css` / `.js` assets, no bundler, no framework, no runtime dependencies, no CDN, no web fonts, no external images. System font stacks only.
- **No network calls.** `fetch` / `XHR` are not used and must not be added. Images come from a local file picker (`FileReader`), never uploaded. The app does everything in the page.
- **No storage beyond control settings + the nonce counter.** The only persisted state is the control-panel settings (`rw_controls_v1`) and the nonce sequence (`rw_nonce_seq`), each in a single `localStorage` key, wrapped in `try/catch` so sandboxed previews that block storage still render and run. Don't add other `localStorage` / `sessionStorage` use.
- **Vanilla, ES5-ish IIFE.** The script is one `"use strict"` IIFE in the ES5-ish idiom (`var`, function expressions). Match the surrounding code when editing — don't reach for build-time syntax that would imply a transpile step.
- **No HTML/markup injection.** This was evaluated for the glyph payload and deliberately rejected (see `CLAUDE.md` and the design spec) — it depends on sanitization behavior in the destination client that can't be relied on. The tool only ever emits plain Unicode glyphs. Don't reintroduce it.
- **Privacy is the product.** Everything runs client-side; **your text and any picked image never leave the device.** No analytics, no servers, no accounts. Preserve this.

---

## Versioning

Standard **semantic versioning** (`MAJOR.MINOR.PATCH`) for a UI tool — the version reflects what a user notices, not internal churn.

| Change type | Increment |
|---|---|
| Removing or breaking an existing tier/mode/option, or changing payload output in a way that breaks existing workflows | `MAJOR` |
| New tier, mode, option, or any user-visible feature | `MINOR` |
| User-visible bug fix, copy / styling / accessibility fix | `PATCH` |
| Internal refactor with no visible change | `PATCH` |
| CI / docs only | no bump |

**Tiebreaker:** if a user would notice without being told, it's at least `MINOR`.

A version bump updates **all** of these in the same PR:

| File | What to change |
|---|---|
| `package.json` | `"version"` — source of truth |
| `README.md` | Version badge URL |
| `docs/CHANGELOG.md` | New section at the top |

Commit message convention: `chore: bump to vX.Y.Z`.

---

## CHANGELOG Format

Add a new section at the top of [`docs/CHANGELOG.md`](../docs/CHANGELOG.md), following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- Tiers — short description of a new capability, from the user's perspective

### Changed
- Image — what changed and how it differs; internal-only refactors get an "(internal)" suffix

### Fixed
- UI — what was broken and what it does now
```

Rules:

- Omit empty sections.
- Write from the user's perspective: "Braille tier now…" not "Refactored packBraille to…".
- Start each bullet with the area: `Tiers — `, `Big Text — `, `Image — `, `Census — `, `Output — `, `UI — `.
- One bullet per user-observable change.

---

## Documentation Requirements

Every PR that changes code updates the relevant docs in the **same PR**. Stale docs are treated as a bug. The short version:

| What changed | Update |
|---|---|
| New tier, mode, or behavior | Feature list / tier table in `README.md` and `CLAUDE.md`, `CHANGELOG` |
| Glyph-engine function added/changed | "How it works" pipeline and Global Constraints in `README.md` and `CLAUDE.md` |
| Any visible UI change | `CHANGELOG` |
| Version bump | All files in the versioning table above |
