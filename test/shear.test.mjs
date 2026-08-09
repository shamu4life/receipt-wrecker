import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";

const C = loadCore();

// Real canvas metrics, captured from headless Chrome on the machine that renders these
// receipts — the same measurement buildBigTextSvg makes in the streamer's browser.
// Impact ships NO italic face, so "italic" is a SYNTHESISED oblique: the outline is
// skewed and the ADVANCE IS UNCHANGED (84.326 both ways) while the ink's right edge
// moves 80.176 -> 99.939. Georgia does ship one, so its italic advance is honest.
// Verified against the real print engine (wkhtmltopdf 0.12.6 / WebKit 534.34) at
// 203dpi: fitting "HI"/Impact/italic on the advance put ink at user x 314.2 inside a
// 263px-wide SVG — 51px of the "I" never printed. Fitting on the ink puts it at 254.6,
// which matched the same glyphs rendered into a deliberately oversized viewport to the
// pixel, i.e. nothing was cut.
const IMPACT_UPRIGHT = { width: 84.326171875, actualBoundingBoxLeft: -4.1015625, actualBoundingBoxRight: 80.17578125 };
const IMPACT_OBLIQUE = { width: 84.326171875, actualBoundingBoxLeft: -4.1015625, actualBoundingBoxRight: 99.93896484375 };
const GEORGIA_ITALIC = { width: 573.2421875, actualBoundingBoxLeft: -7.12890625, actualBoundingBoxRight: 572.119140625 };

// The print engine synthesises its OWN oblique and shears harder than the browser that
// measured: on wkhtmltopdf 0.12.6 at 203dpi the printed ink half-extent for Impact
// italic came out 3.9% past what Chrome's canvas reported, at both sizes tried (the
// model below then predicted the printed edge to within 0.25 user px both before and
// after the fix). Model it here or the pad that covers it is untestable — and a pad
// nothing can fail is a pad someone deletes.
const ENGINE_SHEAR_DRIFT = 1.039;

// Where the widest ink lands, in SVG user units, for a line drawn at font-size S.
// text-anchor is "middle", which centres the ADVANCE box on cx — so ink offsets are
// taken from that centre, not from the text origin — and the fake-bold stroke is
// centred on the outline, spending another sw/2 on each side.
function inkEdges(m, S, drift) {
  const cx = Math.round(C.PAPER_PX / 2);
  const half = m.width / 2;
  const sw = Math.max(1, Math.round(S / 32)) / 2;
  const d = drift || 1;
  return {
    left: cx - (half + m.actualBoundingBoxLeft) * d * S / 100 - sw,
    right: cx + (m.actualBoundingBoxRight - half) * d * S / 100 + sw,
  };
}
const sizeFor = (basis) => Math.max(8, Math.round(C.BIG_FIT_PX * 100 / basis));

test("bigFitBasis fits a synthesised oblique on the ink it lays down, not on its advance", () => {
  // The defect, stated as arithmetic: the advance is identical upright vs oblique, so a
  // fit that reads `.width` cannot see the shear at all.
  assert.equal(IMPACT_OBLIQUE.width, IMPACT_UPRIGHT.width,
    "premise: a synthesised oblique does not move the advance — if this ever fails the whole fix is mis-aimed");

  const sAdvance = sizeFor(IMPACT_OBLIQUE.width);
  assert.ok(inkEdges(IMPACT_OBLIQUE, sAdvance).right > C.PAPER_PX + 30,
    "the pre-fix advance fit is what clipped: ink lands ~40px past the viewport, and SVG has no overflow");

  const sInk = sizeFor(C.bigFitBasis(IMPACT_OBLIQUE, true));
  const e = inkEdges(IMPACT_OBLIQUE, sInk, ENGINE_SHEAR_DRIFT);
  assert.ok(e.right <= C.PAPER_PX, "ink must end inside the viewport, stroke and engine drift included; got " + e.right);
  assert.ok(e.left >= 0, "and start inside it — text-anchor is middle, so both ends are at risk; got " + e.left);
  assert.ok(sInk < sAdvance, "fitting on ink can only ever shrink the line, never grow it");
});

test("bigFitBasis leaves every measurement it has no evidence against exactly alone", () => {
  // The gate. Non-italic is the advance verbatim — this is what keeps unformatted Big
  // Text byte-identical (see the full-string pin in render.test.mjs), and it holds even
  // when handed metrics whose ink overhangs, because upright overhang is not the
  // measured defect and erring long there would shrink type nobody asked to change.
  assert.equal(C.bigFitBasis(IMPACT_UPRIGHT, false), IMPACT_UPRIGHT.width);
  assert.equal(C.bigFitBasis(IMPACT_OBLIQUE, false), IMPACT_OBLIQUE.width,
    "the gate is italic: no italic, no change, whatever the ink says");
  // A REAL italic face reports an honest advance, so there is nothing to correct — and
  // no engine-vs-browser shear drift to pad against either.
  assert.equal(C.bigFitBasis(GEORGIA_ITALIC, true), GEORGIA_ITALIC.width,
    "a font with a true italic must not be shrunk");
  // No canvas (this harness by default) / an engine that reports no ink bounds: fall
  // back to the advance, exactly as runLength does, rather than to NaN.
  assert.equal(C.bigFitBasis({ width: 84.326171875 }, true), 84.326171875,
    "absent bounding box falls back to the advance");
  assert.equal(C.bigFitBasis({ width: 84.326171875, actualBoundingBoxLeft: NaN, actualBoundingBoxRight: NaN }, true),
    84.326171875, "non-finite bounding box falls back to the advance");
});

test("buildBigTextSvg keeps italic ink inside the paper end-to-end, and upright output untouched", () => {
  // The helper being right proves nothing if the fit never calls it. This drives the
  // real buildBigTextSvg against a canvas that returns the captured metrics, so the
  // font-size actually emitted is the thing under test.
  const key = (f, t) => f + " " + t;
  const M = loadCore({
    [key("italic 800 100px Impact", "HI")]: IMPACT_OBLIQUE,
    [key("800 100px Impact", "HI")]: IMPACT_UPRIGHT,
  });
  const sizeOf = (svg) => Number(svg.match(/font-size="(\d+)"/)[1]);

  const italic = sizeOf(M.buildBigTextSvg("HI", 1, { font: "impact", italic: true }));
  const upright = sizeOf(M.buildBigTextSvg("HI", 1, { font: "impact" }));

  assert.equal(upright, sizeFor(IMPACT_UPRIGHT.width),
    "upright still fits on the advance — an unformatted/upright block must not move");
  assert.ok(inkEdges(IMPACT_OBLIQUE, italic, ENGINE_SHEAR_DRIFT).right <= C.PAPER_PX,
    "the emitted font-size must keep the sheared ink inside the " + C.PAPER_PX + "px viewport; got "
      + inkEdges(IMPACT_OBLIQUE, italic, ENGINE_SHEAR_DRIFT).right + " at font-size " + italic);
  assert.ok(italic < upright, "the same word in the same font must get SMALLER when it is sheared, not equal");
});
