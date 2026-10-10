# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this project is

**Receipt Wrecker** (repo `receipt-wrecker`, Cloudflare Worker `receipt-wrecker`, live at
`receipt.uwutoowo.com`) is a single-file, dependency-free web page. It turns a viewer's words
or a picture into a Twitch chat message that prints big on a streamer's thermal receipt
printer. The printer is driven by **SassyTP's printer-bot** (version 2.5.4, MIT,
<https://github.com/SassyTP/printer-bot>), a Streamer.bot action that draws every cheer on a
receipt page in headless Edge and prints a screenshot of it.

The bot prints a cheer in one of two ways, and the whole app follows from that:

- **High Roller** (the code calls it `"raw"`): a cheer of at least the streamer's High Roller
  threshold (default 25 bits; 0 turns High Roller off). The message is treated as HTML and
  passed through the bot's allow-list sanitizer, so inline styles print: big text, sideways
  text, glyph-art grids.
- **Plain**: any smaller cheer. The message prints as 16px text inside quote marks, markup
  and all. The app then builds every block in its plain form, Han tiling: the words or the
  picture drawn out of Han characters, in a grid that is nothing but plain text.

The user copies each part and pastes it into chat as a cheer. The literal `Cheer<N>` word in
the message is what Twitch charges.

Before 1.0.0 the app targeted a different bot (nutty.gg's printer-bot, printed through
wkhtmltopdf). Everything built for it was removed in 1.0.0; git history and
`docs/CHANGELOG.md` keep the record. Don't bring any of it back.

**Credit rule.** The preview runs SassyTP's own receipt page, vendored under its MIT licence.
Credit it ("the preview is drawn by SassyTP's printer-bot renderer, MIT"). Never use
SassyTP's name or logo as the name of this app, and never commit the Twitch, YouTube or Kick
logos (trademarks outside the licence).

## The target, with evidence

The facts below were read from `v/2.5.0/renderer.html` at commit
`b9f12b0cbaf680b01d4e72fb96b3d5e9aa0aa0ef` (renderer `VERSION` `202610090056`, line 368) and
from the action's C#, which ships in the same repo as the Streamer.bot import `import.txt`
(base64 + gzip; decode it to read the code). Line numbers are for that file at that commit.
Re-check them whenever the pin moves.

How a cheer prints:

1. Streamer.bot hands the action the cheer, and the action passes the chat `message` to the
   page untouched, the literal `Cheer100` word included. No emote or cheermote pictures are
   put in.
2. `EdgeRenderer` (C#) opens the receipt page in headless Edge and sets the viewport with
   `Emulation.setDeviceMetricsOverride`: `round(dots / 8 × 96 / 25.4)` CSS px wide, so 272 px
   on 80 mm paper (576 dots) and 181 px on 58 mm (384 dots), at deviceScaleFactor
   dots / width.
3. It calls `PrinterBot.render(event, options)` (API notes lines 338-361, `render` lines
   1883-1946). `options` = `{highRollerBits, highRollerBitsPerInch, highRollerMaxInches,
   hideLinks}` from the dock.
4. It screenshots the height `render()` returns, turns it grey with `(77R + 151G + 28B) >> 8`
   (`ToGray`), dithers it to 1 bit with `class Ditherer` (Floyd-Steinberg by default, Atkinson,
   or a plain `< 128` threshold; the two diffusion modes force grey ≥ 250 to white and ≤ 5 to
   black first) and sends it as an ESC/POS raster on a continuous roll. The dock calls the
   three dithers Detailed, Soft and Crisp (`PRINTER_OPERATION.md` line 59).

What the page decides:

- **High Roller or plain.** `isHighRoller` (lines 726-730): threshold > 0 and bits ≥ threshold,
  25 when no option arrives. The `TwitchCheer` handler (lines 1439-1449) sends a High Roller
  message to `sanitizeRich` and anything else down the plain path. The app mirrors the test in
  `printMode`.
- **The High Roller sanitizer.** `sanitizeRich` (lines 704-711) parses the message in an inert
  document and builds a new tree from allow-lists: `ALLOWED_TAGS` (447-449; `div`, `pre` and
  `br` are on it), `DROP_WITH_CONTENT` (452-454; script, style, iframe, object, embed, svg and
  more go with their content), `ALLOWED_CSS` (464-480; longhands only, because `copyStyle`
  (628) walks the CSSOM, which hands out longhands: font-*, line-height, letter-spacing,
  text-align, the white-space longhands, word-break, overflow-wrap, writing-mode,
  text-orientation, transform/rotate/scale/translate, width/height, margins, paddings,
  display, position, colours, borders), `CSS_VALUE_ALLOWED` (482-490; position only static,
  relative or absolute; a display allow-list) and `CSS_VALUE_FORBIDDEN` (492; `url(`,
  backslashes, `<`, `>`, `var(`, `attr(`, comments and more). `class` and `id` are dropped,
  except an img's `emote` or `bits` class. Pictures load only from the Twitch, Kick, BTTV, 7TV
  and FFZ CDNs (`TRUSTED_IMAGE_HOSTS`, 444) or as a data: PNG/GIF/WebP of at most 2000
  characters (438), never larger than 64px (437; `vetImage` 598, `clampImage` 619). Whatever
  it removes is a `security` note in `render()`'s result. The message lands in ONE
  `<div class="part raw">` (`show()`, line 1830) and inherits the receipt's Segoe UI
  16px/1.35, centred, black.
- **Plain.** `plainText` (lines 555-559) uses the message as text and cuts it at 500
  characters plus `…` (`MAX_PLAIN_CHARS`, 430). The part gets “ and ” from
  `.part.message::before` / `::after` (209-210) and `overflow-wrap: anywhere` (218-221, new in
  2.5.4). Markup prints as text.
- **Geometry.** `#receipt-container` (lines 27-40): padding `0 14px 14px`, `font-family:
  "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif`, 16px, line-height 1.35,
  centred. A message therefore has the page width less 28px: **244 px on 80 mm, 153 px on
  58 mm**. One line of plain text is **21.6 px**.
- **The message box.** `#receipt-content` (157-162): `overflow: hidden; contain: paint;
  max-height: 1600px`. `highRollerMaxHeight` (741-753) and `show()` (1819-1826) apply the
  streamer's limits to High Roller messages only: bitsPx = bpi > 0 ? max(1, floor(bits / bpi
  × 96)) : none; capPx = maxIn > 0 ? max(1, floor(min(maxIn, 40) × 96)) : none. With no cap
  the box is min(bitsPx, 1600), or 1600. With a cap it is bitsPx when that is smaller, else
  capPx, and the 1600 ceiling no longer applies. A message cut by either setting fades its
  last 40px (`.cut`, 179-182) and `render()` reports it as `trimmed` (1914-1933). The 1600
  ceiling on its own cuts **hard**, with no fade and no report.
- **Receipt height** is capped at 5000 CSS px (`MAX_RECEIPT_HEIGHT`, 373, applied at 1943).
- **The page's own policy** (CSP, line 7) runs only the renderer's script and connects only
  to two avatar lookups. A `userName` in the event starts an avatar lookup; the app never
  sends one.

The app mirrors these in `PAPERS` / `paperSpec`, `BASE_PX` / `BASE_LH` / `LEAD_LINE_PX`,
`CONTENT_CEILING_PX`, `contentLimitPx` (a line-for-line mirror of `highRollerMaxHeight` plus
`show()`), `printMode` and `forkDither` (a port of `class Ditherer`).

## The field record: this channel's chat filter

Chat sits between the app and the printer, and a channel's moderators decide what gets
through. What is known about the channel this was built for:

- **The older record (nutty.gg era).** The blocked-terms list ate `<object`, then `<image`,
  then `<img`, one after another, as the old app offered each as a way to carry a picture. The
  `<img` block was confirmed on 2026-09-15 with a control message.
- **2026-10-10, the channel owner's report.** That blocked-terms list is unchanged, and a
  paste test whose message carried an `<img` tag (an emote picture after a styled div) was
  held by AutoMod. So `<img` is still blocked, and `<object` and `<image` are presumed still
  blocked.
- **Not known.** Whether the list blocks anything the 1.0.0 forms use (`<div`, `<pre`, `<br`,
  `style=`). Nobody has said so. Don't change the design on a guess: the free chat test
  (Cheer-ready off) is how a user finds out.

What follows from that, as rules:

- No builder emits `<img`, `<object`, `<image`, `<embed`, `<iframe`, `<svg` or `<input`, in
  any letter case. `test/tags.test.mjs` checks every builder and both probes at 80 and 58 mm,
  with hostile input, and checks the positive side too: the only tags sent are `div`, `pre`
  and `br`, and the only attribute is `style`.
- There is no emote or data: picture feature. An uploaded picture prints only as glyph-art.
  The Real picture card says so plainly ("SassyTP's bot only prints pictures from emote
  servers, and this channel's chat filter blocks the picture tag…") and offers Glyph-art.
- No example, probe or doc snippet contains an `<img` tag. Naming the blocked token in this
  record is the only exception.

### THE RULE

A channel blocking a form is the moderators saying no.

- **Literal tokens only.** Never obfuscate a token: no case games, entities, spacing,
  zero-width characters or CSS escapes.
- **If a form is blocked, fall back to the plain form** (Han tiling). Never cycle variants,
  and never swap in another tag or structure to get the same effect past a block. The UI
  must never suggest either.
- **The words, too.** Stack (one letter a line), sideways text and Han tiling take a word
  apart on the paper, so a word filter never sees it as typed. That is a side effect of
  fitting the paper, not a feature: never describe or advertise it as a way past a filter.
  If chat holds a message for its words, that is the channel's moderation working; don't
  respace, split or rework the words to get them through, and don't build anything that does.
- **Every user character that goes into markup goes through `escapeHtml` / `escapeAttr`.**

## The one file that matters

**[`public/index.html`](public/index.html) is the entire application**: inline `<style>`, one
inline `<script id="rw-app">` (vanilla JS, IIFE, `"use strict"`), and after it the vendored
SassyTP receipt page as an inert `<script type="text/plain" id="sassytp-renderer">` block
between `BEGIN` / `END vendored` comments. Edit the app's script for behaviour changes. Never
edit the vendored block by hand: `tools/vendor-renderer.mjs` writes it (see "The preview").

`src/worker.js` is the other piece of shipped code: a small Cloudflare Worker that serves the
static site plus `/upload`, the image-serving routes and `/px`. It is `main` in
`wrangler.jsonc`. `test/proxy.test.mjs` and `test/imgpath.test.mjs` import it directly.

Everything else is tests, tools, documentation or deploy config.

## Repository layout

| Path | Role |
|---|---|
| `public/` | The deployed site. Cloudflare serves only this directory. |
| `public/index.html` | The app, plus the vendored renderer block. |
| `public/llms.txt`, `robots.txt`, `sitemap.xml` | Ship with the site. `llms.txt` describes current behaviour; keep it current. |
| `src/worker.js` | The Worker: static assets, `POST /upload`, `/<hex>.png` and legacy `/i/<hex>`, and the `/px` image proxy. **Byte-identical since before 1.0.0, by the owner's decision.** Its own header comments still describe older uses (a picture carrier, a Thermal-preview proxy); the docs here describe what the app uses it for now. |
| `wrangler.jsonc` | Workers config: `main`, the two custom domains in `routes`, the `RW_IMG_HOST` var, the `RW_IMG` KV binding. Also byte-identical. |
| `package.json` | Dev-only: `npm test`, `npm run test:browser`, `npm run payload`, `npm run bench`, Wrangler `dev` / `deploy`. Version 1.0.0. No runtime deps. |
| `test/` | Node `node:test` suite: extracts the app's script and unit-tests the pure core. |
| `test-browser/` | Playwright tests of the real page (`npm run test:browser`), including the MANDATORY contract test against the vendored renderer. Not part of `npm test`. |
| `tools/forkbench.mjs` | The bench: renders a message through SassyTP's real receipt page (pinned commit) in Chromium and dithers it with the C# Ditherer port. |
| `tools/payload.mjs` | Builds a message with the app's own core, for the bench. |
| `tools/vendor-renderer.mjs` | Writes (or `--check`s) the vendored renderer block in `public/index.html`. |
| `.github/workflows/ci.yml` | CI: install, `npm test`, the browser suite, `wrangler deploy --dry-run`, on push/PR to `main`. Offline: no tool that fetches runs there. |
| `.github/` | CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue and PR templates, dependabot. |
| `docs/CHANGELOG.md` | Release notes. Entries describe the state at their release. |
| `README.md` | Human-facing overview. |
| `.gitignore` | Wrangler/env files, `node_modules/`, `package-lock.json`, `.claude/`, `.playwright-mcp/`, and **`.render/`**, where the bench writes everything and caches SassyTP's files. |

## How to run / develop

There is no build step. Open `public/index.html` in a browser, or:

```sh
npx wrangler dev      # local preview of public/ plus the Worker
npx wrangler deploy   # publish (normally Workers Builds does this from main; see Deployment)
```

Edit `public/index.html`, reload. Opened from disk the app works except the flows that need
the Worker (pasting a cross-origin picture link, uploads, the adjustment bake).

## Architecture

### Pure core and browser glue

Everything lives in the one IIFE. It is split in two, and the split is what makes it testable:

- **The pure core** (top of the script down to the `BROWSER GLUE` marker): plain functions,
  no DOM. Text, settings or a finished glyph grid in; strings and Body objects out.
  Unit-tested.
- **The browser glue**, inside `if (typeof document !== "undefined" && document.getElementById)`:
  canvas rasterising, cards, the preview, persistence, `init()`. It only runs after
  `DOMContentLoaded`, which the null-DOM test sandbox never fires.

**Placement rule.** New pure-core code goes in as plain `function` declarations OUTSIDE the
guard, before the `BROWSER GLUE` marker. A function declaration inside the guard is
block-scoped in strict mode and cannot reach `module.exports` at the end of the IIFE; glue
that has to be exported (only `designTTextGrid` and `glyphGrid`, for the browser tests) is a
`var name = function …` expression inside the guard.

An inert hook at the end (`if (typeof module !== "undefined" && module.exports)`) hands the
test harness **131 keys**. Regenerate the list instead of trusting this one:
`node -e 'import("./test/_harness.mjs").then(({loadCore})=>console.log(Object.keys(loadCore())))'`

`TIERS`, `getTier`, `sampleLuma`, `quantizeTone`, `ditherFloydSteinberg`, `lumaToDots`,
`packBraille`, `render`, `payloadLength`, `withinBudget`, `MAX_CHARS`, `makeNonce`,
`cheerBits`, `PAPERS`, `paperSpec`, `BASE_PX`, `BASE_LH`, `LEAD_LINE_PX`,
`CONTENT_CEILING_PX`, `PX_PER_INCH`, `MAX_CAP_INCHES`, `HR_DEFAULT`, `HR_MAX`,
`hrThresholdOf`, `bitsPerInchOf`, `maxInchesOf`, `printMode`, `buildMode`, `contentLimitPx`,
`LEAD_GUARD`, `buildLead`, `leadLength`, `buildTrail`, `trailLength`, `stackContext`,
`packStackBodies`, `BIG_MIN_PX`, `BIG_MAX_PX`, `BIG_LH_CAPS`, `BIG_LH_TEXT`, `BIG_CAPS_SAFE`,
`BIG_W`, `BIG_W_DEFAULT`, `BIG_W_EMOJI`, `BIG_LAYOUTS`, `BIG_CAP_EM`, `MM_PER_PX`, `bigCapCm`,
`bigOpen`, `BIG_CLOSE`, `bigClean`, `bigGraphemes`, `bigGraphemesFallback`, `bigLineEm`,
`bigFitPx`, `bigLineHeight`, `bigLines`, `bigSizeOf`, `bigOpts`, `bigCheerCount`, `bigPlan`,
`bigFit`, `buildBigBodies`, `bigReport`, `cheerWords`, `CHEER_GLOBALS`, `SIDE_DIRS`,
`SIDE_MIN_PX`, `SIDE_MAX_PX`, `sideOpen`, `sideWidthPx`, `sideLines`, `sideSizeOf`,
`sideOpts`, `sidePlan`, `sideFit`, `buildSideBodies`, `sideReport`, `GLYPH_FORMS`,
`glyphForm`, `GLYPH_ASPECT`, `CJK_COLS_MIN`, `CJK_COLS_MAX`, `glyphCols`, `gridRows`,
`cjkGridK`, `monoK`, `brailleFontPx`, `glyphAspect`, `buildCjkGrid`, `buildMonoGrid`,
`buildBrailleGrid`, `buildGlyphBodies`, `HAN_CELL_PX`, `HAN_LIGHT`, `hanziCols`, `designTHeader`,
`designTPictureCols`, `buildDesignT`, `buildDesignTPicture`, `buildHighRollerProbe`,
`buildPlainProbe`, `escapeHtml`, `escapeAttr`, `PRESET_V`, `cleanBlocks`, `isMintedImageUrl`,
`presetImageUrls`, `makePreset`, `serializePresets`, `parsePresets`, `upsertPreset`,
`freePresetName`, `migrateBlocks`, `migrationRewrites`, `migrationNote`,
`MIGRATION_BACKUP_NAME`, `TEXT_RENDERS`, `blockRender`, `giantLevelPx`, `THERMAL_DITHERS`,
`normalizeControls`, `hanziWeightOf`, `GLYPH_TIERS`, `glyphOpts`, `modeNotice`, `forkDither`,
`previewEvent`, `previewVerdict`, `designTTextGrid`, `glyphGrid`.

### The pure core, section by section

**Glyph basics.** `TIERS` has five tiers, in this order: `ascii`, `asciifull`, `safe` (blocks
░▒▓█), `cjk` (a 41-step Han density ramp from 丶 to 鬱) and `braille`. `sampleLuma` downsamples
RGBA to a luma grid (alpha over white); `quantizeTone` maps luma to a ramp;
`ditherFloydSteinberg` diffuses to the ramp's depth; `lumaToDots` + `packBraille` pack 2×4 dots
a character. `render` flattens a grid; `payloadLength` counts code points; `MAX_CHARS` is 500,
Twitch's real limit for the whole message.

**Bits and the nonce.** `cheerBits(b)` is the only validation of the bits: any whole number
from 1 up, else 100. There is no floor of 100 anywhere: one would make the Bits control say 25
while the payload said `Cheer100`. `makeNonce(i)` is two visible digits.

**The target and the streamer's settings.** `paperSpec(mm)` → `{mm, cssWidth, contentW,
dots}`: 80 → 272 / 244 / 576, 58 → 181 / 153 / 384. `hrThresholdOf` (0..1,000,000, junk → 25),
`bitsPerInchOf` (> 0 else 0), `maxInchesOf` (0 < x ≤ 40 else 0). `printMode({cheer, bits,
hrThreshold})` is `"raw"` when cheering and the threshold is above 0 and reached, else
`"plain"`. `buildMode` is what the app builds: `printMode` when cheering, and `"raw"` with
Cheer-ready off (a free chat test of the High Roller markup). `contentLimitPx` →
`{px, by: "ceiling" | "bits" | "cap", fades}`.

**The lead and the trail.** A High Roller message starts with a lead the packer owns:
`buildLead({cheer, bits}, nonce)` gives `Cheer<bits> ` (plus the two repeat digits when that
option is on) or, not cheering, `LEAD_GUARD` (U+00A0, a non-breaking space). It prints as one
21.6px line above the first body. A message must **never start with `<`** (some sends that do
are dropped), so there is no "hide the cheer word" option: it would need a leading tag.
`leadLength(opts)` is what to reserve, with or without the nonce (`noNonce`). A **plain part**
carries its token LAST instead: `buildTrail` → ` Cheer<bits>[ NN]` (nothing when not cheering);
`trailLength`. Why last: printed as text, a leading `Cheer100 ` would share line 1 with the
opening quote mark and shift every row of the grid; at the end, the closing quote rides on
the token's own line. The old reasons for a leading token (the previous bot's trailing strip,
a leading `<`) don't apply to plain text, which starts with a Han glyph.

**`stackContext(o)`**: everything a stack is built against, in one object, so the body
builders, the packer and the card labels read the same numbers: `{mode, paper, paperMm,
contentW, limit, room, heightPx, budget, trail, cheer, bits, noNonce}`. `room` (= `heightPx`)
is the box less the lead's 21.6px line; `budget` is 500 less the lead. `o.mode` overrides the
mode (the probes and the card labels use it). It can be handed to `packStackBodies` as is.

**`packStackBodies(bodies, opts)`**: Body = `{html, chars, heightPx, joinPx?, alone?}`.
Greedy: keep adding to the current part while the characters (500 less the lead) and the
height (`opts.heightPx`, default 1600 − 21.6) both hold; a single body always gets at least a
part of its own (over-budget is warned, never truncated). Each part gets one lead (and one
nonce, from `opts.nonceFn` when the repeat number is on). `joinPx` is height a body adds only
when it follows another body in the same part. A body with `alone: true` (Design T) becomes a
plain part: no lead, `payload = html + trail`, never shared. Empty bodies (a block of only
invisible characters) never open or close a part, so no part is ever the lead alone. Parts
report `{payload, lead, trail, chars, heightPx, leadPx, contentPx, bodies, nonce, alone?}`;
`contentPx` is the height the bot's message box gets.

**Big text (High Roller).** One literal shape:
`<div style="font:700 <PX>px/<LH> Arial">line 1<br>line 2</div>`; upside down appends
`;rotate:180deg`. The browser expands the shorthand into longhands, and the bot's sanitizer
keeps weight, size, line-height and family with no security notes (the resets it drops change
nothing that prints).
- **Arial Bold is pinned.** The receipt's own face is Segoe UI, which the bench cannot
  measure; Arial Bold's advances are exact on the bench (Liberation Sans Bold shares them) and
  on the streamer's Windows. Never weight 900 or a nested `<b>`: that asks for a Black face,
  which no table here covers.
- `BIG_W`: case-aware Arial Bold advances in em (the payload is never uppercased). Unknown
  characters count `BIG_W_DEFAULT` 1.0 (errs wide); an emoji grapheme counts `BIG_W_EMOJI` 1.3
  (Segoe UI Emoji's advance on the rig is unmeasured).
- Line height: `.8` only when every line matches `BIG_CAPS_SAFE`
  (`/^[A-PR-Z0-9 .!?'"&#:\/+\-]*$/`), else `1.15`. Lowercase, Q, the comma, the semicolon,
  accents and emoji have ink below the baseline that `.8` clips.
- Width: a line may use `bigFitPx(contentW, glyphs)` = contentW − 2 − 0.5 per glyph (margin for
  the rig's rounding). Height: lines × px × LH, within 0.15px on the bench.
- `bigClean` drops what prints nothing (`BIG_INVISIBLE`: the BMP Default_Ignorable set, the
  C0/C1 controls, U+FFF0-FFFB) but keeps emoji with their joiner and presentation selectors
  (Edge draws colour emoji; they dither to grey dots). CR, CRLF, U+2028/2029 → newline; U+2800
  → space. It reports what it dropped. `bigGraphemes` uses `Intl.Segmenter` with a fallback.
- `bigLines(text, layout)`: `stack` is one grapheme a line with each whitespace run as one
  blank line (a word gap); `lines` and `each` keep the lines as typed.
- Layouts (`bigOpts`): `auto` (tries `lines` and `stack`; a layout whose letters are cut off
  never wins, then a clean one, then the bigger type when both fit one cheer, else the fewer
  cheers, ties to `lines`; never picks `each`), `lines`, `stack`, `each` (every line its own
  size and line height; an explicit px acts as a cap). Sizes (`bigSizeOf`): `fit1` (the
  biggest that fits ONE cheer; failing that, the fewest cheers, then the biggest), `width`
  (fill the paper, any number of cheers) or a whole px 20..400.
- `fit1` is a binary search (`bigSearch`) that a test checks against a linear scan on 450
  cases. A size whose chunks are `over` (one chunk longer than a message can be) or `tall`
  (taller than the box) ranks below every size without.
- A stack tries two word-gap forms and keeps the one with fewer cheers, ties to `blank`:
  `blank` (one div, a gap is a blank line of the type's height) and `small` (a div per word, a
  gap is a bare `<br>`, 21.6px).
- **Chunking** is on height (≤ room) AND characters (≤ budget − 4); it prefers to break at a
  blank line and trims blank lines from both edges of a chunk. A chunk that follows a word gap
  opens with `<br>` (`joinPx` 21.6): after the lead's text it costs nothing, after another
  body it keeps the words apart.
- `bigCheerCount` counts parts with the packer's own greedy test, because two chunks often
  share a part: chunks are not cheers.
- Upside down, the chunks go out last first and the divs inside a chunk reverse, so the tape
  reads in order once turned over.
- `bigPlan` makes the decision without markup (the card labels use it), `bigFit` returns it as
  data, `buildBigBodies` builds the bodies (each with a `big` record), and `bigReport` writes
  the card's plain-language note: capitals in cm (`bigCapCm` = px × 0.716 × 25.4 / 96 / 10),
  cheers and bits, too wide, too long to send, taller than the box (`boxWords` names the
  limit), invisible characters dropped, emoji print grey. `cheerWords` flags standalone words
  shaped like a cheermote (`Kappa50`); the note is flat for Twitch's global prefixes
  (`CHEER_GLOBALS`) and hedged for anything else, since a channel's own are unknowable.

**Sideways (High Roller).** One literal shape:
`<div style="writing-mode:<DIR>;font:700 <S>px/<LH> Arial;white-space:nowrap;margin:auto">line 1<br>line 2</div>`.
- `down` = `vertical-rl` (letter tops toward the right edge: turn the receipt anticlockwise to
  read; works on every Edge). `up` = `sideways-lr` (tops toward the left edge: turn it
  clockwise; needs Edge 132 or newer on the streamer's PC). Each typed line becomes a column;
  line 1 reads on top once the tape is turned.
- `writing-mode` turns the layout box itself, so the run's length is real height inside the
  bot's box and the bot's length check sees it. A transform-only rotation reserves no space and
  is cut off at both ends.
- Width rule (`sideWidthPx`), from Arial Bold's metrics: the outer columns may reach E =
  contentW / 2 − 6 from the centre. Capitals-safe lines at LH .8: floor(E / (0.4N − 0.0305)),
  at most 280 × contentW / 244; anything else at LH 1.15: floor(E / (0.575(N − 1) + 0.6)), at
  most 193 × contentW / 244. On 80 mm that is 280 / 150 / 99 / 73 / 58 px for 1-5 lines of
  capitals. The comma, semicolon and Q are not capitals here (their tails clipped at the paper
  edge in review).
- Length = S × the line's em width + 0.5 px a glyph: an upper bound (kerning makes the real run
  1-18px shorter on the bench).
- A long line is cut into segments at word boundaries, by height and by an equal share of the
  characters; body k takes segment k of every line, and an empty column holds a U+00A0 so the
  others don't move. `up` sends multi-part runs last first. Sizes: `fit1`, `width`, px 20..300.
  `sidePlan`, `sideFit`, `buildSideBodies`, `sideReport` as for big text.

**Glyph-art (High Roller).** The canvas work stays in the glue; these take a finished grid.
The tier picks the form (`GLYPH_FORMS`):
- `cjk` → **R1** `<div style=width:<C>.2em;font-size:<K>vw;line-height:1>` + the cells, no
  `<br>` (the row breaks itself at C cells; the .2em slack lets C fit and not C+1). K =
  floor(100 × 152 / (1.81 × (C + 0.2))) / 100. C is 12..30. vw is the page width, so the same
  message fits both papers.
- `ascii`, `asciifull`, `safe` → **R4** `<pre style="font:<K>vw/1.2 'Courier New';margin:0">`
  rows joined by `<br>`, each row escaped. Courier New is 0.6em on the rig and the bench; `<pre>`
  keeps the ASCII ramps' spaces. K = floor(100 × 152 / (C × 0.6 × 1.81)) / 100. C is 8..48. The
  blocks tier shows thin seams between rows at line-height 1.2 on the bench.
- `braille` → **R6** `<div style=font-size:<F>px;line-height:<F+2>px>` rows joined by `<br>`,
  F 6..12. The rig's Braille face is unmeasured (Courier New has none), so the card says it
  needs a test print.
- `glyphCols` clamps the columns per form and paper; `gridRows` at `glyphAspect(form, cols,
  paperMm)` gives the rows: `GLYPH_ASPECT` (cjk 1, mono 0.5, plain 16 / 21.6), and for Braille
  0.733F / (F + 2), which follows the font size (sampled square, a round picture printed 1.6 to
  1.8 times too tall). `glyphGrid` and `tools/payload.mjs` both size the rows this way. Every grid is banded into bodies by characters
  (the tags repeat in each band) and by height (the room).

**Plain: Design T (Han tiling).** Below the threshold the bot prints text: 16px, a line every
21.6px, centred, in quotes, wrapping anywhere. A Han glyph is exactly 1em, so a line holds
C = floor(contentW / 16) = **15 on 80 mm, 9 on 58 mm** (`hanziCols`). `buildDesignT(grid,
opts)` makes that a grid with no markup at all: `<header of 丶><row 1>…<row R> Cheer<bits>[ NN]`.
- Every row is exactly C cells (padded with 丶 or cut), so the paper's own wrapping makes the
  rows. Never a space, Latin letter or U+3000 inside the grid.
- The header puts the opening quote on a line of its own: on 80 mm the quote plus 15 glyphs is
  wider than 244px, so the plain header is 14 cells; on 58 mm the quote plus 9 fits, so it is
  9. In a High Roller cheer or a free test (no quotes) it is a full C (bench-checked).
- The token goes last, after a space. Each part rides **alone** (any text before the grid
  shifts every row) and repeats the header and the token. Rows per cheer =
  min(floor((500 − trail − header) / C), floor(limit / 21.6) − lines for header and token):
  31 on 80 mm, 53 on 58 mm. Height = (header + rows + token line) × 21.6.
- Text: the glue's `designTTextGrid` draws the text rotated 90° clockwise down a column C cells
  wide (cells 16 × 21.6, so letters keep their shape), quantized to the cjk ramp without
  dither. It reads by turning the receipt anticlockwise. Pictures: `buildDesignTPicture`
  frames C − 2 cells with a 丶 column each side, which absorbs a one-cell slip if the quote is
  wider than expected.

**Probes.** The app cannot see the streamer's threshold, so two one-cheer tests answer it on
paper. Each returns `{bits, mode, bodies, note}` and goes through the normal packer as a
one-part stack.
- `buildHighRollerProbe`: exactly the threshold. BIG at 60px, MMMMM sized to the width rule
  (does the right edge survive?), "jog" at LH 1.15 (descenders), BIG upside down, and UP in
  `sideways-lr` (does the streamer's Edge draw it?). With High Roller off it says so and the
  glue offers no Copy.
- `buildPlainProbe`: one bit under the threshold (1 bit when High Roller is off): a Design T
  grid with HI in block letters and a row of the ramp's tones. When the threshold is 1, every
  cheer is High Roller and it says there is no plain test.

**Migration (saved work from before 1.0.0).** `migrateBlocks(blocks)` is pure, idempotent and
decided by shape, not a version stamp; it never mutates its input and never drops the user's
words.
- A **takeover** (any of its three saved shapes: the item list, the Blank style's
  `picture`/`l1`-`l3`, the Fake-cheer style's `avatar`/`cBits`/`cName`/`cNote`) becomes one Big
  text block per line (`bigLayout: "lines"`, `bigSize: "fit1"`; a `fmt` rides along unused)
  and one Glyph-art Image block per picture. An empty takeover is dropped. Every block made
  from a takeover gets a **fresh id** above every id in the stack (`removeBlock` filters by
  id, so a shared id would delete two blocks).
- An **old text block**: Giant type (`render: "giant"`) → big text, layout kept (the Emote
  layout → lines), level n → `giantLevelPx(n)` = round(16 × 1.2ⁿ) px (constants hardcoded,
  n clamped 1..18, then 20..400). Type, or no render, by `orient`: 0 → big text (lines, fit1),
  180 → the same with `bigFlip`, 90 → sideways down, 270 → sideways up. The old fields
  (`giantLayout`, `giantSize`, `orient`, `rotateLen`) go; `size`, `cols` and `fmt` stay, unused.
  Han tiling keeps its render.
- An **image block** loses `renderAs` and `embedV` (the old carrier pick).
- `migrationRewrites` is true when a takeover or an old text block is present.
  `migrationNote` writes the one-time note. `MIGRATION_BACKUP_NAME` is `"Before 1.0.0"`;
  `freePresetName` never takes a name the user already has.

**App state, read through sanitizers.** Settings and block fields arrive from storage, presets,
imported JSON and form controls (as strings), so everything reads them through these:
`normalizeControls` (the `rw_controls_v1` fields: `cheer` (default on), `bits` (100),
`hrThreshold` (25), `bitsPerInch` (0), `maxInches` (0), `paperMm` (80), `nonce` (off; only an
explicit `true`), `thermalView` (off), `thermalDither` (`floyd`); unknown fields are ignored, so
the next save drops them), `blockRender` (`big` | `sideways` | `hanzi`, junk → `big`),
`bigOpts`, `sideOpts`, `glyphOpts`, `hanziWeightOf` (400 or 700). `modeNotice` is the notice
above the parts (a free test, or why the stack prints plain and how to change it).
`forkDither(rgba, w, h, outWidth, mode)` is the C# Ditherer port (integer arithmetic and
arithmetic shifts as in the C#, the ≥ 250 / ≤ 5 clamps, transparent pixels over white).
`previewEvent` / `previewVerdict` are the app's half of the preview (below).

**Presets.** `makePreset` deep-copies (a preset outlives the stack it came from);
`parsePresets` validates untrusted JSON and says what is wrong; `upsertPreset` replaces by
name; `cleanBlocks` (shared with `saveBlocks`) strips `_`-prefixed runtime fields;
`isMintedImageUrl` matches only this Worker's own upload links, by shape, across all three
generations; `presetImageUrls` walks a stack's picture links.

### The browser glue

- **Rasterising.** `renderColumn` draws one line of text rotated 90° clockwise in Arial (400 or
  700: 600, 700 and 900 rasterise identically, so Han tiling offers Regular and Bold),
  measured from its real ink box and scaled uniformly; `textColumnsLuma` stacks the lines down
  the feed; `rasterizeImage`; `computeGrid(kind, tier, o)` samples with `o.cellAspect` (text)
  or `o.charAspect` (images) so the cells keep the picture's shape.
- **Blocks to bodies.** `renderBlockBodies(block, ctx)`: a Real picture → nothing; a Glyph-art
  picture → `glyphImageBodies` (decoded once into `block._img`; `glyphGrid` samples it for the
  tier's form, or for Design T in plain mode); text → `hanziBodies` when the render is `hanzi`
  or the stack is plain, else `buildSideBodies` / `buildBigBodies`. `packStack(blocks, opts)`
  builds every block against ONE `stackContext(opts)` and packs with that same object, and
  stamps `blockId` on every body so a card can find its own parts.
- **Settings.** `getSettings` reads the panel through `normalizeControls`; `stackOpts(extra)`
  adds `noNonce` and any probe override. `syncModeUi` writes the Bits hint for the current
  threshold; `syncNonceUi` disables (doesn't uncheck) the repeat number without Cheer-ready.
  `saveControls` writes exactly `normalizeControls`' fields; `restoreControls` reads them back.
- **Cards.** `textCard`: Render select (`.sel-render`), then Big (`.sel-layout`, `.sel-size`,
  `.chk-flip`), Sideways (`.sel-dir`, `.sel-side-size`) or Han tiling (`.sel-weight`). Every
  layout and size option is labelled with what it would print for the current text (capitals
  in cm, cheers, cut-off flags), computed for a High Roller cheer and cached by key. The note
  (`.text-note`) is `bigReport` / `sideReport` or a Han tiling summary, plus where the block
  sits in the run, read off the PACKED parts (`blockParts`, `partLines`) through a `costSyncs`
  callback. `imageCard`: Kind (`.sel-kind`: Glyph-art or Real picture), URL, file; for
  Glyph-art the Characters select (`.sel-tier`) with per-form hints and a column range that
  follows the form; for a Real picture the red can't-print note, "Switch to Glyph-art", a
  thumbnail, rotate and brightness/contrast (baked and re-uploaded; shown on the card only).
- **Parts.** `composeParts` packs the stack. A stack with nothing printable, or only a Real
  picture, gives one non-copyable notice; a part with nothing printable in it yet (a picture
  still decoding) is shown but not copyable. Without the repeat number, a part identical to
  the one right before it gets a note (Twitch won't send the same message twice in a row
  within 30 seconds). `probeParts(kind)` builds a probe the same way. `renderParts` shows the
  mode notice, a persistent card per part (char count, kind label, the preview, its verdict,
  Copy) and the bits total. `copyPart` advances that part's nonce only when the repeat number
  is on.
- **Presets and the expiry check.** `seedBlocks` migrates a saved stack once and saves it; when
  `migrationRewrites` is true it queues the backup preset, which `initPresets` writes only
  after the user's presets have loaded, merged in with `upsertPreset` under a free name, and
  never over an unreadable `rw_presets_v1`. `applyPreset` migrates a deep copy; **stored
  presets are never rewritten** (export gives back what was saved, and the backup keeps its
  takeovers), and a JSON import is stored as is and migrated when loaded.
  `probeStackExpiry` checks this Worker's upload links (15-minute TTL) by loading each into a
  `new Image()` (no CORS grant, no `fetch`), and flags a dead one on its card.

## The preview: SassyTP's own renderer

The preview does not model the receipt; it **is** the bot's receipt page. There is no second,
hand-written model of the receipt in this app. The pure core's width and height models only
choose sizes and split parts, and a browser test holds them to what `render()` reports.

**The vendored block.** `public/index.html` carries `v/2.5.0/renderer.html` at
`b9f12b0cbaf680b01d4e72fb96b3d5e9aa0aa0ef` (version `202610090056`) as inert text,
`<script type="text/plain" id="sassytp-renderer" data-commit data-path data-version>`, placed
after the app's script. Above it: SassyTP's copyright line, the full MIT permission notice
(from LICENSE at that commit), the source repo, path, commit and upstream sha256, and a note of
the edits. Exactly three edits, each marked `RW-EDIT` inside the block:

1. The three `ICONS` logos (Twitch, YouTube, Kick: trademarks outside the licence) become one
   plain grey 336 × 112 PNG, the Twitch logo's size, so the footer keeps its height.
2. The page's CSP becomes a no-network policy: `default-src 'none'; script-src
   'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri
   'none'; form-action 'none'; frame-src 'none'; object-src 'none'` (inline scripts instead of
   the renderer's hash, so the preview's glue can run).
3. Every closing script tag is written with a backslash before its slash, so the page can sit
   inside `index.html`; the app takes the backslash out when it reads the block.

The upstream page verbatim (logos, signature file) is never committed. `tools/vendor-renderer.mjs`
regenerates the block from the pinned upstream file by applying exactly those edits, and
refuses a source it cannot embed safely (it walks the HTML tokenizer's script-data states).
`node tools/vendor-renderer.mjs --check` exits 1 if the committed block differs.

**The frames.** Each part gets one `<iframe>` with `srcdoc` = the vendored page plus our glue
(`previewGlue`, appended by its source text, so it must stay self-contained) and
`sandbox="allow-scripts"` WITHOUT `allow-same-origin`: an opaque origin that cannot reach the
app, its storage or its cookies. It is one page wide (272 / 181 CSS px, so vw units and the
244 / 153 px box are the bot's) and as tall as `render()` says. The app and the frame talk by
`postMessage` only, and each end checks `event.source`. Frames persist per part (typing
re-renders instead of reloading 140 KB); every request carries a sequence number and an
older answer is dropped. Cards carry `data-render` (pending/done) and `data-thermal`
(pending/done/failed); the frame keeps `window.__rwPreview` for the tests.

**Driven like the bot.** `previewEvent(o)` builds the call the way the C# routine makes it (a
`TwitchCheer` carrying the bits and the message untouched) and the way the bench does:
`{__source: "TwitchCheer", bits, user: "viewer", message: <the part's exact payload>}` with
`{highRollerBits, highRollerBitsPerInch, highRollerMaxInches, hideLinks: false}`. No
`userName`, so no avatar lookup starts (a real cheer has one, so its header is taller). The
renderer, not this app, decides High Roller or plain, the box and the fade. A free test (Cheer-ready off) is drawn as a High Roller cheer
(threshold 1) and says it never reaches the printer.

**The verdict** under each part (`previewVerdict`): the receipt's height in cm and px; a
`trimmed` cut (bits or cap) with its lengths; a hard cut by the 1600px box (measured in the
frame with the box's limit lifted, because `render()` reports only the streamer's limits);
"this app expected it to fit" when the app had not warned; any `security` notes (the bot's
sanitizer would remove something: should never happen for our payloads, please report it);
page-policy violations; and, under an `up` sideways part, that this browser can't draw
`writing-mode: sideways-lr` when `CSS.supports` says so.

**The Thermal preview.** The frame posts back its style sheets and `#receipt-container` as
XHTML (vw written out as px in the copy). The app draws that into an SVG `<foreignObject>`
scaled to 576 / 384 dots, onto a canvas, and runs `forkDither` in the mode the select names
(Detailed / Soft / Crisp = floyd / atkinson / threshold), one canvas pixel per printer dot.
Compared with the bot's own screenshot of the same page (forkbench): same heights; plain and
glyph grids dot for dot; big and sideways text the same shapes with a few edge dots dithered
differently; header and footer text one or two dots lower (this page lays out at 1 CSS px per
px and scales, the bot lays out at its dot scale). The grey logo placeholder prints as dots in
Detailed and Soft and not at all in Crisp. The caption says the computer's fonts may differ
from the streamer's.

### "SassyTP shipped a new version"

1. Find the new commit in <https://github.com/SassyTP/printer-bot> (its `versions.json` names
   the renderer path).
2. `NODE_USE_ENV_PROXY=1 node tools/vendor-renderer.mjs --ref <40-hex sha>` (add `--path
   v/X.Y.Z/renderer.html` if needed; `NODE_USE_ENV_PROXY=1` only matters behind a proxy), then
   `node tools/vendor-renderer.mjs --check`.
3. Point `tools/forkbench.mjs` at the same commit (its `PINNED_SHA`, `RENDERER_PATH` and
   `RENDERER_SHA256`) and re-bench the modes whose shape matters to you at 80 and 58 mm.
4. Read the diff of the renderer for anything in "The target" above (allow-lists, the box,
   plain text, geometry) and update this file's line numbers and facts.
5. Run both suites. The contract test re-runs every mode through the new page.

## Measuring: the bench

"Does it print?" is answered by measuring. The tools are dev-only, never shipped, never in CI
(CI is offline), and no test imports them. Everything they write or cache goes to the
gitignored `.render/`. Never commit a font or the upstream renderer page.

- **`tools/forkbench.mjs`** (`npm run bench -- …`) renders one message through SassyTP's real
  `renderer.html` in Playwright's Chromium, the way the action drives it: `--paper 80|58` gives
  a 272 / 181 px page at deviceScaleFactor 576/272 or 384/181. By default it fetches the page at
  the pinned commit into `.render/sassytp/<sha>/` with a `.json` note (url, commit, sha256,
  bytes, fetch time) and refuses a copy whose sha256 is not the recorded one; `--offline` uses
  the cache only, `--renderer PATH` a local file. Every non-file request is blocked inside the
  page. It writes `<out>.png` (the screenshot at dot width), `<out>-1bit.png` (dithered by its
  copy of the C# Ditherer port: `--dither floyd|atkinson|threshold`) and `<out>.json` (also one
  line on stdout: ok, height, trimmed, security, part class, fonts and more). Other flags:
  `--message`, `--message-file` or stdin, `--bits`, `--threshold`, `--bits-per-inch`,
  `--max-inches`, `--user`, `--theme-file`, `--hide-links`, `--fonts DIR` (your own font folder,
  through a fontconfig under `.render/fonts/`), `--pretty`. Exit 0 ok, 1 render failed, 2 usage
  or environment.
- **`tools/payload.mjs`** (`npm run payload -- '<json>'`) builds a message with the app's own
  builders AND packer, so the bench measures what the app sends. Kinds: `big`, `side`,
  `glyph` (built-in test pictures through the app's own sampling), `plain` (text needs
  Playwright's Chromium, because it runs the app's canvas code; a picture does not),
  `hrprobe`, `plainprobe`, and `raw`. Fields: `paper`, `bits`, `threshold`, `bpi`, `maxin`,
  `cheer`, `nonce`, `part`. It prints the matching forkbench flags on stderr: pass the same
  ones, or the bench's High Roller decision and box differ from the app's.

```sh
node tools/payload.mjs '{"kind":"big","text":"HELLO","paper":58}' \
  | node tools/forkbench.mjs --paper 58 --bits 100 --threshold 25 --out .render/forkbench/hello.png
```

**What the bench cannot see** (each one needs a real print to settle):

- **Fonts.** The rig is Windows: Segoe UI for the receipt's own text, Arial for big and
  sideways text, Courier New for the R4 grids, a CJK face (most likely Microsoft YaHei) for Han
  glyphs, Segoe UI Emoji, and some face for Braille. The bench has Liberation Sans/Mono (Arial
  and Courier New metrics), WenQuanYi or another CJK face, and no Segoe UI. That is why big and
  sideways text pin Arial and R4 pins Courier New: their advances match on both.
- **Edge.** The bench is Playwright's Chromium, not the streamer's Edge; `sideways-lr` needs
  Edge 132 or newer.
- **The streamer's settings**: threshold, bits per inch, maximum length, paper width, dither.
  The app asks for them; a wrong value means markup printing as text or a silent cut.
- **`theme.css`.** A streamer's theme can change the box, the fonts, the padding or the
  quote marks, which breaks the 15-column plain grid and the vw sizing.
- **The real avatar.** The bench sends no `userName`, so its receipts have no avatar; a real
  cheer's header is taller. The message box is unaffected.
- **Chat.** No bench sees the channel's filters or what Twitch does to the message.

## Global constraints (payload rules)

- **One line, at most 500 code points** (`MAX_CHARS`, the whole message including the lead).
  Over budget is reported, never truncated: Twitch rejects an over-length message.
- **Never start a message with `<`.** The lead (`Cheer<N> ` or `LEAD_GUARD`) or a plain part's
  Han header always comes first. `buildLead` is the only place a lead is built.
- **Tags: `div`, `pre`, `br`. Attribute: `style`.** Nothing else, and never a picture tag (see
  the field record). Every style declaration that matters is one the bot's sanitizer keeps;
  the contract test proves it for every mode.
- **Literal tokens only** (THE RULE). No CSS escapes, entities, case tricks or zero-width
  characters in any token.
- **Every user character in markup goes through `escapeHtml` / `escapeAttr`.** Glyph ramps
  contain no `<`, `>` or `&`.
- **Fonts are pinned**: Arial for big and sideways text (weight 700, never 900 or nested `<b>`),
  Courier New for R4; Han grids inherit (Han glyphs are 1em in every CJK font).
- **Plain grids**: exactly C cells a row, no space, Latin letter or U+3000 inside, the token
  last, one plain part per cheer.
- **The nonce is visible digits, never zero-width, and off by default.** It exists for Twitch's
  duplicate-message rule; it also prints, which is why it is opt-in.
- **Emoji are allowed** in big and sideways text (Edge draws them; they print as grey dots).
  Invisible and control characters are dropped and the card says so.

## Hard constraints: keep these true

> **Exception (added by explicit request):** an optional image backend, `src/worker.js`:
> `POST /upload` (stores an image in the `RW_IMG` KV namespace with a native 15-minute TTL,
> 5 MB cap, image/* only), the image routes (`/<hex>.png` and legacy `/i/<hex>`, matched by
> shape via `imageKeyFor`) and `GET /px?u=<url>`, an image proxy guarded by
> `isPublicHttpUrl()` (public http(s) only, no loopback/private/link-local hosts, every
> redirect hop re-validated; covered by `test/proxy.test.mjs`). **Without that guard `/px` is
> an open relay / SSRF gadget. Do not loosen it.** `src/worker.js` and `wrangler.jsonc` stay
> byte-identical unless the owner asks otherwise.

- **One file.** No build step, no framework, no external resources: system font stacks, no web
  fonts, no CDN, no external images. Don't split the file for tooling.
- **Zero runtime dependencies.** Dev tooling (Wrangler, Playwright, the tools) does not ship.
- **Network calls go only to our own Worker, and there are no new ones.** The app's script has
  **four** `fetch` call sites, all same-origin: two `/px` (`decodeGlyphImage`, which reads a
  pasted picture link for glyph-art; `processImage`, which reads it for the adjustment bake)
  and two `/upload` (`processImage`'s bake; `uploadPngForUrl`, a picked file on a Real
  picture card). Two fire without a dedicated click: typing a picture link and dragging an
  adjustment slider. The preview and the Thermal preview fetch nothing. The vendored renderer
  contains a `fetch` of its own (the avatar lookup): it is inert text in the page and runs only
  inside the no-network frame, and only with a `userName`, which the preview never sends.
  The expiry check loads links with `new Image()` on purpose: turning it into a `fetch` would
  add a fifth call site and a CORS problem. The Real picture card's picture is an `<img>` too,
  loaded only while the card is a Real picture: a pasted link through `/px`, our own minted
  upload links as they are. The browser never asks a pasted link's own host for anything.
- **Storage: exactly four `localStorage` keys**, all in `try/catch`: `rw_controls_v1` (the
  settings: the `normalizeControls` fields), `rw_nonce_seq` (the repeat-number counter, which
  only moves while that option is on), `rw_blocks_v1` (the stack), `rw_presets_v1` (presets).
  New state goes in as a field of one of these. Don't add a fifth key.
- **Vanilla JS**, one IIFE, `"use strict"`, ES5-ish (`var`, function expressions). Match the
  surrounding code. (The tools and tests are modern ES modules; that is fine, they don't ship.)
- **Privacy, stated accurately.** Text in every mode and a picture picked from disk for
  glyph-art never leave the device. Pasting a picture link sends it through `/px`; on a Real
  picture card, picking a file uploads it, and rotating or adjusting re-fetches and re-uploads.
  No analytics, accounts or third parties. Never let the docs drift back to "nothing is ever
  sent".

## Testing

```sh
npm test               # node:test, zero installs: test/*.test.mjs
npm run test:browser   # Playwright: test-browser/composer.spec.mjs (needs: npx playwright install chromium)
```

Both stay green; CI runs both. `npm test` stays zero-install, which is why the browser suite
lives in `test-browser/` and is not in the default matcher.

- **The harness** (`test/_harness.mjs`) reads `public/index.html`, extracts the app's script
  by its id (`APP_SCRIPT_RE`, `/<script id="rw-app">…/`; `appScript()` insists on exactly one)
  and runs it in `node:vm` against a null-DOM proxy. "The first `<script>`" is not safe: the
  vendored page has a `<script>` inside it, and the old match ran the bot's renderer instead of
  the app. `test/vendor.test.mjs` pins that (and that the block is inert, carries exactly the
  three edits and the licence notice). `loadCore()` takes no arguments. `scanTags` reads every
  occurrence of every tag and splits attributes the way a parser does.
- **The tag test** (`test/tags.test.mjs`, AMENDMENT B1): every builder and both probes, at 80
  and 58 mm, with ordinary and hostile input, send only `div`, `pre` and `br` with only
  `style`, never a forbidden tag in any case, and never a message starting with `<`.
- **The MANDATORY contract test** (browser suite): every mode's Copy payload (big auto, lines,
  stack, each and upside down; sideways down and up; glyph cjk, ascii, blocks, braille; plain
  Han tiling; plain CJK picture; both probes) at 80 and 58 mm, above and below the threshold,
  with the streamer's length limits, and as a free test, goes through the app's own vendored
  `PrinterBot.render` in the frame. It asserts: `ok`; no `security` notes; the renderer agrees
  on raw vs plain; cut only where the app warned; for raw parts the sanitised DOM keeps every
  tag, every attribute and every style declaration the app sent, compared after CSSOM
  normalisation (a longhand the `font` shorthand resets that is not on the bot's list may be
  dropped only when the printed value is unchanged), and for plain parts the printed text is
  the payload exactly; zero policy violations; and the height within tolerance (at most 1px
  over the core's prediction; at most 1px under, or 20px under for sideways text, whose
  prediction is an upper bound). Its fixture asserts it saw raw parts, plain parts, a trimmed
  part and at least one such no-op reset.
- **Copy is compared byte for byte with the pure core** for every mode, both papers, above and
  below the threshold. Browser tests capture payloads by stubbing
  `navigator.clipboard.writeText` and clicking Copy; canvas-backed expectations are computed in
  the page through a `window.module` hook (`designTTextGrid`, `glyphGrid`).
- **Pin defaults.** A browser test that depends on a default (bits, threshold, paper, nonce)
  must set the value it needs, or a later default change makes it pass while testing nothing.
- **Playwright init scripts also run inside the sandboxed preview frames**, which have no
  `localStorage`: wrap storage access in try/catch and guard page-only patches with
  `window.parent === window`.
- Anything needing the Worker (`/px`, `/upload`) is not faked; the browser tests use data: URLs
  for pictures. Check those flows against `wrangler dev` by hand.

## Deployment (Cloudflare Workers)

- Workers Builds is connected. `src/worker.js` serves `public/` as
  [static assets](https://developers.cloudflare.com/workers/static-assets/) and handles
  `/upload`, the image routes and `/px`.
- **Two custom domains, both declared in `wrangler.jsonc` `routes`:** `receipt.uwutoowo.com`
  (the app) and `i.uwutoowo.com` (short host for uploaded links). Both must stay listed: once
  routes are in config, config is the source of truth, and listing one invites a deploy to drop
  the other.
- `vars.RW_IMG_HOST` = `i.uwutoowo.com` makes `/upload` mint 39-character links. It falls back to
  the request origin when unset. Only set it while that host really answers.
- `kv_namespaces`: `RW_IMG` holds uploads with a native 15-minute TTL.
- CI validates every push and PR to `main` with `npx wrangler deploy --dry-run`; the workflow
  itself never deploys.
- **Workers Builds does: every push to `main` auto-deploys to production within ~15 s.**
  Other branches build but never reach production. Merging anything to `main`, docs included,
  republishes `main`'s `public/` and `src/`.
- `npx wrangler deploy` deploys whatever is checked out; from a feature branch it puts unmerged
  code in production (see the divergence check).

## Conventions and gotchas

- Keep style, markup and script inline in the one file.
- Every reader of a block's fields goes through its sanitizer (`blockRender`, `bigOpts`,
  `sideOpts`, `glyphOpts`, `hanziWeightOf`, `normalizeControls`), in the card and the builders
  alike, or the card and the payload will disagree.
- A card's cheer count is the packed parts', never its own chunk count: the packer shares parts
  between blocks.
- `.text-note` is the card note's class.
- Migrated text blocks keep `size`, `cols` and `fmt`; they are unused. `fmt.font` is inert.
- Saved presets in storage are never migrated in place; only the stack loaded from one is.
- Known limitations, accepted: no keystroke debounce (each keystroke writes the settings key);
  the glyph-art cell aspects and Design T assume the fonts above; Braille and the blocks tier
  need a real print to judge.
- **Agent-environment note:** the Edit and Write tools decode a literal backslash-u followed by
  four hex digits into the character. To put such an escape in a file, write a doubled
  backslash and normalise it afterwards, or edit with a script.
- Licensed under **MIT** (`LICENSE`). The vendored renderer keeps SassyTP's MIT notice.

## Working in this repo

- Develop on the assigned feature branch. **Never push to `main`** without explicit permission
  (it deploys to production). Branch pushes build but don't deploy.
- Stage explicit paths, never `git add -A`: `.render/` artifacts have been swept into a commit
  that way before.
- After pushing, make sure a PR exists for the branch (unless the task says not to open one).
- Before a release, also run `node tools/vendor-renderer.mjs --check` (offline after one online
  run: `--offline` uses the cache).

### Before merging ANYTHING to `main`: check prod has not diverged

`main` is only the source of truth if nothing was deployed from outside it. A `wrangler
deploy` from a feature branch, or a rollback in the Cloudflare dashboard, puts production ahead
of `main` with no trace in git, and the next merge, however trivial, silently reverts
production. This has happened: prod ran a feature branch for two days while `main` sat 22
commits behind, and three Dependabot merges plus a `.gitignore` merge each rolled the live app
back. "This PR only touches docs, so the deploy is a no-op" is exactly the reasoning that
caused it.

```sh
# what prod actually serves, vs what main would ship
curl -sS https://receipt.uwutoowo.com/ | shasum -a 256
git show main:public/index.html        | shasum -a 256
```

- **Hashes match**: merge freely.
- **Hashes differ**: stop. Find out what prod runs (`npx wrangler deployments list --name
  receipt-wrecker`, and diff prod against each branch) and land that work into `main` first.
  Don't "fix" it by force-deploying `main`.

A live probe checks the Worker too: `/px?u=http://127.0.0.1/x.png` returns **400** when the
proxy and its SSRF guard are deployed. The Cloudflare API's "get worker code" can return a stale
script; trust a live probe over it.

The real acceptance test for a change to what prints is a real cheer on the target rig: the
**High Roller test** and **Plain test** buttons are one cheer each. Unit tests, the contract
test and the bench prove the logic and the renderer's behaviour, not the streamer's fonts,
Edge, settings or chat.
