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
