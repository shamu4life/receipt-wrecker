# Block-Glyph Art & Big-Text Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-file, client-side web tool that turns big text or an uploaded image into a paste-ready single-line grid of monospace "block" glyphs, for making oversized text / pictures print on a Twitch streamer's thermal receipt printer via a `Cheer100` chat message.

**Architecture:** One self-contained `public/index.html` (inline `<style>` + one vanilla-JS IIFE). All *pure* logic (glyph tiers, luma sampling, quantization, dithering, braille packing, render, cheer-packaging, census) is written as DOM-free functions exposed via a `module.exports` hook so `node:test` can unit-test them in a `node:vm`. Canvas rasterization and DOM wiring are thin browser-only glue, verified manually. Deployed as Cloudflare Workers Static Assets. Sibling #3 of `cheer-splitter-9k` / `transliterate-me`; matches their conventions exactly.

**Tech Stack:** Vanilla JS (ES2020, no framework), HTML5 `<canvas>` (browser only), Cloudflare Workers Static Assets via Wrangler, Node's built-in `node:test` + `node:vm` for tests. **Zero runtime dependencies. No build step.**

## Global Constraints

Every task's requirements implicitly include these (verbatim from the spec):

- **One file:** `public/index.html` is the entire app — inline `<style>` + one inline `<script>` starting with `"use strict";`. No `src/`, no bundler, no package manager, **zero runtime deps, no build step**.
- **Test harness:** a shared `test/_harness.mjs` (plain module, **not** a `.test.mjs`) exports `loadCore()` and `eq()`; it uses `node:vm` to run the inline script — extracted via `/<script>([\s\S]*?)<\/script>/` — in a null-DOM sandbox and returns `sandbox.module.exports`. Each `test/*.test.mjs` imports those helpers (`node:test` + `node:assert/strict`). Structural compare via `eq()` = `assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected)`.
- **Pure-core rule:** any function that must be tested takes/returns plain data (numbers, strings, arrays) and never touches `document`/`canvas`/`window`. Canvas & DOM live in browser-only glue guarded so the null-DOM sandbox tolerates it.
- **Payload rules:** output is a **single line, no newlines**; total length ≤ **`MAX_CHARS = 490`** code points (under Twitch's 500 cap); output contains **no space, no `<` `>` `&`**, and must **not begin with `/` or `.`**; the cheer token is the literal `Cheer100`, **space-delimited**; the de-dup nonce is **visible** glyphs (never zero-width).
- **Glyph rules:** default tier is the block ramp `░▒▓█`; the "off"/lightest cell is always a **real, non-collapsing glyph** (never a space); **no emoji / astral-plane codepoints** in any tier.
- **Default columns = 15** (empirically confirmed on the target rig).
- **Deploy target:** `receipt.uwutoowo.com`. **Worker name:** `receipt-wrecker`. **License:** MIT.
- **Identity:** this folder is locked to the **shamu4life** GitHub identity — all `git`/`gh` actions run as shamu4life (pinned by the environment; do not override).

## Core API contract (types & signatures — keep consistent across all tasks)

```
LumaGrid = number[][]     // grid[r][c] in [0..255]; 0 = dark/ink, 255 = light/paper; rows × cols
CellGrid = string[][]     // grid[r][c] = exactly one glyph
Tier = { id, label, kind: "tone"|"binary"|"braille", ramp?: string[] /* light→dark */, on?: string, off?: string }

TIERS: Tier[]                                             // the tier table
getTier(id) -> Tier
sampleLuma(pixels, imgW, imgH, cols, rows) -> LumaGrid    // pixels = RGBA Uint8ClampedArray|number[]
ditherFloydSteinberg(luma, nLevels) -> LumaGrid           // returns luma snapped to nLevels steps
quantizeTone(luma, ramp, opts?) -> CellGrid               // opts: { invert? }
quantizeBinary(luma, opts) -> CellGrid                    // opts: { on, off, threshold?, invert? }
lumaToDots(luma, opts?) -> boolean[][]                    // opts: { threshold?, invert? }; true = ink
packBraille(dots) -> CellGrid                             // dots height %4, width %2
render(cells) -> string                                   // CellGrid → single newline-free string
makeNonce(i) -> string                                    // visible 2-glyph nonce, varies with i
packageCheer(body, opts) -> string                        // opts: { cheer, cheerToken?, nonce? }
payloadLength(s) -> number ; withinBudget(s) -> boolean ; MAX_CHARS
buildCensus() -> string                                   // the one-line diagnostic payload
```

**v1 tiers:** `safe` (`░▒▓█`, default), `cjk` (curated common Han density ramp), `braille` (2×4 sub-cell), `text` (binary `█`/`░`). *Fullwidth-ASCII and quadrant tiers are deferred — data-only additions later; braille already delivers the sub-cell resolution win and the safe ramp delivers grayscale, so v1 stays focused.*

---

## Task 1: Repo scaffold, test harness, export hook

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `.gitignore`, `public/index.html`, `test/_harness.mjs`, `test/smoke.test.mjs`, `LICENSE`

**Interfaces:**
- Produces: the empty inline-script + `module.exports` hook that every later task extends; the reusable test sandbox other test files copy.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "receipt-wrecker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "node --test"
  },
  "devDependencies": {
    "wrangler": "^4"
  }
}
```

- [ ] **Step 2: Create `wrangler.jsonc`** (mirrors `cheer-splitter-9k`)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "receipt-wrecker",
  "compatibility_date": "2026-06-19",
  "observability": { "enabled": true },
  "assets": { "directory": "./public" },
  "compatibility_flags": ["nodejs_compat"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
package-lock.json
.wrangler/
.dev.vars*
.env*
.DS_Store
```

- [ ] **Step 4: Create `public/index.html` skeleton** (the only app file; export hook present, core empty)

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt Wrecker</title></head>
<body>
<main id="app"></main>
<script>
  "use strict";

  // ── PURE CORE (DOM-free; unit-tested via node:vm) ─────────────────────────
  // (filled in by later tasks)

  // ── BROWSER GLUE (canvas + DOM; guarded so the null-DOM test sandbox tolerates it)
  // (filled in by later tasks)

  // ── TEST EXPORT HOOK ──────────────────────────────────────────────────────
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {};
  }
</script>
</body>
</html>
```

- [ ] **Step 5: Create `test/_harness.mjs`** (a plain shared helper — NOT a `.test.mjs`, so it registers no tests of its own)

```js
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Extract the inline <script> and run it in a null-DOM sandbox.
export function loadCore() {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, "../public/index.html"), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("could not find the inline <script> in index.html");
  function nullNode() {
    const fn = function () { return proxy; };
    const proxy = new Proxy(fn, {
      get(_t, k) {
        if (k === "value" || k === "textContent") return "";
        if (k === "checked") return false;
        if (k === Symbol.toPrimitive) return () => "";
        return proxy;
      },
      set() { return true; }, apply() { return proxy; },
    });
    return proxy;
  }
  const document = {
    getElementById: () => nullNode(), createElement: () => nullNode(),
    querySelector: () => nullNode(), querySelectorAll: () => [],
    documentElement: nullNode(), body: nullNode(), addEventListener() {},
  };
  const sandbox = {
    document, navigator: {}, location: { href: "" },
    setTimeout: () => 0, console, module: { exports: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: "index.html#inline" });
  return sandbox.module.exports;
}

// Structural (prototype-agnostic) compare across the vm realm boundary.
export const eq = (a, b, msg) =>
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
```

- [ ] **Step 5b: Create `test/smoke.test.mjs`** (a real test file that uses the helper)

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";

test("(smoke) inline script loads and exposes a module.exports object", () => {
  const C = loadCore();
  assert.equal(typeof C, "object");
});
```

- [ ] **Step 6: Create `LICENSE`** — the standard MIT license text, `Copyright (c) 2026 shamu4life`.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — 1 test, "(smoke) inline script loads and exposes a module.exports object".

- [ ] **Step 8: Verify the Worker config loads**

Run: `npx wrangler deploy --dry-run`
Expected: dry-run succeeds, reporting `public/` as the assets directory (no deploy performed).

- [ ] **Step 9: Commit** (git repo is initialized here; identity is pinned to shamu4life)

```bash
git init
git add -A
git commit -m "chore: scaffold receipt-wrecker (single-file app + test harness)"
```

---

## Task 2: Glyph tiers

**Files:**
- Modify: `public/index.html` (pure core + export hook)
- Test: `test/tiers.test.mjs`

**Interfaces:**
- Produces: `TIERS`, `getTier(id)`. Consumed by quantize/render/census/UI.

- [ ] **Step 1: Write the failing test** — `test/tiers.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

const isBMPSingle = (g) => [...g].length === 1 && g.codePointAt(0) <= 0xFFFF;

test("TIERS: expected ids present with valid shape", () => {
  const byId = Object.fromEntries(C.TIERS.map(t => [t.id, t]));
  for (const id of ["safe", "cjk", "braille", "text"]) assert.ok(byId[id], "missing tier " + id);
  assert.equal(byId.safe.kind, "tone");
  assert.equal(byId.text.kind, "binary");
  assert.equal(byId.braille.kind, "braille");
});

test("TIERS: tone ramps are light→dark arrays of single BMP glyphs, no space, no emoji", () => {
  for (const t of C.TIERS.filter(x => x.kind === "tone")) {
    assert.ok(Array.isArray(t.ramp) && t.ramp.length >= 2);
    for (const g of t.ramp) {
      assert.ok(isBMPSingle(g), "non-single/astral glyph in " + t.id + ": " + JSON.stringify(g));
      assert.notEqual(g, " ");
    }
  }
});

test("TIERS: binary tier uses non-space single glyphs and a distinct off", () => {
  const t = C.getTier("text");
  assert.ok(isBMPSingle(t.on) && isBMPSingle(t.off));
  assert.notEqual(t.off, " ");
  assert.notEqual(t.on, t.off);
});

test("getTier throws on unknown id", () => {
  assert.throws(() => C.getTier("nope"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tiers.test.mjs`
Expected: FAIL — `C.TIERS` is undefined.

- [ ] **Step 3: Implement in the PURE CORE section of `public/index.html`**

```js
  var TIERS = [
    { id: "safe",  label: "Blocks ░▒▓█", kind: "tone",
      ramp: ["░", "▒", "▓", "█"] },
    { id: "cjk",   label: "CJK ramp",    kind: "tone",
      ramp: ["丶","一","二","三","王","士","古","目","田","国","黒","龍"] },
    { id: "braille", label: "Braille",   kind: "braille" },
    { id: "text",  label: "Big text",    kind: "binary", on: "█", off: "░" },
  ];
  function getTier(id) {
    var t = TIERS.find(function (x) { return x.id === id; });
    if (!t) throw new Error("unknown tier: " + id);
    return t;
  }
```

- [ ] **Step 4: Add to the export hook** — extend the `module.exports` object:

```js
    module.exports = { TIERS: TIERS, getTier: getTier };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/tiers.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add public/index.html test/tiers.test.mjs
git commit -m "feat: glyph tier table (safe/cjk/braille/text)"
```

---

## Task 3: `sampleLuma` — RGBA buffer → LumaGrid

**Files:**
- Modify: `public/index.html`
- Test: `test/sample.test.mjs`

**Interfaces:**
- Produces: `sampleLuma(pixels, imgW, imgH, cols, rows) -> LumaGrid`. Consumed by browser glue and quantize tasks.

- [ ] **Step 1: Write the failing test** — `test/sample.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
const C = loadCore();

// helper: build a flat RGBA buffer from a 2D array of [r,g,b,a] (or gray 0/255)
function rgba(rows) {
  const h = rows.length, w = rows[0].length, out = new Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = rows[y][x], i = (y * w + x) * 4;
    const [r, g, b, a] = Array.isArray(p) ? p : [p, p, p, 255];
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
  }
  return { pixels: out, w, h };
}

test("solid black and white map to 0 and 255", () => {
  const black = rgba([[0, 0], [0, 0]]);
  eq(C.sampleLuma(black.pixels, black.w, black.h, 1, 1), [[0]]);
  const white = rgba([[255, 255], [255, 255]]);
  eq(C.sampleLuma(white.pixels, white.w, white.h, 1, 1), [[255]]);
});

test("a 2x2 quadrant image samples into a 2x2 luma grid", () => {
  const img = rgba([[0, 255], [255, 0]]);
  eq(C.sampleLuma(img.pixels, img.w, img.h, 2, 2), [[0, 255], [255, 0]]);
});

test("transparent pixels composite over white (alpha=0 -> 255)", () => {
  const img = rgba([[[0, 0, 0, 0]]]);
  eq(C.sampleLuma(img.pixels, 1, 1, 1, 1), [[255]]);
});

test("downsampling averages a block (half black half white ~ 128)", () => {
  const img = rgba([[0, 0, 255, 255]]); // 1x4: two black, two white
  const g = C.sampleLuma(img.pixels, 4, 1, 1, 1);
  assert.ok(Math.abs(g[0][0] - 128) <= 2, "got " + g[0][0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sample.test.mjs`
Expected: FAIL — `C.sampleLuma` is not a function.

- [ ] **Step 3: Implement in PURE CORE**

```js
  function sampleLuma(pixels, imgW, imgH, cols, rows) {
    var grid = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      var y0 = Math.floor(r * imgH / rows);
      var y1 = Math.max(y0 + 1, Math.floor((r + 1) * imgH / rows));
      for (var c = 0; c < cols; c++) {
        var x0 = Math.floor(c * imgW / cols);
        var x1 = Math.max(x0 + 1, Math.floor((c + 1) * imgW / cols));
        var sum = 0, n = 0;
        for (var y = y0; y < y1 && y < imgH; y++) {
          for (var x = x0; x < x1 && x < imgW; x++) {
            var i = (y * imgW + x) * 4;
            var a = pixels[i + 3] / 255;
            var rr = pixels[i] * a + 255 * (1 - a);
            var gg = pixels[i + 1] * a + 255 * (1 - a);
            var bb = pixels[i + 2] * a + 255 * (1 - a);
            sum += 0.299 * rr + 0.587 * gg + 0.114 * bb; n++;
          }
        }
        row.push(n ? Math.round(sum / n) : 255);
      }
      grid.push(row);
    }
    return grid;
  }
```

- [ ] **Step 4: Add `sampleLuma` to the export hook.**

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/sample.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add public/index.html test/sample.test.mjs
git commit -m "feat: sampleLuma (RGBA buffer -> luma grid, alpha over white)"
```

---

## Task 4: `quantizeTone` and `quantizeBinary`

**Files:**
- Modify: `public/index.html`
- Test: `test/quantize.test.mjs`

**Interfaces:**
- Consumes: LumaGrid, Tier ramps/marks.
- Produces: `quantizeTone(luma, ramp, opts?) -> CellGrid`, `quantizeBinary(luma, opts) -> CellGrid`.

- [ ] **Step 1: Write the failing test** — `test/quantize.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
const C = loadCore();
const RAMP = ["░", "▒", "▓", "█"]; // light→dark

test("quantizeTone maps dark→densest, light→lightest", () => {
  eq(C.quantizeTone([[0]], RAMP), [["█"]]);
  eq(C.quantizeTone([[255]], RAMP), [["░"]]);
});

test("quantizeTone spreads mid-tones across the ramp", () => {
  const out = C.quantizeTone([[0, 85, 170, 255]], RAMP)[0];
  eq(out, ["█", "▓", "▒", "░"]);
});

test("quantizeTone invert flips dark/light", () => {
  eq(C.quantizeTone([[0]], RAMP, { invert: true }), [["░"]]);
});

test("quantizeBinary thresholds to on/off, never emits a space", () => {
  const out = C.quantizeBinary([[0, 255]], { on: "█", off: "░", threshold: 128 });
  eq(out, [["█", "░"]]);
  for (const row of out) for (const g of row) assert.notEqual(g, " ");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/quantize.test.mjs`
Expected: FAIL — functions undefined.

- [ ] **Step 3: Implement in PURE CORE**

```js
  function quantizeTone(luma, ramp, opts) {
    opts = opts || {};
    var maxIdx = ramp.length - 1;
    return luma.map(function (row) {
      return row.map(function (v) {
        var t = v / 255;                 // 0=dark,1=light
        if (opts.invert) t = 1 - t;
        var idx = Math.round((1 - t) * maxIdx);  // dark→maxIdx (densest)
        return ramp[idx];
      });
    });
  }
  function quantizeBinary(luma, opts) {
    var th = opts.threshold == null ? 128 : opts.threshold;
    return luma.map(function (row) {
      return row.map(function (v) {
        var dark = v < th;
        if (opts.invert) dark = !dark;
        return dark ? opts.on : opts.off;
      });
    });
  }
```

- [ ] **Step 4: Add both to the export hook.**

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/quantize.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add public/index.html test/quantize.test.mjs
git commit -m "feat: quantizeTone + quantizeBinary"
```

---

## Task 5: `ditherFloydSteinberg`

**Files:**
- Modify: `public/index.html`
- Test: `test/dither.test.mjs`

**Interfaces:**
- Produces: `ditherFloydSteinberg(luma, nLevels) -> LumaGrid` (values snapped to `nLevels` even steps in [0,255]). Feeds `quantizeTone` (call with `nLevels === ramp.length`) when the user picks "dither".

- [ ] **Step 1: Write the failing test** — `test/dither.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

function levelsOf(nLevels) {
  const step = 255 / (nLevels - 1), s = new Set();
  for (let i = 0; i < nLevels; i++) s.add(Math.round(i * step));
  return s;
}

test("output values are snapped to the requested levels", () => {
  const allowed = levelsOf(4);
  const out = C.ditherFloydSteinberg([[10, 120, 200], [60, 130, 240]], 4);
  for (const row of out) for (const v of row) assert.ok(allowed.has(v), "stray value " + v);
});

test("pure black/white pass through unchanged at 2 levels", () => {
  const out = C.ditherFloydSteinberg([[0, 255]], 2);
  assert.deepEqual(out, [[0, 255]]);
});

test("a flat mid-gray field diffuses into a mix (not all one level)", () => {
  const field = Array.from({ length: 6 }, () => Array(6).fill(128));
  const out = C.ditherFloydSteinberg(field, 2);
  const flat = out.flat();
  assert.ok(flat.some(v => v === 0) && flat.some(v => v === 255), "should mix black & white");
});

test("deterministic: same input twice → identical output", () => {
  const a = C.ditherFloydSteinberg([[30, 90, 150, 210]], 3);
  const b = C.ditherFloydSteinberg([[30, 90, 150, 210]], 3);
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dither.test.mjs`
Expected: FAIL — function undefined.

- [ ] **Step 3: Implement in PURE CORE**

```js
  function ditherFloydSteinberg(luma, nLevels) {
    var rows = luma.length, cols = rows ? luma[0].length : 0;
    var buf = luma.map(function (row) { return row.slice(); });
    var step = 255 / (nLevels - 1);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var oldv = buf[r][c];
        var q = Math.round(oldv / step) * step;
        var err = oldv - q;
        buf[r][c] = q;
        if (c + 1 < cols) buf[r][c + 1] += err * 7 / 16;
        if (r + 1 < rows) {
          if (c - 1 >= 0) buf[r + 1][c - 1] += err * 3 / 16;
          buf[r + 1][c] += err * 5 / 16;
          if (c + 1 < cols) buf[r + 1][c + 1] += err * 1 / 16;
        }
      }
    }
    return buf.map(function (row) {
      return row.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))); });
    });
  }
```

- [ ] **Step 4: Add to the export hook.**

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/dither.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add public/index.html test/dither.test.mjs
git commit -m "feat: Floyd–Steinberg dithering to N levels"
```

---

## Task 6: Braille packing — `lumaToDots` + `packBraille`

**Files:**
- Modify: `public/index.html`
- Test: `test/braille.test.mjs`

**Interfaces:**
- Produces: `lumaToDots(luma, opts?) -> boolean[][]` (true = ink), `packBraille(dots) -> CellGrid`. Browser glue samples the image to a *fine* grid (`cols*2 × rows*4`), calls `lumaToDots` then `packBraille`.

- [ ] **Step 1: Write the failing test** — `test/braille.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
const C = loadCore();

const F = false, T = true;

test("all-off cell → blank braille U+2800 (⠀)", () => {
  const dots = [[F, F], [F, F], [F, F], [F, F]];
  eq(C.packBraille(dots), [["⠀"]]);
});

test("all-on cell → full braille U+28FF (⣿)", () => {
  const dots = [[T, T], [T, T], [T, T], [T, T]];
  eq(C.packBraille(dots), [["⣿"]]);
});

test("single top-left dot → U+2801 (⠁)", () => {
  const dots = [[T, F], [F, F], [F, F], [F, F]];
  eq(C.packBraille(dots), [["⠁"]]);
});

test("packs a 2-cell-wide grid", () => {
  const dots = [
    [T, F, F, F],
    [F, F, F, F],
    [F, F, F, F],
    [F, F, F, T],
  ];
  const out = C.packBraille(dots);
  assert.equal(out[0].length, 2);
  assert.equal(out[0][0], "⠁");        // dot1 in cell 0
  assert.equal(out[0][1], "⢀");        // dot8 in cell 1 (0x80)
});

test("lumaToDots: dark below threshold is ink (true)", () => {
  eq(C.lumaToDots([[0, 255]], { threshold: 128 }), [[true, false]]);
  eq(C.lumaToDots([[0]], { threshold: 128, invert: true }), [[false]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/braille.test.mjs`
Expected: FAIL — functions undefined.

- [ ] **Step 3: Implement in PURE CORE**

```js
  // Braille 2×4 dot → bit mask; rows are dot-rows 0..3, cols are dot-cols 0..1.
  var BRAILLE_BITS = [
    [0x01, 0x08],
    [0x02, 0x10],
    [0x04, 0x20],
    [0x40, 0x80],
  ];
  function lumaToDots(luma, opts) {
    var th = opts && opts.threshold != null ? opts.threshold : 128;
    var inv = !!(opts && opts.invert);
    return luma.map(function (row) {
      return row.map(function (v) { var ink = v < th; return inv ? !ink : ink; });
    });
  }
  function packBraille(dots) {
    var H = dots.length, W = H ? dots[0].length : 0;
    var rows = Math.floor(H / 4), cols = Math.floor(W / 2), out = [];
    for (var r = 0; r < rows; r++) {
      var line = [];
      for (var c = 0; c < cols; c++) {
        var mask = 0;
        for (var dr = 0; dr < 4; dr++)
          for (var dc = 0; dc < 2; dc++)
            if (dots[r * 4 + dr][c * 2 + dc]) mask |= BRAILLE_BITS[dr][dc];
        line.push(String.fromCodePoint(0x2800 + mask));
      }
      out.push(line);
    }
    return out;
  }
```

- [ ] **Step 4: Add `lumaToDots` and `packBraille` to the export hook.**

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/braille.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add public/index.html test/braille.test.mjs
git commit -m "feat: braille 2x4 sub-cell packing"
```

---

## Task 7: `render` + budget helpers

**Files:**
- Modify: `public/index.html`
- Test: `test/render.test.mjs`

**Interfaces:**
- Produces: `render(cells) -> string`, `payloadLength(s) -> number`, `withinBudget(s) -> boolean`, `MAX_CHARS`.

- [ ] **Step 1: Write the failing test** — `test/render.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

test("render flattens a CellGrid to one newline-free string of exactly rows*cols glyphs", () => {
  const cells = [["█", "░", "█"], ["░", "█", "░"]];
  const s = C.render(cells);
  assert.equal(s, "█░█░█░");
  assert.ok(!s.includes("\n"));
  assert.equal([...s].length, 6);
});

test("render output never contains space or < > &", () => {
  const s = C.render([["█", "░"], ["▒", "▓"]]);
  for (const bad of [" ", "<", ">", "&"]) assert.ok(!s.includes(bad), "found " + bad);
});

test("MAX_CHARS is 490 and withinBudget uses code-point length", () => {
  assert.equal(C.MAX_CHARS, 490);
  assert.equal(C.payloadLength("龍龍龍"), 3);
  assert.equal(C.withinBudget("█".repeat(490)), true);
  assert.equal(C.withinBudget("█".repeat(491)), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.mjs`
Expected: FAIL — undefined.

- [ ] **Step 3: Implement in PURE CORE**

```js
  var MAX_CHARS = 490;
  function render(cells) {
    return cells.map(function (row) { return row.join(""); }).join("");
  }
  function payloadLength(s) { return Array.from(s).length; }
  function withinBudget(s) { return payloadLength(s) <= MAX_CHARS; }
```

- [ ] **Step 4: Add `render`, `payloadLength`, `withinBudget`, `MAX_CHARS` to the export hook.**

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/render.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add public/index.html test/render.test.mjs
git commit -m "feat: render + budget helpers"
```

---

## Task 8: `makeNonce`, `packageCheer`, `buildCensus`

**Files:**
- Modify: `public/index.html`
- Test: `test/payload.test.mjs`

**Interfaces:**
- Produces: `makeNonce(i)`, `packageCheer(body, opts)`, `buildCensus()`.

- [ ] **Step 1: Write the failing test** — `test/payload.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

test("makeNonce is a short visible token that changes across sends", () => {
  const a = C.makeNonce(0), b = C.makeNonce(1);
  assert.notEqual(a, b);
  assert.ok([...a].length >= 1 && [...a].length <= 3);
  for (const bad of [" ", "​", "⁠", "<", ">", "&"]) assert.ok(!a.includes(bad));
});

test("packageCheer off = body unchanged", () => {
  assert.equal(C.packageCheer("███", { cheer: false }), "███");
});

test("packageCheer on appends space-delimited Cheer100 + nonce and never leads with / or .", () => {
  const p = C.packageCheer("███", { cheer: true, nonce: "░▒" });
  assert.ok(/ Cheer100 /.test(" " + p + " "), "must contain space-delimited Cheer100");
  assert.ok(p.endsWith("Cheer100 ░▒") || p.endsWith("Cheer100 ░▒ "));
  assert.ok(p[0] !== "/" && p[0] !== ".");
});

test("buildCensus: one line, has each tier label + a ruler + Cheer100, within budget", () => {
  const s = C.buildCensus();
  assert.ok(!s.includes("\n"));
  for (const label of ["FLOOR", "RAMP", "BRAILLE", "CJK", "RULER"]) assert.ok(s.includes(label), "missing " + label);
  assert.ok(/[0-9]{6,}/.test(s), "needs a countable ruler run");
  assert.ok(s.includes("Cheer100"));
  assert.ok(C.withinBudget(s), "census over budget");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/payload.test.mjs`
Expected: FAIL — undefined.

- [ ] **Step 3: Implement in PURE CORE**

```js
  var CHEER_TOKEN = "Cheer100";
  var NONCE_ALPHABET = ["░", "▒", "▓"]; // visible, safe, non-collapsing
  function makeNonce(i) {
    var a = NONCE_ALPHABET, base = a.length * a.length;
    var n = ((i % base) + base) % base;
    return a[Math.floor(n / a.length)] + a[n % a.length];
  }
  function packageCheer(body, opts) {
    opts = opts || {};
    if (!opts.cheer) return body;
    var token = opts.cheerToken || CHEER_TOKEN;
    var nonce = opts.nonce || "";
    return body + " " + token + (nonce ? " " + nonce : "");
  }
  function buildCensus() {
    var parts = [
      "FLOOR" + "█░█░",
      "RAMP" + "░▒▓█",
      "BRAILLE" + "⠿⣿⠿",
      "CJK" + "一二三龍",
      "RULER" + "0123456789012345",
    ];
    return parts.join(" ") + " " + CHEER_TOKEN;
  }
```

- [ ] **Step 4: Add `makeNonce`, `packageCheer`, `buildCensus` (and `CHEER_TOKEN`) to the export hook.**

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/payload.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — all files (harness, tiers, sample, quantize, dither, braille, render, payload).

- [ ] **Step 7: Commit**

```bash
git add public/index.html test/payload.test.mjs
git commit -m "feat: nonce, cheer packaging, and census diagnostic"
```

---

## Task 9: Browser glue — canvas rasterizers, compose, DOM wiring, preview

Manual verification only (canvas/DOM aren't reachable by the null-DOM test sandbox). Keep every pure call above intact.

**Files:**
- Modify: `public/index.html` (BROWSER GLUE section + `<style>` + `#app` markup)

**Interfaces:**
- Consumes: all pure-core functions.
- Produces (browser-only, not exported): `rasterizeText(text, {cols, rows, sideways}) -> {pixels,w,h}`, `rasterizeImage(imgEl, {cols, rows}) -> {pixels,w,h}`, `buildTextPayload()`, `buildImagePayload()`, and DOM wiring.

- [ ] **Step 1: Add the app markup inside `<main id="app">`** — mode tabs (`Big Text` / `Image`), a controls column (tier `<select>`, columns `<input type=range min=6 max=40 value=15>`, orientation toggle, threshold/dither radio, contrast range, invert checkbox, `Cheer-ready` checkbox [checked], image `<input type=file accept="image/*">`, text `<input type=text>`), a preview column (`<pre id="preview">`, `<span id="count">`, `Copy` button, `Print test strip` button), and a delivery reminder line: "Paste into the **official Twitch web/mobile chat** and send as a ≥100-bit cheer — only the first-party client actually cheers." Add minimal inline `<style>` (system font, two-column flex that stacks on narrow screens, monospace `#preview`).

- [ ] **Step 2: Add browser glue — canvas rasterizers.** These build a white-background canvas, draw black content, and return `getImageData`. Guard the whole glue block with `if (typeof document !== "undefined" && document.getElementById)` so the null-DOM sandbox (whose `getElementById` exists but returns proxies) does not execute real rendering during tests — wrap the *wiring* (not the function definitions) in a `DOMContentLoaded`-gated `init()`.

```js
  function canvasPixels(draw, w, h) {
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    draw(ctx, w, h);
    return { pixels: ctx.getImageData(0, 0, w, h).data, w: w, h: h };
  }
  // Render big text: draw uppercase words wrapped to fit `cols` cells wide.
  function rasterizeText(text, o) {
    var CELL = 24, w = o.cols * CELL, lineH = CELL * 1.05;
    // measure/wrap at a font size that fits cols; one pass at fixed size, wrap by width.
    return canvasPixels(function (ctx) {
      ctx.textBaseline = "top";
      var size = CELL * 1.3;
      ctx.font = "900 " + size + "px Arial, sans-serif";
      var words = text.toUpperCase().split(/\s+/).filter(Boolean), lines = [], cur = "";
      for (var i = 0; i < words.length; i++) {
        var t = cur ? cur + " " + words[i] : words[i];
        if (ctx.measureText(t).width > w && cur) { lines.push(cur); cur = words[i]; }
        else cur = t;
      }
      if (cur) lines.push(cur);
      for (var j = 0; j < lines.length; j++) ctx.fillText(lines[j], 0, j * lineH);
    }, w, Math.max(o.rows, 1) * lineH | 0);
  }
  function rasterizeImage(imgEl, o) {
    var w = o.fineW || o.cols, h = o.fineH || o.rows;
    return canvasPixels(function (ctx) { ctx.drawImage(imgEl, 0, 0, w, h); }, w, h);
  }
```

*Note:* text height is content-driven; the wiring recomputes `rows` from the returned buffer height / `CELL` before calling `sampleLuma`. `sideways` orientation is applied by rotating the canvas 90° (`ctx.translate/rotate`) — implement in the wiring or a `sideways` branch; documented as a v1 nicety.

- [ ] **Step 3: Add the compose + wiring `init()`** (runs only in the browser):

```js
  function computeGrid(kind, tier, o) {
    if (tier.kind === "braille") {
      var buf = kind === "text" ? rasterizeText(o.text, { cols: o.cols * 2, rows: o.rows * 4 })
                                 : rasterizeImage(o.img, { fineW: o.cols * 2, fineH: o.rows * 4 });
      var fine = sampleLuma(buf.pixels, buf.w, buf.h, o.cols * 2, (buf.h / (buf.w / (o.cols * 2))) | 0 || o.rows * 4);
      return packBraille(lumaToDots(fine, { threshold: o.threshold, invert: o.invert }));
    }
    var b = kind === "text" ? rasterizeText(o.text, o) : rasterizeImage(o.img, { fineW: o.cols, fineH: o.rows });
    var rows = kind === "text" ? Math.max(1, Math.round(b.h / 24)) : o.rows;
    var luma = sampleLuma(b.pixels, b.w, b.h, o.cols, rows);
    if (tier.kind === "binary") return quantizeBinary(luma, { on: tier.on, off: tier.off, threshold: o.threshold, invert: o.invert });
    if (o.dither) luma = ditherFloydSteinberg(luma, tier.ramp.length);
    return quantizeTone(luma, tier.ramp, { invert: o.invert });
  }
  // init(): read controls → computeGrid → render → packageCheer → update #preview/#count/Copy.
  // Bind: input/change on controls, file reader for image, Copy → navigator.clipboard.writeText,
  //       "Print test strip" → buildCensus() into the output. Persist last opts in localStorage.
```

- [ ] **Step 4: Manual verification** — run `npx wrangler dev`, open the local URL:
  - Big Text "HELLO": preview shows large `█`-on-`░` block letters; char count shown; Copy works.
  - Switch tier to `CJK` / `Braille`: preview updates; braille shows finer detail.
  - Image mode: pick a high-contrast PNG; preview shows a recognizable dithered grid; toggle threshold/dither/invert.
  - Confirm the assembled payload is one line, ends with ` Cheer100 <nonce>`, and the counter stays ≤490 (turns red past it).
  - "Print test strip" fills the output with the census string.

- [ ] **Step 5: Re-run the unit suite** (glue must not break the sandbox load)

Run: `npm test`
Expected: PASS — all pure-core tests still green (the guarded glue is inert under the null-DOM sandbox).

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat: canvas rasterizers, compose pipeline, and UI wiring"
```

---

## Task 10: Docs, community-health, CI, deploy dry-run

**Files:**
- Create: `README.md`, `CLAUDE.md`, `docs/CHANGELOG.md`, `.github/workflows/ci.yml`
- (Optional) copy the community-health set (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, dependabot) from `cheer-splitter-9k`, adjusting names.

- [ ] **Step 1: Write `README.md`** — banner/title "Receipt Wrecker", one-paragraph what-it-is, the Twitch-cheer use, the tier/Census explanation, "runs 100% in your browser", "▶ Try it live: receipt.uwutoowo.com", dev/deploy notes (`npm test`, `npx wrangler dev`, `npx wrangler deploy`), and a "How it works / first-print Census" section. Note the AutoMod caveat (a channel's AutoMod/blocked-terms can hold the cheer).

- [ ] **Step 2: Write `CLAUDE.md`** — mirror `cheer-splitter-9k`'s: "the one file that matters is `public/index.html`", repo layout table, "no build step", the pure-core/glue split and why tests use the null-DOM vm sandbox, and the payload/glyph Global Constraints.

- [ ] **Step 3: Write `docs/CHANGELOG.md`** — `## 0.1.0` initial release: tiers (safe/cjk/braille/text), image + big-text modes, census diagnostic, cheer-ready output.

- [ ] **Step 4: Write `.github/workflows/ci.yml`** (mirror sibling):

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: npm install
      - run: npm test
      - run: npx wrangler deploy --dry-run
```

- [ ] **Step 5: Verify everything**

Run: `npm test && npx wrangler deploy --dry-run`
Expected: all tests PASS; dry-run succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: README, CLAUDE.md, changelog, CI"
```

- [ ] **Step 7 (deploy — only when the user asks):** configure `receipt.uwutoowo.com` as a custom domain/route for the Worker in the Cloudflare dashboard or `wrangler.jsonc` `routes`, then `npx wrangler deploy`.

---

## Acceptance / real-world verification (post-build)

Unit tests + the live preview prove the *generation* is correct. The end-to-end truth is the **Census print**: send `buildCensus()` as a real `Cheer100` on the target rig once, photograph the receipt, read off (a) which tiers render solid vs. tofu, (b) the true column count from the ruler, and set the tier + column-width controls accordingly. Everything else is deterministic from there.

---

## Self-review notes (author checklist — done)

- **Spec coverage:** tiers (T2), image path (T3–T6, T9), text path (T4, T9), dither/threshold (T4–T5), braille high-res (T6), render/budget (T7), cheer+nonce+census (T8), UI/preview/copy/delivery-note (T9), docs/CI/deploy (T10), acceptance = Census. Quadrant + fullwidth-ASCII tiers explicitly deferred (documented in the Core API contract).
- **Placeholder scan:** none — every code step shows complete code; the only "specify/manual" steps are the un-unit-testable canvas/DOM glue (T9) and prose docs (T10), each with concrete content and manual verification.
- **Type consistency:** `LumaGrid`/`CellGrid` used consistently; `quantizeBinary` uses `{on,off,threshold,invert}` everywhere; `packBraille` consumes `boolean[][]` from `lumaToDots`; `packageCheer`/`makeNonce`/`buildCensus`/`MAX_CHARS` names match across T7/T8/T9.
