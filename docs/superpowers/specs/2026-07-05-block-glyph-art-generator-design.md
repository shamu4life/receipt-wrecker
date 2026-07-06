# Design: Block-Glyph Art & Big-Text Generator

**Status:** Draft for review · **Date:** 2026-07-05 · **Working repo name:** `receipt-wrecker` (rename TBD)

> A single-file, client-side web tool that turns **big text** or an **uploaded image**
> into a compact grid of monospace "block" glyphs — a paste-ready string for
> character-limited text boxes. Its headline use is making oversized text / recognizable
> pictures appear on a streamer's thermal **receipt printer** (nutty.gg **printer-bot**)
> by pasting the string into Twitch chat as a `Cheer100`. Framed neutrally, like its
> siblings; the cheer use is one application.

This is **sibling #3** in an existing family of tools and MUST match their conventions:

- `cheer-splitter-9k` ("Voice Chunker") — splits text into size-capped chunks, find/replace, per-chunk prefix.
- `transliterate-me` ("Transliterate Me") — phonetic transliteration.

Shared house style (non-negotiable for this project): **one self-contained
`public/index.html`** (inline `<style>` + one inline vanilla-JS IIFE, `"use strict"`),
**zero runtime dependencies, no build step**, deployed via **Cloudflare Workers Static
Assets**, tested with **Node's `node:test`** by extracting the inline script.

---

## 1. Problem & goal

A friend streams and runs nutty.gg **printer-bot** (inside Streamer.bot) to print
donation/cheer chat messages on a **Rongta RP332** thermal printer. We want to paste a
chat message that prints as **large text** or a **recognizable image**. A prior tool
(`mr-delayer/receiptify`) does this with a 15×33 grid of Chinese Hanzi but is "somewhat
unreliable." Goal: **a reliable, higher-resolution "receiptify done right,"** matching
our house style, with the failure modes engineered out.

## 2. Verified constraints (why the design is shaped this way)

These are established from decoded printer-bot/Streamer.bot source, sourced research, and
the user's hands-on experience — not assumptions.

- **The channel is a chat-message TEXT channel, viewer-only.** We only control the
  Unicode *characters* of a chat message. No access to the streamer's PC; no CSS/HTML/
  image control on their end.
- **The message becomes a rasterized image of rendered HTML.** printer-bot injects the
  message via `innerHTML` into a fixed template, then renders it with **wkhtmltopdf
  0.12.x (Qt 4.8-WebKit, ~2015)** on Windows and silent-prints via SumatraPDF at 1:1
  (`-print-settings "noscale"`). Printer is **80 mm / 203 dpi / 72 mm printable ≈ 576
  dots/line**, continuous length.
- **HTML injection is OUT.** Although printer-bot uses raw `innerHTML` (so markup *would*
  render) and Twitch's *delivery* layer passes `<`/`>` verbatim, **cheering only
  registers from Twitch's first-party client** (website / mobile app) — an IRC client's
  `Cheer100` is ignored. That first-party client is the send-side gate, and it strips
  control chars (confirmed: `\r`/`\n` don't linefeed) and almost certainly sanitizes
  markup. Verdict: injection is unreliable and depends on a behavior we can't count on.
  **We do not build it.** (Coherent model: the first-party client passes *plain Unicode
  text* but strips control chars & sanitizes markup — which also explains why CJK
  glyph-art works, linefeeds don't, and injection dies.)
- **The payload is a single line** (Twitch messages are single-line; no newlines
  survive) of **≤ ~500 characters** (Twitch cap; counted by characters, not bytes).
- **A print costs 100 bits.** The payload MUST contain a space-delimited `Cheer100`
  token so Twitch registers the cheer and printer-bot fires. It must NOT begin with `/`
  or `.` (Twitch command parsing); since the payload begins with a block glyph this is
  naturally avoided. `Cheer100` sits in the **footer** (§7) so its cheermote prints
  *below* the image rather than shoving the grid down the tape.
- **Must work (mostly) blind on the first paste.** No pre-calibration; the streamer is
  not necessarily in on it. We design conservative defaults + a self-describing first
  print (see the Census).
- **The renderable character set is rig-dependent** (see §5). Color **emoji tofu** (Qt
  4.8-WebKit has zero color-font support). This is the core reliability variable.

## 3. Relationship to sibling tools (scope boundary)

- **This tool owns the *glyph engine*** — text → big block-letters, image → character-art
  — which no sibling does. That is its unique value.
- **Packaging leans on `cheer-splitter-9k`.** Chunking across multiple messages,
  find/replace, and generic prefixing already live there. This tool emits a single
  paste-ready block; for a single grid that fits ≤500 chars, no chunking is needed.
- **Convenience overlap kept minimal:** this tool includes a light **"cheer-ready"
  output** (prepend ` Cheer100 ` + a visible nonce) for the common single-message case,
  and documents composing with cheer-splitter-9k for anything fancier. It does **not**
  re-implement chunking.

## 4. Architecture

Identical shape to `cheer-splitter-9k`:

| Path | Role |
|---|---|
| `public/index.html` | **The entire app.** Inline `<style>` + one inline vanilla-JS IIFE (`"use strict"`). The only file to edit for behavior. |
| `wrangler.jsonc` | CF Workers Static Assets, `assets.directory: ./public`, Worker name = repo name. |
| `test/*.test.mjs` | Node `node:test`; extracts the inline `<script>` and unit-tests the **pure core**. |
| `.github/`, `docs/`, `README.md`, `CLAUDE.md`, `LICENSE`, `package.json` | Same community-health / docs / dev-metadata layout as siblings. `package.json`: scripts `dev`/`deploy`/`test`, devDep `wrangler`, no runtime deps. |

**Everything runs 100% in the browser.** No uploads, no storage, no backend, no
bindings. The image never leaves the device. The Worker only serves the static file.

**Internal module boundaries** (all inside the one file, but written as pure,
independently-testable functions so `test/` can exercise them):

1. **`rasterize(input) → LumaGrid`** — render text (via `<canvas>` bitmap-font
   sampling) or a picked image (via `<canvas>` draw + `getImageData`) to a `W×H` grid of
   luminance values `[0..255]`. Handles orientation (stacked / sideways) for text and
   aspect-ratio sampling for images.
2. **`quantize(LumaGrid, tier, mode) → CellGrid`** — map luminance → a glyph per cell
   using the active **tier** (§5) and mode (threshold vs. dither for images; binary for
   text).
3. **`render(CellGrid, tier) → string`** — flatten the grid to a single newline-free
   string of glyphs (no spaces — see §5 "off cell").
4. **`packageCheer(body, {nonce, cheer}) → string`** — append ` Cheer100 ` + a rotating
   **visible** nonce; return the paste-ready payload. Enforce/report the ≤~490-char
   budget.
5. **`census() → string`** — build the diagnostic payload (§6).

The UI layer wires DOM controls to these pure functions and renders the live preview.
`rasterize` uses the DOM `<canvas>`; the tests cover `quantize`/`render`/`packageCheer`/
budget logic against synthetic `LumaGrid`s, and cover the ramp/tier tables directly.

## 5. The glyph engine (the heart of the tool)

**What "the character set" is:** whatever wkhtmltopdf's old Qt-WebKit resolves to a real
glyph against the fonts installed on the streamer's Windows PC, at a consistent width.
The template's **only** font declaration — `font-family: -apple-system,
BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif` (decoded from the
plugin and independently re-confirmed) — resolves to **Segoe UI / Arial** on Windows,
with OS fallback for anything they lack. There is **no way for a viewer to override it**,
which is precisely why we cannot force a monospace family and must let the Census confirm
that a tier tiles on the specific rig.
Evidence-backed reliability ranking (Microsoft font docs + wkhtmltopdf issues):

| Tier | Glyphs | Dots/cell | Notes |
|---|---|---|---|
| **Safe ramp (DEFAULT)** | `░ ▒ ▓ █` (U+2591–2593, 2588) | 1 (4-level tone) | Block Elements ship in Segoe UI Symbol (default Win10/11); CP437-heritage; common advance width → tiles. Grayscale without the CJK gamble. |
| Sub-cell res | quadrant/half/eighth blocks (U+2580–259F) | 2–4 | Same font/heritage; ~2–4× spatial resolution. |
| Max res | Braille (U+2800–28FF) | 8 (2×4) | All 256 in Segoe UI Symbol; densest. Legibility vs. thermal dot-bleed needs the test print. |
| Rich tone (bonus) | curated CJK density ramp | 1 (~many levels) | CJK fonts **do** ship by default on Windows (SimSun/MS Gothic/YaHei/Yu Gothic/Malgun); best tonal range for photos, but width/fallback is rig-dependent. Curated to avoid rare tofu-risk glyphs. |
| Guaranteed floor | `█` / `░` | 1 (binary) | Maximum-contrast, near-universally rendered. |
| **Never** | color emoji, astral-plane symbols | — | Tofu in Qt 4.8-WebKit. Excluded. |

Design rules:
- **Off/light cell is a real, non-collapsing glyph** (default `░`), never a space —
  HTML `white-space:normal` collapses space runs (shearing the grid) and spaces are the
  wrong width in a proportional font. `█`/`░` binary for text; `░▒▓█` ramp for images.
- **We cannot force a monospace `font-family`** (no CSS control from a chat message), so
  tiling depends on the fallback font giving these glyphs a consistent advance. Very
  likely for Block Elements; the Census confirms per-rig.
- **Text mode = binary** (`█` on / `░` off) — crisp big letters, tolerant of ±1 column
  wrap drift. **Image mode = ramp** with a **threshold (default) vs. Floyd–Steinberg
  dither** toggle (threshold usually reads better at this resolution), plus contrast/
  invert.
- **Pluggable tier** selected by the user, defaulting to the Safe ramp, with the Census
  recommending the best tier that survives on the rig.

## 6. The Glyph Census (blind-first-print strategy)

A dedicated **"Print a test strip"** action emits one diagnostic payload (its own
`Cheer100`) that stacks a short, *labeled* sample of every candidate tier plus width
probes, e.g.:

```
FLOOR █░█░  RAMP ░▒▓█  QUAD ▖▗▘▙  BRAILLE ⠿⣿⠿  CJK 一二三龘  RULER123456789012345
```

The printed receipt (photo / VOD) reveals, in a single 100-bit print: **which tiers
render solid vs. tofu vs. wrong-width, and the true per-line column count** (from the
ruler). The user then sets the **tier** and **column-width** control once; every later
payload is pinned to that rig. This converts the biggest unknown into a measured fact
without any access to the streamer's PC.

## 7. Payload format

- Single newline-free line: `<glyph-grid rows concatenated>` + ` Cheer100 ` + `<nonce>`.
  The ` Cheer100 ` + nonce suffix is a **"Cheer-ready" toggle (default on)**; turned off
  it emits the raw glyph block only — for neutral/other uses, or when `cheer-splitter-9k`
  will add the prefix itself.
- **Grid:** `W` columns (default set conservatively; Census-tunable) × `H` rows sized so
  total ≤ ~490 chars (leaving headroom under Twitch's 500). Live character counter with a
  safe/over indicator.
- **Nonce:** a small **visible** rotating token (e.g. a cycling faint glyph or short
  counter) to defeat Twitch's Unique-Chat / 30-second duplicate filter. **Not**
  zero-width (that same sanitizing first-party client likely strips invisibles).
- **No `<`, `>`, `&`** in output (defensive: could be mangled/sanitized) — the engine's
  glyph sets don't include them.

## 8. UI / UX (single page, minimalist — matches siblings)

- Mode tabs: **Big Text** · **Image**. Shared: tier selector (default Safe ramp),
  column-width control, live **preview** on a receipt-shaped canvas (approximate — a
  banner notes the real Qt-WebKit print is the source of truth), char counter, **Copy**
  button, collapsible raw-payload view, and a **Print test strip (Census)** button.
- **Big Text:** text input; orientation **Stacked** (default; each letter big, reads down
  the tape) / **Sideways** (rotated 90°).
- **Image:** in-browser file pick (nothing uploaded); threshold/dither toggle; contrast;
  invert.
- **Delivery reminder** in the UI: paste into the **official Twitch web/mobile chat** and
  send as a ≥100-bit cheer (only the first-party client actually cheers).

## 9. Error handling & edge cases

- **Over budget:** counter turns red; auto-suggest reducing height/width; never silently
  truncate (truncation shears the grid).
- **Empty / whitespace-only text; unreadable image:** clear inline message, no payload.
- **Very large image:** downscale on canvas before sampling; cap source dimensions to
  keep the main thread responsive.
- **Clipboard API unavailable:** fall back to a selectable textarea.
- **Tier renders as tofu on the rig:** mitigated by the Census + the guaranteed `█`/`░`
  floor tier that virtually always renders.
- **AutoMod / blocked-terms** (channel-side) may hold/drop the cheer — documented as an
  out-of-our-control caveat in the README, not something code can fix.

## 10. Testing

`test/*.test.mjs` (Node `node:test`, run by `npm test` and CI), extracting the inline
script per house pattern. Cover the **pure core**:

- `quantize`: luminance→glyph mapping for each tier; threshold vs. dither; binary text
  mapping; correct handling of the off-cell (never emits a space).
- `render`: grid → newline-free string; exact length = `W×H`; no forbidden chars.
- `packageCheer`: ` Cheer100 ` present & space-delimited; never leads with `/`/`.`; nonce
  varies across calls; total length ≤ budget; over-budget is reported not truncated.
- Ramp/tier tables: monotonic light→dark ordering; no excluded (emoji/astral) codepoints.
- `census`: contains each tier label + a countable ruler; fits one message.
- `rasterize` sampling logic tested against synthetic pixel buffers (pure parts factored
  out of the canvas call).

CI mirrors siblings: install → `npm test` → `wrangler deploy --dry-run` on PR/`main`.
**Real-world acceptance = the Census print** on an actual rig.

## 11. Out of scope (v1)

HTML injection; YouTube (~200-char cap); receiptify's phonetic-transliteration gimmick
(that's `transliterate-me`'s job); image hosting / `<img>` printing (wkhtmltopdf's old
TLS stack loads Cloudflare-hosted HTTPS images unreliably anyway); auto-sending to Twitch
(you paste & spend your own bits); multi-message chunking (compose with
`cheer-splitter-9k`); accounts; any server-side processing.

## 12. Decisions & defaults

- **Deploy target: `receipt.uwutoowo.com`** (decided). A receipt-themed identity is fine
  (not forced-neutral). Working repo name `receipt-wrecker`; user-facing site title TBD.
- **Future intent:** the sibling tools may later fold into a single site. The pure-core
  design (§4) keeps the glyph engine as portable functions, so it can drop into a combined
  site without a rewrite — avoid standalone-only coupling.
- **License:** proposed **MIT** (matches `cheer-splitter-9k`, the closest sibling) unless
  GPLv3 is preferred.
- **Default column width: 15** for full-width CJK-scale cells — **empirically confirmed**
  on the target rig in the past week (the receiptify tool prints successfully at 15 cols,
  so CJK renders and the 15-column wrap holds on this specific setup). Block cells may be
  narrower → more columns (Census-set). User-adjustable.

## 13. Rig-dependent unknowns (resolved by the Census / first prints, not guessable blind)

**Already confirmed on the *current* target rig:** the CJK tier renders and the
**15-column** full-width wrap holds (the receiptify tool has printed successfully at 15
cols this past week). Re-confirm if the streamer changes paper width, fonts, or PC.

**Still to surface via one Census print:** whether the higher-resolution block / quadrant /
Braille tiers render vs. tofu and at what column count; Braille dot-bleed legibility; the
best off-cell for clean whites.
