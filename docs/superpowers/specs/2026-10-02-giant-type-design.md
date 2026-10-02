# Giant type via printer-bot's own `.title` class, cheer-gem tuck, size ruler, real-CSS bench — design

**Date:** 2026-10-02
**Status:** implemented in 0.10.0 (see "As built" at the end for where the build departed from this text, and why)
**Branch:** `ccr-ddb10c10-w6i2pl`

This is the final (v2) spec, committed as written apart from the edits listed here. It
was adversarially reviewed before implementation by four critics: real-engine fidelity,
integration, rules/tests/docs, and UX. Their findings are folded into the text and cited
by tag (`fidelity#2`, `ux#4`, `integration#9`, ...). The working files the spec pointed
at (a facts sheet on printer-bot, the four critiques, a scratch real-engine bench with
locally installed Segoe UI faces, and two font-metric tables) were session scratch. They
are not in the repo, and the fonts and nutty's files never will be. The measurements
that matter are recorded in `CLAUDE.md` ("Settled for Giant type and the tuck"), and
the width-table derivation is documented next to `GIANT_W`. Line numbers (`L2315`, ...)
refer to 0.9.1's `public/index.html`.

App: `public/index.html` (one IIFE; ES5 style `var`/function expressions; "use strict").
Release: **0.10.0**, dated **2026-10-02**.
Hygiene: never paste nutty's third-party file contents into repo files; refer to them by
name. (Their source repo, `nuttylmao/nutty.gg`, carries no licence: all rights reserved.)

## 0. Why it works (use this wording in docs, plain language)
printer-bot's sanitizer strips the `style` attribute but keeps `class`. printer-bot then builds the printed receipt with
`GetRenderedHTML`, which copies every stylesheet on its settings page — including nutty's shared UI stylesheet `global.css`
— into the document wkhtmltopdf prints. So any class defined there styles our markup on paper. `.title` is
`font-size:1.2em; font-weight:900; text-transform:uppercase`. `em` is relative to the parent, so N nested `.title`
elements multiply: 16px × 1.2^N (15 → ~247px). Every token is sent literally and is on the sanitizer's own allow-list
(tag `b`, attribute `class`); nothing is disguised from automod, the sanitizer or the bits ledger. It is fragile: nutty
can change the shared stylesheet any time. Evidence levels: FIELD — one real cheer carrying the tuck span, 15×
`<b class=title>` and `</br>` passed automod and printed giant stacked letters. BENCH (real wkhtmltopdf 0.12.6.1 + Segoe
metrics) — sizes, line heights, tuck clipping, shrink wrappers. NEVER SENT — `class=setting-description/attribute`, the
padded emote form, the tucked lead with a following giant body without `<br>`.

## A. Pure core (DOM-free, exported). PLACEMENT TRAP: PAPER_PX (L2315) and LEAD_GUARD (L2286) live INSIDE the
`if (typeof document !== "undefined" && document.getElementById)` guard (opens ~L1976). Put the new code as
`var name = function (...) {...}` expressions INSIDE the guard AFTER L2315 (strict-mode block-scoped function
declarations would break module.exports), or read PAPER_PX/LEAD_GUARD lazily. Never `var X = PAPER_PX` before the guard.
Export LEAD_GUARD too.

1. `PB_CLASSES` — DATA table (carrier-table philosophy; nutty can rename/retune these): entries
   `{id, cls, decl, role, factor?, source, field, checked:"2026-10-01"}` in printer-bot's cascade order:
   - `title`  / cls `title` / decl `font-weight:900;font-size:1.2em;text-transform:uppercase` / role grow / factor 1.2 / global.css / field "printed"
   - `shrink9`/ `setting-description` / `font-size:.9em;font-weight:100` / shrink / 0.9 / global.css / "untested"
   - `shrink8`/ `setting-attribute` / `font-size:.8em;font-weight:200` / shrink / 0.8 / global.css / "untested"
   - `switch` / `switch` / `position:relative;display:inline-block;width:3em;height:1.5em;font-size:1em;overflow:hidden` / tuck / global.css / "sent"
   - `navbtn` / `dialog-nav-button` / `background:transparent;border:none;font-size:1.5em;font-weight:100;padding:0;width:1em;height:1em;position:fixed;top:.5em;right:.5em` / tuck / global.css / "sent"
   - `emote` / `emote` / `height:1em` / emote / style.css / "printed" (printer-bot's own emote rendering)
   `pbClass(id)`; `classAttr(cls)` → `class=cls` if /^[a-z][a-z0-9-]*$/ else `class="cls"`. All giant/tuck markup and the
   preview CSS DERIVE from this table (GIANT_RATIO = pbClass("title").factor, shrink list, TUCK_OPEN classes).
2. `pbPreviewCss(scope)` → one CSS string: `${scope} .${cls}{${decl}}` per entry in table order, EXCEPT role "emote"
   (would shrink the takeover's imgemote preview) and with `position:fixed` → `position:absolute` (the preview's `.rcpt`
   is the page; give `.rcpt` `position:relative`). Plus preview-only adjustment `${scope} .title{line-height:1.33}`
   (Segoe UI's normal line height on the rig, so preview heights match whatever the viewer's OS font). Used by BOTH the
   page (inject a `<style>` in init) and RCPT_CSS (the thermalize string ~L3063-3074).
3. Constants: `GIANT_BASE_PX=16`, `GIANT_RATIO` (=1.2 from table), `GIANT_MAX_LEVELS=18`, `GIANT_MIN_PX=GIANT_BASE_PX*GIANT_RATIO`
   (19.2: no step below one level), `GIANT_GAP_PX=23` (small line: lead line / gap between giant bodies, real engine),
   `GIANT_CAP_EM=0.70` (Segoe UI cap height, for "capitals ≈ X cm").
4. `GIANT_W` — conservative uppercase advance table (em, 3 decimals) = round(max(SegoeUIBold, ArialBold) × 1.03, 3) over
   A–Z 0–9 space . , ! ? - ' " & @ # : / (sources: Segoe UI Bold's hmtx advances over 2048 upm, and Liberation Sans
   Bold, metric-compatible with Arial Bold, measured on a canvas; document the derivation in a comment). `GIANT_W_DEFAULT=1.0`.
   Real engine: 0 overflows across all 1–3 char strings for either font (fidelity#2).
5. `giantLineH(px)` → real-engine line pitch for Segoe UI: `r=Math.round(px); Math.ceil(1.0791*r)+Math.ceil(0.2510*r)`.
6. `giantSteps()` → ascending unique `{levels, shrink:""|cls, factor, px}` over levels 1..GIANT_MAX_LEVELS × factors
   {1, .9, .8} with px ≥ GIANT_MIN_PX (rounding noise ok; sort by px).
7. `giantClean(text)` → `{text, dropped}`: strip `\r`; remove astral code points (U+10000+), U+200D, U+FE0E/FE0F
   (they print as tofu on QtWebKit 534; report them in `dropped`).
8. `giantLines(text, layout)` (after giantClean; split by CODE POINT via Array.from):
   - `stack`: one non-space code point per line; each whitespace run (incl. newlines) → one `""`; trim `""` at both ends.
   - `lines`: split on `\n`, collapse inner space runs, trim each line, drop leading/trailing empty lines, keep interior ones.
   - `emote`: like `lines`.
9. `giantLineEm(line, layout)` → width in em: uppercase (toUpperCase) then sum GIANT_W; `emote`: tokens × 1.0 +
   tokens × GIANT_W[" "] (gaps + the trailing pad space, which QtWebKit counts when centring — fidelity#1).
10. `giantOpts(block)` — sanitizes untrusted fields (presets/imports): layout ∈ {auto, lines, stack, emote} else "auto";
    size ∈ {"fit1","width"} or integer 1..GIANT_MAX_LEVELS (parseInt strings; clamp) else "fit1". `blockRender(b)` →
    "giant" | "hanzi" | "type" (absent/unknown → "type", i.e. today's fall-through). Use both everywhere.
11. `buildLead(opts, nonce)`; `TUCK_OPEN='<span class="switch dialog-nav-button">'` (MUST be quoted: unquoted makes
    `dialog-nav-button` a boolean attribute the sanitizer strips), `TUCK_CLOSE='</span>'`.
    - no cheer → `LEAD_GUARD`; cheer → `token + (nonce?" "+nonce:"") + " "` (token = "Cheer"+(bits>=100?bits:100));
    - cheer+tuck → `LEAD_GUARD + TUCK_OPEN + " " + token + (nonce?" "+nonce:"") + " " + TUCK_CLOSE` (60 chars at Cheer100).
    `leadLength(opts)` = payloadLength(buildLead(opts,"00")) + (cheer&&tuck ? 4 : 0) (the `<br>` the packer may add).
    With tuck OFF everything must stay BYTE-IDENTICAL to today (lead 12 for Cheer100; covers.test's 598 case unchanged).
12. `giantFit(lines, opts)` → `{levels, shrink, factor, px, fits, overflow:[lineIdx], chunks}`; `opts={layout, size,
    budget, fitPx}`; `fitPx` = PAPER_PX (240), minus 5 when tucked (the nbsp shares line 1). A step FITS WIDTH when every
    line's em × px ≤ fitPx. `chunks` = number of bodies buildGiantBodies would make at that step (height AND chars, below).
    - `fit1` (default "biggest that fits ONE cheer"): largest step that fits width with chunks===1; else (nothing fits in
      one) among width-fitting steps the one with the FEWEST chunks, then largest px; if NO step fits width → the
      smallest step, `fits:false`, `overflow` = offending lines.
    - `width`: largest width-fitting step (chunks as needed); none → smallest, fits:false.
    - integer n: `{levels:n, factor:1}` exactly; fits/overflow reported honestly.
    - Empty lines list → `{levels:0,...}` "none" (never L18 of empty tags — integration#9).
    - For a `fits:false` line in `lines`/`emote` layout, the height model counts ceil(widthPx/fitPx) wrapped lines.
13. `buildGiantBodies(text, opts)` → Body[]; `opts={layout, size, budget, tuck}`; budget = chars available per body
    (MAX_CHARS − leadLength).
    - layout `auto`: compute fit1 for `lines` and `stack`; pick the larger px when both are one chunk, else fewer chunks,
      tie → lines. Report the resolved layout.
    - open = (shrink ? `<b ${classAttr(shrink)}>` : "") + `<b class=title>`×levels; close = `</b>`×(levels+(shrink?1:0)).
      (One level = 15 + 4 = 19 chars.) No italic option (dropped: an untested variant; never offer tag/quote/case variants).
    - line html: `escapeHtml(line)` (escapes & < > only; quotes are inert in text); emote layout:
      `" " + tokens.join(" ") + " "` so every emote name is a whitespace-delimited word Twitch can recognise (fidelity#1,
      blocker). Never uppercase the html (emote names are case-sensitive; text-transform is visual only).
    - body.html = `"<br>" + open + chunkLines.join("<br>") + close + "<br>"`; `body.leadBr = true`. Bodies MUST close
      their tags (the packer concatenates raw). Trailing `<br>` at message end adds 0px (measured); giant→giant adds one
      23px small line.
    - CHUNKING: greedy over lines so each chunk satisfies height Σ giantLineH(px) + GIANT_GAP_PX ≤ HEIGHT_BUDGET AND
      chars (open+close+8+Σescaped line chars+4×(n−1)) ≤ budget; ≥1 line per chunk; PREFER to break at a `""` line and
      drop `""` at both edges of every chunk (fidelity#4). A single line that alone exceeds the char budget: emit it
      anyway with `body.giant.over=true` (card warns; never silently truncated).
    - body = `{html, chars:payloadLength(html), heightPx, leadBr:true, preview:{kind:"html", html:previewHtml},
      giant:{levels, shrink, factor, px, capCm, layout, chunkIndex, chunkCount, fits, overflow, over, dropped, cheerWords}}`.
      `cheerWords` = standalone tokens matching /^[a-z]+\d+$/i in lines/emote layouts (Twitch would charge them as extra
      cheers). capCm = px × GIANT_CAP_EM / PX_PER_MM / 10 (PX_PER_MM exists, L2313).
    - previewHtml: same nesting WITHOUT the outer `<br>`s, wrapped in `<div class="rw-giant">` (block → own line);
      emote layout: each token rendered as `<span class="rw-emote-ph">NAME</span>` (dashed 1em square labelled with the
      exact name, `text-transform:none`) — NO `<img>`, NO fetch (CLAUDE.md network rule).
    - Empty after cleaning → `[{html:"",chars:0,heightPx:0,preview:{kind:"html",html:""}, giant:{levels:0,...}}]`.
14. `buildGiantRuler()` → the "Print size ruler" body: `<br>` + `<b class=title>1<br><b class=title>2<br>…13` + 13 closers
    (≈328 chars with the plain lead; fits one 500mm page on the real engine, fidelity/ux). One cheer proves the trick
    works on THIS rig today and shows every size.
15. `giantReport(body)` pure: e.g. "Capitals ≈ 3.8 cm · fits 1 cheer" / "Needs 3 cheers (300 bits) — printer-bot's
    header prints between the pieces" / overflow & emoji & cheer-word warnings. Plain language, no "px"/"level" jargon
    except in the manual size list.

## B. Packer and lead (public/index.html ~L478-552 and callers)
- packStackBodies uses buildLead for `lead` and leadLength for overhead (replace `token.length + 4`); `opts.tuck` only
  counts when `opts.cheer`. Under tuck, for the FIRST body of each part: if `leadBr` strip its leading `<br>` (saves the
  23px lead line: real engine 156→133px), else prepend `<br>` (so Hanzi/glyph grids start on a clean line instead of
  sharing a line with the nbsp, which would shift the wrap and shear the grid).
- packStack (~L2777) computes `budget = MAX_CHARS - leadLength(opts)` and passes it to renderBlockBodies(block, budget);
  hanziBodies (~L2678) and glyphImageBodies (~L2722) replace their hardcoded `14` with `MAX_CHARS - budget + 2`
  (=14 today ⇒ byte-identical with tuck off).
- composeParts (~L4635) and probeParts (~L4659) pass `tuck`; census untouched (document: never tucked).
- renderParts (~L3290): render the lead with insertAdjacentHTML (it is our own markup: constants, digits, nbsp) — today
  it is a text node and would show literal `<span…>`. Over-note text (~L3278) mentions turning off the gem tuck.

## C. Composer UI (textCard ~L3546-3720; newBlock ~L3410-3440; seedBlocks ~L3471)
- New text blocks + the first-run seed: `{render:"giant", giantLayout:"auto", giantSize:"fit1"}` (seed text "HELLO").
  Saved blocks keep their render (no migration); old blocks switched to giant init fields lazily via giantOpts.
- Render select (via blockRender): "Giant type — big bold capitals (prints)", "Hanzi tiling — backup if Giant type prints
  small", and "Type (crisp) — no longer prints" ONLY when the block's render is "type". Hint text depends on render.
- On hanzi/type cards: one line + button "New: Giant type prints real capitals up to about 4 cm tall. [Switch this block]".
- giantWrap controls: Layout select — "Auto — biggest in one cheer" / "Lines as you typed them" / "Stack the letters, one per
  line" / "Emote names (needs one test print)"; each option label shows the computed capitals size for the current text.
  Size select — "Auto — biggest that fits one cheer (recommended)", "Auto — fill the paper width (may cost more cheers)",
  then manual levels 1..18 labelled by result "Capitals 2.6 cm · 1 cheer" / "… · 2 cheers" / "… · letters cut off".
  Rebuild labels on input (debounce not required). Store giantSize as "fit1"|"width"|int.
- Hide typeWrap, hanziWrap, fmtWrap and the % Size row (capture `var sizeRow = sliderRow(...)` at ~L3628) for giant;
  applyRender becomes three-way. Font note for giant: "Font and weight come from printer-bot (bold Segoe UI on Windows) and
  can't be changed here. Prints in CAPITALS."
- Textarea: `autocapitalize="off" autocorrect="off" spellcheck="false"`.
- Card note: class `giant-note` (NOT `cost-note`: two browser tests read `.cost-note.first()`), driven by a costSyncs
  callback (pattern: takeover card ~L4176-4214; renderComposer resets costSyncs ~L4432) reading the packed parts
  (`parts[i].bodies[j].blockId === block.id`, `.giant`) so the cheer count reflects real packing. Text from giantReport,
  plus: emote hint (exact capitals; only emotes the sender may use; BTTV/7TV/FFZ may not work; chunky pixels; try one
  cheer first), "barely bigger than chat text" nudge at ≤ 3 levels, emoji-dropped note, cheer-word warning, fragility
  line "Confirmed printing big on 1 Oct 2026. If a print comes out normal-sized, printer-bot changed its style — switch
  Render to Hanzi tiling." and "Chat sees the raw tags; if the channel's mod bot removes repeated text, send it once
  WITHOUT Cheer-ready first (free) to check." and "Sized for 80 mm printers."
- Multi-part stacks containing giant: the parts note says "Send part 1 first and look at the printer. If the letters came
  out normal-sized, stop."
- Global controls: checkbox `#cheerTuck` "Hide the cheer gem in the corner" (default OFF, disabled when Cheer-ready is
  off) + hint computed from leadLength ("Uses N of the 500 characters" — N=48 at Cheer100): "Normally your cheer prints as
  a small gem, '100' and two digits on their own line above your art. This squeezes them into a tiny box in the receipt's
  top-right corner and saves that line. printer-bot's header still shows the bits and your name. Made for Giant type;
  with other blocks it starts them on a fresh line." Persist as `tuck` in rw_controls_v1 (NO new key); wire els, listener
  array, saveControls (guard `els.cheerTuck &&`), restoreControls (absent ⇒ off).
- "Print size ruler" button next to "Print test strip" (#censusBtn ~L304; wiring like census ~L4666/L4891): builds a
  one-cheer payload from buildGiantRuler with the normal lead (never tucked), shown as a part with a hint "One cheer: prints
  1–13 at every size. If the numbers grow, Giant type works on this printer."

## D. Preview fidelity
- `.rcpt-body` CONTENT width must equal PAPER_PX (240px ±1) in BOTH the page CSS (L64-84) and RCPT_CSS (L3064-3074)
  (today 268px: 80mm box with 1em padding; the print body is 72mm page − 2em). `.rcpt{position:relative}` in both.
- Inject pbPreviewCss(".rcpt") into both. Add `.rw-giant{display:block}` and `.rw-emote-ph{display:inline-block;
  width:1em;height:1em;border:.04em dashed currentColor;font-size:1em;text-transform:none;…label tiny}` styling.
- The thermal preview must render giant bodies (RCPT_CSS carries the rules).

## E. Bench tooling (dev-only; NEVER vendor nutty's files or any font into the repo; CI stays offline)
- NEW `tools/printerbot.mjs`: fetch nutty's live `contents/` page, derive its `<link rel=stylesheet>` list + order and the
  receipt template from it, fetch `global.css`, `contents/style.css`, `/.common/utils/helpers.js`; cache under
  `.render/printerbot/` with sha256 + fetched_at. Read a chat message (stdin or `--message`); in headless Chromium
  (`import('playwright')` from the devDependency, clear "run npx playwright install chromium" error) run the real
  SanitizeHTML, then the emote pass (`--emote NAME=URL`, repeatable) and the cheermote pass (`--bits 100`,
  `--cheer-img URL|path`), and emit the exact GetRenderedHTML-equivalent document (header avatar `--avatar`, title
  "<bits> BITS", subtitle `--user`, footer date) to `--out` (default `.render/printerbot/receipt.html`). Chromium is used
  ONLY for these string passes. `--png out.png`: render with the REAL wkhtmltopdf via rig.py if available; otherwise a
  Chromium PDF render clearly labelled APPROXIMATE. `--check`: exit non-zero if any PB_CLASSES declaration (read from the
  app core via test/_harness.mjs loadCore, like payload.mjs) is missing from the live CSS — a release-checklist canary,
  NOT in CI. `--paper ROLL` (default 80). Provenance JSON on stderr.
- `tools/rig.py`: `--document FILE|-` renders a complete document as-is with the exact print flags (skip PAGE template);
  find wkhtmltopdf also at `~/.local/opt/usr/local/bin/wkhtmltopdf` (Linux .deb via `dpkg -x`); `--fonts DIR` builds a
  FONTCONFIG_FILE under `.render/` so a user can point at their OWN Segoe UI files (e.g. copied from C:\Windows\Fonts) —
  warn when Segoe is not registered (bench falls back to Liberation metrics); add `pages` (pdfinfo or pdftoppm count) to
  the JSON with a WARNING when > 1; add `css: {source: embedded|cache, sha256, fetched_at}`; use the cached real CSS when
  present, else the embedded subset PLUS the PB_CLASSES rules (keep in sync by hand; comment says so).
- `tools/payload.mjs`: `{"kind":"giant","text","layout","size","tuck","bits","part"}` → build via
  `C.packStackBodies(C.buildGiantBodies(...), {cheer:true, bits, tuck})`, emit parts[part].payload, part count on stderr.
  Replace its hand-built lead with C.buildLead.
- package.json script `"printerbot": "node tools/printerbot.mjs"`.

## F. Tests
Unit (`test/giant.test.mjs`, null-DOM harness; plus edits to compose/covers/sanitizer tests as needed):
- PB_CLASSES/derivation: GIANT_RATIO === pbClass("title").factor; TUCK_OPEN exact string; every class in builder output
  exists in PB_CLASSES; all-occurrences attribute scanner (not attrsOf's first-only) — only `class` attrs, each value
  quoted or matching /^[a-z][a-z0-9-]*$/.
- GIANT_W[c] ≥ SegoeUIBold[c] and ≥ ArialBold[c] for every key (embed the two source tables as fixtures in the test).
- giantSteps ascending, unique, min ≥ 19.2; px formula.
- NaN guard: giantFit(["I"],{size:"width"}).levels ≥ 15 and giantFit(["W"],{size:"width"}).px ≤ 240.
- fit1 never returns more chunks than the smallest step would; 'WRECK THE RECEIPT COMPLETELY' in lines → fits:false.
- Char budget (mutation-sensitive): 200 seeded random texts × layouts × tuck on/off ⇒ every body.chars ≤ budget unless
  giant.over; the 24-line case yields ≥2 bodies each ≤ 440 with tuck; packStackBodies([body(230),body(230)],
  {cheer:true,tuck:true,bits}) ⇒ exactly 2 parts each ≤ 500 for bits 100/1000/10000 (restoring `token.length+4` must fail).
- tuck OFF byte-identical: lead === "Cheer100 07 " shape; Hanzi band of 32 rows packs ≤ 500 with tuck ON.
- Tuck lead regex /^\u00A0<span class="switch dialog-nav-button"> Cheer100 \d\d <\/span>$/; no-cheer+tuck ⇒ lead is
  LEAD_GUARD, no `<span`; payload never leads with `<`; parts[0].lead === buildLead(opts, parts[0].nonce).
- Tuck first-body handling: giant first body loses its leading `<br>`; hanzi first body gains one.
- Chunks: no chunk starts/ends with an empty line; heights ≤ HEIGHT_BUDGET; 'PENIS' stack fit1 → one chunk.
- Emote: every token in the raw payload matches /(^|\s)NAME(?=\s|$)/; case preserved byte-for-byte.
- giantLines("A🔥B","stack") → ["A","B"] with dropped ["🔥"]; body.chars === payloadLength(body.html); "A&B" escaped;
  adversarial `</b></b><img src=x>` text: after removing the known tags (/<\/?b( class=[a-z-]+)?>|<br>/g) no `<`/`>`
  remains.
- Empty/whitespace text in all layouts → one empty body (chars 0).
- giantOpts clamps (1e6 → 18, "abc" → "fit1", -3 → 1 or "fit1", layout "x" → "auto"); buildGiantBodies with hostile
  opts finishes < 50 ms and ≤ 500 chars. blockRender unknown → "type".
- buildGiantRuler: balanced tags, 13 levels, lead + ruler ≤ 500.
Browser (`test-browser/composer.spec.mjs`):
- New text block defaults to giant; capture payloads by stubbing navigator.clipboard.writeText via ctx.addInitScript then
  clicking Copy; payload contains `<b class=title>`.
- MANDATORY clean-room sanitizer: our own ~15-line DOMParser allow-list walk implementing the documented behaviour (do
  NOT copy nutty's code) + the PB_CLASSES rules applied via a <style> built from the app's own pbPreviewCss-equivalent
  (or from PB_CLASSES decls); parse the CONCATENATED payload of a [giant, hanzi] stack; assert innermost giant text
  computed font-size within 0.01px of 16×1.2^levels(×factor), weight 900, and that no text after the giant body is
  inside a .title; tuck span classList is [switch, dialog-nav-button]; only class/src attributes remain.
- Preview: `.rcpt-body` clientWidth 240±1; tuck on ⇒ `.rcpt .switch.dialog-nav-button` exists, computed position
  absolute + overflow hidden, receipt textContent has no "<span"; tuck persists across reload.
- Emote layout: no request leaves the static server's origin (page.on('request')).
- Saved hanzi + render:"type" blocks (seeded via addInitScript into rw_blocks_v1) keep their selects/payloads after reload.
- FIX the now-vacuous "range of one" test: pin the added text block to render hanzi and assert /cheers/ unconditionally;
  ensure the two `.cost-note.first()` takeover tests still target the takeover card.

## G. Docs / versioning
- Version 0.10.0 in package.json:3 and the README badge (alt + URL).
- docs/CHANGELOG.md `## [0.10.0] - 2026-10-02` in the existing format (short version + Added/Changed/Fixed/Known).
  Include: preview narrowed 268→240px; lead rendered as HTML; hardcoded lead slack replaced; tuck; ruler; bench.
- CLAUDE.md: new top banner section dated 2026-10-01 ("`class` survives, and printer-bot inlines nutty's whole global.css")
  with mechanism, evidence levels, fragility, and the RULE with stop conditions: (a) literal tokens only, never
  case/quote/entity/zero-width tricks; (b) if a channel blocks the giant form, that is the mods saying no — do not cycle
  tag/quote/case variants; (c) if nutty removes or scopes global.css on purpose, that is the bot author saying no — fall
  back to Hanzi; only an incidental rename justifies remapping PB_CLASSES, after a free probe. Update every statement
  that becomes false (rules-tests-docs#9 has the list with line numbers: backbone, "whole picture story",
  "No carrier can put a real picture" → "no arbitrary picture", "strips … all styling", "survive are exactly the markup-free
  ones", "The cheer token LEADS" (amend: leads, or is tucked in the first span after LEAD_GUARD; still never leads with
  `<`), markup-modes list, Measuring section (real document = all of global.css + style.css via GetRenderedHTML;
  printerbot.mjs; rig.py --document/--fonts/pages), export list regenerated with its true count, tools/.gitignore rows,
  free-probe token list (+ `class=title`, `class=setting-description`, `class=setting-attribute`, the tuck span), storage
  note (tuck field in rw_controls_v1). Architecture list: new items for PB_CLASSES, giant builder, buildLead/tuck, ruler.
- README: banner + feature section for Giant type, tuck, size ruler; Cheer-ready text; tools; tech facts.
- public/llms.txt: update current-behaviour statements. .github/PULL_REQUEST_TEMPLATE.md: storage list (+rw_presets_v1)
  and a PB_CLASSES checkbox mirroring the EMBEDS one. In-app copy (newBlock comment, Render hint, Cheer-ready hint).
- Optionally commit this spec as docs/superpowers/specs/2026-10-02-giant-type-design.md (repo convention), with the
  scratch paths removed. (This file.)

## As built (0.10.0)

Where the implementation departed from the text above, and why. Recorded so the spec
stays a true account of what was decided, not a second, divergent description of the code.

- **Band slack (B).** The spec's `MAX_CHARS - budget + 2` gives 3 with Cheer-ready off and
  15-16 at 1000+ bits, and either breaks the byte-identical requirement. Built as
  `bandReserve(budget) = max(14, MAX_CHARS - budget)`. Untucked output is identical to
  0.9.1 up to 99999 bits. Tucked it is 64, which is exact, because `leadLength` already
  counts the `<br>` the packer may add.
- **Auto layout (A13).** A layout that fits the paper always beats one that doesn't. Under
  `width` the bigger type wins. Otherwise the spec's rule applies, ties to `lines`.
- **Tuck `<br>` handling (B)** applies to the first body *with markup* in each part, so an
  empty body ahead of it cannot absorb it.
- **`giantClean`** also drops lone surrogates and lists each dropped character once.
  `stack` keeps a combining mark on its letter. `renderBlockBodies` takes a third `tuck`
  argument, because the giant fit narrows by `GIANT_TUCK_PX` (5px, the nbsp sharing line
  1) when tucked. Bodies carry two more `giant` fields, `size` and `overflowText`.
  `giantPlan` is exported so the card's labels and the builder share one decision.
- **The fit search** skips steps whose O(1) lower bound on chunks cannot beat the best so
  far. It was verified equal to the brute-force search over 6400 builds, and halves the
  time on a 480-character stack.
- **Preview frame (D).** `.rcpt` is 72mm with an **outline**, not a border: with a border
  and `box-sizing:border-box` the content came out at 238px, and the Thermal copy, which
  drops the border, came out 2px wider than the live preview. The preview avatar now
  follows printer-bot's own rule (90% of the body, 216px) via `aspect-ratio:1` instead of
  a fixed 15em. As a side effect the (non-printing) takeover overlay previews 24px higher.
- **The card (C).** In emote layout `giantReport` reports "Emotes ≈ X cm" from the full
  font-size, because an emote is a 1em square and the 0.70em cap height undersold it by
  30%. The tuck hint says "Uses 48 of the 500 characters" and notes that a giant-first
  cheer gets 4 back and anything else needs 4 more. The manual size labels keep "Level N",
  because levels 1 and 2 both round to 0.4 cm. The ruler's explanation rides a new
  `item.note`, because `headNote` would have triggered the probe's "ALTERNATIVES" text.
  The 24 labels are recomputed only when text, layout, size, budget or tuck changes:
  about 40ms for a 480-character paragraph.
- **Tucked first giant body in the preview** renders inline, so the preview shows no
  extra line that the print doesn't have. Two giant bodies in a row get a ~21px gap,
  standing in for the engine's 23px.
- **`blockHasContent`** returns false for giant text that is only emoji. Otherwise the
  block would have sent a cheer that prints only the lead.
- **Bench (E).** `printerbot.mjs` takes cheermotes from the message's whitespace-delimited
  `Cheer<N>` words, as Twitch does. `--bits` only sets the header, and warns on a
  mismatch. `--emote` applies only where the name is a whole word, and otherwise warns
  and skips. `--check` also fails when the real sanitizer drops one of our classes. Extra
  flags: `--offline`, `--date`, `--out -`, and `--ref` (read a pinned commit of
  `nuttylmao/nutty.gg`, whose `main` is the live site); and `rig.py --embedded-css`.
  `rig.py` exits 3 (not 1) when there is no wkhtmltopdf, so `printerbot.mjs` falls back
  to an APPROXIMATE render only then. The template page prefers the cached real CSS.
- **Review fixes (before release).** `giantClean` also drops invisible format and
  control characters (each was a giant blank line in a stack), and `giantReport` names
  them as such rather than as emoji. `GIANT_CAP_EM` is the exact 1434/2048 rather than
  0.70, and `giantCapCm` / the new `giantEmoteCm` round the font-size to whole px and use
  25.4/96 mm per px (`PX_PER_MM` stays 3.75 for the picture blocks): within 0.01 cm of
  every measured size. A giant body in the **emote** layout keeps its leading `<br>`
  under the tuck (`leadBr:false`, and the packer never doubles a `<br>` a body already
  opens with), because its padded first line printed 27px out of line after the nbsp; so
  its fit keeps the full width. The packer drops a continuation cover from a part that
  cannot afford it (a pre-existing over-500 bug). `printerbot.mjs` reads stdin as a
  stream (the documented pipe threw EAGAIN).
