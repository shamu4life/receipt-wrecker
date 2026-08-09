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

test("bigFontFor resolves the css font that measurement and rendering must share", () => {
  // Measuring in one font and drawing in another is what shears the last letters off a
  // sideways strip, so one function owns the answer and both callers use it.
  assert.equal(C.bigFontFor(), C.BIG_FONT, "no fmt means the default");
  assert.equal(C.bigFontFor({}), C.BIG_FONT);
  assert.equal(C.bigFontFor({ font: "" }), C.BIG_FONT, "the default entry falls back, never ''");
  assert.equal(C.bigFontFor({ font: "impact" }), "Impact");
  assert.equal(C.bigFontFor({ font: "mono" }), "monospace");
  assert.equal(C.bigFontFor({ font: "papyrus" }), C.BIG_FONT, "unknown ids fall back");
});
