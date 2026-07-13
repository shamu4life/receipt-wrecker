# Stack Composer — design (Phase 1)

**Date:** 2026-07-13
**Status:** approved for spec review
**Repo:** receipt-wrecker (single-file vanilla-JS Cloudflare Worker + `public/index.html`)

## Problem / goal

Today the tool has two mutually-exclusive tabs — **Big Text** and **Image** — so a
printout is *either* text *or* a picture, never both. The user wants to **combine an
image and text into one printout**, arranged freely, and to **control the bit amount**
of the cheer (today it is hard-wired to `Cheer100` = 100 bits).

The chosen shape is a **stack composer**: an ordered list of blocks printed
top-to-bottom on the receipt. It **replaces both tabs** — a stack with one text block
*is* today's Big Text; a stack with one image block *is* today's Image.

## Scope

### In Phase 1
- **Composer** replacing the Big Text / Image tabs.
- **Text blocks**: render as crisp **Type** (SVG) or **Hanzi** (glyph tiling); an
  **orientation** of Normal / Sideways ▷ / Sideways ◁ / Upside-down; a size; and (when
  sideways) a per-receipt length.
- **Image blocks** (real pictures only): source by **link** or **upload-for-a-link**;
  print width; **rotation** 0/90/180/270° baked into the pixels; a per-block **render
  mode A/B toggle** (`<object>` vs SVG `<image>`).
- **Bits amount** control (integer ≥ 100, default 100) that swaps `Cheer<N>` into every
  payload, updates the preview header, and shows the **total** (parts × amount).
- The existing **Cheer-ready** toggle and **Thermal preview** toggle, unchanged.

### Deferred to Phase 2 (explicitly out of scope now)
- **File→glyph-art pictures** as stack blocks (they band across many receipts; the
  packer already supports multi-band blocks, so this is mostly per-block glyph controls).
- **Drag-to-reorder** (Phase 1 uses ↑ / ↓ / ✕ buttons).

## Non-negotiable invariants (must not regress)
- A stack of exactly one **text block** at Normal orientation produces the **same
  payload** today's Big Text produces; one **image block** = today's Image. The existing
  renderers are *reused*, not rewritten.
- Every filter-dodging property is preserved **per block**: the escaped-`\66ont:`
  property name (`FONT_PROP`), the run-cap (`breakRuns`), digit nonce, and the leading
  non-`<` guard (`LEAD_GUARD`).
- Zero-dependency, single `public/index.html` + `src/worker.js`. No build step, no
  external resources beyond the sanctioned backend calls (`/upload`, `/i/`, `/px`).

## Block model (data)

A single ordered array drives everything; persisted to `localStorage` like today's
controls.

```
blocks: [ Block, ... ]

Block =
  { id, type: "text",
    render: "type" | "hanzi",
    orient: 0 | 90 | 180 | 270,          // 90/270 = giant sideways (each direction)
    text: string,
    size: 25..100,                        // fill-% (hanzi floored at 85 as today)
    rotateLen: 300..2000 }                // only used when orient ∈ {90,270}
  | { id, type: "image",
      source: "url" | "upload",
      url: string,                        // the /i/ link or pasted URL actually embedded
      width: 10..70,                      // mm
      rotate: 0 | 90 | 180 | 270,         // baked into pixels
      renderAs: "object" | "svg" }        // A/B toggle, default "svg"

globals: { bits: >=100 (default 100), cheer: bool, thermal: bool }
```

`orient` subsumes the old `bigStyle` "rotate": Normal=0, Sideways ▷=90 (today's
behaviour), Sideways ◁=270 (rotate the other way + reverse column order so it still
reads when the tape is turned the other direction), Upside-down=180.

## Rendering & packing

Two clean halves, split out of the existing single-mode builders:

1. **`renderBlockBodies(block) → [htmlBody, …]`** — returns one HTML fragment per band.
   Most blocks return a single body; a tall **Hanzi** text block returns N bands, exactly
   as `buildTextParts` bands today. Bodies carry **no** cheer wrapper. Reuses
   `buildBigTextSvg` / `rotatedSpan` / the glyph grid / the image embed verbatim, with
   orientation/rotation applied.

2. **`packStack(blocks) → [part, …]`** — greedy fill. Maintains a current receipt with a
   remaining character budget of `MAX_CHARS − cheerOverhead`. For each body in order: if
   it fits, append it to the current receipt (bodies stacked in DOM order); else flush the
   current receipt and start a new one. A band that is itself ~`MAX_CHARS` naturally takes
   its own receipt. Only the **first** body on a receipt gets `LEAD_GUARD`; one nonce per
   receipt. Each finished receipt → `packageCheer(LEAD_GUARD + bodies.join(""),
   { cheer, cheerToken: "Cheer"+bits, nonce })`.

**Char accounting:** `payloadLength` (code-point length) of `LEAD_GUARD` + concatenated
bodies + `" Cheer"+bits` + `" "+nonce` must be ≤ `MAX_CHARS` (490). The per-receipt count
and the over-budget warning are shown as today; an over-budget single body still warns
rather than silently failing.

## Image block: rotation & render mode

- **Rotation bakes pixels, never CSS.** We just learned the printer mishandles CSS
  transforms (it broke text centering). So a rotated image is turned on a `<canvas>` and
  re-encoded to a print-sized PNG — it *arrives* rotated and prints reliably. Uploaded
  images already re-encode on upload, so rotation slots into that step. A **pasted URL**
  image with rotation ≠ 0 is fetched through the existing **`/px`** proxy (same-origin
  bytes), rotated on canvas, and uploaded to get an `/i/` link. Rotation = 0 keeps the
  original reference (URL direct, or the existing upload link) with no extra backend call.
  - *Privacy note:* rotating a pasted URL sends it through our backend (like Thermal
    preview does). Un-rotated URL images stay client-side. Surface this where it happens.
- **Sideways auto-size:** at 90/270°, default the print width so the image's long side
  runs down the tape (bigger on the narrow paper); still adjustable.
- **Render mode A/B:** each image block renders its final reference as either
  `<object data=…>` or SVG `<image>`. Default **svg** (today's behaviour, no regression).
  Because both options exist per block, the user can put one of each in a single stack,
  print once, and lock in whichever wins on the real printer. Rationale for offering the
  switch: `<object>`'s only known flaw was sizing WebP/JPEG at native size — which a
  right-sized PNG removes — while inline-SVG-referencing-an-external-image is exactly what
  old wkhtmltopdf is flaky about. This is **printer-dependent and cannot be verified
  locally**; the toggle is how we settle it empirically.

## Text block: orientation

- `orient` 0 = today's Big Text (Type) / Hanzi tiling.
- `orient` 90 = today's Giant sideways (unchanged mechanism: the
  `translate(-50%,-50%) rotate(90deg)` centering shipped 2026-07-12).
- `orient` 270 = sideways the other way: `rotate(270deg)` (equivalently `-90`) with the
  column order reversed so it reads top-to-bottom when the tape is turned the other way.
- `orient` 180 = upside-down: `rotate(180deg)` on the Type SVG / Hanzi grid.
- All angles use the **same CSS-rotate path that already prints** for 90° today, so the
  printer risk is low; confirm with one print. (The 2026-07-12 lesson was about
  *centering offset*, not whether rotation prints — it does.)

## UI

- **Block list:** each block is a card with a mini-preview, its own type-specific controls,
  and **↑ / ↓ / ✕**. An **"+ Add block → Text | Image"** control at the bottom.
- **Globals** above the preview: **Bits amount** (number, min 100), Cheer-ready toggle,
  Thermal preview toggle.
- **Preview:** the receipt(s) rendered with blocks stacked in order (thermal toggle still
  applies); a parts note shows `N BITS × P parts = total`.

## Testing

- **Node** (`node --test`, existing null-DOM harness): `packStack` splits at the right
  block boundary and respects the char budget; `renderBlockBodies` bands a tall hanzi
  block like `buildTextParts`; the cheer token reflects the bits amount; a single
  text/image block reproduces the current payload byte-for-byte (golden compare against
  the pre-refactor output).
- **Browser** (Playwright, against `wrangler dev`): a mixed stack renders top-to-bottom;
  Type/Sideways(both)/Upside-down orientations render and stay centered (ink-symmetry
  measure on the thermal canvas, as used this session); image rotation produces rotated
  pixels; the A/B toggle emits both `<object>` and SVG forms; thermal preview still
  dithers; the bits header and total update.
- **Printer (user, field):** the SVG-vs-`<object>` winner; that rotated images and the
  new text orientations land correctly. These cannot be verified locally (wkhtmltopdf is
  no longer installable).

## Risks / open items
- **Printer-dependent** items above are settled only by the user's prints; the design
  makes them A/B-testable rather than guessing.
- **Char budget** is the hard ceiling on how much stacks in one receipt; the packer +
  existing over-budget warning handle overflow by taping parts (each its own cheer → the
  bits total reflects it).
- **Branching:** built on current production code (the `thermal-image-proxy` work, PR #4,
  deployed but not yet merged). Resolve base branch at implementation (ideally after PR #4
  merges to `main`).
