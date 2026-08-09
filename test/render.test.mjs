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

test("bigWeightFor/bigItalicFor resolve the descriptor measureRun and the rendered markup must share", () => {
  // Companions to bigFontFor: weight defaults to BIG_WEIGHT (800, Big Text's own
  // historical baseline — the literal that used to be hardcoded into measureRun and
  // the rotated span's CSS shorthand), not fmtAttrs' 400.
  assert.equal(C.bigWeightFor(), C.BIG_WEIGHT, "no fmt means the historical weight");
  assert.equal(C.bigWeightFor({}), C.BIG_WEIGHT, "CONTRACT: absent is not 400 — must fall back, never materialize 400");
  assert.equal(C.bigWeightFor({ weight: 900 }), 900);
  assert.equal(C.bigWeightFor({ weight: "410.4" }), 410, "rounds, like fmtAttrs");
  assert.equal(C.bigWeightFor({ weight: 0 }), C.BIG_WEIGHT, "junk/zero falls back rather than building an invalid canvas font string");
  assert.equal(C.bigItalicFor(), false);
  assert.equal(C.bigItalicFor({}), false);
  assert.equal(C.bigItalicFor({ italic: true }), true);
});

test("Big Text's shared <g> carries the block's formatting; per-line <text> elements never do", () => {
  // Two lines, not one — a per-<text> implementation would also produce exactly one
  // <g> for a single line, so that shape alone can't prove the attributes are shared
  // rather than duplicated. Sharing them is the budget-critical property the brief
  // singled out: a per-line copy would cost a second cheer on a multi-line caption.
  const html = C.buildBigTextSvg("HELLO\nWORLD", 1, { font: "georgia", underline: true });
  assert.match(html, /<g [^>]*font-family="Georgia"/);
  assert.match(html, /<g [^>]*text-decoration="underline"/);
  assert.equal((html.match(/<g /g) || []).length, 1, "one <g>, not per-line");
  const textTags = html.match(/<text[^>]*>/g) || [];
  assert.equal(textTags.length, 2, "one <text> per input line");
  for (const t of textTags) {
    assert.ok(!/font-family=/.test(t), "formatting must not be duplicated onto a <text>: " + t);
    assert.ok(!/text-decoration=/.test(t), "formatting must not be duplicated onto a <text>: " + t);
  }
});

test("an unformatted Big Text block is byte-identical to today", () => {
  // Full-string pin, not a negative regex — a negative match on font-family/
  // text-decoration is satisfied even by an empty string, which proves nothing.
  assert.equal(
    C.buildBigTextSvg("HELLO", 1),
    '<svg width="263" height="33500"><g font-size="25000" text-anchor="middle" fill="#000" stroke="#000" stroke-width="781"><text x="132" y="22500">HELLO</text></g></svg>'
  );
});

test("buildBigTextSvg measures in the weight/italic it renders, clamped to a floor of BIG_WEIGHT", () => {
  // The null-DOM harness otherwise can't observe measurement at all (the canvas
  // proxy discards c.font) — __fontLog (see _harness.mjs) records every `.font =`
  // assignment, so this can compare what was MEASURED against what was RENDERED
  // instead of trusting that the code reads right.
  const before = C.__fontLog.length;
  const svg = C.buildBigTextSvg("HELLO", 1, { font: "georgia", weight: 900, italic: true });
  const measured = C.__fontLog.slice(before);
  assert.deepEqual(measured, ["italic 900 100px Georgia"],
    "measured weight/italic/family must equal what <g> renders (900, italic, Georgia)");
  assert.match(svg, /<g [^>]*font-weight="900"/);
  assert.match(svg, /<g [^>]*font-style="italic"/);
  assert.match(svg, /<g [^>]*font-family="Georgia"/);

  // A weight BELOW the floor is a deliberate exception, not a bug: the <g> always
  // fake-bolds via stroke-width regardless of the nominal weight, so the rendered ink
  // is wider than a literal low-weight measurement predicts. Measuring at the clamped
  // floor errs long (safe — see runLength's own principle) instead of erring short
  // (which clips the widest line against SVG's overflow:hidden, off both ends, since
  // text-anchor is "middle"). The <g> itself renders NO font-weight attribute for 400
  // (fmtAttrs treats it as the default), so measured and rendered deliberately diverge
  // here — that divergence is the fix, not a regression.
  const before2 = C.__fontLog.length;
  const svg2 = C.buildBigTextSvg("HELLO", 1, { weight: 400 });
  const measured2 = C.__fontLog.slice(before2);
  assert.deepEqual(measured2, ["800 100px Arial,sans-serif"], "weight 400 still measures at the BIG_WEIGHT floor");
  assert.ok(!/font-weight=/.test(svg2), "fmtAttrs omits font-weight for 400 — the default");
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
  const html = bodies[0].html;
  assert.equal(
    html,
    '<div style="position:relative;width:263px;height:41px;margin:0 auto">'
      + '<span style="position:absolute;top:50%;left:50%;width:41px;height:263px;'
      + 'white-space:nowrap;text-align:center;\\66ont:800 342px/263px Arial,sans-serif;'
      + '-webkit-transform:translate(-50%,-50%) rotate(90deg)">HELLO</span></div>'
  );
  // The real constraint, encoded directly: a literal "font" substring re-trips the
  // automod filter this whole `\66ont:` escape exists to dodge.
  assert.ok(html.indexOf("font") < 0, "no literal 'font' substring anywhere in the payload");
});

test("rotateBodies is byte-identical for an explicitly-empty fmt, and honours an explicit weight that happens to be 400", () => {
  // Guards the contract stated on bigWeightFor: an untouched block passing `{}` (no
  // `weight` key at all) must still fall back to BIG_WEIGHT (800) — the same as no fmt
  // — while a block that explicitly SET weight to 400 gets exactly 400, not the
  // fallback. Task 6 wiring these two cases up backwards (materializing a stored 400
  // for a block nobody touched) would silently drop every existing sideways block from
  // 800 to 400 — lighter print, different metrics — with nothing else here to catch it.
  const bare = C.rotateBodies("HELLO", 1, 1400, 90, {});
  assert.equal(bare[0].html, C.rotateBodies("HELLO", 1, 1400, 90)[0].html, "{} must match no-fmt exactly");

  const explicit400 = C.rotateBodies("HELLO", 1, 1400, 90, { font: "", weight: 400 });
  const html = explicit400[0].html;
  assert.equal(
    html,
    '<div style="position:relative;width:263px;height:41px;margin:0 auto">'
      + '<span style="position:absolute;top:50%;left:50%;width:41px;height:263px;'
      + 'white-space:nowrap;text-align:center;\\66ont:400 342px/263px Arial,sans-serif;'
      + '-webkit-transform:translate(-50%,-50%) rotate(90deg)">HELLO</span></div>'
  );
  assert.ok(html.indexOf("font") < 0, "no literal 'font' substring anywhere in the payload");
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
  assert.ok(html.indexOf("font") < 0, "no literal 'font' substring anywhere in the payload");
});
