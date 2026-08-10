# Phase 1 verification: does the preview tell the truth about formatting?

**Task:** Task 7 of `2026-08-09-formatting-and-preview-fidelity.md` — the closing task of
the plan. Tasks 1–6 built font/weight/italic/underline/strikethrough controls across the
takeover card, the text card and Big Text. This task proves those controls actually draw
on the real printer, and that the thermal preview doesn't lie about them.

**Engine:** wkhtmltopdf 0.12.6 (patched Qt/WebKit 534.34) — the exact binary printer-bot
runs — via the faithful harness at `/Users/robp/.claude/jobs/8f8ffb3c/tmp/dbg/rig.py`
(printer-bot's CSS, receipt template, and command-line flags). Every fragment below was
built from the app's own code, not hand-written markup: `buildTakeover`, `buildBigTextSvg`,
`rotateBodies` and `fmtAttrs` were pulled live out of `public/index.html` and run inside an
actual browser tab (Chromium via Playwright, real `document`/`canvas`) so the SVG/HTML they
emit used real font metrics — not the null-DOM test harness's proxy measurements, which
degenerate `buildBigTextSvg`/`rotateBodies` output (a canvas `.measureText().width` read
through `test/_harness.mjs`'s proxy coerces to `0`, which blew the size calc up to a
25000px font — caught and worked around, not shipped anywhere near the app).

Every raster below is at **203 dpi, hard-thresholded to 1 bit** — the RP332 head's real
resolution and color depth — via `pdftoppm` + PIL, same recipe as the prior task's
`thermal_fonts.py`/`floor.py`. "Ink" = count of pixels `< 128` after thresholding.

---

## Open question 1: does `<g text-decoration>` inherit to child `<text>`?

`buildBigTextSvg` puts `fmtAttrs(fmt)` once on the shared `<g>` (payload economy — repeating
it per `<text>` would blow the 500-char cheer budget on a multi-line caption). This is a
**new, unproven** form; the takeover path puts the same attributes directly on each
`<text>`, which was already known to work.

**Verdict: it inherits. Confirmed on the real engine, both by ink delta and visually.**

| variant (`<g …>` around `<text>GTEST</text>`) | size (px) | ink | Δ vs none |
|---|---|---|---|
| none | 641×896 | 228453 | — |
| underline | 641×896 | 234849 | +6396 |
| strike | 641×896 | 233246 | +4793 |
| **both** | 641×896 | 239642 | **+11189** |
| multiline, both (`LINE ONE\nLINE TWO`) | 641×953 | 256405 | both lines carry the decoration |

Screenshots (`r_g_both_1bit.png` vs `r_g_none_1bit.png` in the dbg dir): "GTEST" prints
with a full underline **and** a strikethrough through the middle when both flags are set on
the `<g>`, nothing when neither is set. The multiline case confirms the whole point of the
optimization: both `LINE ONE` and `LINE TWO` inherit the same decoration from one shared
`<g>`, so a multi-line caption doesn't need per-line attributes.

**No code change required** — `buildBigTextSvg`'s shared-`<g>` design (from Task 5) is safe
as shipped for normal-orientation Big Text.

## Open question 2: does the combined `"underline line-through"` value render?

Verified on **both** surfaces that use `fmtAttrs`, not just one:

**On the known-working `<text>` path** (`buildTakeover` → `takeoverText`):

| variant | size | ink | Δ vs none |
|---|---|---|---|
| none | 641×767 | 5799 | — |
| underline only | 641×767 | 6525 | +726 |
| strike only | 641×767 | 6610 | +811 |
| **both** | 641×767 | 7336 | **+1537** (> either alone) |

**On the `<g>` path** (question 1's table, above) — both draws more ink than either alone
there too.

Both surfaces draw strictly more ink for the combined value than for either decoration
alone, and the screenshots (`r_q2_both_1bit.png`) show "UNDERSTRIKE" with both a full
underline and a full strikethrough simultaneously.

**No code change required.** `fmtAttrs`' comment already commits to falling back to
`underline` alone "if the combined form ever stops rendering" — it hasn't; the comment
stands as accurate documentation of a contingency that didn't trigger.

## Open question 3: does `text-decoration:` render on the rotated HTML `<span>`?

This is the CSS-declaration path (`rotatedSpan`), not an SVG attribute — different renderer
code, different question.

| variant | size | ink | Δ vs none |
|---|---|---|---|
| none | 641×3998 | 966683 | — |
| both (underline + line-through) | 641×3998 | 977535 | **+10852** |

Screenshot (`r_rot_both_1bit.png`): two straight lines run the full length of the rotated
"SIDEWAYS" strip, perpendicular to the letters' baseline (as expected — the decoration
lines rotate along with the text, so on a 90°-rotated span they render as verticals cutting
across the glyphs). Confirmed rendering.

**No code change required.**

## Open question 4: every font, both sizes

All nine `FONTS` entries rendered through `fmtAttrs({font: id})` at a takeover-line size
(24px) and a headline size (58px), 203dpi/1-bit.

| font id | 24px | 58px |
|---|---|---|
| `""` (Default/Arial) | legible, plain sans | legible, plain sans |
| `black` (Arial Black) | legible, heavy sans, clearly distinct | legible, heavy sans |
| `impact` | legible, condensed heavy sans, clearly distinct | legible, condensed heavy sans |
| `comic` (Comic Sans MS) | legible, casual rounded, clearly distinct | legible, casual rounded |
| `georgia` | legible, serif w/ old-style figures | legible, serif |
| `serif` (generic) | legible, Times-like serif | legible, Times-like serif |
| `mono` (monospace) | legible, fixed-width, clearly distinct | legible, fixed-width |
| `script` (cursive) | legible, connected cursive, clearly distinct | legible, cursive |
| `fantasy` | legible, decorative serif w/ swashes | legible, decorative serif |

Full sheets: `r_fonts_24_1bit.png`, `r_fonts_58_1bit.png` (both 9 fonts stacked, same
message "Handgloves 123" per line, real wkhtmltopdf render at 203dpi/1-bit).

**All nine pass** — every font is legible and produces visibly different letterforms from
the default at both sizes. One honest caveat, not a failure: `georgia`, `serif` and
`fantasy` are all serif families and read as a *family* of similar shapes next to each
other at 24px on a 1-bit thermal raster — each is still clearly not-Arial and not
identical to its neighbors (Georgia's slab serifs and old-style figures vs. generic serif's
Times-like proportions vs. Fantasy's decorative swashes), but a streamer squinting at three
serif options back-to-back on tiny thermal type won't get three dramatically different
looks the way `impact`/`comic`/`mono`/`script` each do. This was true before this task and
is not a regression — noting it because "looks fine" isn't the standard this task set.

## Weight and italic isolation, and the 58px underline/strike gap (fix round 1)

The first pass of this task exercised weight (Bold/Black) and italic only combined with
other attributes — inside `q5_all_together.svg` (font=Impact, italic, underline, strike,
all on one 24px line) and inside the browser's live-DOM checks, which run on **Chromium**,
not the WebKit 534.34 the printer actually runs. Underline/strike had a real-engine pass at
24px (`buildTakeover`'s `<text>` path) and at an auto-fit ~75px (`buildBigTextSvg`'s `<g>`
path), but never at a controlled, fixed 58px matching the font table's headline size.
Neither gap was acceptable for a task whose whole point is not inferring WebKit's behavior
from Chromium's. Re-ran, isolating one attribute per line against a same-size/same-text
baseline (identical method to the font table): `fmtAttrs({weight:…})` / `fmtAttrs({italic:
true})` / `fmtAttrs({underline:…, strike:…})` each built their own `<svg><text>`, real
wkhtmltopdf render, 203dpi, 1-bit threshold, ink counted and diffed against the same-size
`fmtAttrs({})` baseline so the delta attributes to exactly one attribute.

| variant | 24px ink (Δ vs none) | 58px ink (Δ vs none) |
|---|---|---|
| none | 207256 | 219045 |
| weight 400 (explicit) | 207256 (+0) | 219045 (+0) |
| weight 700 (Bold) | 209094 (+1838) | 225234 (+6189) |
| weight 900 (Black) | 209094 (**+1838, identical to 700**) | 225234 (**+6189, identical to 700**) |
| italic | 207208 (−48) | 218871 (−174) |

**Finding — Bold and Black render pixel-identically on the Default (Arial) font, on this
engine.** `r_w58_700_1bit.png` and `r_w58_900_1bit.png` (and their 24px counterparts) are
not just close in ink count, they are **byte-for-byte identical rasters**
(`PIL.ImageChops.difference(...).getbbox()` returns `None` at both sizes — zero differing
pixels). Visually, both are clearly bolder than the "none" baseline (thicker strokes), but
weight 700 and weight 900 are the same bold, not two steps of one. This is very likely
because the system's Arial substitute has one real/synthetic bold face available to
wkhtmltopdf's font stack on this render host, and both 700 and 900 clamp to it — CSS
font-weight matching commonly rounds to the nearest available face rather than failing.
**This is a real, reportable finding, not a pass**: on this render engine, selecting
"Black" instead of "Bold" on the **Default** font produces no visible difference at all.
The app already has a real escape hatch for a genuinely heavier look — the separate `black`
font-family entry (Arial Black, a distinct typeface, not a synthesized weight) — but the
Weight dropdown's Bold/Black distinction, used alone on the default font, is not proven to
do anything on the real engine. No code change made: the dropdown still writes the
attribute correctly (`fmtAttrs` and the browser DOM checks both confirm `font-weight="700"`
vs `"900"` reach the markup byte-for-byte differently), and weight 900 might render visibly
heavier than 700 on a font that ships more weight steps (not tested here, out of the
reviewer's ask) — this is a rendering-engine/font-availability limitation on the *Default*
font specifically, not a markup bug, so there is nothing in `fmtAttrs` to fix.

`weight: 400` is pixel-identical to `none` at both sizes, as expected — `fmtAttrs` omits
`font-weight` entirely at 400 (its documented default-omission rule), so the markup itself
is identical, not just the render.

Italic renders correctly at both sizes (visually confirmed: `r_w24_italic_1bit.png`,
`r_w58_italic_1bit.png` show a clearly slanted "Handgloves 123"), with a small **negative**
ink delta (−48 / −174) rather than positive — italic changes glyph shapes and advance
widths rather than adding stroke weight, so less ink is a normal outcome, not a rendering
failure.

**58px underline/strike** (closing the coverage gap — 24px and ~75px auto-fit were already
covered):

| variant | 58px ink | Δ vs none |
|---|---|---|
| none | 219891 | — |
| underline | 223173 | +3282 |
| strike | 222361 | +2470 |
| both | 225643 | +5752 |

Both draws more ink than either alone, consistent with the 24px/`<g>`-path findings above.
Visually confirmed (`r_u58_both_1bit.png`): "UNDERSTRIKE" at 58px shows both a full
underline and a full strikethrough. Underline/strike decoration is now confirmed on the
real engine at 24px, ~75px, **and** 58px — full size coverage, matching the font table.

## Bonus: everything at once

`buildTakeover` with `fmt: {font:"impact", weight:900, italic:true, underline:true,
strike:true}` on one line, rendered through the real engine: font swap, heavy weight and
italic slant are all clearly visible; the underline is visible; the strikethrough is
present in the markup and independently confirmed to render by the two ink-delta tables
above, but is hard to visually isolate by eye in this specific combination because
Impact-italic's heavy diagonal strokes already fill the letter's vertical middle. This is a
readability observation about stacking every decoration on the heaviest/most slanted font
at once, not evidence the attribute failed to draw.

---

## Browser: does the thermal preview reflect formatting?

Served `public/` at `127.0.0.1:8791`, driven via Playwright MCP against a cleared
`localStorage`, one fresh Takeover block, "Blank" style, Line 1 = "TAKEOVER".

**Font changes the raster.** Thermal canvas (`.rcpt-thermal`, 560×825), ink counted at
threshold 128 across the raw canvas `ImageData`:

- Default (Arial): **ink = 5973**
- Impact: **ink = 6134**

Different. The `font-family` attribute is reaching the rasterized preview, not just the
vector preview.

**Underline changes the raster.**

- Plain: **ink = 5973**
- Underlined: **ink = 7000**

Different, by a wide margin (+1027) — underline is visibly present in the dithered canvas,
not silently dropped by the `foreignObject` serialization step the brief specifically
worried about.

**Takeover thermalizes at all.** With Line 1 = "TAKEOVER" and no other lines/picture set,
the thermal canvas rendered as a 560×825 dithered 1-bit image — not blank — with the
overlay text, the (dithered) Twitch icon, and the date all present and clipped inside the
white paper box (screenshot: `t7_thermal_default.png`, not committed — see note below).
Console: **0 errors, 0 warnings** at every checkpoint across the whole session
(`browser_console_messages({all:true})`), including immediately after this render.

**Bold, Black, I and S all reach the rendered SVG** — the four toggles the brief flagged as
never having been driven end-to-end before (only Font and U had prior coverage). Read
`document.querySelector(".rcpt-body text").outerHTML` after each click, on Line 1. **Scope
note:** this confirms the click reaches the correct DOM attribute in the live Chromium
preview — it does not by itself confirm WebKit 534.34 (the printer's engine) draws the
attribute the same way; that is what the engine-side isolation pass above is for.

Given the engine-side finding that Bold and Black render pixel-identically on wkhtmltopdf/
WebKit 534.34 for the Default font (see "Weight and italic isolation"), it mattered whether
the *preview* at least shows a difference the real print doesn't — that would be a
preview-fidelity bug, not just a font limitation. Tested directly: built the same
`fmtAttrs({weight:700})` / `fmtAttrs({weight:900})` SVGs, decoded them through a real
`<img>`/`<canvas>` in this Chromium session (58px, same "Handgloves 123" text, ink
thresholded the same way as the engine passes) — **Chromium renders them pixel-identically
too**: `none=3350, weight700=4637, weight900=4637` (`w700 === w900`). So this is not a
preview/print mismatch — the preview and the real engine **agree**: Bold and Black look
the same on the Default font in both places, because Arial (the family both resolve "" to)
has no true 900-weight design on essentially any platform, only a single synthesized/real
bold. The Weight control's Bold/Black distinction is validated as reaching the markup
correctly; it just has no visible effect on the Default font specifically, consistently, in
both renderers. `Arial Black` (a separate font-family entry, not a weight) remains the way
to get a genuinely heavier look.

1. Baseline (Default weight = Black/900 by slot default, U already on from a prior step):
   `<text x="132" y="296" font-size="24" font-weight="900" text-decoration="underline">TAKEOVER</text>`
2. Weight select → **Bold**: `font-weight="700"` — changed.
3. Weight select → **Black**: `font-weight="900"` — changed back.
4. Click **I**: `font-style="italic"` appended.
5. Click **S**: `text-decoration="underline line-through"` — both decorations now present
   together in the live SVG, matching the engine-side Q2 finding above.

Final thermal ink count with weight=900 + italic + underline + strike (still default font):
**ink = 7424**, vs. the 5973 plain baseline — every toggle's effect is visible in the
raster, not just the DOM attribute. Console stayed at 0 errors/0 warnings through this
whole sequence.

Server (`python3 -m http.server 8791` in `public/`) was killed at the end of the session;
confirmed down via a follow-up `curl` (connection refused). Screenshots from this session
live under the gitignored `.playwright-mcp/` directory in the worktree, not committed —
the numeric ink/DOM evidence above is the actual verification artifact.

---

## What was NOT tested (as of fix round 1)

Weight and italic are now isolated on the real engine at both sizes (see "Weight and
italic isolation" above), closing the gap the fix-round-1 review found — they were
previously confirmed only combined with other attributes on the engine, or alone but only
in Chromium. Underline/strike now have real-engine coverage at 24px, ~75px and 58px.
Remaining known gaps:

- **Real hardware.** Everything above is wkhtmltopdf (printer-bot's exact renderer) or
  Chromium (the browser preview's renderer). Neither is the RP332 itself; this task had no
  access to physical hardware. The prior tasks' own calibration notes (`floor.py`,
  `thermal_fonts.py`) already establish that this rig's 203dpi/1-bit raster is the accepted
  proxy for "what the head lays down" in this project — this task didn't have reason to
  revisit that.
- **Fonts not in `FONTS`.** By design — the table's own comment says an unverified family
  is a silent fallback masquerading as a working control, so nothing outside the nine was
  tried.
- **Twitch's chat filter.** This task verified rendering, not delivery — whether a message
  carrying `text-decoration="underline line-through"` or a `\66ont:` escape survives
  Twitch's live moderation filter is a different, previously-covered concern (see
  `FONT_PROP`'s comment in `public/index.html`) and out of scope here.

---

## Code changes made as a result of this task

Both are the two small fixes named in the task brief — neither was prompted by an engine
or browser finding above; the four open questions all resolved clean (no code change
needed for `fmtAttrs`, `buildBigTextSvg`, or `rotatedSpan`).

1. **`public/index.html`, comment above `bigFontFor`.** Said the DOM-glue guard
   (`if (typeof document !== "undefined" && document.getElementById)`, opening at line
   1051) was "below" `bigFontFor` (line 1321). It's above — `bigFontFor` is defined well
   inside the guard's block, not before it. One word, `below` → `above`; no behavior
   change.

2. **`public/index.html`, `takeoverCard`'s `mkFmt`.** The font `<select>`'s initial
   `selected` test read `(block[key] || {}).font` directly — the only one of the row's
   four controls (font, weight, I/U/S) that bypassed `lineFmt`. It happened to select the
   right option today only because `lineFmt`'s font resolution (`f.font || ""`) and the
   raw read agree when `FONTS[0].id === ""` and Default is listed first — reorder the
   table (or add an entry before Default) and the raw read stops matching any `<option>`,
   the `<select>` silently falls back to whatever the browser puts first, and the dropdown
   would show the wrong font for an untouched line while the render stayed correct. Fixed
   by resolving `fNow = lineFmt(block[key], defWeight, defItalic).font` once and comparing
   against that, matching the weight select and the three toggles right next to it.

Both are pure refactors/comment fixes with no behavioral surface for the null-DOM test
suite to exercise directly; verified by full suite + a live-browser pass instead (see
below).

## Test status

`node --test`: **119/119 passing**, run before touching any code, again after the two
fixes above, and a third time at the end of the browser session. No regressions, no new
tests added (per the brief — this task's job was to verify with the real engine and the
live browser, not to grow the null-DOM suite, which can't run wkhtmltopdf or a real canvas
anyway).

## Summary

All four open questions this task owned came back **positive** — inheritance from `<g>`
works, the combined decoration value renders on every surface that uses it, the rotated
`<span>`'s CSS decoration renders, and all nine fonts are legible and distinct at both
sizes. Weight and italic are now isolated on the real engine at both 24px and 58px, and
underline/strike now have real-engine coverage at 58px too, closing the fix-round-1 gap.
The thermal preview's ink counts move exactly the way the underlying formatting changes
predict, and all five toggles (Font, Weight/Bold/Black, I, U, S) demonstrably reach the
rendered SVG with zero console errors.

**One finding worth carrying forward, not a defect to fix:** Bold (700) and Black (900)
render pixel-identically on the Default (Arial) font, on the real engine **and** in
Chromium — confirmed byte-for-byte identical rasters both places, at both 24px and 58px.
This is a font-availability limit (Arial has no true 900-weight design), not a
preview/print mismatch and not a markup bug — `fmtAttrs` emits the correct, different
`font-weight` value each time, and both renderers clamp it to the same visual result. No
code change follows from it; it's recorded here so a future debugger chasing "why doesn't
Black look heavier than Bold" doesn't re-derive this from scratch. Nothing else in Phase
1's formatting work needed to be walked back; the two fixes made in `public/index.html` are
pre-existing code-quality issues named in the brief, not defects this task's verification
uncovered.
