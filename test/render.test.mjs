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

test("MAX_CHARS is 500 (Twitch's real limit) and withinBudget uses code-point length", () => {
  assert.equal(C.MAX_CHARS, 500);
  assert.equal(C.payloadLength("龍龍龍"), 3);
  assert.equal(C.withinBudget("█".repeat(500)), true);
  assert.equal(C.withinBudget("█".repeat(501)), false);
});
