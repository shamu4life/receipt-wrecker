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

test("Big Text carries its block's formatting onto the shared <g>", () => {
  const html = C.buildBigTextSvg("HELLO", 1, { font: "georgia", underline: true });
  assert.match(html, /<g [^>]*font-family="Georgia"/);
  assert.match(html, /<g [^>]*text-decoration="underline"/);
  // one <g>, not per-line attributes — that sharing is what keeps multi-line affordable
  assert.equal((html.match(/<g /g) || []).length, 1);
});

test("an unformatted Big Text block emits exactly what it emits today", () => {
  const before = C.buildBigTextSvg("HELLO", 1);
  assert.ok(!/font-family=/.test(before), "no font-family when the default is chosen");
  assert.ok(!/text-decoration=/.test(before));
});
