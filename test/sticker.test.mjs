// Printer Bot 3.2.0's sticker printer (a Brother VC-500W): a High Roller cheer prints on tape, the
// message centred in a bordered box; the app models it as a narrow roll capped at 16.5 inches. The
// renderer's own sticker rendering is held by the browser suite; these pin the pure-core model.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const r2 = (x) => Math.round(x * 100) / 100;

test("stickerTapeOf: one of the VC-500W tapes, else 50 mm", () => {
  for (const t of [9, 12, 19, 25, 50]) assert.equal(C.stickerTapeOf(t), t);
  for (const t of [9, 12, 19, 25, 50]) assert.equal(C.stickerTapeOf(String(t)), t);
  for (const junk of [0, 10, 100, "", "x", null, undefined, 50.5]) assert.equal(C.stickerTapeOf(junk), 50, String(junk));
});

test("stickerSpec: the tape's dots and CSS width (round(dots / 320 x 96)), 96 px to the inch, no page", () => {
  const widths = { 9: 34, 12: 45, 19: 72, 25: 94, 50: 189 };
  const dots = { 9: 112, 12: 150, 19: 240, 25: 313, 50: 630 };
  for (const t of [9, 12, 19, 25, 50]) {
    const p = C.stickerSpec(t);
    assert.equal(p.mm, "sticker");
    assert.equal(p.tapeMm, t);
    assert.equal(p.cssWidth, widths[t], t + " mm width");
    assert.equal(p.dots, dots[t], t + " mm dots");
    assert.equal(p.pxPerInch, 96);
    assert.equal(p.pagePx, 0, "a sticker is continuous tape, not a page");
    assert.equal(p.sticker, true);
    assert.ok(p.contentW > 0 && p.contentW < p.cssWidth, "the box's inner width is inside the tape");
  }
  // paperSpec routes "sticker" to the tape the options name (default 50 mm).
  assert.equal(C.paperSpec("sticker", { stickerTape: 25 }).tapeMm, 25);
  assert.equal(C.paperSpec("sticker").tapeMm, 50);
});

test("targetPaper: a cheer of the sticker bits prints on the tape; the highest threshold it meets wins", () => {
  const tp = (o) => C.targetPaper(o);
  assert.equal(tp({ bits: 100, stickerBits: 100 }), "sticker");
  assert.equal(tp({ bits: 99, stickerBits: 100 }), 80, "below the sticker bits: the roll");
  assert.equal(tp({ bits: 100, stickerBits: 100, paperMm: 58 }), "sticker");
  assert.equal(tp({ bits: 100, stickerBits: 0 }), 80, "0 = no sticker printer");
  // Both a Letter and a sticker printer: the most specific rule (highest threshold met) wins.
  assert.equal(tp({ bits: 600, letterBits: 500, stickerBits: 100 }), "letter", "600 meets both; Letter's 500 is higher");
  assert.equal(tp({ bits: 300, letterBits: 500, stickerBits: 100 }), "sticker", "300 meets only the sticker");
  assert.equal(tp({ bits: 1000, letterBits: 100, stickerBits: 500 }), "sticker", "the sticker's 500 is higher here");
  assert.equal(tp({ bits: 500, letterBits: 500, stickerBits: 500 }), "letter", "a tie keeps the earlier (Letter)");
});

test("a sticker cheer is capped at 16.5 inches, and High Roller prints are taken as on", () => {
  assert.equal(C.STICKER_MAX_IN, 16.5);
  const cap = (o) => C.contentLimitPx({ cheer: true, bits: 100, hrThreshold: 25, stickerBits: 100, stickerTape: 50, ...o });
  // No maximum length set: the bot forces 16.5 inches (1584px at 96).
  eq([cap({}).by, r2(cap({}).px)], ["cap", r2(16.5 * 96)]);
  // A shorter maximum length is kept; a longer one is brought down to 16.5.
  assert.equal(r2(cap({ maxInches: 5 }).px), r2(5 * 96));
  assert.equal(r2(cap({ maxInches: 40 }).px), r2(16.5 * 96));
  // A sticker printer prints High Roller cheers (its Allow High Roller prints is taken as on, like Letter).
  assert.equal(C.printMode({ cheer: true, bits: 100, hrThreshold: 25, stickerBits: 100, allowHighRoller: false }), "raw");
});

test("normalizeControls carries the sticker printer's settings", () => {
  const n = C.normalizeControls({ stickerBits: "100", stickerTape: "25" });
  assert.equal(n.stickerBits, 100);
  assert.equal(n.stickerTape, 25);
  const d = C.normalizeControls({});
  assert.equal(d.stickerBits, 0);
  assert.equal(d.stickerTape, 50);
});

test("a High Roller sticker builds for the tape; a plain one builds as an 80 mm roll (3.2.0 stickerfit)", () => {
  // High Roller: centred on the tape at its own size, so the narrow sticker content width.
  const hr = C.stackContext({ cheer: true, bits: 100, hrThreshold: 25, stickerBits: 100, stickerTape: 50, noNonce: true });
  assert.equal(hr.mode, "raw");
  assert.equal(hr.paperMm, "sticker");
  assert.ok(hr.contentW < 200, "the narrow 50 mm tape box, not the 80 mm roll's 244");
  eq(hr.sticker, { tapeMm: 50, profile: "bw" });
  // Plain: the 80 mm roll scaled onto the tape, so built as an 80 mm roll (244 px, 15 Han columns).
  const plain = C.stackContext({ cheer: true, bits: 10, hrThreshold: 25, stickerBits: 10, stickerTape: 50, noNonce: true });
  assert.equal(plain.mode, "plain");
  assert.equal(plain.paperMm, 80, "built as an 80 mm roll");
  assert.equal(plain.contentW, 244);
  assert.equal(C.hanziCols(plain.contentW), 15, "the roll's 15 columns, so the grid wraps in stickerfit's roll box");
  eq(plain.sticker, { tapeMm: 50, profile: "bw" }, "still named a sticker for the notes/preview");
});
