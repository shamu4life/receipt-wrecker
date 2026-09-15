// The paper is the one number every visual mode is scaled against, and it was wrong.
//
// Measured on the real engine (wkhtmltopdf 0.12.6 patched-qt, --paper 80) with an SVG
// that draws its own left, centre and right markers: at width 263 the right marker is
// GONE and the centre lands 22 dots (2.8mm) right of the page centre, because an SVG
// too wide for the body is pinned left instead of centred. At 240 all three markers
// print and the centre lands on 287 against a page centre of 288.
//
// There is no clamp available to avoid the constant. All three adaptive forms were
// tried on the engine and all three fail: `max-width:100%` is ignored on an SVG,
// `max-width` plus `height:auto` collapses it to nothing, and a `viewBox` (with or
// without a percentage width) collapses it too. QtWebKit 534.34 honours an explicit
// pixel width and nothing else, so the width has to be right rather than clamped.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

// page = roll - 8mm, body = page - printer-bot's two 1em margins, in CSS px at 96dpi.
const ROLL_MM = 80;
const PAGE_MM = ROLL_MM - 8;
const EM_MM = 16 / (96 / 25.4);
const BODY_PX = Math.round((PAGE_MM - 2 * EM_MM) * (96 / 25.4));

test("PAPER_PX fits the body printer-bot really gives us, not the bare paper", () => {
  assert.equal(BODY_PX, 240, "premise: the derivation still lands on the measured 240");
  assert.ok(C.PAPER_PX <= BODY_PX,
    "PAPER_PX " + C.PAPER_PX + " exceeds the " + BODY_PX
    + "px body; the engine clips the overhang and pins the SVG left of centre");
});

test("a full-width Big Text SVG asks for a width the engine will actually draw", () => {
  const svg = C.buildBigTextSvg("WWWWWW", 1);
  const w = /^<svg width="(\d+)"/.exec(svg);
  assert.ok(w, "expected a literal pixel width on the svg; got " + svg.slice(0, 60));
  assert.ok(Number(w[1]) <= BODY_PX,
    "emitted svg width " + w[1] + " exceeds the " + BODY_PX + "px body");
});

test("the fit target keeps a clipping margin inside the paper", () => {
  assert.ok(C.BIG_FIT_PX < C.PAPER_PX,
    "BIG_FIT_PX " + C.BIG_FIT_PX + " must stay inside PAPER_PX " + C.PAPER_PX
    + ": SVG has no overflow, so anything past the viewport is simply not printed");
});
