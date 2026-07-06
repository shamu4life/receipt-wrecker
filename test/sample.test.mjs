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
