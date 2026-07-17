# Stack Composer — Phase 1 Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Execute inline
> (single-file app; subagents would collide on `public/index.html`). TDD where the
> null-DOM test harness can reach the code; browser + real-engine (wkhtmltopdf)
> checks for anything DOM/visual.

**Goal:** Replace the Big Text / Image tabs with an ordered stack of blocks (text +
real-image) printed top-to-bottom, add a Cheer<N> bits-amount control, per-block image
rotation + object/SVG toggle, and text orientation.

**Architecture:** Split each existing renderer into a *body producer* (`renderBlockBodies`)
and central *packaging* (`packStack`). A `blocks` array drives the UI and rendering. The
packer fills receipts respecting BOTH the ~490-char Twitch limit AND the ~1500px physical
page-height limit (calibrated on the real engine).

**Tech Stack:** Vanilla JS, single `public/index.html`; `node --test` null-DOM harness;
local wkhtmltopdf 0.12.6 harness (job scratch dir) for real-engine verification.

## Global Constraints
- Single file `public/index.html`; zero deps; no build step; no external resources beyond
  sanctioned backend calls (`/upload`, `/i/`, `/px`).
- Preserve per-block: `FONT_PROP` (`\66ont:`), `breakRuns` run-cap, digit nonce, `LEAD_GUARD`.
- A single text block (orient 0) and a single image block must reproduce today's output.
- `MAX_CHARS = 490`. Physical height budget `HEIGHT_BUDGET = 1500` (px; real page ~1552).
- Bits: integer ≥ 100, default 100. Cheer token = `"Cheer" + bits`.

---

## File structure
- `public/index.html` — all app code (model, render, pack, UI, styles). One file by constraint.
- `test/compose.test.mjs` — new: packStack + bits + body-producer unit tests (null-DOM).
- Existing `test/*.mjs` continue to pass unchanged (regression guard on the reused renderers).
- `src/worker.js` — unchanged in Phase 1 (rotation reuses `/upload` + `/px`).

## Interfaces (locked; used across tasks)

```
// A rendered piece of a block. heightPx = estimated PHYSICAL height for page packing.
Body = { html: string, chars: number, heightPx: number,
         preview: { kind:"svg"|"img"|"grid", html?, imgUrl?, grid? }, blockId }

renderBlockBodies(block, ctx) -> Body[]      // ctx = {PAPER_PX, PX_PER_MM, measureRun,...}
packStack(blocks, { bits, cheer }) -> Part[] // Part = { payload, chars, heightPx, bodies:[Body], nonce }
getBits() -> number (>=100)
cheerOptsFor(i) -> { cheer, cheerToken:"Cheer"+getBits(), nonce }
```

Packing rule (packStack): walk blocks in order → concat their Bodies into a flat list →
greedily fill a receipt while `cumChars + body.chars <= MAX_CHARS` AND
`cumHeight + body.heightPx <= HEIGHT_BUDGET`; else flush and start a new receipt. A single
Body always gets at least its own receipt. First body on a receipt carries `LEAD_GUARD`.

---

## Task 1: Bits amount control + cheer token

**Files:** Modify `public/index.html` (add `#bitsAmount` input near the cheer toggle;
`getBits`, `cheerOptsFor`, title/total in preview). Test: `test/compose.test.mjs`.

**Interfaces — Produces:** `getBits()`, `cheerOptsFor(i)` (now sets `cheerToken`).

- [ ] Step 1: Test — `packageCheer("X", {cheer:true, cheerToken:"Cheer500", nonce:"07"})` → `"X Cheer500 07"`. (Extend existing payload test file or add to compose.test.mjs.)
```js
import { packageCheer } from harness; // via loadCore
eq(C.packageCheer("X", {cheer:true, cheerToken:"Cheer500", nonce:"07"}), "X Cheer500 07");
```
- [ ] Step 2: Run `node --test test/compose.test.mjs` → FAIL (no such export/behavior) or PASS if packageCheer already supports cheerToken (it does — then this pins it).
- [ ] Step 3: Add UI `<input type="number" id="bitsAmount" min="100" step="100" value="100">` and `function getBits(){var n=parseInt(els.bitsAmount.value,10); return isFinite(n)&&n>=100?n:100;}`. Wire `cheerOptsFor` → `{cheer:els.cheer.checked, cheerToken:"Cheer"+getBits(), nonce:nonceForPart(i)}`. Persist `bits` in save/restore.
- [ ] Step 4: Preview — receipt title shows `getBits()+" BITS"`; parts note shows `P + " parts × " + getBits() + " = " + P*getBits() + " bits"`.
- [ ] Step 5: `node --test` all green; commit `feat: bits amount control (Cheer<N>)`.

## Task 2: renderBlockBodies + packStack (engine, no UI yet)

**Files:** Modify `public/index.html` (extract body producers from `buildBigTextSvg`,
`rotatedSpan`/`buildRotatedParts`, `buildTextParts`, `buildUrlImageParts`; add `packStack`).
Export them for tests. Test: `test/compose.test.mjs`.

**Interfaces — Produces:** `renderBlockBodies`, `packStack` (see Interfaces).

- [ ] Step 1: Tests (null-DOM; pure string/number logic):
```js
// packing by chars
const bodies = [{html:"a",chars:200,heightPx:100},{html:"b",chars:200,heightPx:100},{html:"c",chars:200,heightPx:100}];
const parts = C.packStackBodies(bodies, {bits:100, cheer:true});
assert.equal(parts.length, 2);            // 200*3=600 > 490 -> 2 receipts
// packing by height
const tall = [{html:"a",chars:10,heightPx:900},{html:"b",chars:10,heightPx:900}];
assert.equal(C.packStackBodies(tall,{bits:100,cheer:true}).length, 2);  // 1800>1500
// cheer token from bits
assert.ok(C.packStackBodies([{html:"x",chars:5,heightPx:10}],{bits:500,cheer:true})[0].payload.includes("Cheer500"));
```
(Expose a pure `packStackBodies(bodies, opts)` that packStack calls, so it's unit-testable without DOM.)
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement `packStackBodies` (dual-budget greedy) + `renderBlockBodies` (reuse existing renderers, strip the cheer wrapper, attach `heightPx`: big=svg height; rotate band=maxL; hanzi band=rows*F; image=W*aspect). `packStack` = renderBlockBodies over blocks → flatten → packStackBodies.
- [ ] Step 4: Run → PASS; also `node --test` all prior tests green (renderers unchanged in behavior).
- [ ] Step 5: Commit `feat: renderBlockBodies + dual-budget packStack`.

## Task 3: Block model + composer UI (replaces tabs)

**Files:** Modify `public/index.html` (remove tab markup + per-mode panels; add block-list
container, per-block cards, "+ Add" control, globals row). JS: `blocks` array, `addBlock`,
`removeBlock`, `moveBlock`, `renderComposer`, block→controls binding, persistence of `blocks`.

**Interfaces — Consumes:** Task 2 `packStack`. **Produces:** `blocks`, `computeParts` (now
`packStack(blocks, {bits,cheer})`).

- [ ] Step 1: Replace `computeParts()` to call `packStack(blocks, {bits:getBits(), cheer:els.cheer.checked})`.
- [ ] Step 2: Build block cards: text card (render select type/hanzi, orient select, size, length-if-sideways, textarea) and image card (url/upload, width, rotation select, object/svg select). Each card: ↑/↓/✕. Migrate old saved `text`/`imgUrl` into an initial `blocks` seed so existing users land on a 1-text-block stack (= today's Big Text).
- [ ] Step 3: Reorder/add/remove mutate `blocks` + re-render + `saveControls`.
- [ ] Step 4: Browser check (Playwright vs wrangler dev): add a text block + image block, confirm 2 blocks render stacked in one receipt preview; single text block === today's payload (compare `lastParts[0].payload` to a golden captured pre-refactor).
- [ ] Step 5: Commit `feat: block-stack composer UI replacing tabs`.

## Task 4: Preview renders stacked bodies

**Files:** Modify `public/index.html` `renderParts` to render each Part's `bodies[]` in order
inside one `.rcpt` frame (svg/img/grid per `preview.kind`), keep thermal toggle + `data-thermalable`.

- [ ] Step 1: `renderParts` loops `item.bodies`, appends each preview node into the frame body.
- [ ] Step 2: Browser: mixed stack shows image then text stacked; thermal toggle still dithers the whole frame.
- [ ] Step 3: Commit `feat: stacked multi-block preview`.

## Task 5: Image rotation (baked pixels) + object/SVG toggle

**Files:** Modify `public/index.html`. Rotation via canvas: `rotateImageToDataThenUpload(url, deg)`
— for uploads rotate during existing re-encode; for URL fetch via `/px`, rotate on canvas,
re-upload to `/i/`. `renderAs` chooses `<object>` vs SVG `<image>`. Sideways (90/270) default
width so long side runs down tape.

- [ ] Step 1: Browser: upload/URL image, set rotation 90 → preview shows rotated pixels; payload references a new `/i/` link (rotated). renderAs toggle emits `<object>`/svg.
- [ ] Step 2: Real-engine check: render both forms of a rotated image through wkhtmltopdf harness → both correct.
- [ ] Step 3: Privacy note surfaces when a URL image is rotated (goes through backend).
- [ ] Step 4: Commit `feat: image rotation (baked) + object/SVG toggle`.

## Task 6: Text orientation 0/90/180/270

**Files:** Modify `public/index.html`. `orient` on text blocks: 0=big/hanzi as today; 90=today's
sideways; 270=sideways other way (rotate(270) + reverse column order); 180=upside-down (rotate(180)
on the SVG/grid). All via the proven `-webkit-transform` CSS-rotate.

- [ ] Step 1: Browser: each orientation renders + stays centered (ink-symmetry measure on thermal canvas).
- [ ] Step 2: Real-engine check: 180 and 270 render correctly through wkhtmltopdf harness.
- [ ] Step 3: Commit `feat: text orientation (sideways both ways + upside-down)`.

## Task 7: Regression + real-engine acceptance

- [ ] Step 1: `node --test` all green (43+ existing + new compose tests).
- [ ] Step 2: Golden compare: single text block (orient 0) and single image block payloads == captured pre-refactor payloads.
- [ ] Step 3: Real-engine: render a combined image+text stack + a bits=500 receipt through wkhtmltopdf; visually confirm.
- [ ] Step 4: Commit; deploy on user's go.

## Self-review notes
- Spec coverage: composer (T3), text+image blocks (T3), bits (T1), rotation+A/B (T5),
  orientation (T6), packing/regression (T2,T7). Glyph-art blocks + drag-reorder correctly
  deferred (Phase 2).
- Height-aware packing (T2) is the ground-truth refinement over the spec's char-only note.
