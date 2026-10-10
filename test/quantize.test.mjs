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
