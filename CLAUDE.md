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
of a general glyph-art generator.

**The app emits HTML markup, and that is the main path now.** The v1 spec
deliberately cut markup (see `docs/superpowers/specs/`) on the grounds that it
depended on undocumented sanitization — then it was confirmed in the field that
printer-bot renders the chat message as raw HTML. Big type, sideways type, real
pictures, takeovers and the fake cheer are all markup. Glyph-art is still here as
the markup-free fallback that always prints. Do not "restore" the glyphs-only
rule: it describes a product that no longer exists.

## The one file that matters

**[`public/index.html`](public/index.html) is the entire application.** It is a
self-contained HTML page with inline `<style>` and a single inline `<script>`
(vanilla JS, IIFE, `"use strict"`). **This is the only file to edit when changing
app behavior.** There is no bundler and no package manager for the app itself.

`src/worker.js` is the other piece of shipped code — a small Cloudflare Worker
that serves the static site plus `/upload`, the image-serving routes and `/px`.
It is `main` in `wrangler.jsonc`, so it is the deployed entrypoint, and
`test/proxy.test.mjs` and `test/imgpath.test.mjs` import it directly.

Everything else in the repo is documentation, tests, or deploy config.

## Repository layout

| Path | Role |
|---|---|
| `public/` | **The deployed site.** Cloudflare serves *only* this directory, so docs/tests stay out of production. |
| `public/index.html` | **The app.** Edit this. |
| `src/worker.js` | The Cloudflare Worker: serves `public/` as assets **plus** `POST /upload`, the image-serving routes (`/<hex>.png` and legacy `/i/<hex>`), and the `/px` image proxy. `main` in `wrangler.jsonc`. |
| `wrangler.jsonc` | Workers config — `main`, the two custom domains in `routes`, the `RW_IMG_HOST` var, and the `RW_IMG` KV binding. |
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
`HEIGHT_BUDGET`, `escapeHtml`, `escapeAttr`, `urlHasImageExt`, `EMBEDS`, `EMBED_DEFAULT`,
`getEmbed`, `buildImageEmbed`, `buildEmbedProbe`, `buildTakeover`, `takeoverBox`,
`TAKEOVER_PULL_PT`, `buildFakeCheer`, `CHEER_AVATAR_W`, `CHEER_MIN_PIC_PX`,
`takeoverReport`, `takeoverItems`, `takeoverPlace`, `takeoverWants`, `lineFmt`,
`takeoverAmountText`, `takeoverItemsForBlock`, `takeoverPinToInk`,
`migrateTakeoverItems`, `migrateTakeoverPull`, `TAKEOVER_ITEMS_V`, `TAKEOVER_PULL_V`.
(That list is easy to let rot — regenerate it
with `node -e 'import("./test/_harness.mjs").then(({loadCore})=>console.log(Object.keys(loadCore())))'`
rather than trusting it.) The canvas/DOM functions — `rasterizeImage`, `computeGrid`,
the body builders and the UI wiring in `init()` — are **not** exported and are
verified by hand in a browser instead. CI runs the same `npm test` (see
`.github/workflows/ci.yml`).

## Deployment (Cloudflare Workers)

- Connected via **Workers Builds**. `src/worker.js` is the entrypoint; it serves
  `public/` as [static assets](https://developers.cloudflare.com/workers/static-assets/)
  and handles `/upload`, the image routes and `/px`.
- **Two custom domains, both declared in `wrangler.jsonc` `routes`:**
  `receipt.uwutoowo.com` (the app) and `i.uwutoowo.com` (short host for uploaded
  image links). **Both must stay listed.** This file used to declare no routes at
  all and the app domain lived only in the dashboard — once routes are in config,
  config is the source of truth, and declaring only one invites a deploy to
  reconcile the route set and drop the other.
- `vars.RW_IMG_HOST` = `i.uwutoowo.com` makes `/upload` mint 39-char links instead
  of 45. It falls back to the request origin when unset, so previews and
  `wrangler dev` work either way — but **only set it while that host really
  answers**, or every picture prints blank.
- `kv_namespaces`: `RW_IMG` holds uploaded images with a native 15-minute TTL.
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

1. `TIERS` / `getTier(id)` — the glyph tier table. **Six tiers, in this order:**
   `ascii` (letter ramp, *the glyph-art default*), `asciifull` (denser ASCII ramp),
   `safe` (`░▒▓█` blocks), `cjk` (curated Han density ramp), `braille` (2×4 dot
   packing), `text` (binary `█`/`░`, used by big type). The ASCII ramps lead because
   they need no particular font to be installed; the app's own selector labels the
   block tier "often blank on printer", so do NOT call blocks the safe choice. Both
   ASCII ramps start with a literal space as their lightest cell — see the
   `white-space:pre` note in Global Constraints. Keep the table's shape (`id`,
   `label`, `kind`, `ramp`/`on`/`off`) if you add one.
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
11. `buildTakeover(o)` / `takeoverBox(pullPt)` / `TAKEOVER_PULL_PT` — the **Takeover**
    block: an opaque SVG lifted over printer-bot's own header with a negative top
    margin, so the tape reads as your artwork instead of a receipt with a message
    stapled under it. Three optional lines plus an optional picture (which rides in a
    `<foreignObject>` through `buildImageEmbed`, so it inherits the carrier table
    rather than hardcoding SVG's blocked `<image`). Everything derives from one
    calibration number, `pullPt` — the bot's header height varies with the streamer's
    avatar, so it needs one print to dial in. Lines are bottom-anchored to the covered
    area by default; pass `startY` to hang them downward from a given baseline instead,
    which is what the fake cheer does. Either way the stack is **clamped into the
    painted box** — a baseline outside it prints *on top of* the header this block
    exists to paint over, which reads as the feature simply not working.
    **THE LEAD IS PART OF THE GEOMETRY.** A lifted overlay is positioned from where the
    SVG lands in `#receipt-content`, and it does not land at the top: every message
    carries a lead (`Cheer100 <nonce> `, or the nbsp guard) *before* the first body,
    and that lead takes a line — measured 16px, which left a crescent of the streamer's
    avatar printing above the artwork. `TAKEOVER_PULL_PT` is 240 **because** of that
    line; the original 220 was calibrated against a preview that rendered the bodies
    with no lead at all. Two rules follow, and breaking either re-creates the bug:
    `packStackBodies` publishes `lead` and its payload is exactly `lead + bodies` (one
    string, so preview and print cannot diverge), and the preview renders that lead into
    the receipt slot. `CHEER_MAX_LIFT_PX` is **derived** from `TAKEOVER_PULL_PT` — never
    re-inline it as a literal, which is how it and the default silently drifted apart.
    **Known limit, do not "fix" by guessing:** a picture is anchored to the top of the
    panel, so on a rig whose real header is shorter than the pull it is lifted clean off
    the paper and clipped, and turning the pull down instead drops it under the 120px
    floor — swept 60–400pt against a short header and it never printed. The app cannot
    know the rig's header height; that is what the pull *is*. The preview clips at the
    paper edge (`.rcpt { overflow: hidden }`) so the loss is visible instead of silent.
12. `buildFakeCheer(o)` / `CHEER_AVATAR_W` — the **Fake cheer**: the same takeover
    arranged like the bot's own header (picture on top, then the amount, then a name,
    then an italic note). It **composes `buildTakeover`** rather than emitting its own
    markup, so escaping, the carrier table and the `foreignObject`-last rule are
    inherited instead of re-implemented — keep it that way.
    **Nothing renders through it any more.** Every takeover draws from its item list;
    this survives as the migration's ORACLE ("where did this block's ink land in 0.4.2")
    and as the seed button's data, so treat it as frozen. There is no `CHEER_SUFFIX`:
    `" BITS"` used to be welded on at render time, which is the one thing that made the
    block Twitch-only, and it is now baked into the amount ITEM's text once, at
    migration, by `takeoverAmountText`. Nothing appends anything when it draws.
    The layout numbers reproduce the hand-built payload this was reverse-engineered
    from, which printed correctly on the real rig: an 80 px picture at the top,
    baselines 24/900, 19/700, 13/italic — except that the picture is reserved
    **square** (a profile picture is square, and the carriers state only a width, so
    a 1.4 reservation left a slab of white under it) and at least `CHEER_MIN_PIC_PX`
    tall (see the render threshold above). The bits figure is **free text, not a
    number** — `-100000` and `∞` are both jokes people want, and coercing it to a
    number kills them.
    **Layout order is load-bearing:** reserve the TEXT's room first, then give the
    picture what is left. Sizing the picture first and clamping the text into the
    remainder drags the stack up into the picture's rectangle — and the picture is
    painted last, so it erases the line. Measured: the default pull with the width
    slider at max rendered the bits line with zero ink while every test passed, because
    the tests only asserted each piece was inside the box. They now assert the two are
    disjoint. The lift is also capped (`CHEER_MAX_LIFT_PX`) so an over-pulled block
    follows the message down instead of sailing off the top of the roll — at pullPt 380+
    it used to print a blank white slab.
    **Measured cost:** three lines alone are ~357 chars with the cheer wrapper; *with*
    a picture on a minted link it is **491 of 500 — one cheer**. Getting there took
    three things and the margin is thin enough to lose by accident, so they are tested:
    the link went 67 chars -> 45 -> 39 (see "Short links" below), and the body-width clamp is
    dropped inside the fixed `foreignObject` where it is a provable no-op (`framed`, see
    `clampAttr`). A *pasted* CDN link is longer than anything we mint and still does not
    fit — the card says so, and the packer splits rather than truncating.
    On scope: the tape is not a record of anything. Twitch's bits ledger is server-side
    and authoritative, nobody reconciles it against thermal paper, and the printer is a
    gag the streamer runs for laughs — the cheer that triggers a print carries the real
    sender's name in chat, in front of the whole room. (An earlier version of this file
    argued the opposite and refused a sender template on "forged record" grounds. That
    was wrong: it treated *looks like a receipt* as *functions as a financial record*.)
13. `buildEmbedProbe(box)` — the diagnostic payload set for the **Find what still
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
**Write the test pages and their output into `.render/`** (gitignored) — loose
`t*.html` / `*.pdf` / `*-1.png` in the repo root have already been swept into a
commit by a `git add -A` once. Stage explicit paths, not `-A`.

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
- **`<foreignObject>` swallows every SVG sibling that follows it.** It's an HTML
  integration point; the parser switches to HTML inside and never cleanly returns to
  SVG context, so `<text>` emitted *after* one is parsed as HTML and silently never
  drawn — the markup looks perfect and the print comes out blank. Measured. Anything
  riding in a `foreignObject` must be emitted **last** (see `buildTakeover`).
- A **takeover** — an opaque `<rect>` in an SVG lifted with `margin-top:-Npt` —
  reliably paints out the bot's own header, and a message after it still flows
  below. The pull is per-rig: the header's height depends on the streamer's avatar.
- The usable body width is `paperWidth - 8`mm minus the 1em margins — **240 px** on
  an 80 mm roll, against `PAPER_PX = 263`. Field-confirmed: a real print came out
  too wide. Real-image carriers now carry `max-width:100%` so they clamp to whatever
  the body really is; `PAPER_PX` itself is left alone because the text modes are
  field-verified at it. Prefer a clamp over another hardcoded number here.
- **A picture drawn under ~120 CSS px TALL does not render inside a lifted takeover.**
  No image XObject in the PDF at all — the tape prints blank where the picture should
  be. It is the drawn HEIGHT, not width or area: a 60x240 draw renders, a 200x67 draw
  does not, at near-identical areas; the threshold sits between 110 and 120. All three
  live carriers behave identically, so it is not a carrier quirk, and it only happens
  under the negative top margin (the same markup unlifted renders at 80). This decides
  the fake cheer's default: a profile picture is square, so its drawn height IS its
  width, and the old 80px default printed nothing. `CHEER_MIN_PIC_PX` = 120 is the
  floor, both picture-width sliders start there, and a picture that cannot clear it is
  dropped rather than sent as ~90 characters buying blank paper. **This is easy to
  "disprove" by accident:** test with a portrait source and it draws tall enough to
  clear the threshold no matter how narrow you set it. Test with a SQUARE source.
- **The uploaded-image URL is payload, and its length is a product constraint.**
  `/upload` mints `https://i.uwutoowo.com/<12 hex>.png` — **39 chars**, down from
  45 (`receipt.uwutoowo.com/<12 hex>.png`) and 67 before that (`/i/<32 hex>.png`).
  12 hex = 48 bits against a 15-minute TTL, which is ample; 128 bits was 20 characters
  of margin that never did anything. The root path is matched by SHAPE (`imageKeyFor`),
  so it cannot shadow a static asset — that is what `test/imgpath.test.mjs` guards.
  Both older shapes still resolve. The short host comes from `vars.RW_IMG_HOST`, which
  is now SET and verified live; it falls back to the request origin when unset, so
  previews and `wrangler dev` keep working. If that host ever stops answering, clear
  the var first — every picture prints blank otherwise. Do NOT drop the `.png` suffix to save 4 more: an
  unknown extension on a failed subresource is a fatal, whole-job error (above).
- **The width clamp may be dropped inside a fixed `<foreignObject>`, and nowhere else.**
  `max-width:100%` on a top-level carrier is field-verified — without it real pictures
  printed off the right edge, because the body is ~240px and not `PAPER_PX`'s 263.
  Inside a `foreignObject` the containing block IS the frame and the tag already states
  that width, so it is a no-op worth 23 chars. `buildImageEmbed({framed:true})` is the
  only way to drop it, `buildTakeover` is the only caller, and a test asserts every
  carrier still clamps unframed. Don't "simplify" that flag away.
- **Field record of the blocked-terms list** (each block killed every picture until
  the carrier moved): `<object` → `<image` (SVG form) → `<img`. Still live as of
  Aug 2026: `<embed` (default, printed perfectly), `<input` (needs no file
  extension), `<iframe` (prints, but crops anything bigger than the box).
- `<embed>` / `<object>` fail **silently** on an extensionless URL — the message
  sends and the tape prints with a blank where the picture should be. `needsExt` on
  those entries drives a UI warning; don't make one of them the default without it.
- **`<g text-decoration>` inherits to child `<text>` on WebKit 534.34.** Measured —
  a `text-decoration` set on the shared `<g>` that `buildBigTextSvg` wraps a
  multi-line block in reaches every `<text>` inside it without repeating the
  attribute per line. This is what lets underline/strike/font-family ride one
  shared `<g>` instead of being duplicated onto each `<text>`; sharing it is a
  deliberate payload-budget decision (see the "shared `<g>`" test in
  `test/render.test.mjs`), not an incidental simplification.
- **Combined `text-decoration="underline line-through"` renders**, on both the
  `<text>` and `<g>` forms — no need to pick one or the other, or to emit two
  separate decorated wrappers.
- **`text-decoration:` renders on the rotated HTML `<span>`** (the sideways
  giant-text path) — same property, plain CSS declaration there rather than an
  SVG presentation attribute, riding next to the escaped `\66ont:` shorthand.
  It is a **new literal `"text-decoration"` token in the payload** and, per the
  arms-race history above (the blocked-terms list), the next plausible
  automod-filter target — if it ever gets blocked, look here first.
- **FIELD-CONFIRMED 2026-08-10: none of 0.4.0's new tokens trip the blocked-terms
  list.** robp pasted four probe messages into the channel's chat with Cheer-ready
  OFF — a non-cheer message never reaches the printer but still passes the filter,
  so this costs nothing and is the cheapest test available. All four went through.
  What that clears: `font-family="cursive"`, the combined
  `text-decoration="underline line-through"` in SVG attribute position, and the
  literal `text-decoration:` CSS declaration on the rotated span. Two of the four
  were unformatted controls of the same shape, so a block would have been
  attributable. Blocked terms apply whether or not the stream is live, which is why
  an offline paste is a valid test.
  **What it does NOT clear:** a filter printer-bot itself applies at render time,
  which only a real cheer would exercise. And the list is a moving target — this is
  a snapshot, not a guarantee. Re-probe with the same four messages after any
  suspected block; it is free.
- **All nine offered fonts are legible and distinct at 24px and 58px, at the
  printer's real 203dpi/1-bit dithering.** Checked on the real engine, not just
  in-browser.
- **Bold (700) and Black (900) are pixel-identical on Arial.** The markup differs
  (`font-weight="700"` vs `"900"`) but the rasters are **MD5-identical on the real
  engine**, at both 24px and 58px. Chromium agrees, but that half was checked by
  ink count (`4637 === 4637`), not by hashing the pixels — stated precisely because
  overclaiming the evidence here is how this file went wrong before. Arial has no
  true 900 face, so the renderer
  silently clamps 900 down to whatever its heaviest real weight is. `Arial Black`
  is a **separate font family**, not a weight of Arial, and is the actual escape
  hatch for a visibly heavier line. The app does not (and, without visibility into
  the streamer's font stack, cannot honestly) warn about this in the UI — see the
  weight-convention note below for what the code *does* encode.

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
- **Grid rows ship inside `white-space:pre`, and that is what makes spaces safe.**
  The old rule here was "the off cell is never a space, because HTML collapsing
  would shear the grid". That got solved a better way: every glyph body is wrapped
  in `<span style="white-space:pre;…monospace">`, so runs of spaces survive intact.
  The two ASCII tiers — now the glyph-art default — use a literal space as their
  lightest cell and print correctly. Keep the wrapper; that is the load-bearing
  part, not the choice of glyph.
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
- **The cheer token LEADS the payload.** This file claimed the opposite for a long
  time; the code is right. `packStackBodies` emits `Cheer<bits> <nonce> <html>`, for
  two reasons given in its own comment: the token and nonce survive any
  trailing-strip a bot or filter does to a long HTML blob, and a leading `Cheer…`
  guarantees the message doesn't start with `<`, which is the hard rule just above.
  When not cheering, `LEAD_GUARD` (a non-breaking space) leads instead. Don't
  "restore" a trailing token.
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
  pictures). The Takeover and the fake cheer are the standing exception: painting
  over the bot's header is inherently a markup trick with no glyph equivalent, so
  they ship markup-only by necessity. Everything that *can* have a fallback still
  should.
- **Carrier tags: the tag for a real picture is DATA, not a hardcode.** The
  blocked-terms list has already eaten `<object` and then `<image`, each block
  killing every picture the tool makes. `EMBEDS` in the pure core lists the
  interchangeable surfaces (`embed` default, `input type=image`, `iframe`,
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
> with a native 15-minute `expirationTtl`, 5 MB cap, image/* only), the image-serving
> routes (`/<hex>.png` at the root, and legacy `/i/<hex>` — matched by SHAPE via
> `imageKeyFor`), and `GET /px?u=<url>` (an image proxy — see below). `/upload` is
> called from the Image block's uploader **and** from the Takeover card's, in both
> styles; the returned URL feeds a real-picture payload built through the `EMBEDS`
> carrier table — `<embed>` by default, not `<object>`, which the blocked-terms list
> ate long ago.
>
> `/px` began as a Thermal-preview-only path and is no longer that: it also backs
> glyph-art decoding of a pasted URL and the debounced image-adjust bake, so it can
> fire from typing and from dragging a slider. The underlying reason it exists:
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
> These are the only sanctioned network calls / server-side pieces. **The honest
> privacy line:** Big Text is fully local, and a picture picked from disk for
> glyph-art is decoded locally. Everything else touches the Worker — pasting an image
> URL sends it through `/px`, adjusting brightness/contrast re-uploads a baked PNG,
> and the uploaders POST the file. User-facing docs must say that plainly rather than
> claim nothing leaves the device. The constraints below hold for everything *except*
> those flows.

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
- **Network calls go only to our own Worker, and there are no new ones.** Six
  `fetch` call sites in `public/index.html`, all same-origin: three `/px`
  (glyph-art decoding a pasted URL, Thermal preview inlining, the debounced
  image-adjust bake) and three `/upload`. Two fire without a dedicated click —
  **typing an image URL** and **dragging an adjustment slider**. Don't add a
  seventh, don't call a third party, and don't describe the app as making no
  network calls.
- **Storage:** `localStorage` holds exactly three keys — the control-panel
  settings (`rw_controls_v1`), the nonce sequence counter (`rw_nonce_seq`), and
  the block composer's stack (`rw_blocks_v1`). All wrapped in `try/catch` so
  sandboxed previews that block storage still render and run. Don't add a fourth
  without an explicit request.
- **Vanilla JS**, IIFE-wrapped, `"use strict"`, ES5-ish style (`var`, function
  expressions) — match the surrounding code's idiom when editing.
- **Privacy — state it accurately.** Big Text and a locally-picked glyph-art
  picture never leave the device, and there are no analytics, accounts or third
  parties. Uploading a file, pasting an image URL, or dragging an adjustment
  slider *does* send data to our Worker. Preserve the no-third-parties property;
  don't let this drift back to "nothing is ever sent".

## Conventions & gotchas for editors

- Keep style/markup/script **inline in the one file** — do not split into
  separate `.css`/`.js` assets.
- Known v1 limitations, accepted as-is unless a task says otherwise (see
  this list is the record — there is no `.superpowers/` directory in this repo): `buildCensus`
  hardcodes its sample glyphs rather than deriving them from `TIERS`; no keystroke
  debounce (each keystroke still burns a control-settings `localStorage` write via
  `saveControls()`, though the nonce itself only advances on Copy); `TEXT_ROWS`/
  scale-to-fit height cap means very long big-text input can cramp at narrow
  column widths; `CHAR_ASPECT = 0.5` is a fixed magic constant for glyph
  aspect ratio, not measured per-font.
- Licensed under **MIT** (see `LICENSE`).
- **Two incompatible weight/italic conventions coexist, by shape, not by name.**
  `lineFmt(stored, defWeight, defItalic)` (takeover lines: `f1`/`f2`/`f3`) **materialises**
  its defaults — an untouched slot resolves to a concrete 900/700/400. Big Text
  (`block.fmt`) requires the opposite: an **absent** weight must stay absent, because
  `bigWeightFor` reads absent as the 800 sideways baseline, not 400. They only stay
  safely apart today because the two block shapes never mix (`f1/f2/f3` vs a single
  `fmt`) — `lineFmt` is the obviously-named helper, so anyone wiring up a new text
  surface will reach for it first. **Never hand `lineFmt`'s output to the Big Text
  path** — it would silently drop every untouched sideways block from 800 to 400.

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
