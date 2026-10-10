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
- **2026-10-10, later: `<br`.** Of the sideways paste tests sent that day, the one with two
  lines (`HAPPY` and `BIRTHDAY` with a `<br>` between them) was held by AutoMod, and the three
  without a `<br>` went through, one of them two `<div>`s in a row. So `<br` is presumed on
  the list too (perhaps since the nutty.gg era: a giant stacked-letter cheer that printed then
  used `</br>`). **By the owner's decision, no message carries a `<br>`:** every line, grid
  row and stacked letter is its own `<div>` (see "One `<div>` a line" under Global
  constraints). That puts line breaks on the paper without the blocked token, and the owner
  chose it knowing so. It is the one exception to THE RULE's "never swap in another tag or
  structure", and it covers `<br` only.
- **Not known.** Whether the list blocks anything the 1.0.0 forms use now (`<div`, `<pre`,
  `style=`). Nobody has said so. Don't change the design on a guess: the free chat test
  (Cheer-ready off) is how a user finds out.

What follows from that, as rules:

- No builder emits `<img`, `<object`, `<image`, `<embed`, `<iframe`, `<svg`, `<input` or
  `<br`, in any letter case. `test/tags.test.mjs` checks every builder and both probes at 80
  and 58 mm, with hostile input, and checks the positive side too: the only tags sent are
  `div` and `pre`, and the only attribute is `style`.
- There is no emote or data: picture feature. An uploaded picture prints only as glyph-art.
  The Real picture card says so plainly ("SassyTP's bot only prints pictures from emote
  servers, and this channel's chat filter blocks the picture tag…") and offers Glyph-art.
- No example, probe or doc snippet contains an `<img` tag. The exceptions: naming the blocked
  token in this record; the CHANGELOG's history (its older entries describe the state at their
  release, picture tags included, and are kept as written); the unit tests' HOSTILE INPUTS
  (`test/tags.test.mjs`, `big.test.mjs`, `side.test.mjs`), which must keep typing picture tags,
  in any case, to prove they arrive escaped, as text, and never as a tag; and the glue's own
  DOM (the Image card's thumbnail is an `<img>` element on the page, never in a payload).

### THE RULE

A channel blocking a form is the moderators saying no.

- **Literal tokens only.** Never obfuscate a token: no case games, entities, spacing,
  zero-width characters or CSS escapes.
- **If a form is blocked, fall back to the plain form** (Han tiling). Never cycle variants,
  and never swap in another tag or structure to get the same effect past a block. The UI
  must never suggest either. (The one exception, the owner's decision of 2026-10-10: line
  breaks are `<div>`s, not `<br>`; see the field record. Don't extend it to anything else.)
- **The words, too.** Stack (one letter a line) splits a word and Han tiling draws it as a
  picture, so a word filter never sees it as typed. (Sideways text sends each line's words
  whole: a long line is cut at a space, and only a word too long for one part is split.) That is a side effect of fitting the paper, not
  a feature: never describe or advertise it as a way past a filter. If chat holds a message
  for its words, that is the channel's moderation working; don't respace, split or rework the
  words to get them through, don't send them again in another form (Han tiling included), and
  don't build anything that does. The UI's "Held or blocked by chat?" note says so.
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
test harness **152 keys**. Regenerate the list instead of trusting this one:
`node -e 'import("./test/_harness.mjs").then(({loadCore})=>console.log(Object.keys(loadCore())))'`

`TIERS`, `getTier`, `sampleLuma`, `quantizeTone`, `ditherFloydSteinberg`, `lumaToDots`,
`packBraille`, `render`, `payloadLength`, `withinBudget`, `MAX_CHARS`, `makeNonce`,
`cheerBits`, `bitsWord`, `PAPERS`, `paperSpec`, `BASE_PX`, `BASE_LH`, `LEAD_LINE_PX`,
`CONTENT_CEILING_PX`, `PX_PER_INCH`, `MAX_CAP_INCHES`, `HR_DEFAULT`, `HR_MAX`,
`hrThresholdOf`, `bitsPerInchOf`, `maxInchesOf`, `printMode`, `buildMode`, `contentLimitPx`,
`LEAD_GUARD`, `buildLead`, `leadLength`, `buildTrail`, `trailLength`, `stackContext`,
`packStackBodies`, `BIG_MIN_PX`, `BIG_MAX_PX`, `BIG_LH_CAPS`, `BIG_LH_TEXT`, `BIG_CAPS_SAFE`,
`BIG_W`, `BIG_W_DEFAULT`, `BIG_W_EMOJI`, `BIG_W_WIDE`, `BIG_LAYOUTS`, `BIG_CAP_EM`, `MM_PER_PX`, `bigCapCm`,
`bigOpen`, `BIG_CLOSE`, `bigClean`, `bigGraphemes`, `bigGraphemesFallback`, `bigLineEm`,
`bigFitPx`, `BIG_EDGE`, `bigEdge`, `bigEdgeEm`, `bigLineHeight`, `bigWrapWords`, `bigWrapCount`, `bigWrapWordsOf`, `bigLines`, `bigSizeOf`, `bigOpts`, `bigCheerCount`, `bigPlan`,
`bigFit`, `buildBigBodies`, `bigReport`, `cheerWords`, `CHEER_GLOBALS`, `SIDE_DIRS`,
`SIDE_MIN_PX`, `SIDE_MAX_PX`, `sideOpen`, `sidePad`, `sideWidthPx`, `sideLines`, `sideSizeOf`,
`sideOpts`, `sidePlan`, `sideFit`, `buildSideBodies`, `sideReport`, `GLYPH_FORMS`,
`glyphForm`, `GLYPH_ASPECT`, `CJK_COLS_MIN`, `CJK_COLS_MAX`, `glyphCols`, `gridRows`,
`cjkGridK`, `monoK`, `brailleFontPx`, `glyphAspect`, `buildCjkGrid`, `buildMonoGrid`,
`buildBrailleGrid`, `buildGlyphBodies`, `HAN_CELL_PX`, `HAN_LIGHT`, `hanziCols`, `designTHeader`,
`designTPictureCols`, `buildDesignT`, `buildDesignTPicture`, `HAN_MAX_LINES`, `hanTextLines`,
`buildHighRollerProbe`,
`buildPlainProbe`, `escapeHtml`, `escapeAttr`, `PRESET_V`, `cleanBlocks`, `isMintedImageUrl`,
`presetImageUrls`, `makePreset`, `serializePresets`, `parsePresets`, `upsertPreset`,
`freePresetName`, `importPresets`, `migrateBlocks`, `migrationRewrites`, `migrationNote`,
`MIGRATION_BACKUP_NAME`, `TEXT_RENDERS`, `blockRender`, `giantLevelPx`, `THERMAL_DITHERS`,
`normalizeControls`, `hanziWeightOf`, `GLYPH_TIERS`, `glyphOpts`, `modeNotice`, `noRoomAdvice`, `partsShape`,
`extraCheers`, `extraCheerLines`, `partsCostWords`, `paidTestNotice`, `wideLine`, `partCheer`, `forkDither`,
`previewEvent`, `previewVerdict`, `avatarExtraPx`, `designTTextGrid`, `glyphGrid`.

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
`bitsPerInchOf` (> 0 else 0), `maxInchesOf` (> 0, clamped to 40, as the renderer's min(maxIn, 40); else 0). `printMode({cheer, bits,
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

**`packStackBodies(bodies, opts)`**: Body = `{html, chars, heightPx, joinPx?, joinHtml?, alone?}`.
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
`<div style="font:700 <PX>px/<LH> Arial"><div>line 1</div><div>line 2</div></div>` (a block of ONE
line is the bare `<div style="…">line</div>`); upside down appends
`;rotate:180deg`. The browser expands the shorthand into longhands, and the bot's sanitizer
keeps weight, size, line-height and family with no security notes (the resets it drops change
nothing that prints).
- **Arial Bold is pinned.** The receipt's own face is Segoe UI, which the bench cannot
  measure; Arial Bold's advances are exact on the bench (Liberation Sans Bold shares them) and
  on the streamer's Windows. Never weight 900 or a nested `<b>`: that asks for a Black face,
  which no table here covers.
- `BIG_W`: case-aware Arial Bold advances in em (the payload is never uppercased). Unknown
  characters count `BIG_W_DEFAULT` 1.0 (errs wide), East Asian wide and full-width ones
  (`bigIsWide`: Han, kana, Hangul, full-width forms) `BIG_W_WIDE` 1.05, because they are a full
  1em already (the bench's kana face is 1.0235em: at 1.0 a kana stack overflowed 244px by
  2.7px, round 3); an emoji grapheme counts `BIG_W_EMOJI` 1.3 (Segoe UI Emoji's advance on the
  rig is unmeasured).
- Line height: `.8` only when every line matches `BIG_CAPS_SAFE`
  (`/^[A-PR-Z0-9 .!?'"&#:\/+\-]*$/`), else `1.15`. Lowercase, Q, the comma, the semicolon,
  accents and emoji have ink below the baseline that `.8` clips.
- Width: a line may use `bigFitPx(contentW, glyphs)` = contentW − 2 − 0.5 per glyph (margin for
  the rig's rounding). Height: lines × px × LH, within 0.15px on the bench.
- **Ink past the advance.** A few glyphs draw outside their own advance: j's hook 0.047em left of
  it, f's arm 0.031em right, r's ear 0.013em, Æ and the accented dotless i's (Ì Í Î Ï ì í î ï)
  up to 0.042em (`BIG_EDGE`, `[left, right]` em: the larger of Arial Bold and Liberation Sans
  Bold, measured from the rendered ink at 400px, rounded up; only overhangs over 0.003em, which
  bigFitPx's margin covers). A centred line needs `bigEdgeEm(line)` = 2 × max(its first glyph's
  left, its last glyph's right) more width, so `bigPrep` keeps `inkEms` (advances + that) beside
  `ems` (advances): the width fit (`pxW`) and "too wide" (`overflow`) use `inkEms`, the wrap
  count (`bigLineH`, `bigWrapCount`) uses `ems`, since the browser wraps by advances, and
  `bigWrapWords` counts the ends of each line it builds. Before polish review 4 the model
  measured advances only: with Arial Bold on the bench "jeff" at 160px lost 5.5px of the j's
  hook past the box's left edge and 2.7px of the f's arm past its right, "if" at 394px 9.7px of
  the arm, while the card said "fits". Now 150 / 358px, ink at least 2px inside both edges.
- `bigWrapWords(line, px, contentW)` is a greedy word wrap at px against `bigFitPx`, at the
  spaces only: the lines the Wrap layout sends, every word whole.
- `bigWrapCount(line, px, contentW)` is how many lines a line too wide at an explicit size
  PRINTS as, at most; the height model (`bigLineH`) counts such a line by it. A High Roller
  message keeps its own styling (the renderer's `overflow-wrap: anywhere` is for
  `.part:not(.raw)`), so the browser breaks only at its line-break opportunities: always at a
  space, never between two letters or digits, and, by context-dependent rules too many to copy,
  around Han, kana, Hangul, emoji, hyphens and most punctuation ("你|好", "WELL-|DONE", "A-|5",
  but not "好|。" or "(|你"). So it counts an upper bound: words that fit a line go on lines
  greedily, each whole (the page has these breaks and maybe more, and more breaks never need
  more lines when nothing overflows); a word wider than a whole line starts a line of its own
  (and so does what follows it) and takes min(pieces, 2 × ceil(its width / the width) − 1)
  lines, where its pieces are what is left between the places the page could break it
  (`bigWrapWordsOf`: never between letters, digits and apostrophes, `BIG_ATOM_RE`; never
  before `BIG_NO_BREAK_BEFORE`, closers, `, . : ; ! ?`, hyphens, dashes and quotes, or after
  `BIG_NO_BREAK_AFTER`, openers) and two lines in a row of a first-fit break hold more than a
  line's width. It can count a line or two too many (a cheer spent) but never too few (a
  cut): 460 cases through the vendored
  renderer, none short. Counting the spaces alone, "你好你好" at 160px printed four lines,
  counted one, and the bot's box cut the NEXT block in that part off (polish review 2; the
  MANDATORY contract test now carries that stack). ceil(width / line width) under-counted too:
  20 lines of "WWW WWW WWW" at 48px are 60 printed lines, it said 40.
- `bigClean` drops what prints nothing (`BIG_INVISIBLE`: the BMP Default_Ignorable set, the
  C0/C1 controls, U+FFF0-FFFB) but keeps emoji with their joiner and presentation selectors
  (Edge draws colour emoji; they dither to grey dots). CR, CRLF, U+2028/2029 → newline; U+2800
  → space. It reports what it dropped. `bigGraphemes` uses `Intl.Segmenter` with a fallback.
- `bigLines(text, layout)`: `stack` is one grapheme a line with each whitespace run as one
  blank line (a word gap); `lines` and `each` keep the lines as typed.
- Layouts (`BIG_LAYOUTS`, read through `bigOpts`): five, all a block's own pick. `auto`;
  `lines` (as typed); `wrap` ("Words wrapped to the paper"); `stack` (one letter a line);
  `each` (every line its own size and line height; an explicit px acts as a cap, so the card
  labels a numeric size "up to N px" with the capitals each line really gets). `auto` tries
  three candidates in order, `lines`, then `wrap`, then `stack`, and `bigBetter` decides: a
  layout whose letters are cut off never wins, then a clean one, then the bigger type when both
  fit one cheer (or the size is `width`), else the fewer cheers; a tie keeps the earlier; it
  never picks `each`. `wrap` (`bigWrapPlan`) is the typed lines with each too-wide line broken
  at its spaces by `bigWrapWords` at the size being tried, then fitted like `lines`; the size
  it settles on is then balanced (the same number of lines, each as short as it can be: "WE
  ARE / SO BACK", not "WE ARE SO / BACK"), which changes neither the height nor the characters.
  It is what a long sentence typed on one line gets (as one line it was tiny). A short one whose
  stacked letters come out even 1 to 5 px bigger still stacks under Auto (it keeps the biggest),
  often over most of the 1600px box: "You are the best streamer" stacks at 61px over 1581px,
  where `wrap` gives 56px in 215px. So `wrap` is also offered on its own, one pick away; a
  line with no space to break at makes `wrap` exactly `lines`, and `bigFit(...).layout` says
  `lines` then. Under Auto, `bigFit(...).layout` can read `wrap`. Sizes (`bigSizeOf`): `fit1`
  (the biggest that fits ONE cheer; failing that, the fewest cheers, then the biggest), `width`
  (fill the paper, any number of cheers) or a whole px 20..400.
- `fit1` is a binary search (`bigSearch`) that a test checks against a linear scan on 600
  cases (`lines`, `wrap`, `stack` and `each`). A size whose chunks are `over` (one chunk longer than a message can be) or `tall`
  (taller than the box) ranks below every size without.
- `each`: every line's height is `bigLineH` at its own px, so a spaced line too wide even at
  the smallest size counts the lines it wraps to, as in `lines` (counted as one line, a long
  sentence's part printed up to 20× taller than planned, round 3).
- A stack tries two word-gap forms and keeps the one with fewer cheers, ties to `blank`:
  `blank` (one div, a gap is a blank line of the type's height) and `small` (a div per word, a
  gap is `LINE_BLANK`, `<div>` + nbsp + `</div>` at the receipt's font, 21.6px).
- **Chunking** is on height (≤ room) AND characters (≤ budget − `LINE_BLANK_LEN`, 12); it
  prefers to break at a blank line and trims blank lines from both edges of a chunk. A chunk
  that follows a word gap carries `LINE_BLANK` as its `joinHtml` (`joinPx` 21.6). The packer
  puts it in, and counts its 12 characters and its height, only when the body follows another
  body in the same part, where it keeps the words apart; first in a part, after the lead's
  text, it would print a blank line, so the body goes out without it (a `<br>` there used to
  cost nothing).
- `bigCheerCount` counts parts with the packer's own greedy test, because two chunks often
  share a part: chunks are not cheers.
- Upside down, the chunks go out last first and the divs inside a chunk reverse, so the tape
  reads in order once turned over.
- Known limit, upside down: at line-height .8 the overshoot of round capitals (O, G, S, C) sits
  up to 1.5 CSS px above the line box (Chromium rounds the ascent to whole px), which `rotate`
  turns into the bottom. When a flipped block is the last thing in a part, `#receipt-content`'s
  `overflow:hidden` trims that much (about 3 dots; measured with Arial Bold, worst at 48px,
  none from about 80px up). An em-based `translate` does not cover the small sizes, and more
  room changes every flipped height and fit, so it is left as is; the bench shows it as
  `clippedSides: ["bottom"]`.
- `bigPlan` makes the decision without markup (the card labels use it), `bigFit` returns it as
  data, `buildBigBodies` builds the bodies (each with a `big` record), and `bigReport` writes
  the card's plain-language note: capitals in cm (`bigCapCm` = px × 0.716 × 25.4 / 96 / 10),
  cheers and bits (or, when the box leaves nothing after the Cheer line, `boxNoRoom`, "prints
  nothing" in place of a price, the tall line then left out: `costWords(…, noRoom)`), too wide
  (naming at most two lines, "and N more"), too long to send, taller than the box (`boxWords`
  names the limit, in cm to one decimal like the part's verdict; the summary then says "1
  cheer, but cut off", never "fits", `costWords(…, tall)`), invisible characters
  dropped, emoji print grey. When even the smallest size is taller than the room after the
  Cheer line (`tallWords(what, limit, minPx)`: one line at 20px, or sideways the block's longest
  letter, `side.widestEm`), the note says the letters are cut at any size and to set Bits per
  cheer higher (or, under a maximum length, that only a longer one helps), not "Pick a
  smaller size", which it used to say at 20px too. `cheerWords` flags standalone words
  shaped like a cheermote (`Kappa50`); the note is flat for Twitch's global prefixes
  (`CHEER_GLOBALS`) and hedged for anything else, since a channel's own are unknowable. In a
  free test (Cheer-ready off) such a word is the only cheer in the message, so the card's
  summary says "not free" (`costWords(…, paid)`) and the note says the test spends the bits and
  prints (`cheerWordNotes(…, free)`). The parts read the same words off each packed part
  (`extraCheers(bodies)`: `sure` words with a global prefix and their bits, every occurrence
  counted; `maybe` the rest): the part says what it really costs, or that a free test isn't
  free (`extraCheerLines`, red when certain, a grey hedge otherwise), the total adds the bits in
  (`partsCostWords`), a free test's notice becomes a red "Not a free test" (`paidTestNotice`),
  and the preview draws the cheer Twitch would send (`partCheer`: a free test with such a word is
  a real cheer of its bits, through the streamer's threshold; a cheer adds them to its own, so
  the header says 150 BITS over "Cheer100 … Cheer50"). Before final review 2 only the card knew,
  and a free test carrying "Cheer50" was called free three times.
  `bigSplitWords` (the `big` record's `splitWords`, `[{word, pieces}]`) names a STACKED word
  that a body starts in the middle of, i.e. one too tall for one receipt at the size picked
  ("Fill the paper's width" makes it as big as the paper allows, however tall): the report says
  it breaks across that many cheers with the bot's header in between and to pick a smaller
  size (not when the box is too short for even one letter, which `tall` already says). The fit
  rule is unchanged. In Each, a range of capitals that rounds to one value reads as one.

**Sideways (High Roller).** One literal shape:
`<div style="writing-mode:<DIR>;font:700 <S>px/<LH> Arial;white-space:nowrap;margin:auto[;padding-bottom:<P>px][;position:relative;left:<X>px]"><div>line 1</div><div>line 2</div></div>`;
one column is the bare `…">line</div>`, and an empty column is a `<div>` holding an nbsp.
- `down` = `vertical-rl;text-orientation:sideways` (letter tops toward the right edge: turn
  the receipt anticlockwise to read; works on every Edge). The `text-orientation` is not
  optional: without it `vertical-rl` stands Han, kana, Hangul and emoji upright, so they lie on
  their side once the tape is turned (and print over the next letters in a face with no vertical
  metrics), and the length model, which measures sideways advances, is wrong (bench, round 3:
  "你好 HELLO" boxed 729px against a predicted 1119; with the declaration, 1115). It changes
  nothing for Latin. `up` = `sideways-lr` (tops toward the left edge: turn it
  clockwise; needs Edge 132 or newer on the streamer's PC). Each typed line becomes a column;
  line 1 reads on top once the tape is turned.
- `writing-mode` turns the layout box itself, so the run's length is real height inside the
  bot's box and the bot's length check sees it. A transform-only rotation reserves no space and
  is cut off at both ends.
- Width rule (`sideWidthPx`), from Arial Bold's metrics: the outer columns' ink may reach E =
  contentW / 2 − 6 from the centre. Capitals-safe lines at LH .8: floor(E / (0.4N − 0.0305))
  (a capital's ink, centred, reaches half its span, (0.728 + 0.013) / 2 = 0.3705em, either side
  of its column's middle; the formula's 0.3695 is the same within 0.2px); anything else at LH
  1.15: floor(E / (0.575(N − 1) + 0.6)). On 80 mm that is 313 / 150 / 99 / 73 / 58 px for 1-5
  lines of capitals (one line is held to the Size menu's 300) and 193 / 98 / 66 / 49
  otherwise; on 58 mm 190 / 91 / 60 / 44 / 35 and 117 / 60 / 40 / 30. One line of capitals
  used to be capped at 280 (scaled), below the rule, so 281-300px was called "too wide" while
  it printed whole (polish review 2). With Arial Bold on the bench, HELLO at 300px prints 11.5
  / 10.6px clear of the edges on 80 mm and at 190px 7.2 / 5.3px on 58 mm: the model keeps 6px,
  and the bench's rounding takes up to about 1.3px of it (4.7px at the least, two columns of
  capitals at 91px on 58 mm). The comma, semicolon and Q are not capitals here (their tails
  clipped at the paper edge in review).
- **The ink is centred, not the line box.** `margin:auto` centres a column's line box, but the
  baseline sits half the leading plus Arial's ascent (0.905em) from the side the letter tops
  face, so lowercase (nothing above the x-height, descenders below) and mixed text landed toward
  the descender side: 'gg' at 193px 34.5px off centre on 80 mm, "Happy birthday" 16.3px, "Hey,
  you" 19.8px (bench, polish round 1). `sideInk(g)` gives each grapheme an ink extent [lo, hi]
  in em above the baseline from the classes in `SIDE_INK`; East Asian wide characters take
  [−0.15, 0.72] as the bench measured them (their font on the rig is unmeasured); emoji and
  anything else the font's whole box [−0.212, 0.905], which is centred and moves nothing (emoji
  took [−0.10, 0.89] until final review 2, which moved an emoji-only column 8px off centre on the
  bench, where unshifted it printed within 0.9px; the rig's Segoe UI Emoji is unmeasured). `sideInkSpan` unions every column's ink, `sideShiftEm` is how far its middle
  sits from the box's, and `sideShiftPx` turns that into `position:relative;left:<X>px` (both
  on the bot's allow-list; it moves the painted box and leaves the layout alone), toward the
  letter tops' side (+ down, − up), in whole px, ONE value for the whole block (body k carries
  the same shift as body 1, so columns don't jump between pieces), whenever it rounds to 1px or
  more (so the modelled ink sits within half a px of the middle), and never for a block wider
  than the paper (margin:auto can't centre it). Moving the ink to the middle only shrinks its
  worse gap to an edge, so the width rule still holds; `sidePlan` reports the modelled gaps
  (`inkGaps`), and a unit test holds them within 1px of each other and at least 6px from both
  edges, capitals included. The shift's own characters (about 27) count in the open tag's
  length.
- **Sideways centring is judged on the bench with Arial Bold** (`forkbench --fonts`, your own
  copy, never committed), the rig's face. Capitals, digits and the symbols beside them, Q and Ç
  take Arial Bold's own outlines (read from the font file): flat capitals 0 to 0.716em, O C G S
  −0.013 to 0.728, digits up to 0.719, Q's tail −0.07 (0.197 in Liberation Sans Bold). The
  other classes (x-height letters, descenders, ascenders, accented capitals, punctuation) sit
  between Arial Bold and Liberation Sans Bold, which differ there by up to 0.03em. Capitals
  used Liberation's 0.70 until polish review 3, so they never moved, and with Arial on the
  bench they printed 2 to 3.5px off centre (3px from the paper's edge on 58 mm); at LH .8 their
  ink sits 0.0115em toward the letter tops, so they now move about 3px the other way at 300px,
  and the shift is no longer skipped at 1px. Bench after, with Arial (74 blocks: capitals,
  digits, lowercase, mixed, kana, emoji; 80 and 58 mm, down and up): every one within 1.9px of
  centre. A wider sweep (polish review 4: 548 blocks, 12 texts at 15 sizes from 20 to 300px)
  found up to 2.4px off centre, 6% of them past 2px: under about 130px the ink leans 0 to 2px
  toward the letter tops, by an amount that changes with the size (the line boxes' pixel
  rounding, not a constant a shift could take out; folding in a fixed 1px would move the large
  sizes off centre instead), and a block that narrow is far from both edges. From 130px up
  every one is within 1.2px, and every block is at least 4.7px from both edges. With the
  bench's default Liberation, capitals sit
  up to 4px toward the baseline side (its capitals are shorter) and Q-led blocks up to 14.6px
  toward the descenders' side ("QUIZ" at 193px); a Linux or Mac preview drawing Arial with a
  Liberation-like face shows the same.
- Length = S × the line's em width + 0.5 px a glyph: an upper bound (kerning makes the real run
  1-18px shorter on the bench).
- **Ink past the end of the run** (`sidePad`). The div is exactly as long as its longest
  column's advances and the bot's box ends with it, so a glyph whose ink runs past its advance
  (`BIG_EDGE`) at the column's BOTTOM end was cut: top to bottom the last letter's right side (an
  f's arm: "stuff" at 193px lost 6.2px), bottom to top the first letter's left side (a j's hook:
  "just" lost 9.4px, 2.5 mm). The other end reaches into the line above (the Cheer line or the
  body before), which is not cut. A body whose columns end (bottom to top: start) with such a
  glyph gets `padding-bottom` = ceil(S × that overhang + 0.5) px (half a px for the anti-aliased
  edge), and its height counts it; every column counts in full (a shorter column is centred and
  needs less, but the lengths are upper bounds). `sideEval` keeps that much room back in
  characters and length so a body's real padding always fits: first the largest overhang at a
  word end (top to bottom) or word start (bottom to top), since segments end at word boundaries;
  when a word too long for a body is cut between letters and a cut letter needs more, it runs
  again with every glyph's. Text with none of these glyphs at its word ends is byte-identical to
  before. Bench after, with Arial (the vendored renderer with the box's clip lifted): no ink past
  the box's bottom in any case, 0 to 1.1px inside.
- A long line is cut into segments at word boundaries, by height and by an equal share of the
  characters; body k takes segment k of every line, and an empty column holds a U+00A0 so the
  others don't move. `up` sends multi-part runs last first. Sizes: `fit1`, `width`, px 20..300.
  `sidePlan`, `sideFit`, `buildSideBodies`, `sideReport` as for big text.
- `fit1` tries EVERY size from 20px to the width rule's (`bigSearch(..., true)`), not big
  text's binary search: for sideways text the cheer count is not monotonic in the size (where
  the word and letter cuts land moves it up and down), and the search could pick a size that
  costs a cheer more than a smaller one (round 3). `sidePrep` measures every line's words and
  graphemes once, so each size is arithmetic only.
- A block with more lines than fit even at 20px is wider than the paper; `margin:auto` cannot
  centre it, so it sits against the left edge and the right edge cuts it. Top to bottom loses
  the FIRST lines (line 1 is the rightmost column), bottom to top the LAST; `sideReport` and
  the size labels say which. A ONE-line block past the rule at a fixed size has no lines to
  lose: its note says the letters run past the paper's edge.
- `sideReport` adds "Press Enter between words to make more columns" when Auto (`fit1`) had to
  shrink a block with a spaced line below the width rule's size and its capitals are under
  1.5 cm: a typed line is ONE column and never wraps, so a sentence on one line printed as a
  thin column (the textarea soft-wraps it, so it looked like two lines there).
- The bench's `summary.clippedByContentBox` / `clippedSides` come from the ink: dark pixels in
  the content box's outermost row or column on that side, where `overflow:hidden` cuts. The
  boxes are reported apart as `boxOverflowSides`, and they are font boxes, not ink (1.117em
  against big text's line-height .8, a sideways column's whole font box), so nearly every big
  and sideways part lists sides there with its ink well clear. Until 1.0.0's final review the
  verdict was the box one, and it called almost every correct big or sideways print clipped.

**Glyph-art (High Roller).** The canvas work stays in the glue; these take a finished grid.
The tier picks the form (`GLYPH_FORMS`):
- `cjk` → **R1** `<div style=font-size:<K>vw;line-height:1>` + one `<div>` per row of cells,
  so a row can never reflow into the next. Rows used to break
  themselves at `width:<C>.2em` with no separator; Chromium 156 rounds each Han advance to the nearest
  whole px (10.69 → 11 at 58 mm), so 14 cells no longer fitted 14.2em and every row reflowed at 13
  (found by CI, reproduced with that Chromium; 24 columns would have reflowed at 25 on 80 mm). K =
  floor(100 × (152 − C/2) / (1.81 × C)) / 100 keeps a row inside 58 mm's 153px even when every
  cell rounds up half a pixel, so no row wraps either. C is 12..30. vw is the page width, so the
  same message fits both papers. The rows centre on the receipt's own `text-align:center`. One
  cheer holds 19 rows at 12 columns (a row's `<div></div>` is 11 characters; it held 27 with a
  `<br>` between rows, and 34 when rows broke themselves at a width). Known limit: because newer
  Chromium rounds each advance to a whole px and older Chromium does not, the picture's WIDTH
  depends on the browser's version (height does not): measured on the bench, 30 columns on
  58 mm print about 10% wider in Chromium 156 than in 141, and Braille (0.733em cells at a
  whole-px F) on 58 mm at 28+ columns about 9% narrower; within about 5% on 80 mm. Nothing
  shears, wraps or is cut. The cjk and Braille tier hints say so. A whole-px R1 font size per
  paper would make the cell the same in every version; it was left for after 1.0.0 because it
  changes the R1 payload, its fit and every number pinned to it.
- `ascii`, `asciifull`, `safe` → **R4** `<pre style="font:<K>vw/1.2 'Courier New';margin:0">`
  one `<div>` per row, each row escaped. Courier New is 0.6em on the rig and the bench; `<pre>`
  keeps the ASCII ramps' spaces. K = floor(100 × 152 / (C × 0.6 × 1.81)) / 100. C is 8..48. The
  blocks tier shows thin seams between rows at line-height 1.2 on the bench.
- `braille` → **R6** `<div style=font-size:<F>px;line-height:<F+2>px>` one `<div>` per row,
  F 6..12. The rig's Braille face is unmeasured (Courier New has none), so the card says it
  needs a test print.
- `glyphCols` clamps the columns per form and paper; `gridRows` at `glyphAspect(form, cols,
  paperMm)` gives the rows: `GLYPH_ASPECT` (cjk 1, mono 0.5, plain 16 / 21.6), and for Braille
  0.733F / (F + 2), which follows the font size (sampled square, a round picture printed 1.6 to
  1.8 times too tall). `glyphGrid` and `tools/payload.mjs` both size the rows this way. Every grid is banded into bodies by characters
  (the tags repeat in each band) and by height (the room), the rows spread evenly over the
  bands the greedy pass needs (7/7/6, never 9/9/2: a last cheer with a sliver of two rows). A
  room of 0 or less (a box the Cheer line fills) bands by characters alone: nothing after the
  Cheer line prints whatever a band's height, and banding by height made a cheer of every row.
  A room above 0 but shorter than one row still gets a row a band, and those bands carry
  `tall` (and `glyph.tall`): the card says every part is cut and to raise Detail (shorter rows)
  or Bits per cheer, and `partWarned` counts it, so the verdict doesn't blame fonts.

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
  at most 31 on 80 mm, 53 on 58 mm. The rows are spread evenly over the cheers that takes
  (ceil(R / parts) each), so no cheer carries a lone row. Height = (header + rows + token
  line) × 21.6. A High Roller box too short for even header + one row + token (a small cheer
  under bits per inch) still gets one row a part, and those bodies carry `tall` so the card
  says the bot cuts every part.
- Text: the glue's `designTTextGrid` draws the text rotated 90° clockwise down a column C cells
  wide (cells 16 × 21.6, so letters keep their shape), quantized to the cjk ramp without
  dither. At most `HAN_MAX_LINES` (50) typed lines (`hanTextLines`); the rest are left out and the
  card says how many (`hanzi.droppedLines`). The bound is the preview, not the canvas: every
  part is a frame running the bot's renderer, and 100 one-word lines made 73 cheers whose
  frames froze the page for about 30 s. It
  was 24, silently, which cost a 26-line stack its last letters once every Big and Sideways
  block fell back to Han tiling below the threshold. It reads by turning the receipt anticlockwise. Pictures: `buildDesignTPicture`
  frames C − 2 cells with a 丶 column each side, which absorbs a one-cell slip if the quote is
  wider than expected.

**Probes.** The app cannot see the streamer's threshold, so two one-cheer tests answer it on
paper. Each returns `{bits, mode, bodies, note}` and goes through the normal packer as a
one-part stack.
- `buildHighRollerProbe`: exactly the threshold. BIG at 60px, MMMMM sized to the width rule
  (does the right edge survive?), "jog" at LH 1.15 (descenders), BIG upside down, and UP in
  `sideways-lr` (does the streamer's Edge draw it?), about 250px in all. It is built against
  the box the threshold's bits buy (`contentLimitPx` with the streamer's bits per inch and
  maximum length): the shapes are kept in order of what they prove (BIG, UP, the upside-down
  BIG, jog, MMMMM) while they fit after the Cheer line, printed in their usual order, and the
  note asks only about the ones kept and names the ones left out (`left`). It returns `works`:
  false with High Roller off, or when not even BIG fits (the note says the test can't show
  anything at these settings: "the Cheer line fills it" when it does, else how many mm are left
  after the Cheer line, too short for BIG's 13 mm), and the glue then offers no Copy.
- `buildPlainProbe`: one bit under the threshold (1 bit when High Roller is off): a Design T
  grid with HI in block letters and a row of the ramp's tones. When the threshold is 1, every
  cheer is High Roller and it says there is no plain test.

**Migration (saved work from before 1.0.0).** `migrateBlocks(blocks)` is pure, idempotent and
decided by shape, not a version stamp; it never mutates its input and never drops the user's
words.
- A **takeover** (any of its three saved shapes: the item list, the Blank style's
  `picture`/`l1`-`l3`, the Fake-cheer style's `avatar`/`cBits`/`cName`/`cNote`) becomes one Big
  text block per line (`bigLayout: "lines"`, `bigSize: "fit1"`; a `fmt` rides along unused)
  and one Glyph-art Image block per picture. A long line then prints small, so the migration
  banner says to pick Auto under Layout for bigger letters. An empty takeover is dropped. Every block made
  from a takeover gets a **fresh id** above every id in the stack (removing or moving a block,
  its Undo and the cards' notes all find a block by its id).
- An **old text block**: Giant type (`render: "giant"`) → big text, layout kept (the Emote
  layout → lines), level n → `giantLevelPx(n)` = round(16 × 1.2ⁿ) px (constants hardcoded,
  n clamped 1..18, then 20..400); an Emote-layout block → `bigSize: "fit1"` (its level sized a
  1em emote picture, not letters: "Kappa Kappa" at 205px printed cut off). Type, or no render, by `orient`: 0 → big text (lines, fit1),
  180 → the same with `bigFlip`, 90 → sideways down, 270 → sideways up. The old fields
  (`giantLayout`, `giantSize`, `orient`, `rotateLen`) go; `size`, `cols` and `fmt` stay, unused.
  Han tiling keeps its render.
- An **image block** loses `renderAs` and `embedV` (the old carrier pick). A Glyph-art block
  made from a takeover picture gets 16 columns (`newBlock`'s; the 40 an older build used would
  print as 30, the most Han characters take).
- A Giant type level keeps its px even when that is too wide for the paper (the spec's
  mapping); the card then says the letters are cut off rather than "fits".
- `migrationRewrites` is true when a takeover or an old text block is present.
  `migrationNote` writes the one-time note: what changed, what could not be carried over
  (Giant type's emotes now print as words; the old fonts and italics are gone), the backup's
  name, and that loading it converts it again while Export JSON keeps it as it was; with
  `unsaved` (no backup could be written) it says so instead and points at the JSON box. The glue
  shows it as a banner above the blocks (`#migrationNote`) on the load that converted the stack,
  until "Got it" or the next reload (shown once: the stack is converted by then). Loading a
  pre-1.0.0 preset converts the loaded copy and puts `migrationNote(blocks, name, true)` in
  the presets note (the stored preset is unchanged). A Giant Emote-layout level sized a
  picture, so those blocks get `bigSize: "fit1"`, not the level's px. `MIGRATION_BACKUP_NAME` is `"Before 1.0.0"`;
  `freePresetName` never takes a name the user already has, keeps "Name (2)" within the 60
  characters a name holds (the base is cut; at 64 the next load cut it back to the very name it
  was renamed away from), and keeps its set of taken names without a prototype ("constructor"
  is taken only when a preset has it).

**App state, read through sanitizers.** Settings and block fields arrive from storage, presets,
imported JSON and form controls (as strings), so everything reads them through these:
`normalizeControls` (the `rw_controls_v1` fields: `cheer` (default on), `bits` (100),
`hrThreshold` (25), `bitsPerInch` (0), `maxInches` (0), `paperMm` (80), `nonce` (off; only an
explicit `true`), `thermalView` (off), `thermalDither` (`floyd`); unknown fields are ignored, so
the next save drops them), `blockRender` (`big` | `sideways` | `hanzi`, junk → `big`),
`bigOpts`, `sideOpts`, `glyphOpts`, `hanziWeightOf` (400 or 700). `modeNotice` is the notice
above the parts (a free test, or why the stack prints plain and how to change it).
`noRoomAdvice` is what replaces the bits total when the box leaves no room after the Cheer line
(raise Bits per cheer, with the streamer's bits per inch; or, under a maximum length, that it
would have to be longer). Both take a `shape` (`partsShape(parts)`): a Han tiling part has no
Cheer line at its top (its token goes last), so when every part is one they say the box is
shorter than one line and each part prints only its light first row, and a mix names both.
`forkDither(rgba, w, h, outWidth, mode)` is the C# Ditherer port (integer arithmetic and
arithmetic shifts as in the C#, the ≥ 250 / ≤ 5 clamps, transparent pixels over white).
`previewEvent` / `previewVerdict` / `avatarExtraPx` are the app's half of the preview (below).

**Presets.** `makePreset` deep-copies (a preset outlives the stack it came from);
`parsePresets` validates untrusted JSON and says what is wrong; `upsertPreset` replaces by
name (the glue asks first: Save under a taken name turns into "Replace?" for a second press);
`importPresets(presets, incoming)` is Import: it ADDS every preset and never replaces one, a
name taken by a saved setup or by one added earlier in the same import getting
`freePresetName`'s "Stream (2)" (upserting lost a setup when a file held two of one name, and
replaced saved ones without asking); a preset already saved exactly as it is (same name, same
blocks, compared by `canonJson`, keys sorted) is left out and listed in `same`, so Export then
Import no longer doubles the list; "same name" includes a copy an earlier Import renamed
(`presetNamedFrom`: "Stream (2)", the base cut as `freePresetName` cuts it), so importing a file
whose names clashed a second time adds nothing either; it returns `{presets, added, renamed, same}` and the note
says which were renamed and which were already saved. `cleanBlocks` (shared with `saveBlocks`) strips `_`-prefixed runtime fields;
`isMintedImageUrl` matches only this Worker's own upload links, by shape, across all three
generations; `presetImageUrls` walks a stack's picture links.

### The browser glue

- **Page layout.** `.layout` is a grid: the blocks (`.controls-blocks`) and, under them, the
  presets and settings (`.controls-settings`) in the left column, the preview beside both. Below
  700px it is one column in DOM order, blocks, preview, settings, so on a phone the preview and
  Copy sit right under the blocks (they were about 1,900px down, past every setting). Card
  controls get labels: `labelControls(card)` ties each `<label>` that sits before its control
  with `for=` (ids `rwc-N` from `ctlId`), `sliderRow` names its input with `aria-label`, and the
  head's ↑ ↓ × buttons and every ↺ have `aria-label`s ("Remove block", "Reset detail (columns)
  to 18"); tests find them by those names.
- **Rasterising.** `renderColumn` draws one line of text rotated 90° clockwise in Arial (400 or
  700: 600, 700 and 900 rasterise identically, so Han tiling offers Regular and Bold),
  measured from its real ink box and scaled uniformly; `textColumnsLuma` stacks the lines down
  the feed; `rasterizeImage`; `computeGrid(kind, tier, o)` samples with `o.cellAspect` (text)
  or `o.charAspect` (images) so the cells keep the picture's shape.
- **Blocks to bodies.** `renderBlockBodies(block, ctx)`: a Real picture → nothing; a Glyph-art
  picture → `glyphImageBodies` (decoded once into `block._img` by `decodeGlyphImage`, turned by
  `block.rotate` on a canvas by `glyphSource`; `glyphGrid` samples it for the tier's form, or
  for Design T in plain mode). Runtime-only decode state: `_decoding`, `_decodeKey` (a slow
  read of an older link never lands over a newer one; `cancelDecode(block)` retires the read in
  flight whenever the source changes without a new read starting: the link emptied, typed on a
  Real picture card, or replaced by an upload, where the old read used to land and print the
  picture the field no longer named) and `_decodeFailed` (the source that
  could not be read; it is not asked again until the link changes, where every refresh used
  to re-fetch it through /px). A picked file is read on the device and never uploaded, so it
  replaces the link (`url` ""), and its name is kept as `fileName` (a saved field): after a
  reload or in a preset the card, the parts placeholder and Save all say to pick it again; text → `hanziBodies` when the render is `hanzi`
  or the stack is plain, else `buildSideBodies` / `buildBigBodies`. `packStack(blocks, opts)`
  builds every block against ONE `stackContext(opts)` and packs with that same object, and
  stamps `blockId` on every body so a card can find its own parts.
- **Settings.** `getSettings` reads the panel through `normalizeControls`; `stackOpts(extra)`
  adds `noNonce` and any probe override. `syncModeUi` writes the Bits hint for the current
  threshold; `syncNonceUi` disables (doesn't uncheck) the repeat number without Cheer-ready,
  and `getNonce()` is on only while it is checked AND Cheer-ready is (every builder, both
  probes and `copyPart` read it): the tests, real cheers either way, used to carry the digits
  while the page showed the option as off.
  `saveControls` writes exactly `normalizeControls`' fields; `restoreControls` reads them back.
- **Cards.** `textCard`: Render select (`.sel-render`), then Big (`.sel-layout`, `.sel-size`,
  `.chk-flip`), Sideways (`.sel-dir`, `.sel-side-size`) or Han tiling (`.sel-weight`). Every
  layout and size option is labelled with what it would print for the current text (capitals
  in cm, "N cm of message" (the bodies' height: the header, Cheer line and footer come on top,
  and the part's verdict gives the whole receipt), cheers, cut-off flags), computed for a High
  Roller cheer and cached by key; in Each a numeric size is "up to N px" with the capitals its
  lines really get. While the textarea has focus the labels wait until 250 ms after the last key
  (`relabelSoon`; each relabel plans every layout and size, about 30 plans, and froze a long
  text for half a second a keystroke), and focusing or pressing a select draws any still
  waiting (`relabelNow`); the note and the parts follow every key. The Layout hint (`.layout-hint`) is one sentence about the layout picked.
  Longer fixed explanations (the render, the font, sideways, Han weight, the tier) fold behind
  a native `<details class="hint more"><summary>What's this?</summary>` (`moreHint`; no state,
  nothing saved), and so does the Thermal caption's detail. The head's ↑ is disabled on the
  first block and ↓ on the last (`cardHead(block, i, n)`). × removes the block at once (and
  saves), and keeps it for **Undo**: the block, runtime fields and all (a decoded picture comes
  back with it), and its index wait in `removedBlock`, and `renderComposer` draws "Removed a
  Text block (…). Undo" (`.undo-note`; the button `#undoRemove` takes the focus) where it was,
  until the next add, move, removal, Undo or preset load. Memory only, nothing stored, and no
  timer: a note that vanished by itself would shift the cards under a finger. After ↑ or ↓ the
  focus goes back to the same button on the moved card (the other one when that is now
  disabled), and after Undo to the restored card's first control (`blockCard(i)`): the redraw
  used to drop it on the page body. On a touchscreen
  or below 700px the head's buttons are 44px targets and × stands apart from ↓ (a mis-tap
  while reordering used to delete the block for good). The tests count cards as
  `#blockList > .block-card`, since the note sits among them. The note
  (`.text-note`) is `bigReport` / `sideReport` or a Han tiling summary, plus where the block
  sits in the run, read off the PACKED parts (`blockParts`, `partLines`) through a `costSyncs`
  callback, which always gets the STACK's last parts (`stackParts`), so a probe shown in the
  parts never rewrites the cards (they went blank); while a probe is shown, `refresh()`
  recomputes the stack's parts too, so the cards follow a picture that lands meanwhile. The
  note's first line is the summary, then warnings in orange (something to change: `note-warn`),
  then information in grey (`note-fine`: where the block sits, why it prints plain, the CJK
  font it needs); `partLines` returns `{warn, fine}` for that. The Text box has as many rows as typed
  lines, 2 to 8. Below the threshold the labels describe a cheer AT the threshold (its bits, so its
  box under a bits-per-inch setting); with High Roller off the note says so instead of "below
  the threshold (0 bits)". In a free test the note counts messages, not bits. `imageCard`: Kind
  (`.sel-kind`: Glyph-art or Real picture), URL, file (with a hint of what happens to it for
  that kind), Rotate (`.sel-rotate`, both kinds); for Glyph-art the Characters select
  (`.sel-tier`) with per-form hints and a column range that follows the form (the Detail field
  shows the columns the grid really uses, `glyphCols`, and committing a value writes the
  clamped one back; an emptied field changes nothing while it is retyped and takes the default
  when left empty; a new block starts at 16 (`GLYPH_COLS_DEFAULT`), so a square picture is 489
  characters, one cheer, where 18 is two now that every row is its own `<div>`, and the face
  printed in halves with the bot's header between them), **Darkness** (the stored `contrast`,
  0..255 with 128 as is, shown centred as −128..127: it is a tone shift, not a contrast) and
  **Smooth shading (photos)** (the `dither` field: error diffusion over the characters, not the
  thermal view's dither); for a Real picture the red can't-print note, "Switch to Glyph-art", a
  thumbnail and brightness/contrast (baked and re-uploaded; they change the card's picture
  only, and the card says so). The file input is emptied once its file is taken and on a change
  of kind, so picking the same file again always fires (it didn't after a switch to Real); the
  line under it (`.file-use`) names the picked file in use ("Using “smiley.png”, read on this
  device (not uploaded)"), and on a Real picture card says that file was never uploaded, so
  there is nothing to show.
- **Parts.** `composeParts` packs the stack. A stack with nothing printable, or only a Real
  picture, gives one non-copyable notice, drawn as wrapped prose (`.rcpt-placeholder`; it was
  receipt text in a fixed-width box, cut off mid-word); a part with nothing printable in it yet
  (a picture still decoding) is shown but not copyable. `missingPictures` lists every Glyph-art
  block with a source (a link or a picked file's name) that is not in the parts (still loading,
  a link or file that can't be read, an expired upload, a file to pick again), and the parts
  show it in a red notice under the mode notice (`#pictureNote`, `pictureAlert`, one line each,
  "The picture in block 2 from the top …"): as long as another block printed, such a picture
  dropped out of the run with one live Copy and "One 100-bit cheer. Paste it into chat and send
  it." While any picture is still loading, no part is copyable (the parts change when it
  lands). When the streamer's settings leave a
  High Roller cheer no room after its Cheer line (`boxNoRoom`), every part is `noRoom`: a red
  note says it prints nothing but that line (a plain grid: only its light first row), its Copy
  is disabled, and `noRoomAdvice` replaces the bits total. Every card agrees: Big and Sideways
  say only "Prints nothing" (`NO_ROOM_SUMMARY`: no price and no size, since none prints), the
  Han tiling summary says only its light first row prints, the Glyph-art summary drops its
  cheer count, and `partLines(where, parts, noRoom)` leaves out "Your whole stack needs N
  cheers". The mode notice and the no-room line carry a button to the field that fixes them
  (`settingFix`, `fixButton`, `goToSetting`: "Change Bits per cheer", or "Go to Maximum length" /
  "Go to High Roller threshold"), which scrolls there and focuses it: on a phone the settings
  sit below every part. Without the repeat number, a part identical to
  the one right before it gets a note (Twitch won't send the same message twice in a row
  within 30 seconds). When every copyable part is taller than the box the streamer's settings
  give a cheer (`item.cut`: a Han tiling row under a high bits-per-inch, say), a red line above
  the total (`#partsCut`) says the bot cuts every one and what to change. A part holding a block
  too wide for the paper at its size (`item.wide`, the blocks' numbers) says so beside Copy
  (`wideLine`), and the total stops saying "Paste it into chat and send it" under it.
  **`update()` vs `refresh()`:** `update()` is for the user's own edits and drops a probe view
  back to the stack; `refresh()` redraws the view on screen and stays there. Work that finishes
  on its own (a Glyph-art read, an adjust bake, an upload, the expiry check) calls `refresh()`:
  with `update()` a read landing under the High Roller test swapped the stack's parts in, and
  the next Copy sent the stack's part 1. The expiry check's card rebuild keeps the focused
  control, its caret and scroll (`keepFocus`), since it lands 700 ms after a keystroke. An upload
  on a Real picture card writes the minted link into the card's Image URL field; the link and
  the status line are the BLOCK's (`block.url`, the runtime `block._status`) and the image
  card's `syncGlyph` shows them on every refresh, so an upload that lands after the cards were
  redrawn (add, move, ×, Undo, the expiry check) shows on the card on screen, not a detached
  one. Bits per cheer
  that isn't an amount (0, negative, emptied) reads as the last amount it held (`lastBits`) and
  is put back when the field is left, with the hint naming what was refused. The streamer's
  three number fields do the same for anything that isn't a number of 0 or more
  (`lastStreamer`; a negative threshold used to become the default 25 and flip every block), and
  say so beside the field (`#hrThresholdNote`, `#bitsPerInchNote`, `#maxInchesNote`,
  `streamerNoteFor`), as they do when a value is capped to the bot's limit (1,000,000 bits, 40
  inches).
  `probeParts(kind)` builds a probe the same way; its view's notice
  carries a "Back to my stack" button (`#backToStack`) and, with Cheer-ready off, says the test
  is a real cheer anyway (it has to print to show anything). `renderParts` shows the mode notice, a
  persistent card per part and the total (bits, or a free test's message count; one part says
  "One N-bit cheer" unless it carries a note of its own, as a probe does). A part over 500
  characters replaces the total with a red "too long for Twitch to send … Fix it before
  pasting" (`.too-long`): it said "send it" under the part's own note that Twitch rejects it. A part's
  header (`.part-head`: "N / 500 characters" and the kind label in `.part-info`, which wraps
  beside the full-size Copy button, `.copy-btn`) is sticky, so Copy stays in view while a
  40 cm preview scrolls past; the part's note, then its preview and verdict, follow.
  `copyToClipboard` returns a promise of whether the text reached the clipboard (writeText,
  else the execCommand fallback with its result checked); `copyPart` says "Copied" only then
  (`lastCopiedIdx`), and otherwise shows the part's payload in a read-only box under its header,
  selected once (`copyFailIdx`, `copyFailFocus`), with "Couldn't copy automatically: select
  this text and copy it". Both remember the payload as well (`lastCopiedPayload`,
  `copyFailPayload`), and a part shows either state only while it still holds exactly that
  payload: an index alone outlived its parts (after a probe's Copy failed, Back to my stack
  showed the stack's part 1 in the box). The header and its Copy button (`pc.head`,
  `pc.copyBtn`, reading `pc.index` when clicked) are made once per part and updated in place,
  never replaced or moved: leaving a number field for Copy fires its change, and the redraw used
  to swap the button between mousedown and click, so the click was lost and the clipboard kept
  the older payload. After a probe (or Back to my stack) renders, `revealParts` scrolls
  the notice or the parts into view (smooth unless the viewer asks for reduced motion) and
  focuses the first live Copy, else the Back button. `partWarned` (the app already expects a cut: too tall for the
  box, or a block too wide for the paper) keeps the verdict from blaming fonts. `copyPart`
  advances that part's nonce only when the repeat number is on. Committing a number field
  (change) writes back the value the app uses (0 or an emptied Bits per cheer goes back to the
  last amount it held, 50 inches → 40); the Thermal
  dither select is disabled while the Thermal view is off, with "(turn on the thermal preview
  first)" beside it (`#thermalDitherOff`).
- **Presets and the expiry check.** `seedBlocks` migrates a saved stack once and saves it; when
  `migrationRewrites` is true it queues the backup preset, which `initPresets` writes only
  after the user's presets have loaded, merged in with `upsertPreset` under a free name, and
  never over an unreadable `rw_presets_v1`. When it can't be written (presets unreadable, or
  storage refuses it: `persistPresets` returns whether it took), the stack as it was goes into
  the JSON box under Presets, shown, and the banner says so (`migrationNote(…, unsaved)`): the
  converted stack is already saved, and it used to be converted with no word at all. `applyPreset` migrates a deep copy; **stored
  presets are never rewritten** (export gives back what was saved, and the backup keeps its
  takeovers), and a JSON import is added as is (`importPresets`: never over a saved setup) and
  migrated when loaded. Load asks first ("Replace stack?", `armedLoad`, like Save's
  "Replace?" and Delete's "Really?") when the stack on screen matches no preset
  (`stackIsSaved`: each preset migrated, ids and the Real picture's derived `outUrl` / `aspect`
  aside, keys sorted; a stack holding none of the user's work has nothing to lose,
  `blockHasWork`: text, or a picture's link, file, rotation or adjustments, Real pictures
  included, though they print nothing).
  `probeStackExpiry` checks this Worker's upload links (15-minute TTL) by loading each into a
  `new Image()` (no CORS grant, no `fetch`), flags a dead one on its card and redraws the parts
  too (their red notice then says "expired", as the card does), and RETURNS a promise
  of how many it flagged (it once didn't, and Load's "Checking…" never resolved), which Load
  reports for Glyph-art blocks only (counted on the converted stack, so an old Takeover's
  picture counts; a Real picture prints nothing whatever its link does) ("Its uploaded pictures
  still load" / "N pictures' links have expired: pick the file again or paste a fresh link");
  a preset with no uploaded Glyph-art link promises no check. A Glyph-art block that read its
  picture before the link died still prints from that copy (`_img`) until a reload or a preset
  load: its card says so in grey (not the red "prints nothing"), and it is not counted. The
  preset list is keyed by INDEX, not name (`renderPresetList(pick)`, `selectedIndex`), so a list that holds
  two presets of one name (an older build could save one) still loads, renames and deletes the
  one picked; Rename refuses a name another preset has, and says when the name is unchanged.
  After Delete or Import moves the list's pick, the name box follows it (`syncPresetName`), and
  when the migration backup is written the list picks it, since the banner names it.

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
re-renders instead of reloading about 130 KB); every request carries a sequence number and an
older answer is dropped. Cards carry `data-render` (pending/done) and `data-thermal`
(pending/done/failed); the frame keeps `window.__rwPreview` for the tests.

**Drawn lazily, one at a time.** A long stack is 80 parts or more, and all their frames at once
(about 130 KB and a renderer run each, again on every edit) froze the page. A part asks for its
drawing only when its card is within 800px of the viewport (`IntersectionObserver`,
`onPartsSeen`, `previewNear`); requests go through one queue (`queuePreview`,
`pumpPreviews`, `startPreview`) that keeps one frame busy at a time (`previewBusy`;
`previewDone` frees it when the newest answer arrives, a frame that never answers is let go
after 4 s and tried once more later, and a newer request for the busy part goes straight to
its frame). Until a part's frame exists, a `.rcpt-wait` box of the predicted receipt height
(the packer's `contentPx` plus the header and footer the last drawn frame measured,
`chromePx`) holds its place; Copy, the header and the notes are there at once. A part far from
the viewport keeps its last drawing and redraws when it comes near; the Thermal view
rasterises only near parts. **Test hook:** `window.__rwPreviewAll = true` makes every part
near (the browser tests' `freshPage({eager: true})`, used by the contract and preview tests).
Han tiling keeps its text's raster on the block (`_han`) while text, paper and weight are
unchanged: a 50-line stack redrew 50 canvas lines on every refresh.

**Driven like the bot.** `previewEvent(o)` builds the call the way the C# routine makes it (a
`TwitchCheer` carrying the bits and the message untouched) and the way the bench does:
`{__source: "TwitchCheer", bits, user: "viewer", message: <the part's exact payload>}` with
`{highRollerBits, highRollerBitsPerInch, highRollerMaxInches, hideLinks: false}`. No
`userName`, so no avatar lookup starts (a real cheer has one, so its header is taller:
`avatarExtraPx`, 182px on 80 mm, 151px on 58 mm, and the verdict says so). The
renderer, not this app, decides High Roller or plain, the box and the fade. A free test (Cheer-ready off) is drawn as a High Roller cheer
(threshold 1) and says it never reaches the printer.

**The verdict** under each part (`previewVerdict`): the receipt's height in cm and px, plus
what a found profile picture adds (about 4.8 cm on 80 mm, 4.0 cm on 58 mm; `#receipt-avatar` is
min(11.5em, 100%) square with a 14px gap and replaces the 16px top padding); a
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
Compared with the bot's own screenshot of the same page (forkbench): same heights; plain text
and 80 mm Han grids dot for dot; big and sideways text the same shapes with a few edge dots
dithered differently; header and footer text one or two dots lower. Small fixed-pitch grids on
58 mm, and Braille on either paper, drift further: rows up to 3 dots off, and their texture
differs (review round 2: 58 mm Braille 33.5% of dark pixels after the best shift; round 3: a
30-column Han grid on 58 mm differs on 24% of the bot's dark dots in Crisp, with whole
horizontal strokes gone, and 108% in Detailed). The cause is that this page lays out at 1 CSS
px per px and scales, where the bot lays out at its dot scale; CSS zoom instead of the scale
is no fix (Detailed improves, Crisp gets worse), and rasterising the frame itself at the dot
scale has not been done. The caption says all of this plainly (the computer's fonts may
differ; small grids on 58 mm and Braille can differ from the print, strokes included, so judge
them with the thermal view off). The canvas is shown
at one scale for both papers (`min(576px, 100%)` and `min(384px, 66.67%)`), so 58 mm is two
thirds of 80 mm (in a column narrower than that on a standard-density screen, some rows and
columns of dots are skipped on screen, and the caption says so and to zoom in), and the Thermal dither select is disabled while the view is off. The grey logo
placeholder prints as dots in Detailed and Soft and not at all in Crisp.

### "SassyTP shipped a new version"

1. Find the new commit in <https://github.com/SassyTP/printer-bot> (its `versions.json` names
   the renderer path).
2. `NODE_USE_ENV_PROXY=1 node tools/vendor-renderer.mjs --ref <40-hex sha>` (add `--path
   v/X.Y.Z/renderer.html` if needed; `NODE_USE_ENV_PROXY=1` only matters behind a proxy), then
   `node tools/vendor-renderer.mjs --check`. Without `--ref`, the tool (a plain write and
   `--check` alike) follows the commit the committed block names (its `data-commit` and
   `data-path`, and the upstream sha256 in its notice), so the check right after a correct
   update passes and a plain write can't put the old renderer back over the new one; it uses
   its own `PINNED_*` only on a first run, when the page has no block. (It used to use
   `PINNED_*` every time: the check failed right after a correct update, and a plain write
   restored 2.5.4 without a word.) It says so on stderr while its pin is out of date.
3. Point both tools at the same commit: `tools/vendor-renderer.mjs`'s `PINNED_SHA`,
   `PINNED_PATH` and `PINNED_SHA256`, and `tools/forkbench.mjs`'s `PINNED_SHA`,
   `RENDERER_PATH` and `RENDERER_SHA256`. Then re-bench the modes whose shape matters to you at
   80 and 58 mm.
4. Read the diff of the renderer for anything in "The target" above (allow-lists, the box,
   plain text, geometry) and update this file's line numbers and facts.
5. Run both suites. The contract test re-runs every mode through the new page.

## Measuring: the bench

"Does it print?" is answered by measuring. The tools are dev-only, never shipped, never in CI
(CI is offline), and no test imports them. (One test reads one: `test/state.test.mjs` takes
forkbench's `forkDither` source out of `tools/forkbench.mjs` with a regex, without importing or
running the tool, to check that its port of the bot's ditherer and the app's agree dot for dot.
Keep that function's shape, `function forkDither(` to a closing brace at the start of a line,
or that test fails.) Everything they write or cache goes to the gitignored `.render/`. Never
commit a font or the upstream renderer page.

- **`tools/forkbench.mjs`** (`npm run bench -- …`) renders one message through SassyTP's real
  `renderer.html` in Playwright's Chromium, the way the action drives it: `--paper 80|58` gives
  a 272 / 181 px page at deviceScaleFactor 576/272 or 384/181. By default it fetches the page at
  the pinned commit into `.render/sassytp/<sha>/` with a `.json` note (url, commit, sha256,
  bytes, fetch time) and refuses a copy whose sha256 is not the recorded one; `--offline` uses
  the cache only, `--renderer PATH` a local file. Every non-file request is blocked inside the
  page. It writes `<out>.png` (the screenshot at dot width), `<out>-1bit.png` (dithered by its
  copy of the C# Ditherer port: `--dither floyd|atkinson|threshold`) and `<out>.json` (also one
  line on stdout: ok, height, trimmed, security, part class, fonts, the ink's box and a
  `summary` whose clipping verdict is read off the ink, not the boxes). Other flags:
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
- **Tags: `div`, `pre`. Attribute: `style`.** Nothing else: never a picture tag and never a
  `<br>` (see the field record). Every style declaration that matters is one the bot's
  sanitizer keeps; the contract test proves it for every mode.
- **One `<div>` a line.** Every line of big and sideways text, every glyph-art row and every
  stacked letter is `<div>…</div>` (`LINE_OPEN` / `LINE_CLOSE`, 11 characters, `LINE_COST`)
  inside the styled div, and a blank line or word gap is `LINE_BLANK` (a div holding one nbsp:
  an empty div has no height, an nbsp one is one line of the font it sits in, exactly as a
  blank line between two `<br>`s was). A block of one line (big text) or one column (sideways)
  is the bare styled div, as before. Heights are unchanged; characters are not (a line or row
  costs 11 where a `<br>` between lines cost 4), so fewer rows and stacked letters fit a cheer.
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
  and 58 mm, with ordinary and hostile input, send only `div` and `pre` with only `style`,
  never a forbidden tag (a `<br>` included) in any case, and never a message starting with
  `<`.
- **The MANDATORY contract test** (browser suite): every mode's Copy payload (big auto, lines,
  stack, each and upside down; sideways down and up; glyph cjk, ascii, blocks, braille; plain
  Han tiling; plain CJK picture; both probes; a Han and an emoji run at a fixed size too wide
  for the paper, each followed by another block) at 80 and 58 mm, above and below the threshold,
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
- **Lazy previews.** A part's frame is drawn only near the viewport, so a test that needs every
  part drawn passes `eager: true` to `freshPage` (the app's `window.__rwPreviewAll` hook), and
  `drawnPart` scrolls its card into view first. One test builds 80 parts and holds the lazy
  path to its promises (Copy before any frame, at most 20 frames, a far part waiting at its
  height, a fast keystroke, the last part drawn when scrolled to).
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
- `.text-note` is the card note's class. It wraps anywhere, and a note quotes a user's word or
  line through `quoteCut` (23 characters and "…" past 24): a 43-letter word quoted whole ran off
  a phone's screen.
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
