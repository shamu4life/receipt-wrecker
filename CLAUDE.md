# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this project is

**Receipt Wrecker** (repo: `receipt-wrecker`, deployed Worker: `receipt-wrecker`,
target domain: `receipt.uwutoowo.com`) is a single-file, dependency-free web tool
that turns **big text** or an **uploaded image** into a paste-ready, newline-free
single line of monospace "block" glyphs — a compact character-art payload for any
character-limited text box.

Its headline use is making oversized text or a recognizable picture print on a
Twitch streamer's thermal receipt printer via nutty.gg's **printer-bot**
(Streamer.bot), by pasting the output into chat as a `Cheer100`. The tool itself
is framed neutrally, like its siblings `cheer-splitter-9k` (chunking) and
`transliterate-me` (phonetic transliteration) — the cheer use is one application
of a general glyph-art generator. **HTML/markup injection was considered and
deliberately cut** (see the design spec under `docs/superpowers/specs/` for the
full reasoning) — this tool only ever emits plain Unicode glyphs.

## The one file that matters

**[`public/index.html`](public/index.html) is the entire application.** It is a
self-contained HTML page with inline `<style>` and a single inline `<script>`
(vanilla JS, IIFE, `"use strict"`). **This is the only file to edit when changing
app behavior.** There is no `src/`, no bundler, no package manager for the app
itself.

Everything else in the repo is documentation, tests, or deploy config.

## Repository layout

| Path | Role |
|---|---|
| `public/` | **The deployed site.** Cloudflare serves *only* this directory, so docs/tests stay out of production. |
| `public/index.html` | **The app.** Edit this. |
| `wrangler.jsonc` | Cloudflare Workers config — serves `public/` as static assets. |
| `package.json` | Dev-only metadata: `npm test` (Node's `node:test`) and the Wrangler dev/deploy scripts. No runtime deps. |
| `test/` | Node `node:test` suite — extracts the inline script from `public/index.html` and unit-tests the pure glyph engine. |
| `.github/workflows/ci.yml` | CI: install, `npm test`, then `wrangler deploy --dry-run` on push/PR to `main`. |
| `.github/` | Community-health files (CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates, dependabot). |
| `docs/CHANGELOG.md` | Release notes / change history. |
| `docs/superpowers/` | Design spec, plan, and SDD task briefs this build was implemented from — historical reference, not shipped. |
| `README.md` | Human-facing overview, feature spec, deploy notes. |
| `CLAUDE.md` | This file — assistant-facing guidance. |
| `.gitignore` | Ignores wrangler/env artifacts (`.wrangler`, `.dev.vars*`, `.env*`) plus `node_modules/` and `package-lock.json`. |

## How to run / develop

There is **no build step**. Either:

- Open `public/index.html` directly in a browser, **or**
- Use the Cloudflare CLI from the repo root:

```sh
npx wrangler dev      # local preview of public/ as static assets
npx wrangler deploy   # publish to production (normally CI-verified via dry-run — see below)
```

To make a change: edit `public/index.html`, reload the browser. That's the whole
loop.

## Testing — and why the sandbox is a null DOM

```sh
npm test   # Node's built-in node:test runner — zero deps to install
```

The suite (`test/_harness.mjs` + `test/*.test.mjs`) reads `public/index.html`,
extracts the single inline `<script>` with a regex, and runs it in a `node:vm`
context against a **minimal null-DOM proxy** (`document.getElementById`,
`createElement`, etc. all return an inert proxy object; `addEventListener` is a
no-op). It then unit-tests the exported **pure core**.

That null-DOM sandbox exists because of the app's internal **pure-core /
browser-glue split**:

- The **pure core** (tier tables, luminance quantization, dithering, Braille dot
  packing, render/budget helpers, cheer packaging, the Census builder) is plain
  functions with no DOM dependency at all — inputs and outputs are arrays/strings.
  These are fully unit-testable.
- The **browser glue** (canvas rasterization of text/images, DOM wiring, event
  handlers, clipboard, `localStorage`) is guarded by
  `if (typeof document !== "undefined" && document.getElementById)` and only ever
  *runs* once `document.addEventListener("DOMContentLoaded", init)` fires — which
  the null-DOM sandbox never triggers, since there's no real event loop driving
  it. The guard's function *declarations* still parse and hoist fine against the
  null-DOM proxy (they're never *called*), which is what lets the whole script run
  in `node:vm` without a real DOM, canvas, or `window` at all.

An **inert `module.exports` hook** at the end of the IIFE (guarded by
`typeof module !== "undefined"`, false in browsers, true under Node) hands the
test harness the pure-core functions: `TIERS`, `getTier`, `sampleLuma`,
`quantizeTone`, `quantizeBinary`, `ditherFloydSteinberg`, `lumaToDots`,
`packBraille`, `render`, `payloadLength`, `withinBudget`, `MAX_CHARS`,
`makeNonce`, `packageCheer`, `buildCensus`, `CHEER_TOKEN`, `packStackBodies`,
`HEIGHT_BUDGET`, `escapeHtml`, `escapeAttr`, `EMBEDS`, `EMBED_DEFAULT`,
`getEmbed`, `buildImageEmbed`, `buildEmbedProbe`. The canvas-rasterizing
functions (`rasterizeText`, `rasterizeImage`, `computeGrid`, and the UI wiring in
`init()`) are **not** exported — they need a real canvas/DOM, so they're verified
by hand in a browser instead (see `.superpowers/sdd/progress.md` for what's been
manually browser-verified so far). CI runs the same `npm test` (see
`.github/workflows/ci.yml`).

## Deployment (Cloudflare Workers)

- Connected via **Workers Builds**. `public/` is served as
  [static assets](https://developers.cloudflare.com/workers/static-assets/);
  there is no Worker script, just assets.
- **Target domain: `receipt.uwutoowo.com`** — configured as a custom
  domain/route for the Worker (Cloudflare dashboard or `wrangler.jsonc` `routes`).
  This is a deploy-time step; it is not exercised by `npm test` or the CI
  dry-run.
- Config is `wrangler.jsonc`: `name` = `receipt-wrecker`, `assets.directory` =
  `./public`.
- CI validates every push/PR to `main` with `npx wrangler deploy --dry-run` — the
  GitHub Actions workflow itself never deploys.
- **Workers Builds does, though: every push to `main` auto-deploys to production,
  within ~15s.** Pushes to any other branch build but never reach production.
  Merging *anything* to `main` — even a docs- or CI-only change — republishes
  `main`'s `public/` and `src/` over whatever is currently live.
- `npx wrangler deploy` also exists and deploys **whatever is checked out**. Using
  it from a feature branch puts un-merged code in production; see the divergence
  rule under "Working in this repo".

## Architecture of the app (glyph pipeline)

All functions live inside the one IIFE in `public/index.html`.

**Pure core** (DOM-free, unit-tested):

1. `TIERS` / `getTier(id)` — the glyph tier table: `safe` (`░▒▓█` block ramp,
   Image mode's default), `cjk` (curated Han density ramp), `braille` (2×4 dot
   packing, highest resolution), `text` (binary `█`/`░`, Big Text mode's
   default for crisp letters — the tier selector overrides it, so big text can
   also render in CJK or Braille). Quadrant and fullwidth-ASCII tiers are
   **explicitly deferred** — do not add them without an explicit request; keep
   the tier table's shape (`id`, `label`, `kind`, `ramp`/`on`/`off`) if you do.
2. `sampleLuma(pixels, imgW, imgH, cols, rows)` — downsamples an RGBA buffer to a
   `cols×rows` luminance grid, compositing alpha over white.
3. `quantizeTone(luma, ramp, opts)` / `quantizeBinary(luma, opts)` — map
   luminance → a glyph per cell using a tone ramp (images) or on/off glyphs
   (binary text), honoring `invert`.
4. `ditherFloydSteinberg(luma, nLevels)` — optional error-diffusion dither to the
   active tier's ramp depth, as an alternative to plain thresholding.
5. `lumaToDots(luma, opts)` / `packBraille(dots)` — for the Braille tier: threshold
   a fine 2×-wide/4×-tall luma grid to booleans, then pack each 2×4 block into one
   Braille codepoint (U+2800 + bitmask).
6. `render(cells)` / `payloadLength(s)` / `withinBudget(s)` / `MAX_CHARS` (500) —
   flatten a `CellGrid` to one newline-free string and check it against the
   character budget (see Global Constraints below).
7. `makeNonce(i)` / `packageCheer(body, opts)` / `CHEER_TOKEN` (`"Cheer100"`) —
   append a space-delimited `Cheer100` token plus a small **visible** rotating
   nonce (glyphs, never zero-width) when the "Cheer-ready" toggle is on.
8. `buildCensus()` — the fixed diagnostic payload for the **Print test strip**
   button: labeled samples of every tier plus a numbered ruler, so a single print
   on the target rig reveals which tiers render vs. tofu and the true column
   count.
9. `escapeHtml` / `escapeAttr` — escaping for anything user-supplied that lands in
   markup.
10. `EMBEDS` / `EMBED_DEFAULT` / `getEmbed(id)` / `buildImageEmbed(id, box)` — the
    **carrier tag** table: every interchangeable way to put a real picture on the
    printed page, each building the same picture out of a different token, because
    the blocked-terms list keeps eating them one at a time. `buildImageEmbed` is the
    only place that markup is built (it also normalizes the box, so a missing aspect
    probe can't emit a zero-sized frame). See Global Constraints for the drill when
    the next one gets blocked. **The order and the labels are measured** — see
    "Measuring against the real engine" below before editing either.
11. `buildEmbedProbe(box)` — the diagnostic payload set for the **Find what still
    sends** button: the same picture through every carrier, labeled `A`…`G`, one
    message each (they can't share a cheer — one blocked term kills the whole
    message). A letter that prints *with a picture under it* names the carrier that
    works; a bare letter means the tag didn't render; a missing letter means chat
    blocked it. This is `buildCensus`'s counterpart for markup rather than glyphs.

**Browser glue** (canvas + DOM, guarded, browser-verified rather than
unit-tested):

- `rasterizeText(text, o)` / `rasterizeImage(imgEl, o)` — draw onto an off-screen
  `<canvas>` (scaling big-text words to fill the target width; drawing/rotating
  images for the sideways orientation) and return the raw pixel buffer.
- `computeGrid(kind, tier, o)` — composes rasterize → sample → quantize (or
  Braille pack) into a `CellGrid`, deriving the sample grid's aspect from the
  *actual* rasterized buffer dimensions (post-rotation) rather than a
  pre-rotation assumption, so "sideways" is a true rotation and not a
  transpose/distortion.
- `buildTextPayload()` / `buildImagePayload()` — read the current controls,
  call `computeGrid` + `render` + `packageCheer`, and return the paste-ready
  string (or `null` for Image mode with no image chosen yet).
- `imageBox(block)` / `imageBodies(block)` — the print box for a real-picture block
  (requested width capped to the paper; height from the probed aspect, square until
  that probe lands and re-renders) and the body built from it via `buildImageEmbed`.
  `probeBlockAspect` does the one-off aspect probe. `probeParts()` reuses `imageBox`
  so the probe measures the carrier tag and nothing else.
- `copyToClipboard(text)` — `navigator.clipboard.writeText()` with an
  `execCommand('copy')` fallback (`fallbackCopy()`).
- `saveControls()` / `restoreControls()` / `loadSavedControls()` — persist/restore
  the control panel (tier, columns, mode, toggles, text) to `localStorage`.
- `nextNonce()` — advances a `localStorage`-backed counter (falling back to an
  in-session counter if storage is unavailable) and feeds it through `makeNonce`.
- `init()` — wires all DOM elements and event listeners; only runs on
  `DOMContentLoaded`, so it never executes under the test harness.

## Measuring against the real engine (do this before claiming a markup form works)

The destination is not a guess any more. printer-bot's own shipped files pin it
down, and anything about how markup *renders* can be tested locally instead of
argued about:

- **Engine:** `wkhtmltopdf 0.12.6 (with patched qt)` — patched **Qt 4.8.7**, i.e.
  QtWebKit ~**534.34** (a 2011 snapshot). Not Chromium, not Qt 5. Then printed via
  SumatraPDF 3.5.2. There is no ESC/POS text path.
- **The message is inserted with raw `innerHTML`**, unsanitised, then re-serialised
  into a standalone HTML document and parsed a second time by wkhtmltopdf.
- **Its exact print flags** (from the Print Routine) — several of these decide
  whether a given form renders at all:

  ```
  --page-width {paperWidth-8}mm --page-height 500mm --disable-smart-shrinking
  --load-error-handling ignore --no-background --enable-javascript
  --enable-local-file-access --javascript-delay 800 --margin-{top,bottom,left,right} 0
  ```

- **Its receipt CSS** is `body { margin: 1em }` + `#receipt-content { padding:
  0.5em 0em }`, and **nothing clamps message content** — no `max-width`, no
  `height: auto`. Do not test against Receipt Wrecker's own preview CSS by mistake:
  its `.rcpt-body > svg { height: auto }` collapses an SVG carrier to zero height
  and will make you conclude the engine can't render SVG. It can.

To measure: install wkhtmltopdf 0.12.6 (the **patched-qt** build — the distro
QtWebKit 5.212 build behaves differently), generate pages with the real
`buildImageEmbed` via `test/_harness.mjs`, render with the flags above, and check
for an image XObject with `pdfimages -list` plus an ink bbox off `pdftoppm`.

Things already settled this way, so you don't have to re-derive them:

- `--no-background` means **no CSS-background carrier can ever work**, however
  tempting a tagless surface looks.
- `<embed>` / `<object>` pick the image renderer from the URL's **file extension**;
  a bare `/i/<hex>` renders nothing. `<img>` / `<input type=image>` don't care.
- A failed subresource whose extension isn't in wkhtmltopdf's hardcoded media list
  (`css/js/svg/png/jpg/jpeg/gif`) is a **fatal** error — exit 1, whole job — and
  `--load-error-handling ignore` does not suppress it. This is why `/upload`
  returns `.png` links.
- An `<iframe>` gets **no shrink-to-fit** (that's main-frame only), so it crops.
- The usable body width is `paperWidth - 8`mm minus the 1em margins — **240 px** on
  an 80 mm roll, against `PAPER_PX = 263`. Left as-is deliberately (it's shared
  with field-verified text modes and depends on the streamer's paper setting), but
  know it when you touch print geometry.

## Global Constraints (payload & glyph rules — do not relax without an explicit request)

These come directly from verified, reverse-engineered constraints on the
receiving renderer (see the design spec for the full evidence trail) — they are
not arbitrary style choices:

- **Single line, no newlines.** The payload is exactly one newline-free string.
  Twitch chat messages are single-line; no `\n`/`\r` survives delivery anyway.
- **Character budget: `MAX_CHARS = 500`** (Twitch's real per-message limit; the whole
  payload incl. the cheer token counts), counted by **code points**
  (`Array.from(s).length`), leaving headroom under Twitch's ~500-char cap. Over
  budget is **reported, never silently truncated** — truncation shears the grid.
- **The "off" cell is always a real, non-collapsing glyph** (`░` by default),
  **never a space.** HTML whitespace collapsing would shear the grid, and a space
  is the wrong advance width in a proportional fallback font.
- **No `<`, `>`, or `&`** may appear in *glyph* output. None of the tier glyph sets
  include them; don't add a tier or ramp entry that does. (The markup modes — big
  type, rotate, real pictures — obviously emit tags; everything user-supplied that
  goes into them runs through `escapeHtml` / `escapeAttr` in the pure core.)
- **A payload must never *lead* with `<`** — some sends get dropped outright on a
  leading angle bracket. When cheering, the `Cheer<N>` token leads; otherwise
  `LEAD_GUARD` (a non-breaking space) does.
- **No color emoji / astral-plane codepoints.** The target renderer (old
  Qt-WebKit) has zero color-font support — these tofu. Stick to BMP glyphs with
  broad legacy-font coverage (Block Elements, Braille, curated CJK).
- **The `Cheer100` token is space-delimited and never leads the payload.** The
  grid comes first, `Cheer100` + nonce sits in the footer, so the cheermote
  renders below the image instead of pushing it down the tape. The payload must
  not begin with `/` or `.` (Twitch command parsing) — naturally satisfied since
  it starts with a block glyph.
- **The nonce is visible, never zero-width.** It exists to defeat a duplicate-
  message filter; an invisible/zero-width character is likely to be stripped by
  the same sanitizing behavior that rules out HTML injection.
- **Markup was originally out of scope; that was overtaken by field evidence.** The
  v1 spec rejected it (see
  `docs/superpowers/specs/2026-07-05-block-glyph-art-generator-design.md`, §2) on
  the grounds that it depended on undocumented sanitization. It was then confirmed
  live that printer-bot renders the chat message as HTML, so big type, sideways
  type, and real pictures are all markup now. **The spec's reasoning still holds as
  a warning, though:** markup is the surface mods block, and every markup mode
  needs a markup-free fallback behind it (Hanzi tiling for text, glyph-art for
  pictures). Don't ship a markup-only feature.
- **Carrier tags: the tag for a real picture is DATA, not a hardcode.** The
  blocked-terms list has already eaten `<object` and then `<image`, each block
  killing every picture the tool makes. `EMBEDS` in the pure core lists the
  interchangeable surfaces (`img` default, `input type=image`, `embed`, `iframe`,
  plus the two blocked ones kept for A/B) and `buildImageEmbed()` is the only place
  that markup gets built. When the next one gets blocked: mark it `blocked: true`,
  move `EMBED_DEFAULT`, bump `EMBED_V` so saved blocks migrate — do **not** hardcode
  a new tag at a call site, and **measure a candidate before adding it** (see
  "Measuring against the real engine"; a CSS-background carrier was written, found
  dead, and cut, because `--no-background` makes it unrenderable).

## Hard constraints — keep these true

These are the project's defining properties (shared with the sibling tools).
**Do not break them without an explicit request:**

> **Exception (added by explicit request):** an **optional** image backend.
> `src/worker.js` is a tiny Cloudflare Worker that serves the static site as before
> **plus** three routes: `POST /upload` (stashes an image in the `RW_IMG` KV namespace
> with a native 15-minute `expirationTtl`, 5 MB cap, image/* only), `GET /i/<hex>`
> (serves it back), and `GET /px?u=<url>` (an image proxy — see below). The client
> calls `/upload` **only** when the user clicks "Upload for a 15-min link"; the
> returned URL feeds an `<object data>` real-image payload.
>
> `/px` exists because **Thermal preview cannot dither a picture without it.**
> `thermalize()` rasterizes the receipt by loading it as an SVG `<img>`, and an SVG
> loaded that way may not fetch *any* external resource — a remote `<img>` inside the
> `foreignObject` never paints at all. So the picture has to be inlined as a `data:`
> URI first, and reading a cross-origin image's bytes from JS is exactly what CORS
> forbids; the bytes come back through our own origin instead. `/px` is guarded by
> `isPublicHttpUrl()` (public http(s) only — no other scheme, no loopback/private/
> link-local host, redirects re-validated hop by hop), enforces image/* + the 5 MB
> cap, and is covered by `test/proxy.test.mjs`. **Without that guard it is an open
> relay / SSRF gadget — do not loosen it.**
>
> These are the only sanctioned network calls / server-side pieces. The privacy line
> is now: Big Text and glyph-art are **fully local**; paste-a-URL is local *until you
> turn on Thermal preview*, which sends that URL through `/px` to fetch its bytes.
> The constraints below hold for everything *except* those explicit flows.

- **One file.** No build step, no framework, no external resources. System font
  stacks only — **no web fonts, no CDN, no external images** (the upload backend
  above is the sole exception, and only on the user's explicit action).
- **The shipped app stays zero-dependency.** "No dependencies" applies to what
  ships in `public/`: it must have **no runtime deps** and load nothing external.
  Dev-only tooling does **not** ship and does **not** violate this — Wrangler is
  a dev/deploy CLI (a `devDependency`), and the tests use only Node built-ins
  (`node:test`, `node:vm`, `node:fs`). Neither is bundled into `public/`. Do not
  add a runtime dependency, a `<script src>`, or any external fetch to the app,
  and do not split the single file to accommodate tooling.
- **No network calls.** `fetch`/XHR are not used and must not be added. Images
  are read from a local file input via `FileReader`, never uploaded.
- **Storage:** `localStorage` is used only for (a) the control-panel settings
  (`rw_controls_v1`) and (b) the nonce sequence counter (`rw_nonce_seq`), both
  wrapped in `try/catch` so sandboxed previews that block storage still render
  and run. Don't add other `localStorage`/`sessionStorage` use without an
  explicit request.
- **Vanilla JS**, IIFE-wrapped, `"use strict"`, ES5-ish style (`var`, function
  expressions) — match the surrounding code's idiom when editing.
- **Privacy:** everything runs client-side; text and images never leave the
  device. Preserve this.

## Conventions & gotchas for editors

- Keep style/markup/script **inline in the one file** — do not split into
  separate `.css`/`.js` assets.
- Known v1 limitations, accepted as-is unless a task says otherwise (see
  `.superpowers/sdd/progress.md` for the full accepted-minors list): `buildCensus`
  hardcodes its sample glyphs rather than deriving them from `TIERS`; no keystroke
  debounce (each keystroke still burns a control-settings `localStorage` write via
  `saveControls()`, though the nonce itself only advances on Copy); `TEXT_ROWS`/
  scale-to-fit height cap means very long big-text input can cramp at narrow
  column widths; `CHAR_ASPECT = 0.5` is a fixed magic constant for glyph
  aspect ratio, not measured per-font.
- Licensed under **MIT** (see `LICENSE`).

## Working in this repo (workflow for assistants)

- Branch: do development on the assigned feature branch; **never push directly to
  `main`** without explicit permission (a push to `main` triggers a production
  deploy).
- Pushing to a branch and opening a PR is the normal flow. Branch pushes build but
  do **not** deploy, so they cannot disturb production.
- After pushing, ensure a PR exists for the branch.

### Before merging ANYTHING to `main`: check prod has not diverged

**`main` is only the source of truth if nothing was deployed from outside it.**
A `wrangler deploy` run from a feature branch (or a rollback in the Cloudflare
dashboard) puts production *ahead of* `main` with no trace in git — and then the
next merge to `main`, however trivial, silently **reverts production** to whatever
`main` still holds.

This has happened: prod ran the `stack-composer` build for two days while `main`
sat 22 commits behind it. Three Dependabot merges and a `.gitignore` merge each
auto-deployed `main` and rolled the live app back ~35 hours before anyone noticed.
"This PR only touches CI/docs, so the deploy is a harmless no-op" is **exactly the
reasoning that caused it** — it is only true if prod already matches `main`.

So, before merging anything to `main`:

```sh
# what prod actually serves, vs what main would ship
curl -sS https://receipt.uwutoowo.com/ | shasum -a 256
git show main:public/index.html        | shasum -a 256
```

- **Hashes match** → merge freely; the deploy really is a no-op.
- **Hashes differ** → **stop.** Production is running something that is not in
  `main`. Find out what (`npx wrangler deployments list --name receipt-wrecker`,
  and diff prod against each branch), and land that work into `main` *first*.
  Do not merge, and do not "fix" it by force-deploying `main`.

Probing a route is a good second check that the live **Worker** (not just the
assets) is what you think — `/px?u=http://127.0.0.1/x.png` returns **400** when the
proxy + SSRF guard are deployed, versus **404** on a build that predates `/px`.
Note that the Cloudflare API's "get worker code" can return a stale script; trust
a live probe over it.
- The real-world acceptance test for any change to the glyph engine is a physical
  **Census print** on the target rig (see README → "Tiers & the Census") — unit
  tests prove the generation logic, not what actually comes off the printer.
