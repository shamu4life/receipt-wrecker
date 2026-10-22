// Rich text (1.10.0): Big text's "each" layout with a style per line — each row the user adds is
// its own styled <div>, at its own size and, on a color printer in its color profile, its own text
// and background color. These pin the pure-core model; the browser suite drives the markup through
// the vendored renderer.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const OPTS = { face: "arial", center: false, color: false, paperMm: 80, budget: 490, heightPx: 1578, contentW: 244 };

test("richPxOf: a whole 20..400 px, else the default", () => {
  assert.equal(C.richPxOf(60), 60);
  assert.equal(C.richPxOf("72"), 72);
  assert.equal(C.richPxOf(12), 20);         // clamped up
  assert.equal(C.richPxOf(9999), 400);      // clamped down
  assert.equal(C.richPxOf("7.9"), 7 < 20 ? 20 : 7);  // parseInt then clamp -> 20
  for (const junk of ["", "x", null, undefined, {}]) assert.equal(C.richPxOf(junk), C.RICH_DEFAULT_PX, JSON.stringify(junk));
});

test("richLineOf / richLinesOf: one row sanitized; an absent list gives one empty row", () => {
  const l = C.richLineOf({ text: "Hi\nthere", px: "48", color: "#AABBCC", bg: "not a color" });
  eq(l, { text: "Hi there", px: 48, color: "#aabbcc", bg: "" });  // newline -> space, bg junk dropped
  eq(C.richLineOf(null), { text: "", px: C.RICH_DEFAULT_PX, color: "", bg: "" });
  assert.equal(C.richLinesOf({}).length, 1);
  assert.equal(C.richLinesOf({ richLines: [] }).length, 1);
  assert.equal(C.richLinesOf({ richLines: [{ text: "a" }, { text: "b" }] }).length, 2);
});

test("richText: the rows as one block, a line a row (for the Han tiling fallback)", () => {
  assert.equal(C.richText({ richLines: [{ text: "one" }, { text: "two\nthree" }] }), "one\ntwo three");
});

test("richHasContent: any row with visible text", () => {
  assert.equal(C.richHasContent({ richLines: [{ text: "  " }, { text: "" }] }), false);
  assert.equal(C.richHasContent({ richLines: [{ text: "  " }, { text: "hi" }] }), true);
  assert.equal(C.richHasContent({}), false);
});

test("buildRichBodies: one styled div a non-empty row, at its own size", () => {
  const b = C.buildRichBodies([{ text: "HELLO", px: 60 }, { text: "", px: 40 }, { text: "world", px: 90 }], OPTS);
  assert.equal(b.length, 2, "the empty row prints nothing");
  assert.match(b[0].html, /^<div style="\\66ont:700 60px\/[.0-9]+ Arial">HELLO<\/div>$/);
  assert.match(b[1].html, /^<div style="\\66ont:700 90px\/[.0-9]+ Arial">world<\/div>$/);
  eq(b[0].rich, { row: 0, px: 60, color: "", bg: "" });
  eq(b[1].rich, { row: 2, px: 90, color: "", bg: "" });
  // Each row carries buildBigBodies' own record too, so the card can read its size and fit.
  assert.ok(b[0].big && b[0].big.px === 60);
});

test("buildRichBodies: on a color printer each row carries its own colors; elsewhere none do", () => {
  const rows = [{ text: "A", px: 60, color: "#c00000", bg: "#fff2a8" }, { text: "B", px: 60, color: "#0050c8" }];
  const on = C.buildRichBodies(rows, { ...OPTS, color: true });
  assert.match(on[0].html, /;color:#c00000;background-color:#fff2a8">A</);
  assert.match(on[1].html, /;color:#0050c8">B</);
  assert.doesNotMatch(on[1].html, /background-color/);
  const off = C.buildRichBodies(rows, { ...OPTS, color: false });
  for (const body of off) assert.doesNotMatch(body.html, /color:/);   // colors wait for a color printer
});

test("buildRichBodies: centred for Letter's Large message", () => {
  const b = C.buildRichBodies([{ text: "A", px: 60 }], { ...OPTS, center: true });
  assert.match(b[0].html, /;text-align:center">A</);
});

test("buildRichBodies: a row too tall for the box is flagged, never silently dropped", () => {
  // One line at 400px is far taller than a 120px box; the body carries tall, like Big text.
  const b = C.buildRichBodies([{ text: "TALL", px: 400 }], { ...OPTS, heightPx: 120 });
  assert.ok(b.length >= 1);
  assert.ok(b.some((x) => x.big && x.big.tall), "a row taller than the box is marked tall");
});

test("richReport: capitals range, cheers, and the too-wide / too-tall warnings", () => {
  const b = C.buildRichBodies([{ text: "HELLO", px: 48 }, { text: "WORLD", px: 96 }], OPTS);
  const note = C.richReport(b, { cheers: 1, bits: 100, limit: { px: 1578, leadPx: 0 }, paperMm: 80 });
  assert.match(note, /Capitals ≈ [.0-9]+–[.0-9]+ cm/);
  assert.match(note, /1 cheer/);
  assert.equal(C.richReport([], {}), "Add a line and type something to print it.");
});

test("printsInColor: a special printer in its color profile; never the roll", () => {
  assert.equal(C.printsInColor({ bits: 200, letterBits: 100, letterProfile: "color" }), true);
  assert.equal(C.printsInColor({ bits: 200, letterBits: 100, letterProfile: "bw" }), false);
  assert.equal(C.printsInColor({ bits: 200, cardBits: 100, cardProfile: "color" }), true);
  assert.equal(C.printsInColor({ bits: 200, stickerBits: 100, stickerProfile: "color" }), true);
  assert.equal(C.printsInColor({ bits: 200, paperMm: 80 }), false);          // the roll never
  assert.equal(C.printsInColor({ bits: 50, letterBits: 100, letterProfile: "color" }), false);  // doesn't reach it
});

test("stackContext.color follows printsInColor, so Rich/Big/Glyph colors print on card and sticker too", () => {
  const card = C.stackContext({ cheer: true, bits: 200, hrThreshold: 25, noNonce: true, cardBits: 100, cardProfile: "color" });
  assert.equal(card.paperMm, "card");
  assert.equal(card.color, true);
  const stk = C.stackContext({ cheer: true, bits: 200, hrThreshold: 25, noNonce: true, stickerBits: 100, stickerProfile: "color" });
  assert.equal(stk.color, true);
  // Black and white: no color flag.
  const bw = C.stackContext({ cheer: true, bits: 200, hrThreshold: 25, noNonce: true, cardBits: 100, cardProfile: "bw" });
  assert.equal(bw.color, false);
  // blockLook carries a block's colors only when the context prints color.
  eq(C.blockLook({ color: "#112233", bg: "#aabbcc" }, card), { center: false, color: "#112233", bg: "#aabbcc" });
  eq(C.blockLook({ color: "#112233", bg: "#aabbcc" }, bw), { center: false, color: "", bg: "" });
});
