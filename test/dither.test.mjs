import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
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
  eq(out, [[0, 255]]);
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
