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

test("bigWeightFor/bigItalicFor resolve the descriptor measureRun and the rotated span must share", () => {
  // Companions to bigFontFor: weight defaults to 800 (Big Text's own historical
  // baseline — the literal that used to be hardcoded into measureRun and the rotated
  // span's CSS shorthand), not fmtAttrs' 400.
  assert.equal(C.bigWeightFor(), 800, "no fmt means the historical weight");
  assert.equal(C.bigWeightFor({}), 800);
  assert.equal(C.bigWeightFor({ weight: 900 }), 900);
  assert.equal(C.bigItalicFor(), false);
  assert.equal(C.bigItalicFor({}), false);
  assert.equal(C.bigItalicFor({ italic: true }), true);
});

test("an unformatted rotated Big Text block is byte-identical to before this fix", () => {
  // rotatedSpan emits a plain HTML <span>, not SVG — fmtAttrs' presentation attributes
  // (font-weight=, text-decoration=, ...) do nothing there, so they must never appear;
  // weight/italic/family instead ride the escaped `font:` shorthand, and it must default
  // to exactly what was hardcoded before fmt existed. This is the literal captured from
  // the pre-fix build (commit f494261) for the same inputs — a silent regression here
  // would change the shape of every existing sideways block already printed in the wild.
  const bodies = C.rotateBodies("HELLO", 1, 1400, 90);
  assert.equal(bodies.length, 1);
  assert.equal(
    bodies[0].html,
    '<div style="position:relative;width:263px;height:41px;margin:0 auto">'
      + '<span style="position:absolute;top:50%;left:50%;width:41px;height:263px;'
      + 'white-space:nowrap;text-align:center;\\66ont:800 342px/263px Arial,sans-serif;'
      + '-webkit-transform:translate(-50%,-50%) rotate(90deg)">HELLO</span></div>'
  );
});

test("a rotated Big Text block's weight/italic/decoration reach the CSS style, never an inert HTML attribute", () => {
  const bodies = C.rotateBodies("HELLO", 1, 1400, 90,
    { font: "impact", weight: 900, italic: true, underline: true, strike: true });
  const html = bodies[0].html;
  // CSS `font` shorthand order is style, then weight, then size/line-height, then
  // family — any other order and the whole declaration is silently dropped.
  assert.ok(html.includes("\\66ont:italic 900 342px/263px Impact;"), "style-weight-size-family order, escaped");
  // Underline/strike don't affect metrics, so they ride a separate plain declaration.
  assert.ok(html.includes("text-decoration:underline line-through;"), "decoration rides the style");
  // fmtAttrs' SVG-attribute form must never land on this HTML element — it would be
  // both inert (HTML doesn't recognize these as presentation attributes) and wasted
  // payload against the 500-character budget.
  assert.ok(!/font-family=|font-weight=|font-style=|text-decoration="/.test(html),
    "no SVG-style attributes on the HTML span");
});
