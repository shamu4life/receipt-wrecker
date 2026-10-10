# Contributing to Receipt Wrecker

Thanks for your interest in contributing. It is a small project, simple on purpose: one HTML file, no dependencies, no build step. The entire app is [`public/index.html`](../public/index.html), inline CSS plus a single vanilla-JS IIFE (and, after it, SassyTP's receipt page kept as inert text for the preview). Keep it that way and you'll fit right in.

Contributions are accepted under the project's [MIT License](../LICENSE). There is no CLA. By opening a pull request you agree your contribution is licensed under MIT.

The app targets [SassyTP's printer-bot](https://github.com/SassyTP/printer-bot). Read [`CLAUDE.md`](../CLAUDE.md) first: it describes the target with evidence, the architecture, and the rules about chat filters that every change has to keep.

---

## Getting started

There is no build step and nothing to install to run the app:

```bash
git clone https://github.com/shamu4life/receipt-wrecker.git
cd receipt-wrecker

# Option A: just open the file. The whole app is one HTML file.
open public/index.html          # or double-click it in your file manager

# Option B: local preview of public/ plus the Worker, via the Cloudflare CLI
npx wrangler dev
```

To make a change: edit `public/index.html`, reload the browser. There is no bundler and no compile step; the file you edit is the file that runs. Never edit the vendored renderer block (between the `BEGIN` and `END vendored SassyTP printer-bot renderer` comments) by hand: `tools/vendor-renderer.mjs` writes it.

### Tests

```bash
npm test               # unit tests: Node's built-in runner, nothing to install
npm run test:browser   # the real page in headless Chromium (run `npx playwright install chromium` once)
```

`npm test` runs `test/*.test.mjs`. The harness (`test/_harness.mjs`) extracts the app's own script (`<script id="rw-app">`, picked by its id, never "the first script") from `public/index.html` and runs it in a `node:vm` sandbox against a null-DOM proxy. The pure core is reachable through an inert `module.exports` hook at the end of the IIFE, which does nothing in a browser.

The browser suite drives the real page. It compares every mode's Copy output byte for byte with the pure core, and its MANDATORY contract test runs every mode's message through the vendored SassyTP renderer and checks that nothing is taken out, nothing is cut that the app didn't warn about, and the height matches the app's prediction.

When you add pure-core behaviour, put it outside the DOM guard (see the placement rule in `CLAUDE.md`), export it through the `module.exports` hook, and add a test. Assert what the code actually does. A browser test that depends on a default must set the value it needs.

### A change is shippable when

```bash
npm test
npm run test:browser
npx wrangler deploy --dry-run       # config + assets validate
```

all pass, and you've tried the change in a browser. If it changes what a message looks like, run it through the bench (below) at 80 and 58 mm and say so in the PR. Don't claim more than you tested: the bench and the contract test run SassyTP's real receipt page, but not the streamer's fonts, Edge, settings or chat filter. The real check is a cheer on a real printer (the app's **High Roller test** and **Plain test** buttons are one cheer each). Most contributors can't do that, and it isn't required for a PR.

### The bench

```bash
node tools/payload.mjs '{"kind":"big","text":"HELLO","paper":58}' \
  | node tools/forkbench.mjs --paper 58 --bits 100 --threshold 25
```

`tools/payload.mjs` builds a message with the app's own code; `tools/forkbench.mjs` (`npm run bench`) renders it through SassyTP's receipt page at a pinned commit (fetched once, checked by sha256, cached in the gitignored `.render/`) and writes the screenshot, the 1-bit dithered version and a JSON report. Never commit a font or a copy of the upstream page. Details in `CLAUDE.md`, "Measuring: the bench".

---

## Self-hosting (running your own instance)

Receipt Wrecker is a static page plus a small Worker. The page alone works anywhere; the Worker adds the picture-link proxy, uploads and the adjustment bake.

1. **Cloudflare Workers.** The repo is wired for this. `src/worker.js` serves `public/` as [static assets](https://developers.cloudflare.com/workers/static-assets/) and handles `POST /upload`, the image routes and the `/px` proxy. Deploy with `npx wrangler deploy` (credentials via `wrangler login`). `wrangler.jsonc` declares two custom domains in `routes` (both must stay listed), an `RW_IMG_HOST` var and the `RW_IMG` KV namespace, so a fork needs its own KV namespace id and domains, or none.
2. **Any static host.** Put `public/` on GitHub Pages, Netlify, S3 or your own server.
3. **Just open the file.** Text in every mode and pictures picked from disk work with no server at all.

---

## Workflow

1. Fork the repo (or branch, if you have write access) from `main`.
2. Make your change in `public/index.html` (or the tests, tools or docs).
3. **Never push to `main`.** A push to `main` deploys to production. All work goes through a branch and a PR.
4. Run both test suites and try it in a browser.
5. Follow the versioning, documentation and changelog requirements below.
6. Open a pull request (the template will prompt you).

---

## House rules

These are the non-negotiables. A PR that breaks one of them won't be merged without a very good reason.

- **Stay single-file.** All CSS and JS stay inline in `public/index.html`. No separate assets, no bundler, no framework, no runtime dependencies, no CDN, no web fonts, no external images.
- **Network calls only to our own Worker, and no new ones.** The app's script has exactly four `fetch` call sites, all same-origin: two `GET /px` (reading a pasted picture link for glyph-art, and for the adjustment bake) and two `POST /upload` (the bake, and a file picked on a Real picture card). The preview fetches nothing. Don't add a fifth, don't call a third party, and don't touch the SSRF guard on `/px`.
- **Four `localStorage` keys, no more**: `rw_controls_v1` (settings), `rw_nonce_seq` (the repeat-number counter), `rw_blocks_v1` (the block stack) and `rw_presets_v1` (presets), each wrapped in `try/catch`. New state goes in as a field of one of them.
- **Vanilla, ES5-ish IIFE.** One `"use strict"` IIFE, `var` and function expressions. Match the surrounding code.
- **What a message may contain.** Only the tags `div`, `pre` and `br`, only the `style` attribute, and only style declarations SassyTP's sanitizer keeps. Never a picture tag (the channel's chat filter blocks it). A message never starts with `<`. Every user-supplied character that lands in markup goes through `escapeHtml` / `escapeAttr`. `test/tags.test.mjs` enforces the tag rule.
- **Every High Roller mode has a plain form behind it.** Below the threshold the bot prints plain text, and the app prints Han tiling. Don't add a mode without one.
- **Never route around a channel's moderation.** If a channel blocks a form, the answer is the plain form. No obfuscated tokens (case, entities, spacing, zero-width characters, CSS escapes), no swapping in another tag to get the same effect, and no describing word-splitting as a way past a filter. See THE RULE in `CLAUDE.md`.
- **Credit SassyTP, don't borrow the name.** The preview is drawn by SassyTP's printer-bot renderer (MIT). Keep its notice; never use SassyTP's name or logo as this app's name, and never commit the platform logos.
- **Privacy: be accurate about it.** Text and a picture picked from disk never leave the device; pasting a picture link, uploading on a Real picture card, and adjusting one do send data to this project's Worker. No analytics, accounts or third parties.

---

## Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`) for a UI tool: the version reflects what a user notices.

| Change type | Increment |
|---|---|
| Removing or breaking a mode/option, or changing message output in a way that breaks existing workflows | `MAJOR` |
| New mode, option, or any user-visible feature | `MINOR` |
| User-visible bug fix, copy / styling / accessibility fix | `PATCH` |
| Internal refactor with no visible change | `PATCH` |
| CI / docs only | no bump |

A version bump updates all of these in the same PR:

| File | What to change |
|---|---|
| `package.json` | `"version"`, the source of truth |
| `README.md` | Version badge |
| `docs/CHANGELOG.md` | New section at the top |

---

## Changelog format

Add a new section at the top of [`docs/CHANGELOG.md`](../docs/CHANGELOG.md), following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Big text: short description of a new capability, from the user's perspective

### Changed
- Glyph-art: what changed and how it differs; internal-only refactors get an "(internal)" suffix

### Fixed
- Preview: what was broken and what it does now
```

- Omit empty sections.
- Write from the user's perspective.
- Start each bullet with the area: `Big text: `, `Sideways: `, `Han tiling: `, `Glyph-art: `, `Settings: `, `Preview: `, `Probes: `, `Presets: `, `UI: `.
- Say how sure you are: bench (the forkbench), tests, or a real print.

---

## Documentation requirements

Every PR that changes code updates the relevant docs in the same PR. Stale docs are treated as a bug.

| What changed | Update |
|---|---|
| New mode, option or behaviour | `README.md`, `CLAUDE.md`, `public/llms.txt`, `CHANGELOG` |
| A builder, the packer or the target model | The architecture section of `CLAUDE.md`; regenerate the export list if the exports changed |
| A new SassyTP version vendored | "The target" and "The preview" in `CLAUDE.md` (line numbers, facts), `CHANGELOG` |
| Any visible UI change | `CHANGELOG` |
| Version bump | All files in the versioning table above |
