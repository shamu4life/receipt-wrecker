import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";

const C = loadCore();

// Real canvas metrics, captured from headless Chrome on the machine that renders these
// receipts — the same measurement buildBigTextSvg makes in the streamer's browser, at
// the weight it measures with (800). Two separate ways the ADVANCE fails to bound the
// INK, both of which shear glyphs off the print because the SVG viewport clips:
//
//   1. A SYNTHESISED oblique. Impact ships NO italic face, so the browser skews the
//      outline and leaves the ADVANCE UNCHANGED (84.326 both ways) while the ink's
//      right edge moves 80.176 -> 99.939.
//   2. An UPRIGHT face whose glyph simply overhangs its own advance box — a swash or a
//      descender. Script "L" advances 64.01 and inks from -4.52 to 66.26.
//
// Verified against the real print engine (wkhtmltopdf 0.12.6 / WebKit 534.34) at
// 203dpi: fitting "HI"/Impact/italic on the advance put ink at user x 314.2 inside a
// 263px-wide SVG — 51px of the "I" never printed. Fitting on the ink puts it at 254.6,
// which matched the same glyphs rendered into a deliberately oversized viewport to the
// pixel, i.e. nothing was cut. Same probe on UPRIGHT "L"/Script, which an italic-gated
// fit left alone: emitted font-size 391, ink to user x 318.3 in the oversized viewport
// against 263.5 (the viewport edge) in the real one — 55px of the letter amputated.
//
// A full sweep of the app's 9 fonts x 10 strings x upright/italic is what settled the
// gate question: fitting on the advance clips in 64 of those 180 cases, of which SIX
// are upright (Script "L"/"Wj"/"gyp", Fantasy "L"/"gyp", Comic Sans "L"); fitting on
// the ink clips in 0.
const IMPACT_UPRIGHT = { width: 84.326171875, actualBoundingBoxLeft: -4.1015625, actualBoundingBoxRight: 80.17578125 };
const IMPACT_OBLIQUE = { width: 84.326171875, actualBoundingBoxLeft: -4.1015625, actualBoundingBoxRight: 99.93896484375 };
// Upright, no italic anywhere in it, and its ink still overhangs on BOTH sides: the
// left half-extent (32.01 + 4.52) is the binding one. This is the case the first cut of
// the fix could not see, because it only looked when `italic` was set.
//
// CAPTURED WHEN THE SCRIPT SLOT WAS THE BARE `cursive` GENERIC, and left as it is on
// purpose. The slot names `Segoe Script,cursive` now (a bare generic resolves to
// whatever the STREAMER'S machine says, which turned out to be Comic Sans MS on the real
// rig — see FONTS), so these numbers are a capture of whatever this machine's cursive
// was. That does not weaken the fixture: what it is here to be is a REAL upright face
// whose ink overhangs its own advance box, which is a property of the numbers, not of
// the family they were taken from. The key below states the family only so the app's own
// canvas lookup finds them.
const SCRIPT_L_UPRIGHT = { width: 64.013671875, actualBoundingBoxLeft: 4.5230865478515625, actualBoundingBoxRight: 66.259765625 };
// Georgia DOES ship a real italic face — and that is not by itself evidence that its
// advance bounds its ink. On "WRECKED" it does (573.24 advance, 571.00 of ink); on "HI"
// it does not (136.38 against 149.07). Both fixtures are here because the difference
// between them is the whole rule: it is the measurement that decides, not the style.
const GEORGIA_ITALIC_WRECKED = { width: 573.2421875, actualBoundingBoxLeft: -7.12890625, actualBoundingBoxRight: 572.119140625 };
const GEORGIA_ITALIC_HI = { width: 136.376953125, actualBoundingBoxLeft: 2.685546875, actualBoundingBoxRight: 142.724609375 };

// The print engine synthesises its OWN oblique and shears harder than the browser that
// measured: on wkhtmltopdf 0.12.6 at 203dpi the printed ink half-extent for Impact
// italic came out 3.9% past what Chrome's canvas reported, at both sizes tried (the
// model below then predicted the printed edge to within 0.25 user px both before and
// after the fix). Model it here or the pad that covers it is untestable — and a pad
// nothing can fail is a pad someone deletes.
// Known limit, recorded next to BIG_INK_PAD too: applying this same drift across the
// whole font x string sweep leaves the two tightest italic cases (Arial italic "gyp",
// Georgia italic "Wj") at 263.4 and 264.2 against the 263px box. ~1px, invisible on a
// 1-bit head, but the pad has no headroom there — it was derived from Impact alone.
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

  const sInk = sizeFor(C.bigFitBasis(IMPACT_OBLIQUE));
  const e = inkEdges(IMPACT_OBLIQUE, sInk, ENGINE_SHEAR_DRIFT);
  assert.ok(e.right <= C.PAPER_PX, "ink must end inside the viewport, stroke and engine drift included; got " + e.right);
  assert.ok(e.left >= 0, "and start inside it — text-anchor is middle, so both ends are at risk; got " + e.left);
  assert.ok(sInk < sAdvance, "fitting on ink can only ever shrink the line, never grow it");
});

test("bigFitBasis fits an UPRIGHT overhanging face on its ink too — the fit is not gated on italic", () => {
  // No italic anywhere in this case. The first cut of this fix only consulted ink when
  // `italic` was set, which left this shearing on the paper: swept across the app's
  // nine fonts, six upright cases clipped, and the engine amputated 55px of this one.
  const sAdvance = sizeFor(SCRIPT_L_UPRIGHT.width);
  const bad = inkEdges(SCRIPT_L_UPRIGHT, sAdvance);
  assert.ok(bad.left < 0 || bad.right > C.PAPER_PX,
    "premise: fitting this upright glyph on its advance puts ink outside the " + C.PAPER_PX
      + "px viewport (left " + bad.left + ", right " + bad.right + ")");

  const sInk = sizeFor(C.bigFitBasis(SCRIPT_L_UPRIGHT));
  const e = inkEdges(SCRIPT_L_UPRIGHT, sInk);
  assert.ok(e.left >= 0 && e.right <= C.PAPER_PX,
    "an upright overhang must be fitted on its ink like a sheared one; got left " + e.left + ", right " + e.right);
  assert.ok(sInk < sAdvance, "and that can only shrink it");
});

test("bigFitBasis leaves every measurement whose advance already bounds its ink exactly alone", () => {
  // The gate is the MEASUREMENT, not the style: ink inside the advance box returns the
  // advance verbatim. This is what keeps unformatted Big Text byte-identical (see the
  // full-string pin in render.test.mjs) — every upright case that does not overflow is
  // this case, which is why removing the italic gate cost nothing there.
  assert.equal(C.bigFitBasis(IMPACT_UPRIGHT), IMPACT_UPRIGHT.width);
  assert.equal(C.bigFitBasis(GEORGIA_ITALIC_WRECKED), GEORGIA_ITALIC_WRECKED.width,
    "a real italic face whose advance IS honest keeps its size — 573.24 advance vs 571.00 of ink");
  // No canvas (this harness by default) / an engine that reports no ink bounds: fall
  // back to the advance, exactly as runLength does, rather than to NaN.
  assert.equal(C.bigFitBasis({ width: 84.326171875 }), 84.326171875,
    "absent bounding box falls back to the advance");
  assert.equal(C.bigFitBasis({ width: 84.326171875, actualBoundingBoxLeft: NaN, actualBoundingBoxRight: NaN }),
    84.326171875, "non-finite bounding box falls back to the advance");
});

test("a REAL italic face is measured like any other, and pays the pad when its ink overhangs", () => {
  // Deliberate, and stated here so nobody "fixes" it back: `ink <= adv` does not exempt
  // a font that ships a true italic. Georgia does ship one, and on 6 of the 10 strings
  // swept its ink still exceeds its advance, so those lines now print smaller than they
  // did — none of them was clipping. The trade is runLength's rule: erring long adds
  // invisible blank tape, erring short shears a letter off, so over-measuring is the
  // direction to be wrong in. What is NOT acceptable is claiming it doesn't happen.
  const basis = C.bigFitBasis(GEORGIA_ITALIC_HI);
  assert.ok(basis > GEORGIA_ITALIC_HI.width,
    "a true italic face is not exempt — 136.38 advance against 149.07 of ink is still an overhang");
  const before = sizeFor(GEORGIA_ITALIC_HI.width), after = sizeFor(basis);
  // 183/155 before PAPER_PX went 263 -> 240 and BIG_FIT_PX 250 -> 228; both are the old
  // figure times 228/250. The ratio is what this test is about and it is unchanged.
  assert.equal(before, 167);
  assert.equal(after, 142, "the measured cost of the pad here: ~15% smaller type, and it is the price of the rule");
  assert.ok(inkEdges(GEORGIA_ITALIC_HI, after).right <= C.PAPER_PX,
    "and it does buy something — the padded fit keeps this inside the viewport");
});

test("buildBigTextSvg keeps ink inside the paper end-to-end, italic AND upright, with unformatted output untouched", () => {
  // The helper being right proves nothing if the fit never calls it. This drives the
  // real buildBigTextSvg against a canvas that returns the captured metrics, so the
  // font-size actually emitted is the thing under test.
  const key = (f, t) => f + " " + t;
  const M = loadCore({
    [key("italic 800 100px Impact", "HI")]: IMPACT_OBLIQUE,
    [key("800 100px Impact", "HI")]: IMPACT_UPRIGHT,
    [key("800 100px Segoe Script,cursive", "L")]: SCRIPT_L_UPRIGHT,
  });
  const sizeOf = (svg) => Number(svg.match(/font-size="(\d+)"/)[1]);

  const italic = sizeOf(M.buildBigTextSvg("HI", 1, { font: "impact", italic: true }));
  const upright = sizeOf(M.buildBigTextSvg("HI", 1, { font: "impact" }));

  assert.equal(upright, sizeFor(IMPACT_UPRIGHT.width),
    "an unformatted/upright block whose advance bounds its ink must not move");
  assert.ok(inkEdges(IMPACT_OBLIQUE, italic, ENGINE_SHEAR_DRIFT).right <= C.PAPER_PX,
    "the emitted font-size must keep the sheared ink inside the " + C.PAPER_PX + "px viewport; got "
      + inkEdges(IMPACT_OBLIQUE, italic, ENGINE_SHEAR_DRIFT).right + " at font-size " + italic);
  assert.ok(italic < upright, "the same word in the same font must get SMALLER when it is sheared, not equal");

  // The upright overhang, all the way through the real builder: this emitted 391 before
  // and inked 55px off the paper on the engine.
  const script = sizeOf(M.buildBigTextSvg("L", 1, { font: "script" }));
  assert.ok(script < sizeFor(SCRIPT_L_UPRIGHT.width),
    "upright Script \"L\" must be fitted on its ink; still emitting the advance size " + script);
  const e = inkEdges(SCRIPT_L_UPRIGHT, script);
  assert.ok(e.left >= 0 && e.right <= C.PAPER_PX,
    "and the emitted size must land the whole glyph inside the viewport; got left " + e.left + ", right " + e.right);
});
