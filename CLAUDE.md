# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this project is

**Receipt Wrecker** (repo: `receipt-wrecker`, deployed Worker: `receipt-wrecker`,
target domain: `receipt.uwutoowo.com`) is a single-file, dependency-free web tool
that turns big text or an uploaded image into a paste-ready, newline-free single
line of monospace "block" glyphs: a compact character-art payload for any
character-limited text box.

Its headline use is making oversized text or a recognizable picture print on a
Twitch streamer's thermal receipt printer via nutty.gg's printer-bot
(Streamer.bot), by pasting the output into chat as a `Cheer100`. The tool itself
is framed neutrally, like its siblings `cheer-splitter-9k` (chunking) and
`transliterate-me` (phonetic transliteration). The cheer use is one application
of a general glyph-art generator.

**⚠⚠⚠ 2026-10-01: `class` survives, and printer-bot inlines nutty's whole `global.css`.
READ THIS FIRST. It amends both banners below; they are kept as written, with
amendments marked in place, because this file records what was believed and why it
changed.** The 2026-09-15 sanitizer strips the `style` attribute, but it keeps `class`.
And printer-bot does not print the bare message. `GetRenderedHTML` builds the document
wkhtmltopdf prints by copying the text of **every stylesheet linked from printer-bot's
settings page** into one `<style>`: first nutty's shared UI stylesheet, `global.css`,
which every nutty widget uses, then printer-bot's own `contents/style.css`. So every
class rule in those two sheets is live on the receipt, and a class in the chat message
picks it up. One of them belongs to a settings-page heading: `.title` is
`font-weight:900; font-size:1.2em; text-transform:uppercase`. `em` is relative to the
*parent*, so nesting multiplies: N nested `<b class=title>` print at
**16px × 1.2^N** (14 levels ≈ 205px type, capitals ≈ 3.8 cm; 15 ≈ 247px).

That is **Giant type**, the default Text render as of 0.10.0. Do not confuse it with
"Giant sideways", the dead SVG/rotate Type render. Every markup token is sent literally
and is on the sanitizer's own allow-list (tag `b`, and `span` for the tuck; attribute
`class`): nothing in the markup is disguised from automod, from the sanitizer or from the
bits ledger. (That is a claim about the tags, not the user's words: Stack splits a word one
letter per line, so a word filter never sees it. See the note under THE RULE.) The same
mechanism gives the **cheer-gem tuck**: `.switch` (a 3em × 1.5em `overflow:hidden` box)
plus `.dialog-nav-button` (`position:fixed`, top right) pin the cheermote printer-bot
draws into a clipped box in the page's top-right corner. See arch items 16-19.

**Evidence levels. Keep them apart; this file has been burned before by writing one
sample up as a mechanism.**

- **FIELD (one sample).** One real cheer carrying
  `<span class="switch dialog-nav-button"> Cheer100 </span>`, then 15 × `<b class=title>`,
  then `P</br>E</br>N</br>I</br>S`, passed the channel's automod and printed giant
  stacked letters on the real rig (owner's report, 2026-10-01). That clears
  `<b class=title>`, the quoted two-class `<span>` and `</br>` against that channel's terms
  list on that day. Nothing more was judged on paper, and in particular whether the
  corner box clipped the gem was not.
- **BENCH**: real wkhtmltopdf 0.12.6.1 (patched Qt) with Segoe UI metrics, fed the
  document `tools/printerbot.mjs` builds with printer-bot's own sanitizer. It covers the
  sizes, line pitch, the 23px lead/gap line, the small stack word gap (0.11.0), the tuck's
  clipping and the line it saves, the shrink wrappers, and emote sizing. It does NOT cover
  the one thing that caused the 0.11.0 field cut-off — the printer driver's real paper
  length and SumatraPDF's `noscale` clip — because the bench renders wkhtmltopdf's 500mm
  page; that is the Receipt length control's job. See "Settled for Giant type" below.
- **NEVER SENT**: `class=setting-description` / `class=setting-attribute` (the ×0.9 /
  ×0.8 shrink wrappers, which Auto emits whenever such a step is the best fit, so they
  are far from exotic), the padded emote form, and the app's EXACT tucked lead: a leading
  nbsp and the two-digit nonce inside the span. The field cheer had the span with no
  nonce, directly followed by `<b class=title>` with no `<br>` between, so that adjacency
  itself has printed; only the nbsp and the nonce have not. These are the first things to
  put in a free probe (see the probe list under "Measuring").

**It is fragile by construction.** This is a borrowed style on someone else's page.
nutty can rename `.title`, retune it, scope `global.css` away from the receipt, or stop
inlining linked stylesheets, any day, and the failure is **quiet**: the text prints at
normal size and the cheer still spends. The app's defences: the class names and
declarations are data (`PB_CLASSES`); the card is date-stamped ("Confirmed printing big
on 1 Oct 2026"); a multi-part giant run names the first part that carries giant type
and says to look at the printer after it (part 1 when it has some); the **Print
size ruler** proves the trick on the rig for one cheer; Hanzi tiling stays one select
away as the markup-free backup; and `npm run printerbot -- --check` diffs `PB_CLASSES`
against the live CSS before a release (a release-checklist canary, not CI).

How stable is it? printer-bot's pages are served by GitHub Pages from the public repo
[`github.com/nuttylmao/nutty.gg`](https://github.com/nuttylmao/nutty.gg): its `CNAME`
is `widgets.nutty.gg`, so its `main` branch **is** the live site, and its history is
readable. **Verified 2026-10-02:** the five files `tools/printerbot.mjs` fetches
(settings page, `script.js`, `style.css`, `global.css`, `helpers.js`), as served live
that day, were byte-identical to `main` @ be2972f (2026-09-13). As of that date:
`.title`'s `font-size: 1.2em` has stood since af65fcf (2025-09-06; it was 1.5em in 7e20a30
earlier that day, and c5e9890, 2025-09-13, only re-indented the rule, so it is what a blame
shows, not the origin); `GetRenderedHTML`'s inline-every-stylesheet step dates from
20a0e59 (2025-07-27, under `receipt-printer/`, before the 0c7b4fc rename to printer-bot);
`global.css` has had **eight commits
ever**, the last (9bf1efb) on 2026-04-28. (The sanitizer arrived upstream in 121c351,
dated 2026-08-27; this repo first noticed it on 2026-09-15.) So the trick rests on code
that has been stable for over a year, but **it is not a contract**. Two things follow:

- **Pin what you measure.** `tools/printerbot.mjs --ref <sha|branch>` reads the same
  files from the repo at one commit instead of the live site, resolves a branch to its
  sha and records it in the provenance, so a bench number can be re-run on exactly the
  CSS it was taken on. It replays commits from 121c351 (2026-08-27) onward; EARLIER ONES
  ARE REFUSED (exit 2), because the pipeline runs printer-bot's own `SanitizeHTML`, which
  they do not have (before it, printer-bot inserted raw innerHTML, a path the tool does not
  implement). A `--ref` run never rewrites the `printed.css` cache `tools/rig.py` reads.
- **How to get warned, without reading code.** Paste
  <https://github.com/nuttylmao/nutty.gg/commits/main/.common/styles/global.css.atom>
  into any feed reader (Feedly, Inoreader, Thunderbird and the like). It lists every
  change to that one stylesheet and nothing else, eight entries in all so far, so a new
  entry is news. When one appears, run `npm run printerbot -- --check`: its last line
  says "check passed" or "check FAILED" (exit status 0 or 1), i.e. whether every
  `PB_CLASSES` rule is still in the live CSS, still survives the sanitizer, and still
  computes the sizes the app assumes once the whole printed cascade applies (an override
  of any selector or `!important` fails it). Exit 2 means it could not check (a file only
  available from the cache, say), and the last line says why. Then send the Print size
  ruler before the next real run.

That repo has **no licence file, so all rights are reserved**: never vendor or copy
nutty's code or CSS into this repo. Fetch it at bench time (`tools/printerbot.mjs`
does), and quote at most the few declarations we rely on, as facts about the target.

**THE RULE, with its stop conditions.** Borrowing an allow-listed class is not
obfuscation. Every token is literal, both gates see exactly what they act on, Twitch
still charges and shows the cheer in chat, and the header still prints the bits and the
sender. It stays that way only under three conditions:

- **(a) Literal tokens only.** Never case, quote, entity, padding or zero-width tricks to
  get any token past either gate.
- **(b) If a channel blocks the giant form** (say `<b class` or `class=title` lands on
  its terms list), that is the mods saying no to giant text. Do **not** cycle tag
  (`<strong>`, `<i>`, `<em>`), quote (`class="title"`) or case (`CLASS=title`) variants
  of the same feature, and the UI must never suggest one. Fall back to Hanzi.
- **(c) If nutty removes `global.css` from `GetRenderedHTML`, or scopes it away from the
  receipt, on purpose,** that is the bot author saying no. Fall back to Hanzi. Only an
  *incidental* rename (a UI redesign moved `.title` to another name) justifies remapping
  a `PB_CLASSES` row, and only after a free probe and a ruler print show the new name
  prints.

**What THE RULE does not cover: the words.** "Literal" and "nothing is disguised" are
claims about the MARKUP. Stack, which Auto picks for short words by default, sends each
word one letter per `<br>` (`H<br>E<br>L<br>L<br>O`), so a channel's blocked-terms list
never sees the word as typed, exactly as with Hanzi tiling (whose code comment already
calls it filter-proof); the one field cheer was this shape. That is a side effect of
fitting the paper's width, not a feature: never describe or advertise it as a way past a
filter. And a passing free probe tests the markup tokens, not whether the words would
pass. If chat holds or blocks a message for its WORDS, that is the channel's moderation
working: do not respace, split, re-layout or otherwise rework the words to get them
through, do not build anything that does, and the app must never suggest it.

**⚠ 2026-09-15 — printer-bot added an HTML sanitizer, and it changes everything
below. READ THIS FIRST.** For a long time printer-bot rendered the chat message
as raw, unsanitised HTML, and the whole app was built on that: big type, sideways
type, real pictures, takeovers and the fake cheer are all markup. That premise is
now dead. printer-bot runs the message through an allow-list sanitizer (a
`DOMParser` walk) before the engine ever sees it, and the allow-list is tiny:

- **Tags kept:** `img`, `span`, `b`, `i`, `br`, `em`, `strong`. Everything else is
  *unwrapped* (the tag is deleted, its text kept).
- **Attributes kept:** `src` and `class` — and nothing else, on any element. `style`,
  `width`, `height`, SVG presentation attributes: all stripped.
- **`<img>`** is deleted outright unless its `class` contains `emote` or `bits`.

What that does to the feature list: **SVG is gone**, so Big Text ("Type", every
orientation) and the whole Takeover / fake-cheer trick (an opaque `<svg><rect>`
lifted with a negative margin) no longer render. **The rotate `<div>`/`<span>`
styling is stripped**, so "Giant sideways" degrades to plain text. **Every picture
carrier (`<embed>`/`<input>`/`<iframe>`/`<object>`) is stripped**; the only picture
the sanitizer keeps is `<img class="emote">` or `<img class="bits">`, and only its
`src`/`class` survive (so sizing has to come from the uploaded PNG's pixels, not
markup). **ASCII glyph-art shears**, because it depended on a `white-space:pre`
monospace `<span>` (that styling is in `style`, now stripped) — its spaces collapse.
*(Checked 2026-10-01: the class route does not rescue any of these. No rule in
`global.css` or `contents/style.css` that an allow-listed tag plus a class can reach gives
`white-space:pre`, a monospace face, rotation, `display:none` or white text (the
`display:none` and white-text rules there target `html`/`body`, form controls, ids or
descendants of ids), and none targets `b`, `i`, `span`, `img` or `br` by tag.)*

So the durable paths, and the app's new backbone, are the ones that were always
markup-free: **Hanzi tiling for text and the CJK glyph tier for pictures** (pure
text, or `<br>`-separated rows of uniform-width Han glyphs — no `style` needed).
Everything in the sections below that assumes raw-HTML rendering is now historical;
it is kept (not deleted) as the record of how the app got here and in case the
sanitizer is ever rolled back.
*(Amended 2026-10-01: "markup-free" turned out to be too strong a criterion. The
sanitizer strips `style`, not `class`, and `class` carries `global.css` onto the paper
(banner above). For **text** the backbone is now Giant type, which is markup but only
allow-listed tags plus a class. Hanzi tiling is its markup-free backup, one select away.
For **pictures** CJK glyph-art is still the backbone.)*

**⚠⚠ AND THEN THE PICTURE DIED COMPLETELY — FIELD-CONFIRMED 2026-09-15.** The
`<img class="emote">` carrier shipped as a probe-me candidate. The probe came back
**blocked**. There are two independent gates and their intersection is empty:

- The **sanitizer** keeps exactly one image-capable tag, `<img>`, and only with an
  `emote`/`bits` class. Of the seven tags it allows, only `<img>` can load an image
  at all — `src` on a `<span>`/`<b>`/`<i>`/`<em>`/`<strong>`/`<br>` does nothing.
- **Automod still blocks the literal `<img`.** Re-probed free (non-cheer, so it
  never reaches the printer but still passes the terms filter): the `emote` and
  `bits` forms were both eaten, while a control carrying the same link with no tag
  went through. So the tag is what is blocked, not the link or the host.

**No carrier can put an arbitrary picture on the tape.** *(This said "a real picture"
until 2026-10-01. printer-bot's own emote pass still swaps a Twitch emote the sender may
use for `<img class="emote">`, and `.emote{height:1em}` makes that picture scale with
whatever font-size it sits in, so Giant type's **Emote layout** can print one ~185px
square (a lone emote: 14 levels inside the ×0.9 wrapper, its pad space counted). That is
Twitch's picture, picked from Twitch's list by printer-bot. It is not one of ours, no
carrier is involved, and the padded form it needs has never been sent.)*
`anyCarrierLive()` returns false,
every `EMBEDS` entry is `blocked: true`, and `field` records which gate killed it
(`"blocked"` = automod ate the token, `"stripped"` = the sanitizer removes the tag).
The img-class pair still leads the table because it is sanitizer-legal and only
chat-blocked — it is the pair to re-probe first if the terms list is ever pruned.
The Image block warns rather than offering a pick that silently spends bits on blank
paper. **Glyph-art is unaffected and is the whole arbitrary-picture story now.**
*(Amended 2026-10-01: "arbitrary" added. The emote layout above is the one exception,
and it only prints emotes Twitch itself recognises.)*

**Do NOT "fix" this by obfuscating the tag** (case-mangling `<IMG`, padding,
entities, zero-width splitting). The terms list has now eaten `<object`, then
`<image`, then `<img` — three rounds of a channel's mods blocking every picture
surface this tool has offered — and printer-bot independently added a sanitizer that
admits only Twitch's *own* emotes. Two separate parties have said no to arbitrary
images. Route around it with glyph-art, which is plain text and needs no evasion;
do not route around the moderators. The carrier table's swap-to-another-tag drill
below is for finding a surface that is *allowed*, never for defeating a filter.

**The v1 spec's original warning turned out right.** It cut markup (see
`docs/superpowers/specs/`) precisely because it "depended on undocumented
sanitization." Field evidence overturned that for a couple of years; the sanitizer
has now vindicated it. Do not build a new feature on a tag outside the allow-list
above without a fresh field probe proving it survives.
*(Giant type, 0.10.0, follows this: `b` and `span` are on the allow-list, and a real
cheer carrying the exact form printed before the feature was built. It is still
markup, so it still keeps a markup-free path behind it.)*

## The one file that matters

**[`public/index.html`](public/index.html) is the entire application.** It is a
self-contained HTML page with inline `<style>` and a single inline `<script>`
(vanilla JS, IIFE, `"use strict"`). **This is the only file to edit when changing
app behavior.** There is no bundler and no package manager for the app itself.

`src/worker.js` is the other piece of shipped code, a small Cloudflare Worker
that serves the static site plus `/upload`, the image-serving routes and `/px`.
It is `main` in `wrangler.jsonc`, so it is the deployed entrypoint, and
`test/proxy.test.mjs` and `test/imgpath.test.mjs` import it directly.

Everything else in the repo is documentation, tests, or deploy config.

## Repository layout

| Path | Role |
|---|---|
| `public/` | The deployed site. Cloudflare serves *only* this directory, so docs/tests stay out of production. |
| `public/index.html` | The app. Edit this. |
| `src/worker.js` | The Cloudflare Worker: serves `public/` as assets, plus `POST /upload`, the image-serving routes (`/<hex>.png` and legacy `/i/<hex>`), and the `/px` image proxy. `main` in `wrangler.jsonc`. |
| `wrangler.jsonc` | Workers config: `main`, the two custom domains in `routes`, the `RW_IMG_HOST` var, and the `RW_IMG` KV binding. |
| `package.json` | Dev-only metadata: `npm test` (Node's `node:test`), `npm run test:browser`, the Wrangler dev/deploy scripts, and the bench scripts (`render` = `tools/rig.py`, `payload`, `printerbot`). No runtime deps. |
| `test/` | Node `node:test` suite. Extracts the inline script from `public/index.html` and unit-tests the pure glyph engine. `test/rig.test.mjs` is the one tool test: it runs `tools/rig.py`'s case-name guard (python3, no engine needed; skipped without python3). |
| `test-browser/` | Playwright smoke tests for the browser glue the null-DOM harness cannot reach. NOT part of `npm test`; run `npm run test:browser` (needs `npx playwright install chromium` once). |
| `tools/` | The print-engine bench. `rig.py` renders a payload the way printer-bot really does and measures the ink; `payload.mjs` builds that payload from the app's own core; `printerbot.mjs` (0.10.0) builds the exact document printer-bot prints, from nutty's live files and printer-bot's own sanitizer, and `--check`s `PB_CLASSES` against the live CSS; `calibrate.py` builds the dither test print. This is where "does it print?" gets answered; see "Measuring against the real engine". Nothing of nutty's, and no font, is ever committed here: `printerbot.mjs` fetches and caches under `.render/`. |
| `.github/workflows/ci.yml` | CI: install, `npm test`, the browser suite, then `wrangler deploy --dry-run` on push/PR to `main`. |
| `.github/` | Community-health files (CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates, dependabot). |
| `docs/CHANGELOG.md` | Release notes / change history. |
| `docs/superpowers/` | Design spec, plan, and SDD task briefs this build was implemented from. Historical reference, not shipped. |
| `README.md` | Human-facing overview, feature spec, deploy notes. |
| `CLAUDE.md` | This file: assistant-facing guidance. |
| `.gitignore` | Ignores wrangler/env artifacts (`.wrangler`, `.dev.vars*`, `.env*`), `node_modules/`, `package-lock.json`, `.DS_Store`, `.claude/`, `.playwright-mcp/`, `__pycache__/`, and **`.render/`**, where every bench artifact goes, including `printerbot.mjs`'s cache of nutty's files and `rig.py --fonts`' fontconfig. |

## How to run / develop

There is no build step. Either:

- Open `public/index.html` directly in a browser, or
- Use the Cloudflare CLI from the repo root:

```sh
npx wrangler dev      # local preview of public/ as static assets
npx wrangler deploy   # publish to production (normally CI-verified via dry-run; see below)
```

To make a change: edit `public/index.html`, reload the browser. That's the whole
loop.

## Testing, and why the sandbox is a null DOM

```sh
npm test           # Node's built-in node:test runner; zero deps to install
npm run test:browser   # Playwright smoke tests (needs: npx playwright install chromium)
```

Two suites, and the split is deliberate. `npm test` stays zero-install. That is a
documented property of this repo and worth keeping, so the browser suite is NOT in the
default matcher and lives in `test-browser/` rather than `test/`. CI runs both.

The suite (`test/_harness.mjs` + `test/*.test.mjs`) reads `public/index.html`,
extracts the single inline `<script>` with a regex, and runs it in a `node:vm`
context against a minimal null-DOM proxy (`document.getElementById`,
`createElement`, etc. all return an inert proxy object; `addEventListener` is a
no-op). It then unit-tests the exported pure core.

That null-DOM sandbox exists because of the app's internal pure-core /
browser-glue split:

- The pure core (tier tables, luminance quantization, dithering, Braille dot
  packing, render/budget helpers, cheer packaging, the Census builder, and since
  0.10.0 the Giant type builder, its borrowed-class table and the lead/tuck builder)
  is plain functions with no DOM dependency at all: inputs and outputs are
  arrays/strings. These are fully unit-testable. (Some of it is *defined* inside the
  DOM guard, after `PAPER_PX`/`LEAD_GUARD`, as `var name = function` expressions; it is
  still pure, and still exported. See arch item 17 for why it lives there.)
- The browser glue (canvas rasterization of text/images, DOM wiring, event
  handlers, clipboard, `localStorage`) is guarded by
  `if (typeof document !== "undefined" && document.getElementById)` and only ever
  *runs* once `document.addEventListener("DOMContentLoaded", init)` fires. The
  null-DOM sandbox never triggers that, since there's no real event loop driving
  it. The guard's function *declarations* still parse and hoist fine against the
  null-DOM proxy (they're never *called*), which is what lets the whole script run
  in `node:vm` without a real DOM, canvas, or `window` at all.

An inert `module.exports` hook at the end of the IIFE (guarded by
`typeof module !== "undefined"`, false in browsers, true under Node) hands the
test harness the pure-core functions. **118 keys, regenerated at the 0.11.0 cut: 117
from the app's `module.exports`, plus `__fontLog`, which `test/_harness.mjs` adds
itself.** (The 0.6.0 list said 72 and was already one short by 0.9.1: `anyCarrierLive`
was missing. 0.11.0 replaced the `HEIGHT_BUDGET` constant with the length helpers below.)
`TIERS`, `getTier`, `sampleLuma`, `quantizeTone`, `quantizeBinary`,
`ditherFloydSteinberg`, `lumaToDots`, `packBraille`, `render`,
`payloadLength`, `withinBudget`, `MAX_CHARS`, `makeNonce`, `packageCheer`,
`buildCensus`, `CHEER_TOKEN`, `packStackBodies`, and, new in 0.11.0 (the
length-derived per-receipt height budget), `heightBudget`, `clampReceiptMm`,
`giantHeight`, `DEFAULT_HEIGHT_BUDGET`, `HEIGHT_RESERVE_PX`, `LEN_PX_PER_MM`,
`RECEIPT_MM_DEFAULT`, `RECEIPT_MM_MIN`, `RECEIPT_MM_MAX`,
`escapeHtml`, `escapeAttr`, `urlHasImageExt`, `EMBEDS`, `EMBED_DEFAULT`,
`getEmbed`, `anyCarrierLive`, `FONTS`, `getFont`, `fmtAttrs`, `buildImageEmbed`,
`buildEmbedProbe`, `buildTakeover`, `takeoverBox`, `TAKEOVER_PULL_PT`,
`buildStackCover`, `PRESET_V`, `cleanBlocks`, `isMintedImageUrl`,
`presetImageUrls`, `makePreset`, `serializePresets`, `parsePresets`,
`upsertPreset`, `lineFmt`, `takeoverItems`, `takeoverPlace`, `takeoverWants`,
`takeoverSeed`, `TAKEOVER_BOTTOM_PX`, `CHEER_GAP_PX`, `CHEER_TOP_PX`,
`CHEER_MAX_LIFT_PX`, `buildFakeCheer`, `CHEER_AVATAR_W`, `takeoverAmountText`,
`takeoverItemsForBlock`, `takeoverPinToInk`, `migrateTakeoverItems`,
`migrateTakeoverPull`, `TAKEOVER_ITEMS_V`, `TAKEOVER_PULL_V`,
`CHEER_MIN_PIC_PX`, `takeoverReport`, `bigFontFor`, `BIG_FONT`,
`buildBigTextSvg`, `bigWeightFor`, `bigItalicFor`, `rotateBodies`,
`bigFitBasis`, `PAPER_PX`, `BIG_FIT_PX`, `BIG_WEIGHT`, and, new in 0.10.0:
`LEAD_GUARD`, `PX_PER_MM`, `PB_CLASSES`, `pbClass`, `classAttr`, `pbPreviewCss`,
`GIANT_BASE_PX`, `GIANT_RATIO`, `GIANT_MAX_LEVELS`, `GIANT_MIN_PX`, `GIANT_GAP_PX`,
`GIANT_CAP_EM`, `GIANT_TUCK_PX`, `GIANT_W`, `GIANT_W_DEFAULT`, `GIANT_LAYOUTS`,
`GIANT_RULER_LEVELS`, `giantLineH`, `giantSteps`, `giantClean`, `giantLines`,
`giantLineEm`, `giantOpts`, `blockRender`, `buildLead`, `leadLength`, `TUCK_OPEN`,
`TUCK_CLOSE`, `bandReserve`, `giantCapCm`, `giantEmoteCm`, `GIANT_MM_PER_PX`,
`giantFit`, `giantPlan`, `buildGiantBodies`, `buildGiantRuler`, `giantReport`; then the
harness's `__fontLog`.
(That list is easy to let rot, so regenerate it
with `node -e 'import("./test/_harness.mjs").then(({loadCore})=>console.log(Object.keys(loadCore())))'`
rather than trusting it.) The canvas/DOM functions (`rasterizeImage`,
`computeGrid`, the body builders and the UI wiring in `init()`) are **not**
exported.

They are no longer only hand-checked, and that mattered. `test-browser/` drives the
real page in headless Chromium against a built-in static server, and every case in it is
a bug that actually shipped for want of exactly this: add/remove/reorder never calling
`saveBlocks()` so a rebuilt stack vanished on reload; the expired-upload flag that set
and never cleared; the cost line that said "Parts 2-2". Mutation-verified: restore the
persistence bug and two of the eight go red.
0.10.0 added the Giant type cases. The one marked **MANDATORY** runs Copy's real
payload through a *clean-room* DOMParser allow-list walk written from the documented
behaviour (never nutty's code), with the `PB_CLASSES` rules applied. It then asserts the
innermost giant text's computed size is 16 × 1.2^levels (× the shrink factor) within
0.01px at weight 900, that nothing after the giant body is inside a `.title`, and that
only `class`/`src` attributes survive. Its control first proves it can see the bug it
exists for: an unquoted tuck class losing `dialog-nav-button`. The others pin the 240px
preview body, the Thermal preview, the tuck (corner box, Copy, reload), the emote
layout's "no request leaves the origin", and that saved Hanzi/Type blocks are not
migrated. Browser tests capture payloads by stubbing `navigator.clipboard.writeText`
and clicking Copy, because the payload is never in the DOM. Any browser test that
depends on a default must **pin** the value it needs. When Giant type became the default,
"the cover surcharge line never says a range of one" quietly stopped splitting and
passed while testing nothing; it now pins its block to Hanzi and asserts the split.
In the unit suite, `test/_harness.mjs` exports `scanTags`, an all-occurrences tag and
attribute scanner. The older first-occurrence `attrsOf` scan missed a stray attribute
on level 2 of a nest, and read the unquoted two-class span as clean. Anything needing the Worker (`/px`,
`/upload`) is deliberately NOT faked there; those are still checked against
`wrangler dev` by hand, and the specs say so. CI runs both suites (see
`.github/workflows/ci.yml`).

## Deployment (Cloudflare Workers)

- Connected via Workers Builds. `src/worker.js` is the entrypoint; it serves
  `public/` as [static assets](https://developers.cloudflare.com/workers/static-assets/)
  and handles `/upload`, the image routes and `/px`.
- **Two custom domains, both declared in `wrangler.jsonc` `routes`:**
  `receipt.uwutoowo.com` (the app) and `i.uwutoowo.com` (short host for uploaded
  image links). **Both must stay listed.** This file used to declare no routes at
  all and the app domain lived only in the dashboard. Once routes are in config,
  config is the source of truth, and declaring only one invites a deploy to
  reconcile the route set and drop the other.
- `vars.RW_IMG_HOST` = `i.uwutoowo.com` makes `/upload` mint 39-char links instead
  of 45. It falls back to the request origin when unset, so previews and
  `wrangler dev` work either way, but **only set it while that host really
  answers**, or every picture prints blank.
- `kv_namespaces`: `RW_IMG` holds uploaded images with a native 15-minute TTL.
- CI validates every push/PR to `main` with `npx wrangler deploy --dry-run`. The
  GitHub Actions workflow itself never deploys.
- **Workers Builds does, though: every push to `main` auto-deploys to production,
  within ~15s.** Pushes to any other branch build but never reach production.
  Merging *anything* to `main`, even a docs- or CI-only change, republishes
  `main`'s `public/` and `src/` over whatever is currently live.
- `npx wrangler deploy` also exists and deploys **whatever is checked out**. Using
  it from a feature branch puts un-merged code in production; see the divergence
  rule under "Working in this repo".

## Architecture of the app (glyph pipeline)

All functions live inside the one IIFE in `public/index.html`.

Pure core (DOM-free, unit-tested):

1. `TIERS` / `getTier(id)`: the glyph tier table. **Six tiers, in this order:**
   `ascii` (letter ramp, *the glyph-art default* until 0.9.0), `asciifull` (denser ASCII ramp),
   `safe` (`░▒▓█` blocks), `cjk` (curated Han density ramp), `braille` (2×4 dot
   packing), `text` (binary `█`/`░`, used by big type). *(Amended 0.9.0: `newBlock`'s
   default is `cjk`; under the sanitizer ASCII's `white-space:pre` wrapper is stripped and
   its rows shear. See the ⚠ banner.)* The ASCII ramps lead because
   they need no particular font to be installed; the app's own selector labels the
   block tier "often blank on printer", so do NOT call blocks the safe choice. Both
   ASCII ramps start with a literal space as their lightest cell; see the
   `white-space:pre` note in Global constraints. Keep the table's shape (`id`,
   `label`, `kind`, `ramp`/`on`/`off`) if you add one.
2. `sampleLuma(pixels, imgW, imgH, cols, rows)`: downsamples an RGBA buffer to a
   `cols×rows` luminance grid, compositing alpha over white.
3. `quantizeTone(luma, ramp, opts)` / `quantizeBinary(luma, opts)`: map
   luminance → a glyph per cell using a tone ramp (images) or on/off glyphs
   (binary text), honoring `invert`.
4. `ditherFloydSteinberg(luma, nLevels)`: optional error-diffusion dither to the
   active tier's ramp depth, as an alternative to plain thresholding.
5. `lumaToDots(luma, opts)` / `packBraille(dots)`, for the Braille tier: threshold
   a fine 2×-wide/4×-tall luma grid to booleans, then pack each 2×4 block into one
   Braille codepoint (U+2800 + bitmask).
6. `render(cells)` / `payloadLength(s)` / `withinBudget(s)` / `MAX_CHARS` (500):
   flatten a `CellGrid` to one newline-free string and check it against the
   character budget (see Global constraints below).
7. `makeNonce(i)` / `packageCheer(body, opts)` / `CHEER_TOKEN` (`"Cheer100"`):
   append a space-delimited `Cheer100` token plus a small **visible** rotating
   nonce (glyphs, never zero-width) when the "Cheer-ready" toggle is on.
   `packageCheer` is the old single-mode path. The block composer's lead is built by
   `buildLead` (item 18), and the token *leads* there (see Global constraints).
8. `buildCensus()` builds the fixed diagnostic payload for the Print test strip
   button: labeled samples of every tier plus a numbered ruler, so a single print
   on the target rig reveals which tiers render vs. tofu and the true column
   count.
9. `escapeHtml` / `escapeAttr`: escaping for anything user-supplied that lands in
   markup.
10. `EMBEDS` / `EMBED_DEFAULT` / `getEmbed(id)` / `buildImageEmbed(id, box)`: the
    carrier tag table. Every interchangeable way to put a real picture on the
    printed page, each building the same picture out of a different token, because
    the blocked-terms list keeps eating them one at a time. `buildImageEmbed` is the
    only place that markup is built (it also normalizes the box, so a missing aspect
    probe can't emit a zero-sized frame). See Global constraints for the drill when
    the next one gets blocked. **The order and the labels are measured.** See
    "Measuring against the real engine" below before editing either.
11. `buildTakeover(o)` / `takeoverBox(pullPt)` / `TAKEOVER_PULL_PT`: the Takeover
    block, an opaque SVG lifted over printer-bot's own header with a negative top
    margin, so the tape reads as your artwork instead of a receipt with a message
    stapled under it. Three optional lines plus an optional picture (which rides in a
    `<foreignObject>` through `buildImageEmbed`, so it inherits the carrier table
    rather than hardcoding SVG's blocked `<image`). Everything derives from one
    calibration number, `pullPt`. The bot's header height varies with the streamer's
    avatar, so it needs one print to dial in. Lines are bottom-anchored to the covered
    area by default; pass `startY` to hang them downward from a given baseline instead,
    which is what the fake cheer does. Either way the stack is **clamped into the
    painted box**: a baseline outside it prints *on top of* the header this block
    exists to paint over, which reads as the feature simply not working.
    **THE LEAD IS PART OF THE GEOMETRY.** A lifted overlay is positioned from where the
    SVG lands in `#receipt-content`, and it does not land at the top: every message
    carries a lead (`Cheer100 <nonce> `, or the nbsp guard; since 0.10.0, tucked, the
    nbsp plus the corner span of item 18) *before* the first body,
    and that lead takes a line, measured 16px, which left a crescent of the streamer's
    avatar printing above the artwork. `TAKEOVER_PULL_PT` is 240 **because** of that
    line; the original 220 was calibrated against a preview that rendered the bodies
    with no lead at all. Two rules follow, and breaking either re-creates the bug:
    `packStackBodies` publishes `lead` and its payload is exactly `lead + bodies` (one
    string, so preview and print cannot diverge), and the preview renders that lead into
    the receipt slot. `CHEER_MAX_LIFT_PX` is **derived** from `TAKEOVER_PULL_PT`. Never
    re-inline it as a literal, which is how it and the default silently drifted apart.
    **Known limit, do not "fix" by guessing:** a picture is anchored to the top of the
    panel, so on a rig whose real header is shorter than the pull it is lifted clean off
    the paper and clipped, and turning the pull down instead drops it under the 120px
    floor. Swept 60 to 400pt against a short header and it never printed. The app cannot
    know the rig's header height; that is what the pull *is*. The preview clips at the
    paper edge (`.rcpt { overflow: hidden }`) so the loss is visible instead of silent.
12. `buildFakeCheer(o)` / `CHEER_AVATAR_W`: the Fake cheer, the same takeover
    arranged like the bot's own header (picture on top, then the amount, then a name,
    then an italic note). It composes `buildTakeover` rather than emitting its own
    markup, so escaping, the carrier table and the `foreignObject`-last rule are
    inherited instead of re-implemented. Keep it that way.
    **Nothing renders through it any more.** Every takeover draws from its item list;
    this survives as the migration's ORACLE ("where did this block's ink land in 0.4.2")
    and as the seed button's data, so treat it as frozen. There is no `CHEER_SUFFIX`:
    `" BITS"` used to be welded on at render time, which is the one thing that made the
    block Twitch-only, and it is now baked into the amount ITEM's text once, at
    migration, by `takeoverAmountText`. Nothing appends anything when it draws.
    The layout numbers reproduce the hand-built payload this was reverse-engineered
    from, which printed correctly on the real rig: an 80 px picture at the top,
    baselines 24/900, 19/700, 13/italic. The one departure is that the picture is
    reserved **square** (a profile picture is square, and the carriers state only a
    width, so a 1.4 reservation left a slab of white under it) and at least
    `CHEER_MIN_PIC_PX` tall (see the render threshold above). The bits figure is free
    text, not a number: `-100000` and `∞` are both jokes people want, and coercing it
    to a number kills them.
    **Layout order is load-bearing:** reserve the TEXT's room first, then give the
    picture what is left. Sizing the picture first and clamping the text into the
    remainder drags the stack up into the picture's rectangle, and the picture is
    painted last, so it erases the line. Measured: the default pull with the width
    slider at max rendered the bits line with zero ink while every test passed, because
    the tests only asserted each piece was inside the box. They now assert the two are
    disjoint. The lift is also capped (`CHEER_MAX_LIFT_PX`) so an over-pulled block
    follows the message down instead of sailing off the top of the roll; at pullPt 380+
    it used to print a blank white slab.
    **Measured cost:** three lines alone are ~357 chars with the cheer wrapper; *with*
    a picture on a minted link it is **491 of 500, one cheer**. Getting there took
    three things and the margin is thin enough to lose by accident, so they are tested:
    the link went 67 chars -> 45 -> 39 (see "Short links" below), and the body-width clamp is
    dropped inside the fixed `foreignObject` where it is a provable no-op (`framed`, see
    `clampAttr`). A *pasted* CDN link is longer than anything we mint and still does not
    fit. The card says so, and the packer splits rather than truncating.
    On scope: the tape is not a record of anything. Twitch's bits ledger is server-side
    and authoritative, nobody reconciles it against thermal paper, and the printer is a
    gag the streamer runs for laughs. The cheer that triggers a print carries the real
    sender's name in chat, in front of the whole room. (An earlier version of this file
    argued the opposite and refused a sender template on "forged record" grounds. That
    was wrong: it treated *looks like a receipt* as *functions as a financial record*.)
13. `buildEmbedProbe(box)`: the diagnostic payload set for the Find what still
    sends button. The same picture through every carrier, labeled `A`…`F` (one per
    EMBEDS entry, `String.fromCharCode(65 + i)`, so the range follows the table's
    length rather than a number written down here), one message each. They can't
    share a cheer: one blocked term kills the whole message. A letter that prints
    *with a picture under it* names the carrier that works; a bare letter means the
    tag didn't render; a missing letter means chat blocked it. This is `buildCensus`'s counterpart for markup rather than glyphs.
14. `buildStackCover(o)`: the continuation cover for parts 2..N of a split run,
    and the reason `packStackBodies`' per-part overhead is no longer constant. A
    takeover paints over the bot's header on the receipt it rides on and no other, so
    a stack that split used to print as artwork followed by uncovered receipts, the
    "blocks after a takeover are broken" complaint. It is `buildTakeover({items: []})`
    and **must stay that way**: the cover and the takeover it continues have to be the
    identical rect at the identical lift, and one code path is what keeps them so. 106
    characters at the default pull.
    **RESERVING those characters is the load-bearing half, not prepending them.** The
    packer subtracts the cover from `maxBody` for every part after the first, and only
    for a takeover that landed in part 1 (a takeover in part 3 covers part 3 itself).
    Prepend without reserving and part 2 lands at 598 characters. Twitch **rejects**
    an over-length message rather than truncating it, so the tail of the run silently
    never sends. Mutation-verified; `test/covers.test.mjs` names the number.
    **And a part that still cannot afford it goes out bare** (0.10.0). The reservation
    keeps bodies out of a covered part, but a single body always gets a part of its own,
    so one bigger than the room left after the cover (a full Hanzi band: 598; a
    464-character giant body: 582) had the cover prepended anyway (present at 0.9.1).
    `flush()` now drops the cover from a part whose lead + cover + bodies would pass
    `MAX_CHARS`: a missing cover costs looks, an over-length part costs the cheer, and
    takeovers no longer print anyway. With that backstop an unreserved cover no longer
    shows up as 598 but as part 2 going out uncovered, so the reservation test asserts
    the cover is THERE as well as the part being under 500. Bodies
    carry the cover on themselves (`body.cover`) because only the packer knows which
    part a block ends up in. The preview renders it, for the same reason it renders
    the lead.
15. `makePreset` / `parsePresets` / `serializePresets` / `upsertPreset` / `cleanBlocks`
    / `isMintedImageUrl` / `presetImageUrls`: presets (spec §8). The whole block
    stack saved under a name in `rw_presets_v1`, plus JSON export/import.
    Three things here are deliberate and easy to undo by accident. `cleanBlocks` is the
    single definition of what a saved block is, shared with `saveBlocks`, so the two
    can't disagree, but `makePreset` **deep**-copies on top of it, because a preset
    outlives the stack it came from and a shared `items` array means editing a takeover
    silently rewrites the user's backup. `parsePresets` validates rather than trusts:
    untrusted text must say what's wrong, not half-load a stack. And `isMintedImageUrl`
    matches **our** links only, by shape, across all three generations. A pasted
    third-party URL has no 15-minute clock, and flagging one that still works teaches
    the user to ignore the flag.
16. `PB_CLASSES` / `pbClass(id)` / `classAttr(cls)` / `pbPreviewCss(scope)`: the
    **borrowed-class table** (0.10.0), the same philosophy as `EMBEDS`: the classes we
    borrow from printer-bot's page, and what they do, are DATA, because nutty can rename
    or retune them any day. Rows are `{id, cls, decl, role, factor?, source, field,
    checked}` in printer-bot's cascade order (`global.css`, then `contents/style.css`):
    `title` (`grow`, ×1.2, `field:"printed"`), `shrink9` = `setting-description` and
    `shrink8` = `setting-attribute` (`shrink`, ×0.9 / ×0.8, `"untested"`), `switch` and
    `navbtn` = `dialog-nav-button` (`tuck`, `"sent"`: they rode the field cheer that
    printed, but their own effect was not what was judged), and `emote` (style.css,
    `height:1em`, printer-bot's own emote rendering). **Everything derives from the
    table**: `GIANT_RATIO` is `pbClass("title").factor`, the shrink steps are the
    `shrink` rows, `TUCK_OPEN` joins the `tuck` rows, and `pbPreviewCss` builds the
    preview rules for BOTH the page `<style>` (injected in `init`) and `RCPT_CSS` (the
    Thermal raster). Do not hardcode a borrowed class at a call site; when nutty renames
    one, it is a one-row edit, after a free probe (see THE RULE in the banner).
    `classAttr` emits `class=x` unquoted when `x` matches `/^[a-z][a-z0-9-]*$/` (two
    characters cheaper, paid up to 18 times a line) and quotes anything else. **A
    two-class value must be quoted.** Unquoted, `class=switch dialog-nav-button` parses
    as `class="switch"` plus a boolean attribute named `dialog-nav-button`, which the
    sanitizer strips, and the tuck quietly stops working. `pbPreviewCss` departs from the
    real rules in three deliberate ways, all because the preview's receipt is a box in a
    page rather than the page: `position:fixed` becomes `absolute` (`.rcpt` is
    `position:relative`); the `emote` row is left out (it would shrink the takeover
    preview's own `<img class="emote">` carrier to 16px); and `.title{line-height:1.33}`
    is appended, Segoe UI's normal line height, so preview heights track the tape on a
    viewer without Segoe. `tools/rig.py`'s `PB_CSS` is a third, **hand-synced** copy of
    these rules for its fallback page; its comment says so.
17. **Giant type**: `giantClean` / `giantLines` / `giantLineEm` / `GIANT_W` /
    `giantSteps` / `giantLineH` / `giantFit` / `giantPlan` / `buildGiantBodies` /
    `giantReport` / `giantOpts` / `blockRender` / `giantCapCm`, plus the `GIANT_*`
    constants. A Text block with `render:"giant"` prints as
    `"<br>" + open + lines.join("<br>") + close + "<br>"`, where `open` is up to 18
    `<b class=title>` (19 characters a level, open plus close), optionally inside ONE
    shrink wrapper.
    - **Placement trap.** The code lives inside the DOM-glue guard, AFTER `PAPER_PX`,
      `PX_PER_MM` and `LEAD_GUARD`, as `var name = function` expressions. A function
      *declaration* there is block-scoped in strict mode and never reaches
      `module.exports`. A `var X = PAPER_PX` placed before `PAPER_PX` is assigned reads
      `undefined`, every width test is false, and the fit silently returns the
      smallest size. The NaN test (`giantFit(["I"],{size:"width"})` reaches 15+
      levels) guards it.
    - **Lines.** `giantClean` drops what QtWebKit 534 cannot print (astral code
      points, i.e. emoji, plus ZWJ, VS15/VS16 and lone surrogates) AND what prints
      nothing (`GIANT_INVISIBLE`: the BMP part of Unicode's Default_Ignorable_Code_Point
      set, i.e. zero-width spaces and joiners, direction marks and embeddings,
      U+2060-206F, the BOM, the soft hyphen, U+034F, the Hangul fillers U+115F/1160/3164/
      FFA0, U+17B4/5, the Mongolian selectors U+180B-180F, U+FE00-FE0F, U+FFF0-FFF8;
      plus U+FFF9-FFFB and C0/C1 controls bar tab and newline), and reports each
      character it dropped. Before that fix each invisible one was a giant LINE of its
      own in a stack ("HI\u200BYOU" fell from 14 levels to 13; the first fix missed
      U+3164, the "invisible character" people actually paste on Twitch). CR, CRLF and
      U+2028/2029 become `\n`, and U+2800 (braille blank, pasted on purpose as a blank)
      becomes a space. `giantReport` says
      which kind went: emoji (named) or invisible characters, never "emoji" for a stray
      zero-width space. `giantLines` splits by CODE POINT:
      `stack` is one character per line, with each whitespace run becoming ONE blank
      line between words; `lines`/`emote` keep the lines as typed.
    - **Width.** `GIANT_W` is a conservative uppercase advance table,
      `round(max(Segoe UI Bold, Arial Bold) × 1.03, 3)` (derivation in its comment).
      Neither font alone is safe, and an earlier Arial-based table let "MMMMM" ink
      past the body edge on the real engine.
    - **Steps.** `giantSteps` lists 51 sizes: 1-18 levels × {1, 0.9, 0.8}, nothing
      below one level (19.2px). `giantLineH` is the real engine's line pitch.
    - **Fit.** `giantFit`/`giantPlan` pick the step. `fit1`, the default "biggest that
      fits ONE cheer", takes the largest step that fits the paper in one CHEER; failing
      that, the FEWEST cheers, then the largest. It never takes the biggest width fit,
      which is the most cheers: an 80-character stack once fell back to 20 cheers.
      `width` is the largest that fits the paper at any cost, and an integer `n` means
      exactly `n` levels with `fits`/`overflow`/`over` reported honestly. Layout `auto`
      tries `lines` and `stack`: a layout whose letters would be cut off never wins, then
      the bigger type when both fit one cheer, else the fewer cheers, ties to `lines`.
      **A cheer is not a chunk.** `fit.chunks` is how many bodies the block makes;
      `fit.cheers` (`giantCheerCount`) is how many parts the packer puts them in, by the
      packer's own greedy test, and it is the number every label, `auto` and `fit1` use.
      They differ because the chunker breaks a stack at a word gap and drops the blank
      edge line, which often lets the packer merge both halves: "HELLO WORLD" at L10 is
      two chunks and one part, and counting chunks said "2 cheers" over a one-part preview
      and made fit1 settle for L10×0.9. Merged, the words are separated by the small
      inter-body gap, not a giant blank line (bench: one page, full L10).
      `giantChunkFloor` is a lower bound on both, so pruning with it stays safe.
      **A step with a line too long to send even alone (`over`) ranks below every step
      without one** (`giantStepOver`, O(1)): it used to count as a valid one-chunk fit,
      and a shrink step carries one tag more than the plain step below it, so Auto could
      pick a 549-character L14×0.9 that Twitch rejects while L12 sent in 478.
    - **Chunking is on height AND characters.** The height is `GIANT_GAP_PX + Σ
      giantLineH ≤ hb`, where `hb` is the per-receipt height budget, `heightBudget(mm)` —
      **length-derived since 0.11.0, not a fixed 1400** (see the next item). The characters
      are `≤ budget`, which is `MAX_CHARS - leadLength`. Height alone once let 26 lines of
      "ROSES nnn" become a 487-character body: 499 with the plain lead, 543 tucked, and
      Twitch rejects that outright. The chunker prefers to break at a blank line and trims
      blanks at both edges of every chunk, because a chunk that starts with one prints a
      giant-height blank. A single line over budget on its own is emitted with `giant.over`
      and warned about, never truncated; one taller than `hb` is flagged `giant.tall`
      (`giantStepTall`, O(1)) and the report says it is cut off — never silently clipped.
    - **The height budget is the receipt's length, not a fixed page (0.11.0, the field
      cut-off fix).** `heightBudget(mm) = floor(mm × LEN_PX_PER_MM − HEIGHT_RESERVE_PX)`,
      A4 → 771 px. `HEIGHT_RESERVE_PX` (351) is the header + lead line + footer a cheer
      spends outside the body, MEASURED on the real engine (inked page = the per-body
      height estimate + 351, flat across L6–L14). `LEN_PX_PER_MM` is the TRUE 96/25.4, not
      the rounded `PX_PER_MM` (3.75) the picture box uses — length needs the exact constant.
      WHY: printer-bot lays the page out at `--page-height 500mm`, so the old fixed 1400 px
      (~37 cm) packed a tall Giant stack into one cheer, but the real printer stops at its
      Windows driver's paper length (often A4, 297 mm) and SumatraPDF prints `noscale`,
      which CLIPS the overflow — a stacked cheer came off cut at ~29.7 cm. The length is a
      per-stack option (`opts.heightPx`) threaded from the **Receipt length** control
      through `packStack` → `renderBlockBodies`/`buildGiantBodies` and into `packStackBodies`
      (both read the SAME value); absent, everything falls back to `DEFAULT_HEIGHT_BUDGET`
      (A4). The bench can set it: `tools/payload.mjs` takes an optional `"mm"`.
    - **Stack word gaps can be the small inter-body gap, not a giant blank line (0.11.0).**
      `giantChunks` takes a `gap` style; `"small"` (stack only) gives each WORD its own nest
      joined by a base-level `<br><br>` (~GIANT_GAP_PX, measured: `I RAID RAID` at L7, pitch
      77 px within a word vs 100 px between), `"blank"` is the old single nest. `giantPick`
      picks whichever gives FEWER cheers, tie to `blank` — so a spaceless word (`HELLO`) stays
      byte-identical to pre-0.11 at EVERY length. A run of single-letter words (`C O C K`) also
      stays `blank` at the A4 default and typical lengths — there per-word nests still blow the
      character budget or don't cut the cheer count — but at a SHORT receipt (e.g. 150 mm)
      `fit1` shrinks the letters until per-word nests both fit under 500 AND save a cheer, so
      `small` correctly wins (verified: gap `small`, 388 chars, 1 cheer at 150 mm). The
      invariant is only "fewer cheers, tie to blank", NOT unconditional byte-identity. `small`
      wins for a spaced PHRASE whenever it buys a bigger one-cheer size (e.g. `I RAID RAID`).
      `fit.gap` / `giant.gap` records the choice. Note the packer's split-and-merge ALSO
      renders a word gap small (two bodies meet at a base `<br><br>`), which is why `blank` is
      usually enough.
    - **Payload rules.** The payload is never uppercased: `text-transform` is visual,
      and emote names are case-sensitive. Every body closes every tag, because the
      packer concatenates raw and an unclosed `.title` would make everything after it
      giant. In the emote layout every name gets a space on BOTH sides, because Twitch
      only reports an emote that is a whitespace-delimited word. `giant.cheerWords`
      flags standalone `Kappa50`- and `4Head100`-shaped tokens (a letter/digit prefix
      ending in a letter, then the amount), which Twitch MAY charge as extra cheers. The
      report says so flatly only for a global cheermote prefix (`GIANT_GLOBAL_CHEERS`)
      and hedges for anything else ("If “PS5” is a cheer name on this channel…"): a
      channel's own prefixes are unknowable here, and telling a user to delete "PS5" on a
      guess was a bug. In the emote layout a name with `<`, `>` or `&` (Twitch's `<3`) is
      escaped like every user character, so Twitch never reports it and it prints as
      text; the preview shows it as text, not as an emote placeholder. Empty input
      gives one empty body with `levels:0`, never 18 levels of
      empty tags, and `packStackBodies` never lets a body that prints nothing open or
      close a part: it rides along in whatever part it lands next to. (It used to get a
      part of its own beside an over-tall neighbour: "Cheer100 03 ", 100 bits for a
      receipt with only the gem.) There is one literal form only: no italic, no
      quote/case/tag variants (THE RULE).
    - **Untrusted fields.** `giantOpts` sanitizes `giantLayout`/`giantSize`, which
      arrive from presets and imported JSON, and from a `<select>` as strings, so
      everything reads them through it: `1e6` becomes 18, junk becomes `"fit1"`.
      `blockRender` maps an absent or unknown `render` to `"type"`, today's
      fall-through, so the card's select and the payload can never disagree.
    - **The report.** `giantReport` is the card's plain-language text ("Capitals ≈
      3.8 cm · fits 1 cheer", too wide, over-length, **taller than the receipt so cut off**,
      emoji or invisible characters left out, cheer-shaped words). It takes `opts.receiptMm`
      so the cut-off warning and the ruler gauge name the user's real length. It stays pure
      so its numbers are tested. The cm
      figures are `giantCapCm` (`round(px)` × 1434/2048 × 25.4/96: the engine rounds
      font-size to whole px, and Segoe UI's cap height is 1434 of 2048 units) and, for
      emotes, `giantEmoteCm` (the whole rounded font-size). Both use `GIANT_MM_PER_PX`
      (25.4/96), **not** `PX_PER_MM`, which is a rounded 3.75 that stays as it is for the
      picture blocks; dividing by it (and not rounding the font-size to whole px) read up
      to ~1.8% high (0.8% from `PX_PER_MM` alone) and put 12 of 51 sizes 0.1 cm
      high on the card. Measured on the engine, every flat-capital height is within
      0.01 cm of `giantCapCm` (see "Settled for Giant type").
18. `buildLead(opts, nonce)` / `leadLength(opts)` / `TUCK_OPEN` / `TUCK_CLOSE` /
    `bandReserve(budget)`, and the packer's tuck handling. **`buildLead` is the one
    builder of a message's lead**: `packStackBodies`' `lead`, its per-part overhead
    (`leadLength`, which replaced `token.length + 4`), the band builders' slack and the
    card hint all go through it, so reserved and sent cannot drift. Cheer off gives
    `LEAD_GUARD`; cheer on gives `Cheer<bits> <nonce> ` (12 at Cheer100). Cheer plus
    **tuck** (`#cheerTuck`, "Hide the cheer gem in the corner", default off) gives
    `LEAD_GUARD + '<span class="switch dialog-nav-button"> Cheer100 07 </span>'`: 60
    characters at Cheer100 (61/62 at 1000/10000), and `leadLength` adds the 4 of a
    `<br>` the packer may insert, so 64. Under the tuck the packer touches the first
    body with markup in each part. A giant body (`leadBr`) **loses** its leading
    `<br>`, which is what makes the tuck save tape (156 → 133px on the engine); kept,
    the tuck hides the gem and saves nothing. Any other body **gains** one, so a Hanzi
    or glyph grid starts on a clean line instead of sharing the nbsp's line and
    shearing, **unless it already opens with one**: a giant body in the EMOTE layout
    has `leadBr:false` and keeps its `<br>` as is (never doubled into a blank line),
    because its first line is padded with a space for Twitch, and after the nbsp that
    space prints and shoves line 1 right (27px skew between lines on the engine; see
    "Settled"). The emote layout's fit therefore keeps the full `PAPER_PX` under the
    tuck (no `GIANT_TUCK_PX`). `bandReserve` replaced the hardcoded `14` in `hanziBodies` /
    `glyphImageBodies` with `max(14, MAX_CHARS - budget)`. The floor is what keeps
    every untucked payload **byte-identical** to 0.9.1 (cheer off, and every bit
    amount up to 99999), and it grows only with the real lead: 64 tucked, which is
    exact. The mutation test: two 230-character bodies, tucked, must pack as two parts
    of at most 500 at 100, 1000 and 10000 bits; restoring `token.length + 4` puts them
    in one 524-character part.
19. `buildGiantRuler()`: the **Print size ruler**, `buildCensus`' counterpart for Giant
    type. The numbers 1-13, each one `.title` level deeper than the last, in one body:
    316 characters (328 with the plain lead), 1275px, one cheer on one 500mm page. It
    proves the trick on THIS rig today and shows every size at once. It is never
    tucked, because it is a diagnostic and should look like every other cheer. **It is
    also the length gauge (0.11.0):** it carries `giant.rungs` (each number's bottom in px,
    measured the way the packer measures a body), and `giantReport(ruler, {receiptMm})` turns
    that into "at N mm, numbers up to K should print, higher ones are cut off — measure your
    printed tape and set Receipt length to its length in mm". It names NO per-number length
    "mark" (and the rung carries no cm): a number's position is DOWN THE GIANT BODY, which
    omits the ~93mm of header/lead/footer (`HEIGHT_RESERVE_PX`) the page spends OUTSIDE the
    body, so feeding it back undershoots by that constant; and the count is deliberately
    conservative (a mid-body cut frees the footer's reserve, so a touch more prints than it
    counts), so a number read off the tape would OVER-set the length. Only the physically
    measured tape — the exact quantity the budget is calibrated against — sets it right. It is
    ONE body, so `packStackBodies` never splits it — it rides the full 500mm page and may run
    past a short receipt on purpose. Do NOT make it honour `heightPx`.

Browser glue (canvas + DOM, guarded, browser-verified rather than
unit-tested):

- `rasterizeText(text, o)` / `rasterizeImage(imgEl, o)`: draw onto an off-screen
  `<canvas>` (scaling big-text words to fill the target width; drawing/rotating
  images for the sideways orientation) and return the raw pixel buffer.
- `computeGrid(kind, tier, o)`: composes rasterize → sample → quantize (or
  Braille pack) into a `CellGrid`. It derives the sample grid's aspect from the
  *actual* rasterized buffer dimensions (post-rotation) rather than a
  pre-rotation assumption, so "sideways" is a true rotation and not a
  transpose/distortion.
- `buildTextPayload()` / `buildImagePayload()`: read the current controls,
  call `computeGrid` + `render` + `packageCheer`, and return the paste-ready
  string (or `null` for Image mode with no image chosen yet).
- `imageBox(block)` / `imageBodies(block)`: the print box for a real-picture block
  (requested width capped to the paper; height from the probed aspect, square until
  that probe lands and re-renders) and the body built from it via `buildImageEmbed`.
  `probeBlockAspect` does the one-off aspect probe. `probeParts()` reuses `imageBox`
  so the probe measures the carrier tag and nothing else.
- `copyToClipboard(text)`: `navigator.clipboard.writeText()` with an
  `execCommand('copy')` fallback (`fallbackCopy()`).
- `saveControls()` / `restoreControls()` / `loadSavedControls()`: persist/restore
  the control panel (tier, columns, mode, toggles, text) to `localStorage`. Since
  0.10.0 that includes `tuck` (the "Hide the cheer gem" checkbox) as a FIELD of
  `rw_controls_v1`; absent reads as off. 0.11.0 adds `receiptLen` (the Receipt length
  mm) the same way, clamped on restore to `clampReceiptMm`; absent reads as the A4
  default. No new key.
- `getReceiptMm()` / `getHeightPx()`: the Receipt length control, clamped, and its
  `heightBudget(mm)`. `composeParts` passes `heightPx: getHeightPx()` into `packStack`,
  and the giant card passes it (and `receiptMm`) into `giantPlan` / `giantReport`, so
  every size label, cheer count and the note reflect the user's real page.
- `getTuck()` / `syncTuckUi()`: the tuck checkbox. It is *disabled*, not unchecked,
  without Cheer-ready, so turning Cheer-ready back on restores the user's choice, and
  its hint computes the cost from the two real leads (`buildLead`) rather than writing
  a number down: an earlier draft said "+46" for what measures 48.
- `packStack(blocks, opts)` computes `budget = MAX_CHARS - leadLength(opts)` and
  `heightPx = giantHeight(opts.heightPx)` once and passes them (and `tuck`) to
  `renderBlockBodies(block, budget, tuck, heightPx)`, which routes through `blockRender`:
  giant first, then hanzi, and everything else falls through to Type as it always has.
  `opts.heightPx` also reaches `packStackBodies`, so the body builders and the packer
  split against the SAME per-receipt height. `composeParts` / `probeParts` pass the tuck.
  The Census and the ruler are never tucked.
- The Giant type card (in `textCard`): Layout and Size selects whose every option is
  labelled with what it would print for the current text ("Level 14 · capitals 3.8 cm
  · 1 cheer", "… · letters cut off"), computed by `giantPlan` with the packer's own
  budget, tuck and receipt height and cached per (text, layout, size, budget, tuck,
  heightPx) — so changing Receipt length re-labels. The card's note
  uses class `giant-note`, **not** `cost-note`: two browser tests find the takeover's
  price as `.cost-note.first()`. It is driven by a `costSyncs` callback reading the
  PACKED parts (`parts[i].bodies[j].blockId`), so its cheer count is the real one after
  the packer has shared parts between blocks. Hanzi and Type cards carry a one-click
  "Switch this block" nudge, because saved blocks are deliberately not migrated.
- `renderParts` renders the lead with `insertAdjacentHTML`. It used to be a text node,
  which would have shown the tucked lead as literal `<span…>`. Only our own markup is
  in it (constants, digits, an nbsp). The preview's CSS (`pbPreviewCss(".rcpt")` plus
  `GIANT_PREVIEW_CSS` for `.rw-giant` / `.rw-emote-ph`) is injected into the page and
  appended to `RCPT_CSS`, so the Thermal preview draws giant type too. An emote is
  previewed as a dashed 1em square labelled with the exact name: no `<img>`, no fetch.
- `rulerParts()` / `#rulerBtn`: the Print size ruler as a one-part stack through the
  normal packer, with the plain lead.
- `nextNonce()`: advances a `localStorage`-backed counter (falling back to an
  in-session counter if storage is unavailable) and feeds it through `makeNonce`.
- `init()`: wires all DOM elements and event listeners; only runs on
  `DOMContentLoaded`, so it never executes under the test harness.

## Measuring against the real engine (do this before claiming a markup form works)

The destination is not a guess any more. printer-bot's own shipped files pin it
down, and anything about how markup *renders* can be tested locally instead of
argued about:

- Engine: `wkhtmltopdf 0.12.6 (with patched qt)`, which is patched **Qt 4.8.7**,
  i.e. QtWebKit ~**534.34** (a 2011 snapshot). Not Chromium, not Qt 5. Then printed via
  SumatraPDF 3.5.2. There is no ESC/POS text path.
- **The message used to be inserted with raw `innerHTML`, unsanitised**, then
  re-serialised into a standalone HTML document and parsed a second time by
  wkhtmltopdf. **As of 2026-09-15 it is NOT unsanitised** — printer-bot now runs it
  through the allow-list sanitizer described in the ⚠ banner at the top of this file
  *before* this step. So the engine notes below still describe what wkhtmltopdf does
  with whatever survives the sanitizer, but a form that the sanitizer strips
  (`<svg>`, `<embed>`, a styled `<span>`) never reaches the engine at all — the bench
  will happily render markup that chat will never deliver. Bench-test only the
  sanitizer-surviving allow-list.
- Its exact print flags, from the Print Routine. Several of these decide whether
  a given form renders at all:

  ```
  --page-width {paperWidth-8}mm --page-height 500mm --disable-smart-shrinking
  --load-error-handling ignore --no-background --enable-javascript
  --enable-local-file-access --javascript-delay 800 --margin-{top,bottom,left,right} 0
  ```

- Its receipt CSS is `body { margin: 1em }` + `#receipt-content { padding:
  0.5em 0em }`, and **nothing clamps message content**: no `max-width`, no
  `height: auto`. Do not test against Receipt Wrecker's own preview CSS by mistake:
  its `.rcpt-body > svg { height: auto }` collapses an SVG carrier to zero height
  and will make you conclude the engine can't render SVG. It can.
  **That is the receipt template's own CSS, not the whole page (corrected
  2026-10-01).** The document printed is built by `GetRenderedHTML`, which puts the
  page's inline `<style>` text and then the fetched text of **every** linked
  stylesheet, in order (nutty's shared `global.css`, then `contents/style.css`), into
  one `<style>`, followed by the receipt template's markup. So the real page carries
  every rule in both sheets. None of them targets `b`, `i`, `span`, `img` or `br` by
  tag, so markup without a class is unaffected. Markup *with* a class picks up
  whatever that class does, which is the whole of Giant type (see `PB_CLASSES`). The
  receipt container's font stack is `-apple-system, BlinkMacSystemFont, Segoe UI,
  Roboto, Helvetica, Arial, sans-serif`, so the Windows rig prints in **Segoe UI**, at
  a 16px base that nothing above the message changes. `global.css`'s own `html, body`
  colour and Inter font are overridden by the receipt, and its background is dropped
  by `--no-background`.
- **The pipeline for a cheer, in order** (printer-bot's overlay, `contents/`): the
  header gets `"<bits> BITS"`, the sender and the avatar; the message goes through
  `SanitizeHTML`; then the **emote pass** replaces each Twitch emote name listed in the
  event's `data.emotes` with `<img src=… class="emote"/>` (a regex over the sanitized
  innerHTML *string*, so it never sees a second sanitize); then the **cheermote pass**
  replaces the FIRST `Cheer<N>` (case-insensitive) with the gem image plus
  `<span class="bits">N</span>`. Only then is the document built and handed to
  wkhtmltopdf. Twitch decides what lands in `data.emotes`, and it only lists a name
  that is a whitespace-delimited word of the raw message.

**The bench is a committed tool now: `tools/rig.py`.** It reproduces printer-bot's
page, its CSS and every one of its print flags, renders at 203dpi, and reports ink
count, ink bbox and the image XObjects in the PDF. *(Amended 0.10.0: "its CSS" was a
hand-copied subset of the receipt template's rules, with no `global.css` in it at all,
so a giant payload rendered at 16px there and read as "giant doesn't work". The default
page now uses the real stylesheets once `tools/printerbot.mjs` has cached them, and
otherwise the subset plus `PB_CSS`, a hand-synced copy of the `PB_CLASSES` rules. The
faithful path is `--document`, below. Every result now names which CSS it used.)*
**It does NOT reproduce the
greyscale->1-bit step**: wkhtmltopdf and pdftoppm emit continuous tone (a 256-level
ramp comes back with all 256 levels), so what turns grey into burnt dots happens
downstream in the printer or its driver where nothing here can observe it. `ink()`
hard-thresholds at 128 to COUNT ink; that is a proxy for "how much did this lay
down", not a picture of the tape. **`--paper` is the roll width in mm and defaults
to 80, the rig's.** It was a buried `paper_mm=72` that `main()` never passed, so every
run rendered a 64mm page, 8mm narrower than reality, and reported clipping for
payloads that fit.

Feed it a payload built by the app's own core with `tools/payload.mjs`, so the bench
measures what the app really sends rather than markup you hand-wrote:

```sh
node tools/payload.mjs '{"kind":"takeover","pullPt":240,"items":[...]}' | python3 tools/rig.py my-case
```

**For anything that depends on printer-bot's stylesheets or its passes, which since
0.10.0 means Giant type and the tuck, use the faithful pipeline instead:**

```sh
node tools/payload.mjs '{"kind":"giant","text":"HELLO"}' \
  | node tools/printerbot.mjs --out - \
  | python3 tools/rig.py hello --document - --fonts ~/my-segoe-ui
```

`payload.mjs` gained two kinds for this in 0.10.0, both built through the app's own
path: `{"kind":"giant","text":"HELLO","layout":"auto|lines|stack|emote","size":"fit1|width"|1..18,"tuck":false,"bits":100,"cheer":true,"part":0}`
runs `buildGiantBodies` at `packStack`'s budget and then `packStackBodies`, and emits
part `part` (0-based), with the part count and the predicted size on stderr.
`"cheer":false` is the free-probe message. `{"kind":"ruler"}` is the Print size ruler.
Both are **complete messages, lead included**, because they only mean anything after
the sanitizer and the cheermote pass. Piped straight into `rig.py`'s template page they
still render, but unsanitized and with the token left as text. `"lead":true` on the
other kinds now goes through `packStackBodies` too (it honours `"tuck"` and `"bits"`),
where it used to hand-build `"Cheer100 00 "`. (Or paste a payload from the app's Copy
button: `node tools/printerbot.mjs --message '…' --png .render/printerbot/x.png`.)

**Where printer-bot's files come from (provenance).** Source:
`github.com/nuttylmao/nutty.gg` (`printer-bot/contents/{index.html,script.js,style.css}`,
`.common/styles/global.css`, `.common/utils/helpers.js`). Its `CNAME` is
`widgets.nutty.gg`, so `main` **is** what every streamer's printer-bot loads; verified
byte-identical to `main` @ be2972f on 2026-10-02. **No licence file: never vendor**, so
the bench fetches at run time and caches under the gitignored `.render/`. Dates that
bound what a measurement can mean: the sanitizer arrived in 121c351 (2026-08-27);
`.title`'s 1.2em has stood since af65fcf (2025-09-06; 1.5em in 7e20a30 earlier that day;
c5e9890 only re-indented it); `GetRenderedHTML`'s inline-every-stylesheet step since
20a0e59 (2025-07-27, under `receipt-printer/`, before the 0c7b4fc rename; reworked in
7e20a30); `global.css`
has had only 8 commits ever. A number taken against the live site is a number about
that day's `main`: the provenance JSON records each file's sha256, and `--ref` pins the
bench to a commit so the number can be re-run. To be warned of a change, see the feed
and `--check` routine in the top banner.

`tools/printerbot.mjs` (`npm run printerbot -- …`) fetches nutty's **live** settings
page (`widgets.nutty.gg/printer-bot/contents/`)
and takes the stylesheet list, their order and the receipt `<template>` *from that
page* rather than from anything typed here. It fetches `global.css`, `style.css` and
`helpers.js` and caches every file under `.render/printerbot/cache/` with its sha256
and fetch time. In headless Chromium it runs printer-bot's **real** `SanitizeHTML`,
then mirrors the emote and cheermote passes, and emits the document `GetRenderedHTML`
would build. Checked on the field payload: byte for byte the document printer-bot's own
overlay script builds with Streamer.bot stubbed, apart from image paths. **Chromium is
used only for those string passes**; geometry comes from the real engine via
`rig.py --document`, and only when there is no wkhtmltopdf at all does `--png` fall
back to a Chromium render, labelled APPROXIMATE. Flags:

| flag | what it does |
|---|---|
| `--message TEXT` | the chat message; otherwise stdin, one trailing newline dropped |
| `--bits N` | the header's "N BITS"; default is the sum of the message's `Cheer<N>` words (which is also where cheermotes come from: whitespace-delimited `Cheer<N>` words, as Twitch parses them) |
| `--user NAME` | the header's sender line (default `someviewer`) |
| `--avatar URL\|PATH` / `--cheer-img URL\|PATH` | header picture / cheer gem; defaults are a 300×300 and a 112×112 stand-in |
| `--emote NAME=URL\|PATH` | repeatable; applied only where Twitch would recognise it, as a whole whitespace-delimited word, else warned and skipped |
| `--date ISO` | footer timestamp (default now) |
| `--out FILE\|-` | default `.render/printerbot/receipt.html` |
| `--png FILE` | render it: real wkhtmltopdf via `rig.py`, else APPROXIMATE Chromium |
| `--fonts DIR` / `--paper MM` | passed to `rig.py`; the paper defaults to 80 (page = MM-8) |
| `--offline` | cache only, never the network |
| `--ref SHA\|BRANCH` | read nutty's files from `github.com/nuttylmao/nutty.gg` at that commit instead of the live site (an EXACT branch or tag name is resolved to its sha, an annotated tag to the commit it points at, and recorded), so a measurement can be re-run against exactly the CSS it was taken on. Commits before 121c351 (the sanitizer) are refused: the pipeline needs `SanitizeHTML`. A `--ref` run never rewrites the `printed.css` cache `rig.py` reads. The live site **is** that repo's `main` (GitHub Pages): checked 2026-10-02, all five files byte-identical to `main` @ be2972f |
| `--check` | the release-checklist canary: exit 1 if any `PB_CLASSES` declaration (read from the app core via `loadCore`) is missing from the live CSS, the real sanitizer drops one of our classes, a linked stylesheet answers 404 (printer-bot would inline it empty), or the printed CASCADE does not compute the sizes the app assumes (nested `.title`, each shrink step, the tuck's `position:fixed`: an override of any selector or `!important` fails it, which the per-rule comparison alone could not see). The verdict is the last line of stderr. **Not in CI**, which stays offline, and no test may import this tool. |

Exit status 0 fine, 1 check or render failed, 2 usage or environment; the last line of
stderr says which. A file that cannot be fetched falls back to its cached copy with a
WARNING, but only on a network failure, a timeout, a 5xx, 408 or 429: a 404 or other 4xx
is the server's answer, which printer-bot gets too, so it is never papered over with the
cache. Under `--check`, any of nutty's files (settings page, stylesheets, `helpers.js`,
the overlay script) that came from the cache exits 2 instead (pass `--offline` to check
the cache deliberately). `printed.css` is only rewritten by a run that fetched every
stylesheet live. An unreachable `--emote`/`--avatar`/`--cheer-img` URL exits 2.
Behind a proxy, Node's `fetch` ignores `HTTPS_PROXY` unless
`NODE_USE_ENV_PROXY=1` is set; the error says so. Provenance JSON (URLs, sha256, fetch
times, warnings) goes to stderr. It needs Playwright's Chromium (`npx playwright install chromium`).
Images are localised as `file://` under `.render/`, because a Twitch emote URL ends in
`3.0` and a failed subresource with an unknown extension is a fatal whole-job error.

`rig.py`'s 0.10.0 flags: `--document FILE|-` renders a complete document as-is (the
PAGE template is skipped, so nothing of ours is in it; stdin is saved to
`.render/<case>.html`, and the case name is optional). `--fonts DIR` adds **your own**
copy of Segoe UI (e.g. copied from `C:\Windows\Fonts`) through a `FONTCONFIG_FILE`
written under `.render/fonts/`, Linux build only; it never downloads a font. `--embedded-css`
forces the hand-copied subset to reproduce pre-0.10.0 numbers. New JSON keys: `pages`,
plus `pages_ink` and a WARNING when there is more than one page (the page is 500mm, and
a message past it prints the rest as another page, which a page-1-only raster never
showed; `ink`/`bbox` remain page 1); `css` (`{source: cache|embedded|document, sha256,
fetched_at}`, plus `matches` when a document's CSS equals the cache, and for the cache its
`origin` and `stylesheets_from` from `printed.css.json`, with a WARNING when it was pinned
by `--ref` or carries a cache fallback, written by an older `printerbot.mjs`); and
`fonts_in_pdf` (from `pdffonts`), with a WARNING when Segoe UI is not among them.
Without Segoe the bench falls back to Liberation (Arial metrics), and the numbers
change: the field payload is one page there and two with Segoe. Exit status: 0
rendered, 1 failed or bad arguments, **3 no wkhtmltopdf at all** (the one case
`printerbot.mjs` may answer with an APPROXIMATE render). The case name must stay under
`.render/` (an absolute path or a `..` escape exits 1 before anything renders), because
the stale-page cleanup deletes `<case>-N.png` wherever the name points.

It needs **wkhtmltopdf 0.12.6 with patched Qt**. The distro QtWebKit 5.212 build behaves
differently and will mislead you, so `rig.py` checks the version string and warns rather
than assuming. Get it from the upstream release
(<https://github.com/wkhtmltopdf/packaging/releases/tag/0.12.6-2>). It needs no admin
rights: expand the `.pkg` with `pkgutil --expand-full` and untar the `wkhtmltox.tar.gz`
inside it into `~/.local/opt`, which is one of the three places `rig.py` looks
(`$WKHTMLTOPDF`, then `PATH`, then there). *(0.10.0: on Linux, `dpkg -x` the
`wkhtmltox_0.12.6.1-2.<distro>_amd64.deb` into `~/.local/opt`, which lands in
`~/.local/opt/usr/local/bin`, also searched. It reports `0.12.6.1 (with patched qt)`,
the same patched Qt 4.8.7 / QtWebKit 534.34. The old substring test rejected it, and
the version check now accepts it.)*

**This is the file's own cautionary tale.** The previous copy of the harness lived only in
gitignored `.render/` scratch with the binary path hardcoded to a throwaway job folder.
When the folder went away the bench silently stopped working, and a figure that could no
longer be re-run went into a changelog wrong. Artifacts still go to `.render/`
(gitignored; loose `t*.html` / `*.pdf` / `*-1.png` in the repo root were swept into a
commit by a `git add -A` once, so stage explicit paths, not `-A`); the TOOL is tracked.

### The one thing the bench CANNOT settle: how grey becomes burnt dots

wkhtmltopdf and pdftoppm emit continuous tone. A 256-level ramp comes back with all 256
levels, so the greyscale->1-bit step happens downstream, where no tool here can see it.
Uploads are not pre-dithered either (`uploadPngForUrl` shrinks to 720px and re-encodes
PNG), so whatever texture a photo prints with is the printer's own. **Do not settle this
by argument.** The app's Thermal preview assumes Atkinson error diffusion and `rig.py`'s
`ink()` hard-thresholds; the field (photos print halftoned, not posterised) rules out the
threshold but names no kernel.

`tools/calibrate.py` (`python3 tools/calibrate.py`; the `npm run calibrate` alias this
line used to name was dropped from `package.json` in 0.9.0) exists to answer it with one physical print:
five bands — continuous-tone patches as the actual probe, the same levels pre-dithered
with Atkinson / Floyd-Steinberg / ordered Bayer as references, and a dot ruler. Whichever
reference matches the probe's texture is the answer.

**The 1:1 rule makes or breaks that test.** 1 CSS px is **2.119** device dots, measured
with an image carrying 1px black columns at its own edges and reading the distance
between them in the render. So a 498-dot image is pixel-exact at **235** CSS px and
nowhere else (234 -> 496, 236 -> 500, 240 -> 509, which also exceeds the 508-dot body).
Draw a pre-dithered reference at any other width and it is resampled into grey mush that
proves nothing. `--check` renders the strip through the bench and refuses to bless it
unless the width came back exact and the ruler band has no soft pixels. Measure widths
with the edge-column method, not by ink extent: ink extent underreports, because an
edge pixel may legitimately be white.

Things already settled this way, so you don't have to re-derive them:

- `--no-background` means **no CSS-background carrier can ever work**, however
  tempting a tagless surface looks.
- `<embed>` / `<object>` pick the image renderer from the URL's file extension;
  a bare `/i/<hex>` renders nothing. `<img>` / `<input type=image>` don't care.
- A failed subresource whose extension isn't in wkhtmltopdf's hardcoded media list
  (`css/js/svg/png/jpg/jpeg/gif`) is a **fatal** error (exit 1, whole job), and
  `--load-error-handling ignore` does not suppress it. This is why `/upload`
  returns `.png` links.
- An `<iframe>` gets **no shrink-to-fit** (that's main-frame only), so it crops.
- **`<foreignObject>` swallows every SVG sibling that follows it.** It's an HTML
  integration point; the parser switches to HTML inside and never cleanly returns to
  SVG context, so `<text>` emitted *after* one is parsed as HTML and silently never
  drawn. The markup looks perfect and the print comes out blank. Measured. Anything
  riding in a `foreignObject` must be emitted **last** (see `buildTakeover`).
- **A second `<foreignObject>` is one of those siblings, so there may only ever be ONE
  per SVG.** Two pictures emitted as consecutive frames printed **31,792** ink pixels
  at 203dpi/1-bit, the first picture's own count to the pixel, with the second one's
  image XObject present in the PDF and never painted. Reproduced with two URLs, the
  same URL twice, and every live carrier. Chromium draws both, so the preview, the
  markup and the drop note all agree with each other and with nothing on the tape.
  The fix (`takeoverPictures`): **one frame spanning the cover, every picture
  absolutely positioned inside it.** The `position:relative` wrapper is load-bearing.
  Without it the boxes resolve against the *page's* initial containing block and the
  whole stack lands at page coordinates; WebKit 534.34 does not make the frame a
  containing block on its own. Each picture's box must stay shrink-to-fit, or the
  receipt's inherited `text-align:center` re-centres the carrier and throws away the
  alignment.
- A takeover (an opaque `<rect>` in an SVG lifted with `margin-top:-Npt`)
  reliably paints out the bot's own header, and a message after it still flows
  below. The pull is per-rig: the header's height depends on the streamer's avatar.
- The usable body width is `paperWidth - 8`mm minus the 1em margins: **240 px** on
  an 80 mm roll. `PAPER_PX` **is** that 240 now. It was 263 for a long time, on the
  reasoning that real-image carriers clamp with `max-width:100%` and "the text modes
  are field-verified at it" — the bench disagrees, and the text modes were not fine.
  Measured with an SVG that draws its own left/centre/right markers: at 263 the right
  marker never prints and the centre lands 22 dots (2.8mm) right of the page centre,
  because an SVG too wide for the body is pinned left rather than centred. At 240 all
  three print and the centre lands on 287 against a page centre of 288.
  **"Prefer a clamp over another hardcoded number" does not apply here, and that was
  the trap.** A clamp is unavailable on SVG: `max-width:100%` is ignored, adding
  `height:auto` collapses the element to nothing, and a `viewBox` (with or without a
  percentage width) collapses it too — all three measured on the engine. QtWebKit
  534.34 honours an explicit pixel width and nothing else, so the number has to be
  right. `max-width:100%` **does** work on an `<img>`, which is why the image carriers
  keep it and only the text modes were silently clipping. A narrower roll needs
  `PAPER_MM` / `PAPER_PX` edited by hand; nothing derives it at run time.
- **A picture drawn under ~120 CSS px TALL does not render inside a lifted takeover.**
  No image XObject in the PDF at all; the tape prints blank where the picture should
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
  `/upload` mints `https://i.uwutoowo.com/<12 hex>.png`, **39 chars**, down from
  45 (`receipt.uwutoowo.com/<12 hex>.png`) and 67 before that (`/i/<32 hex>.png`).
  12 hex = 48 bits against a 15-minute TTL, which is ample; 128 bits was 20 characters
  of margin that never did anything. The root path is matched by SHAPE (`imageKeyFor`),
  so it cannot shadow a static asset, which is what `test/imgpath.test.mjs` guards.
  Both older shapes still resolve. The short host comes from `vars.RW_IMG_HOST`, which
  is now SET and verified live; it falls back to the request origin when unset, so
  previews and `wrangler dev` keep working. If that host ever stops answering, clear
  the var first; every picture prints blank otherwise. Do NOT drop the `.png` suffix
  to save 4 more: an unknown extension on a failed subresource is a fatal, whole-job
  error (above).
- **The width clamp may be dropped inside a fixed `<foreignObject>`, and nowhere else.**
  `max-width:100%` on a top-level carrier is field-verified: without it real pictures
  printed off the right edge, because the body is 240px. (It read "and not `PAPER_PX`'s
  263" until PAPER_PX was corrected to 240; the clamp still earns its place, since it
  also bounds a picture whose own intrinsic width exceeds the box.)
  Inside a `foreignObject` the containing block IS the frame and the tag already states
  that width, so it is a no-op worth 23 chars. `buildImageEmbed({framed:true})` is the
  only way to drop it, `buildTakeover` is the only caller, and a test asserts every
  carrier still clamps unframed. Don't "simplify" that flag away.
- **Field record of the blocked-terms list** (each block killed every picture until
  the carrier moved): `<object` → `<image` (SVG form) → `<img`. Still live as of
  Aug 2026: `<embed` (default, printed perfectly), `<input` (needs no file
  extension), `<iframe` (prints, but crops anything bigger than the box).
- `<embed>` / `<object>` fail **silently** on an extensionless URL: the message
  sends and the tape prints with a blank where the picture should be. `needsExt` on
  those entries drives a UI warning; don't make one of them the default without it.
- **`<g text-decoration>` inherits to child `<text>` on WebKit 534.34.** Measured: a
  `text-decoration` set on the shared `<g>` that `buildBigTextSvg` wraps a
  multi-line block in reaches every `<text>` inside it without repeating the
  attribute per line. This is what lets underline/strike/font-family ride one
  shared `<g>` instead of being duplicated onto each `<text>`; sharing it is a
  deliberate payload-budget decision (see the "shared `<g>`" test in
  `test/render.test.mjs`), not an incidental simplification.
- **Combined `text-decoration="underline line-through"` renders**, on both the
  `<text>` and `<g>` forms. There is no need to pick one or the other, or to emit two
  separate decorated wrappers.
- **`text-decoration:` renders on the rotated HTML `<span>`** (the sideways
  giant-text path). Same property, plain CSS declaration there rather than an
  SVG presentation attribute, next to the escaped `\66ont:` shorthand.
  It is a new literal `"text-decoration"` token in the payload and, per the
  arms-race history above (the blocked-terms list), the next plausible
  automod-filter target. If it ever gets blocked, look here first.
- **FIELD-CONFIRMED 2026-08-10: none of 0.4.0's new tokens trip the blocked-terms
  list.** robp pasted four probe messages into the channel's chat with Cheer-ready
  OFF. A non-cheer message never reaches the printer but still passes the filter,
  so this costs nothing and is the cheapest test available. All four went through.
  What that clears: `font-family="cursive"`, the combined
  `text-decoration="underline line-through"` in SVG attribute position, and the
  literal `text-decoration:` CSS declaration on the rotated span. Two of the four
  were unformatted controls of the same shape, so a block would have been
  attributable. Blocked terms apply whether or not the stream is live, which is why
  an offline paste is a valid test.
  **What it does NOT clear:** a filter printer-bot itself applies at render time,
  which only a real cheer would exercise. And the list is a moving target: this is
  a snapshot, not a guarantee. Re-probe with the same four messages after any
  suspected block; it is free.
  **Also not covered, and newer than that probe:** the Script and Papyrus entries no
  longer emit `font-family="cursive"` / `"fantasy"`; they emit `"Segoe Script,cursive"`
  and `"Papyrus,fantasy"`, which are new literal tokens. The multi-picture takeover
  emits `position:relative` / `position:absolute` in a `style=` attribute for the first
  time. Worth adding to the next free probe round.
  **0.10.0's tokens, and where each stands.** Already cleared by the one FIELD cheer
  (2026-10-01): `<b class=title>` (unquoted), `<span class="switch dialog-nav-button">`
  (quoted, two classes) and `</br>`. Never sent, so put them in the next free probe
  with a plain control of the same shape: `class=setting-description` and
  `class=setting-attribute` (Auto emits one whenever a ×0.9 / ×0.8 step wins, so an
  ordinary word can carry one); the app's exact tucked lead, i.e. a leading nbsp and
  the two-digit nonce inside the span (the span directly followed by `<b class=title>`
  with no `<br>` between already rode the field cheer, without the nbsp or a nonce); and
  the padded emote form
  (` Kappa Kappa <br> Kappa `), for which a free probe also answers the emote question
  outright: if Twitch chat itself draws the emote, Twitch recognised it, and
  printer-bot will get it in `data.emotes`. A free probe cannot show whether a class
  *prints* big. Only a real cheer can, which is what the Print size ruler is for.
- **All nine offered fonts are legible and distinct at 24px and 58px, at the
  printer's real 203dpi/1-bit dithering.** Checked on the real engine, not just
  in-browser.
- **NEVER OFFER A BARE CSS GENERIC AS A FONT-MENU ENTRY.** How `cursive`, `fantasy`,
  `serif` and `monospace` resolve is a property of the **streamer's machine**, not of
  anything this repo can measure, so a generic in the menu is a control whose result
  we do not know. FIELD-CONFIRMED 2026-08-10: the owner printed the two that were
  bare, and `Script` (`cursive`) came out as **Comic Sans MS** while `Fantasy`
  (`fantasy`) came out as **Impact**. Those are the standard Windows mappings, and both
  were already in the list two rows up, so the nine-font menu was really seven. No bench
  here could have caught it: macOS maps the same two generics to different faces
  (`fantasy` → Papyrus). The rule: **name a face that exists on the target box and keep
  the generic behind it as a fallback** (`Segoe Script,cursive`, `Papyrus,fantasy`), so
  the entry can never be worse than the bare generic was, and label the entry with the
  face it actually asks for. Ids never move; saved blocks reference them. `serif` and
  `monospace` stay bare only because Windows maps them to Times New Roman and Courier
  New, which duplicate nothing else in the list; that is a judgement, not an exemption.
  Cost, measured at the 491-character flagship case: Script +22 → **+35**, Fantasy/
  Papyrus +22 → **+30**.
  **Bench note: REPEAT EVERY FONT RENDER HERE BEFORE CONCLUDING ANYTHING.** Font
  resolution on this macOS wkhtmltopdf build is **non-deterministic on early renders**:
  identical markup run five times gives a mix of the requested face and the default one,
  as the font cache warms. Measured, same bytes each time: bare `Impact` came out stable
  across five runs in one session and flapping (169,784 / 178,683 / 169,784 / 178,683 /
  178,683 ink) in another, and the comma-list form flapped in the opposite direction.
  A one-shot local render is therefore not evidence about anything.
  (An earlier version of this note read the flapping as a *causal* rule: that bare
  family names fail here while comma-lists work. That was wrong, and it is recorded
  rather than deleted because it is exactly the shape of mistake this file exists to
  stop: a real observation, one sample deep, written up as a mechanism.)
- **Bold (700) and Black (900) are pixel-identical on Arial.** The markup differs
  (`font-weight="700"` vs `"900"`) but the rasters are **MD5-identical on the real
  engine**, at both 24px and 58px. Chromium agrees, but that half was checked by
  ink count (`4637 === 4637`), not by hashing the pixels. That is stated precisely
  because overclaiming the evidence here is how this file went wrong before. Arial
  has no true 900 face, so the renderer silently clamps 900 down to whatever its
  heaviest real weight is. `Arial Black`
  is a **separate font family**, not a weight of Arial, and is the actual escape
  hatch for a visibly heavier line. The app does not (and, without visibility into
  the streamer's font stack, cannot honestly) warn about this in the UI; see the
  weight-convention note below for what the code *does* encode.

### Settled for Giant type and the tuck (2026-10-01/02)

BENCH, unless marked otherwise: real wkhtmltopdf 0.12.6.1 (patched Qt, Linux), printer-bot's
exact flags, the document `tools/printerbot.mjs` builds through printer-bot's own sanitizer,
and Segoe UI metrics from a local copy that is not, and never will be, in this repo.

- **The rig's face is Segoe UI.** The engine walks the receipt's font stack and lands on
  it: `pdffonts` shows `SegoeUI-Bold` once Segoe UI is installed, and that is the face
  `.title`'s weight 900 gets. Without it the bench falls back to Liberation Sans (Arial
  metrics) and every height changes. On the field payload it changes the page count
  (one page against two). So treat a run without `--fonts` as the wrong font.
- **Font-size is rounded to a whole px** (246.512 → 247), and the line pitch is
  `ceil(1.0791·r) + ceil(0.2510·r)` for `r = round(px)` (Segoe's ascent 2210 and descent
  514 over 2048, each ceiled). That matched the measured pitch exactly at every level
  tried, with and without the shrink wrappers: 1.353em at L1, 1.410em at L3, settling to
  1.333em from L10 up. That is `giantLineH`. A flat 1.33em under-counts the small sizes,
  and Chromium's 1.338em at L3 is not the engine.
- **Capitals print at `round(px)` × 1434/2048 CSS px**, Segoe UI's cap height on the
  rounded font-size. Measured end to end (`payload.mjs | printerbot.mjs | rig.py
  --document --fonts`), flat-topped capitals: L14 3.805, L15 4.580, L16×0.8 4.392, L13
  3.164, L13×0.8 2.540 cm, against `giantCapCm`'s 3.798 / 4.576 / 4.391 / 3.168 / 2.538.
  Every one within 0.01 cm; the first formula (px × 0.70 / `PX_PER_MM` 3.75) said 3.835
  for L14. Round letters (O, S, G) ink about 3px higher and 3-4% taller, as round
  glyphs do. An emote at L10×0.9 (89px) inked a 189-dot square, 2.365 cm, one 203dpi
  dot from `giantEmoteCm`'s 2.355.
- **The small line is 23px.** That covers the lead line ("Cheer100 07", ended by the
  body's leading `<br>`) and the blank line one giant body leaves before another.
  Chromium says 21.3. A trailing `<br>` at the end of a message adds 0px. Without the
  leading `<br>`, untucked, "100 07" sits on the giant line's baseline, so it stays.
- **A blank line at the top of a chunk prints a giant-height blank**: +132px at L10, and
  396px of nothing above "D" at L16. One at the bottom collapses to a small line, but
  the old model still counted it a giant line tall. Hence the chunker's edge trimming.
- **The shrink wrappers work, and their light weight never reaches a glyph.** One
  `setting-description` / `setting-attribute` *outside* the nest gives innermost text of
  89.161 / 79.254px in Chromium (89 / 79 on the engine), still weight 900, uppercase.
  The wrapper's own 14.4px / 100 and 12.8px / 200 apply to no text, `<br>` or blank
  line. BENCH only: these classes have never been sent.
- **Width.** An earlier width table (Arial ×1.10, then an Arial/DejaVu average) sat
  *below* Segoe UI Bold on M, `-`, `'`, `&` and `/`. At its fit, "M&M M&M" wrapped to two
  lines on the engine (message 139px against a 76px estimate), and "MMMMM" inked to
  x 260.6, past the 256px body edge. `GIANT_W` = `round(max(Segoe UI Bold, Arial Bold) ×
  1.03, 3)` gives 0 overflows over every 1-3 character string of its keys in either font.
  The 3% also covers the whole-px rounding (27.65 → 28 is +1.3%).
- **The tuck.** The span is pinned at the page's top right, and the only corner ink is
  x 236.9-259.6, y 14.7-36.4 CSS px: the gem, its bottom 2px clipped. "100" and the
  nonce are clipped away completely, and the nbsp line has no ink. **Keeping the giant
  body's leading `<br>` under the tuck saves no tape**: the message stays at 156.1px,
  because the blank line is exactly as tall as the gem line was. Dropping it gives
  132.9px (-23.2px) and moves line 1 right 1.9px, because the nbsp (0.276em × 16 = 4.4px)
  now shares that line. Hence the packer's strip and `GIANT_TUCK_PX` = 5. **Except the
  emote layout**, whose lines open with a pad space that collapses only at a line start:
  stripped, line 1 followed the nbsp and its space printed (L10x0.9 "Kappa Kappa /
  Kappa": line 1 centred +14.2px from the page centre, line 2 -12.5px, a 26.7px skew).
  With the `<br>` kept (0.10.0), both rows sit at -12.8 / -12.5px, exactly where the
  untucked render puts them (the trailing-space shift below), and the gem is still in
  the corner; the message is then as long as untucked. Chromium gets
  `position:fixed` wrong for this: in a two-page PDF it repeats the box on page 2, and
  wkhtmltopdf does not. FIELD: the span rode a real cheer that printed giant letters;
  whether the gem was clipped was not judged.
- **Emotes.** Twitch reports an emote only when the name is a whitespace-delimited word
  of the raw message. Glued to a tag (`class=title>Kappa`, `Kappa<br>`) it is never in
  `data.emotes`, so the tape prints "KAPPA" in giant capitals sized for a 1em square
  (383px wide per line at L11 in Chromium; on the engine the ink runs to the page edge
  and is clipped). Hence the padding. QtWebKit 534
  **counts the trailing pad space when centring** a line that still fits, so the line
  shifts left by half a space (0.138em; -16.1px at L11). Chromium hangs the space
  instead. `giantLineEm` counts that space, so the fit stays honest. `.emote{height:1em}`
  draws an emote 16 / 33 / 69 / 143 / 247px square at depth 0 / 4 / 8 / 12 / 15
  (Chromium), and the model assumes square: a wide BTTV/7TV/FFZ emote is wider.
- **Page length is the DRIVER's, not wkhtmltopdf's 500mm (0.11.0, the field cut-off).**
  FIELD: a stacked Giant cheer printed only its first ~4 lines and the top of the 5th, cut
  at roughly A4 (~29.7 cm). wkhtmltopdf lays out on a 500mm page, but the physical printer
  stops at its Windows driver's paper length — commonly A4 (297 mm) for an 80 mm roll — and
  SumatraPDF's `-print-settings "noscale"` CLIPS the overflow rather than shrinking it. The
  bench CANNOT see this (it renders the 500mm page); it is what the **Receipt length**
  control exists to let each user set. So `HEIGHT_BUDGET` is no longer a fixed 1400: it is
  `heightBudget(mm) = floor(mm × 96/25.4 − 351)`, A4 → 771 px.
- **The fixed reserve beyond the body estimate is 351 CSS px.** MEASURED: at a fixed level,
  the inked page total = the app's per-body height estimate + 351, LEVEL-INDEPENDENT (held
  at L6/L10/L12/L14). It is the header (216px avatar for a real square Twitch 300×300, +
  "100 BITS" + sender) above the body, minus the 23px lead line already in the estimate,
  plus the footer (icon + date) below. 351 is exact for the square avatar; a (non-Twitch)
  portrait avatar hitting the 240px max would want ~375. Bracketed on the engine: body_est
  683 → 273.6 mm fits A4, 815 → 308.6 mm clipped; 771 sits between. End to end: `C O C K`
  fit1 came off A4 at 295.4 mm (one receipt), `HELLO` at 288.0 mm, a 13-letter word at a
  fixed L12 split into five receipts of ≤251 mm, none spilling to a second page.
- **The small stack word gap is a base line (~23px), not a giant blank line.** MEASURED
  (`I RAID RAID` at L7, per-word nests joined by a base `<br><br>`): the pitch within a
  word is 77px (one `giantLineH`), between words 100px — a +23px (`GIANT_GAP_PX`) gap, vs a
  giant blank line's full 77px. The packer's split-and-merge already produces this (two
  bodies meet at a base `<br><br>`), so the explicit `small` gap only wins where it packs a
  spaced phrase into one cheer at a bigger size; `giantPick` prefers `blank` on a tie, which
  keeps a spaceless word (`HELLO`) byte-identical at every length. A single-letter-word stack
  (`C O C K`) stays `blank` and character-cheap too at A4/typical lengths, but at a SHORT
  receipt (e.g. 150 mm) `small` correctly wins once the shrunk per-word nests both fit under
  500 AND save a cheer — the guarantee is "fewer cheers, tie to blank", not byte-identity.
  (The old reasoning, kept as the cautionary note it is: "about 1516px fits one 500mm page,
  so `HEIGHT_BUDGET` stays 1400" — true for the 500mm PAGE, but the printer never reaches
  500mm, which is the whole bug. The field payload P E N I S at 15 levels is a 1645px
  message that the bench spilled to a 2nd page at 500mm; the real rig had already cut it at
  A4.)
- **Don't measure geometry with JavaScript on the engine.** wkhtmltopdf runs scripts
  during `--javascript-delay` on a 0px-wide layout, which reported widths of 0 and a
  337px header. Measure from ink. A bench-only `outline` on `#receipt-content>div` takes
  no layout space, if you need box edges.

## Global constraints (payload and glyph rules: do not relax without an explicit request)

These come directly from verified, reverse-engineered constraints on the
receiving renderer (see the design spec for the full evidence trail). They are
not arbitrary style choices:

- **Single line, no newlines.** The payload is exactly one newline-free string.
  Twitch chat messages are single-line; no `\n`/`\r` survives delivery anyway.
- **Character budget: `MAX_CHARS = 500`** (Twitch's real per-message limit; the whole
  payload incl. the cheer token counts), counted by code points
  (`Array.from(s).length`), leaving headroom under Twitch's ~500-char cap. Over
  budget is **reported, never silently truncated**: truncation shears the grid.
- **Grid rows ship inside `white-space:pre`, and that is what makes spaces safe.**
  The old rule here was "the off cell is never a space, because HTML collapsing
  would shear the grid". That got solved a better way: every glyph body is wrapped
  in `<span style="white-space:pre;…monospace">`, so runs of spaces survive intact.
  The two ASCII tiers, now the glyph-art default, use a literal space as their
  lightest cell and print correctly. Keep the wrapper; that is the load-bearing
  part, not the choice of glyph.
  *(Amended 0.9.0: under the 2026-09-15 sanitizer the `style` is stripped, so ASCII's
  spaces collapse and the grid shears; the default tier is `cjk` since 0.9.0, whose
  uniform-width glyphs need no wrapper. The wrapper is still emitted and does no harm.)*
- **No `<`, `>`, or `&`** may appear in *glyph* output. None of the tier glyph sets
  include them; don't add a tier or ramp entry that does. (Big type, rotate, real
  pictures and, since 0.10.0, **Giant type** are markup modes and obviously emit tags;
  everything user-supplied that goes into them runs through `escapeHtml` /
  `escapeAttr` in the pure core. Giant type's tests prove it the blunt way: strip the
  known tags from a hostile body and no `<` or `>` may remain.)
- **A payload must never *lead* with `<`**: some sends get dropped outright on a
  leading angle bracket. When cheering, the `Cheer<N>` token leads; otherwise
  `LEAD_GUARD` (a non-breaking space) does. With the 0.10.0 tuck on, `LEAD_GUARD` leads
  and the token rides in the corner span right after it, so this still holds.
  `buildLead` is the only place a lead is built.
- **No color emoji / astral-plane codepoints.** The target renderer (old
  Qt-WebKit) has zero color-font support; these tofu. Stick to BMP glyphs with
  broad legacy-font coverage (Block Elements, Braille, curated CJK). Giant type puts
  the user's own text on the tape, so it enforces this on input: `giantClean` drops
  astral code points, ZWJ and the variation selectors, and the rest of the BMP
  Default_Ignorable set plus U+FFF9-FFFB and the control characters (the list is
  `GIANT_INVISIBLE`; arch item 17 spells it out), and the card names what was left out.
  (At giant size a tofu box is the size of a letter.)
- **The cheer token LEADS the payload.** This file claimed the opposite for a long
  time; the code is right. `packStackBodies` emits `Cheer<bits> <nonce> <html>`, for
  two reasons given in its own comment: the token and nonce survive any
  trailing-strip a bot or filter does to a long HTML blob, and a leading `Cheer…`
  guarantees the message doesn't start with `<`, which is the hard rule just above.
  When not cheering, `LEAD_GUARD` (a non-breaking space) leads instead. Don't
  "restore" a trailing token.
  *(Amended 0.10.0: the token leads, **or**, with the tuck on, it is the first thing
  inside the corner span right after `LEAD_GUARD`:
  `\u00A0<span class="switch dialog-nav-button"> Cheer100 07 </span>`. Both reasons
  above still hold. The token keeps a space on each side, so Twitch still parses a
  standalone `Cheer100` and charges for it, and printer-bot's cheermote pass still finds
  it, because it is the first `Cheer<N>` in the message.)*
- **The nonce is visible, never zero-width.** It exists to defeat a duplicate-
  message filter; an invisible/zero-width character is likely to be stripped by
  the same sanitizing behavior that rules out HTML injection.
- **Markup went out of scope, came back on field evidence, and the sanitizer has
  now cut most of it again.** The v1 spec rejected markup (see
  `docs/superpowers/specs/2026-07-05-block-glyph-art-generator-design.md`, §2) on
  the grounds that it depended on undocumented sanitization. Field evidence then
  showed printer-bot rendering raw HTML, so big type, sideways type and real
  pictures became markup modes. **The 2026-09-15 sanitizer (see the ⚠ banner at the
  top) vindicated the original warning:** it strips `<svg>`, every picture carrier
  but `<img class="emote"|"bits">`, and all styling — so Big Text's SVG, the rotate
  styling, the Takeover and the fake cheer no longer render, and ASCII glyph-art
  shears. **The rule the spec stated is now load-bearing again:** every mode needs a
  markup-free path behind it, and the ones that survive are exactly the markup-free
  ones — Hanzi tiling for text, the CJK glyph tier for pictures. The Takeover and
  fake cheer were the standing markup-only exception; under the sanitizer they
  simply have no surviving form, which is why the composer now flags them as
  non-printing rather than pretending otherwise.
  *(Amended 2026-10-01, two corrections. "All styling" was wrong: the sanitizer strips
  the `style` **attribute**, but `class` survives and carries every rule in nutty's
  inlined `global.css` and `contents/style.css` onto the paper (top banner). And "the
  ones that survive are exactly the markup-free ones" is no longer the whole list:
  Giant type survives as markup, built only from allow-listed tags plus a class. **The
  rule itself stands, and Giant type obeys it:** Hanzi tiling is its markup-free path,
  one select away. The class route fails quietly, so that backup is not optional.)*
- **Carrier tags: the tag for a real picture is DATA, not a hardcode — and right now
  there is no working one.** The blocked-terms list ate `<object`, then `<image`, then
  `<img`; the 2026-09-15 sanitizer independently stripped
  `<embed>`/`<input>`/`<iframe>`/`<object>` and a classless `<img>`. The only tag the
  sanitizer keeps is `<img class="emote"|"bits">`, and automod blocks `<img`, so
  **every entry in `EMBEDS` is `blocked: true` and `anyCarrierLive()` is false**
  (field-confirmed; see the ⚠⚠ banner at the top). `EMBEDS` still lists the surfaces
  and `buildImageEmbed()` is still the only place markup gets built; `imgemote` remains
  `EMBED_DEFAULT` as the entry to re-probe first, not as one that works. When a surface
  dies: mark it `blocked: true`, set `field` to which gate killed it, and bump
  `EMBED_V` if there is something live to migrate onto. Do **not** hardcode a new tag
  at a call site, and **before adding a candidate, prove it clears BOTH gates** — the
  sanitizer allow-list and the channel's blocked-terms list — with a field probe, not
  just the bench. (A bench-only pass is how a CSS-background carrier got written before
  `--no-background` was found to kill it, and the bench cannot see either gate.) The
  free probe is the cheapest tool here: send the candidate as a **non-cheer** message,
  which never reaches the printer but still passes the terms filter, and include a
  control of the same shape so a block is attributable. **Swapping to an allowed tag is
  the drill; obfuscating a blocked one is not** — see the banner.
- **Borrowed classes are DATA too (0.10.0).** `PB_CLASSES` is to printer-bot's
  stylesheets what `EMBEDS` is to tags: every class Giant type and the tuck use, and the
  declarations we rely on, live in that one table, and `classAttr` / `pbClass` /
  `pbPreviewCss` derive everything from it. Do not hardcode a class at a call site. When
  `npm run printerbot -- --check` (or a ruler print) says a row stopped working, apply
  THE RULE in the top banner *before* touching the row. An incidental rename is a
  one-row remap, after a free probe and a ruler print. A deliberate removal, or a
  channel blocking the form, is a stop: fall back to Hanzi and never cycle
  tag/quote/case variants. That stop condition is the difference between this table and
  the carrier drill above.

## Hard constraints: keep these true

These are the project's defining properties (shared with the sibling tools).
**Do not break them without an explicit request:**

> **Exception (added by explicit request):** an optional image backend.
> `src/worker.js` is a tiny Cloudflare Worker that serves the static site as before
> plus three routes: `POST /upload` (stashes an image in the `RW_IMG` KV namespace
> with a native 15-minute `expirationTtl`, 5 MB cap, image/* only), the image-serving
> routes (`/<hex>.png` at the root, and legacy `/i/<hex>`, matched by SHAPE via
> `imageKeyFor`), and `GET /px?u=<url>` (an image proxy; see below). `/upload` is
> called from the Image block's uploader **and** from the Takeover card's, in both
> styles; the returned URL feeds a real-picture payload built through the `EMBEDS`
> carrier table: `<embed>` by default, not `<object>`, which the blocked-terms list
> ate long ago.
>
> `/px` began as a Thermal-preview-only path and is no longer that: it also backs
> glyph-art decoding of a pasted URL and the debounced image-adjust bake, so it can
> fire from typing and from dragging a slider. The underlying reason it exists:
> `thermalize()` rasterizes the receipt by loading it as an SVG `<img>`, and an SVG
> loaded that way may not fetch *any* external resource, so a remote `<img>` inside
> the `foreignObject` never paints at all. The picture has to be inlined as a `data:`
> URI first, and reading a cross-origin image's bytes from JS is exactly what CORS
> forbids; the bytes come back through our own origin instead. `/px` is guarded by
> `isPublicHttpUrl()` (public http(s) only, no other scheme, no loopback/private/
> link-local host, redirects re-validated hop by hop), enforces image/* + the 5 MB
> cap, and is covered by `test/proxy.test.mjs`. **Without that guard it is an open
> relay / SSRF gadget. Do not loosen it.**
>
> These are the only sanctioned network calls / server-side pieces. **The honest
> privacy line:** Big Text is fully local (Giant type included: its emote preview is a
> labelled placeholder, never a fetch of the emote), and a picture picked from disk for
> glyph-art is decoded locally. Everything else touches the Worker: pasting an image
> URL sends it through `/px`, adjusting brightness/contrast re-uploads a baked PNG,
> and the uploaders POST the file. User-facing docs must say that plainly rather than
> claim nothing leaves the device. The constraints below hold for everything *except*
> those flows.

- **One file.** No build step, no framework, no external resources. System font
  stacks only: **no web fonts, no CDN, no external images** (the upload backend
  above is the sole exception, and only on the user's explicit action).
- **The shipped app stays zero-dependency.** "No dependencies" applies to what
  ships in `public/`: it must have **no runtime deps** and load nothing external.
  Dev-only tooling does **not** ship and does **not** violate this. Wrangler is
  a dev/deploy CLI (a `devDependency`), and the tests use only Node built-ins
  (`node:test`, `node:vm`, `node:fs`). Neither is bundled into `public/`. Do not
  add a runtime dependency, a `<script src>`, or any external fetch to the app,
  and do not split the single file to accommodate tooling.
- **Network calls go only to our own Worker, and there are no new ones.** Six
  `fetch` call sites in `public/index.html`, all same-origin: three `/px`
  (glyph-art decoding a pasted URL, Thermal preview inlining, the debounced
  image-adjust bake) and three `/upload`. Two fire without a dedicated click:
  **typing an image URL** and **dragging an adjustment slider**. Don't add a seventh, don't call a third party, and don't describe the app as making no
  network calls.
  **The preset expiry check is not one of them, deliberately.** `probeStackExpiry`
  asks whether an uploaded link still resolves by *loading it as an `<img>`*. That
  needs no CORS grant, adds no `fetch` call site, and tests the exact condition that
  makes the receipt print blank. If you ever "tidy" it into a `fetch`, you have added
  a seventh call site and a CORS problem in one move.
  **Nor is anything Giant type does.** The Emote layout invites a preview that loads
  the named emote from Twitch's CDN: that would be a seventh call site *and* a third
  party. It draws a dashed 1em square labelled with the name instead, and a browser
  test asserts no request leaves the page's origin. Fetching nutty's live stylesheets
  is something only the dev-only bench (`tools/printerbot.mjs`) does, never the app.
- **Storage:** `localStorage` holds exactly four keys: the control-panel
  settings (`rw_controls_v1`), the nonce sequence counter (`rw_nonce_seq`), the
  block composer's stack (`rw_blocks_v1`), and the saved presets (`rw_presets_v1`,
  added by explicit request in 0.6.0, spec §8). All wrapped in `try/catch` so
  sandboxed previews that block storage still render and run. Don't add a fifth
  without an explicit request. (0.10.0 and 0.11.0 added state without adding a key: the
  "Hide the cheer gem" checkbox is a `tuck` field inside `rw_controls_v1`, the Receipt
  length is a `receiptLen` field there, both absent-means-default, and a giant block's
  `giantLayout` / `giantSize` ride in `rw_blocks_v1` and presets like every other block
  field.)
- **Vanilla JS**, IIFE-wrapped, `"use strict"`, ES5-ish style (`var`, function
  expressions). Match the surrounding code's idiom when editing.
- **Privacy: state it accurately.** Big Text (Giant type included) and a
  locally-picked glyph-art picture never leave the device, and there are no analytics, accounts or third
  parties. Uploading a file, pasting an image URL, or dragging an adjustment
  slider *does* send data to our Worker. Preserve the no-third-parties property;
  don't let this drift back to "nothing is ever sent".

## Conventions & gotchas for editors

- Keep style/markup/script **inline in the one file**. Do not split into
  separate `.css`/`.js` assets.
- Known v1 limitations, accepted as-is unless a task says otherwise (this list is
  the record; there is no `.superpowers/` directory in this repo): `buildCensus`
  hardcodes its sample glyphs rather than deriving them from `TIERS`; no keystroke
  debounce (each keystroke still burns a control-settings `localStorage` write via
  `saveControls()`, though the nonce itself only advances on Copy); `TEXT_ROWS`/
  scale-to-fit height cap means very long big-text input can cramp at narrow
  column widths; `CHAR_ASPECT = 0.5` is a fixed magic constant for glyph
  aspect ratio, not measured per-font.
- Licensed under **MIT** (see `LICENSE`).
- **Two incompatible weight/italic conventions coexist, by shape, not by name.**
  `lineFmt(stored, defWeight, defItalic)` (takeover lines: `f1`/`f2`/`f3`) **materialises**
  its defaults: an untouched slot resolves to a concrete 900/700/400. Big Text
  (`block.fmt`) requires the opposite: an **absent** weight must stay absent, because
  `bigWeightFor` reads absent as the 800 sideways baseline, not 400. They only stay
  safely apart today because the two block shapes never mix (`f1/f2/f3` vs a single
  `fmt`). `lineFmt` is the obviously-named helper, so anyone wiring up a new text
  surface will reach for it first. **Never hand `lineFmt`'s output to the Big Text
  path**: it would silently drop every untouched sideways block from 800 to 400.
  Giant type (0.10.0) uses **neither** convention: it has no weight, italic or font
  controls at all, because `.title` sets weight 900 and the receipt's font stack picks
  Segoe UI. The card hides the formatting row and says so. Don't wire `lineFmt` or
  `block.fmt` into it, and don't add an italic or tag variant. That is THE RULE in the
  top banner, not a missing feature.
- **"Giant type" is not "Giant sideways".** Giant type (`render:"giant"`, 0.10.0) is
  nested `.title`, and it prints. "Giant sideways" was the rotated SVG/HTML Type render,
  and it has not printed since the sanitizer. Name new things so they can't be confused
  with the dead ones.
- **Every reader of a block's render or giant fields goes through `blockRender` /
  `giantOpts`**, in the card, `applyRender` and `renderBlockBodies` alike. Those fields
  arrive from presets and imported JSON, which `parsePresets` checks for shape and not
  for values, and a raw `block.render !== "hanzi"` test is exactly how the card and the
  payload would come to disagree.

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
dashboard) puts production *ahead of* `main` with no trace in git. The next merge
to `main`, however trivial, then silently **reverts production** to whatever
`main` still holds.

This has happened: prod ran the `stack-composer` build for two days while `main`
sat 22 commits behind it. Three Dependabot merges and a `.gitignore` merge each
auto-deployed `main` and rolled the live app back ~35 hours before anyone noticed.
"This PR only touches CI/docs, so the deploy is a harmless no-op" is **exactly the
reasoning that caused it**, and it is only true if prod already matches `main`.

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
assets) is what you think: `/px?u=http://127.0.0.1/x.png` returns **400** when the
proxy + SSRF guard are deployed, versus **404** on a build that predates `/px`.
Note that the Cloudflare API's "get worker code" can return a stale script; trust
a live probe over it.
- The real-world acceptance test for any change to the glyph engine is a physical
  **Census print** on the target rig (see README → "Tiers & the Census"). Unit
  tests prove the generation logic, not what actually comes off the printer.
  For Giant type it is the **Print size ruler**: one cheer, 1-13 at every size. Before a
  release, also run `npm run printerbot -- --check` (live CSS against `PB_CLASSES`).
  It is a canary, deliberately not in CI.
