# Contributing to Receipt Wrecker

Thanks for your interest in contributing. It is a small project, simple on purpose: one HTML file, no dependencies, no build step. The entire app is [`public/index.html`](../public/index.html), inline CSS plus a single vanilla-JS IIFE. Keep it that way and you'll fit right in.

Contributions are accepted under the project's [MIT License](../LICENSE). There is no CLA. By opening a pull request you agree your contribution is licensed under MIT.

---

## Getting started

There is no build step and nothing to install to run the app. Pick whichever loop is easiest:

```bash
git clone https://github.com/shamu4life/receipt-wrecker.git
cd receipt-wrecker

# Option A: just open the file. The whole app is one HTML file.
open public/index.html          # or double-click it in your file manager

# Option B: live-reload preview of public/ via the Cloudflare CLI
npx wrangler dev                # serves public/ as static assets, with live reload

npm test                        # run the unit tests (Node built-in runner, zero deps)
npx wrangler deploy             # publish to production
```

To make a change: edit `public/index.html`, reload the browser. That's the whole loop. `npx wrangler dev` serves `public/` exactly as it ships. There is no bundler and no compile step; the file you edit is the file that runs.

### Tests

The pure glyph-engine functions have unit tests using Node's built-in test runner. There is nothing to `npm install` first:

```bash
npm test         # node --test → runs test/*.test.mjs, which extract and test the inline script from public/index.html
```

The suite (`test/_harness.mjs`) extracts the inline `<script>` from `public/index.html` and runs it in a `node:vm` sandbox against a minimal null-DOM proxy, then exercises the pure pipeline helpers directly (`quantizeTone`, `quantizeBinary`, `ditherFloydSteinberg`, `lumaToDots`, `packBraille`, `render`, `packageCheer`, `buildCensus`, and friends). Those functions are reachable through an inert `module.exports` hook at the end of the IIFE. It is guarded by `typeof module !== "undefined"`, so it does nothing in a browser (where `module` is undefined) and only takes effect under Node's test runner. The script ships and runs unchanged in the browser; the hook is invisible there.

The canvas-rasterizing functions (`rasterizeText`, `rasterizeImage`, `computeGrid`) and all DOM wiring in `init()` need a real canvas/DOM, so they are **not** unit-tested. Verify those by hand in a browser (see below).

When you extend the glyph engine, export the new pure helper through the `module.exports` hook and add a case to the suite. Assert what the code *actually* does, not an idealized version. For example, `render` never emits a space for the "off" cell (a run of spaces would collapse and shear the grid), and `MAX_CHARS` counts Unicode code points, not bytes. There are tests that pin this.

### A change is shippable when:

```bash
npm test                            # unit tests pass
npx wrangler deploy --dry-run       # config + assets validate
```

both pass, and you've smoke-tested the change in a browser (open `public/index.html` or `npx wrangler dev`, try Big Text and Image modes, and confirm the preview and copy button behave). Don't claim "tested" beyond what the suite covers. The unit tests cover the pure glyph engine; canvas rasterization, clipboard, and UI wiring are verified by hand in the browser, so say so and say how.

If your change touches the glyph engine's actual rendering behavior on a real
receipt printer, the ultimate verification is a Census print on the target rig
(see `README.md`). That is not something most contributors can do, and it is not
required for a PR.

---

## Self-hosting (running your own instance)

Receipt Wrecker is a static page plus a small Worker. The page alone works anywhere; the Worker adds the optional picture upload and proxy. There are three ways:

1. Cloudflare Workers. The repo is wired for this. `src/worker.js` serves the `public/` directory as [static assets](https://developers.cloudflare.com/workers/static-assets/) and handles `POST /upload`, the image-serving routes and the `/px` proxy. Deploy with:

   ```bash
   npx wrangler deploy
   ```

   Cloudflare credentials are managed via `wrangler login`. `wrangler.jsonc` declares two custom domains in `routes` (both must stay listed), a `RW_IMG_HOST` var, and the `RW_IMG` KV namespace that holds uploaded images, so a fork needs its own KV namespace id and its own domains, or none at all.

2. Any static host. Drop `public/index.html` on GitHub Pages, Netlify, an S3 bucket, or your own web server: anywhere that serves a file over HTTP.

3. Just open the file. Because the app is one self-contained HTML file with no network calls, you can open `public/index.html` straight from disk. You do not need a server, even offline.

---

## Workflow

1. Fork the repo (or, if you have write access, branch directly) and create a branch from `main`.
2. Make your change in `public/index.html`. See [`CLAUDE.md`](../CLAUDE.md) for the full architecture, the pure-core/glue split, and the payload/glyph constraints.
3. **Never push to `main`.** A push to `main` triggers a production deploy to Cloudflare. All work goes through a branch and a PR.
4. Smoke-test in a browser and run `npm test`.
5. Follow the versioning, documentation, and changelog requirements below.
6. Open a pull request with a clear description (the PR template will prompt you).

---

## House rules

These are the non-negotiables. A PR that breaks one of them won't be merged without a very good reason.

- Stay single-file. All CSS and JS stay inline in `public/index.html`. No separate `.css` / `.js` assets, no bundler, no framework, no runtime dependencies, no CDN, no web fonts, no external images. System font stacks only.
- Network calls only to our own Worker, and no new ones. The app makes exactly six `fetch` calls, all same-origin: `POST /upload` (three call sites) and `GET /px` (three). They back the picture uploaders, glyph-art decoding of a pasted URL, the image-adjust bake, and Thermal preview. Don't add a seventh, don't call a third party, and don't remove the SSRF guard on `/px`.
- Three `localStorage` keys, no more. Control-panel settings (`rw_controls_v1`), the nonce sequence (`rw_nonce_seq`), and the block composer's stack (`rw_blocks_v1`), each wrapped in `try/catch` so sandboxed previews that block storage still render and run. Don't add a fourth, and don't reach for `sessionStorage`.
- Vanilla, ES5-ish IIFE. The script is one `"use strict"` IIFE in the ES5-ish idiom (`var`, function expressions). Match the surrounding code when editing, and don't reach for build-time syntax that would imply a transpile step.
- Markup is the main path now, so escape everything user-supplied. The v1 spec rejected markup; field evidence overtook it (printer-bot renders the chat message as raw HTML), so big type, sideways type, real pictures and Takeovers all emit HTML/SVG. Every user-supplied value that lands in markup goes through `escapeHtml` / `escapeAttr` in the pure core, and the tag carrying a picture comes from the `EMBEDS` table rather than being hardcoded. Keep both properties. Glyph-art remains the markup-free fallback, so don't delete it.
- Privacy: be accurate about it. Big Text and a locally-picked glyph-art picture never leave the device, and there are no analytics, accounts or third parties. But uploading a file, pasting an image URL, or dragging an adjustment slider *does* send data to this project's Worker. Preserve the no-third-parties property, and don't let docs drift back to claiming nothing is ever sent.

---

## Versioning

Standard semantic versioning (`MAJOR.MINOR.PATCH`) for a UI tool: the version reflects what a user notices, not internal churn.

| Change type | Increment |
|---|---|
| Removing or breaking an existing tier/mode/option, or changing payload output in a way that breaks existing workflows | `MAJOR` |
| New tier, mode, option, or any user-visible feature | `MINOR` |
| User-visible bug fix, copy / styling / accessibility fix | `PATCH` |
| Internal refactor with no visible change | `PATCH` |
| CI / docs only | no bump |

Tiebreaker: if a user would notice without being told, it's at least `MINOR`.

A version bump updates all of these in the same PR:

| File | What to change |
|---|---|
| `package.json` | `"version"`, the source of truth |
| `README.md` | Version badge URL |
| `docs/CHANGELOG.md` | New section at the top |

Commit message convention: `chore: bump to vX.Y.Z`.

---

## Changelog format

Add a new section at the top of [`docs/CHANGELOG.md`](../docs/CHANGELOG.md), following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Tiers: short description of a new capability, from the user's perspective

### Changed
- Image: what changed and how it differs; internal-only refactors get an "(internal)" suffix

### Fixed
- UI: what was broken and what it does now
```

Rules:

- Omit empty sections.
- Write from the user's perspective: "Braille tier now…" not "Refactored packBraille to…".
- Start each bullet with the area: `Tiers: `, `Big Text: `, `Image: `, `Census: `, `Output: `, `UI: `.
- One bullet per user-observable change.

---

## Documentation requirements

Every PR that changes code updates the relevant docs in the same PR. Stale docs are treated as a bug. The short version:

| What changed | Update |
|---|---|
| New tier, mode, or behavior | Feature list / tier table in `README.md` and `CLAUDE.md`, `CHANGELOG` |
| Glyph-engine function added/changed | "How it works" pipeline and the global constraints in `README.md` and `CLAUDE.md` |
| Any visible UI change | `CHANGELOG` |
| Version bump | All files in the versioning table above |
