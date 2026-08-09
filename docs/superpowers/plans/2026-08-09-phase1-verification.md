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
`document.querySelector(".rcpt-body text").outerHTML` after each click, on Line 1:

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

## What was NOT tested

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
sizes. The thermal preview's ink counts move exactly the way the underlying formatting
changes predict, and all five toggles (Font, Weight/Bold/Black, I, U, S) demonstrably reach
the rendered SVG with zero console errors. Nothing in Phase 1's formatting work needed to
be walked back; the two fixes made here are pre-existing code-quality issues named in the
brief, not defects this task's verification uncovered.
