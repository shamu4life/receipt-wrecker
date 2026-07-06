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
