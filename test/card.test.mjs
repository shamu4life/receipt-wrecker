// Printer Bot 3.2.0's 4 x 6 in card printer: a High Roller cheer prints on ONE card, zoomed to fit
// (cardWords); a non-High-Roller cheer prints the 80 mm roll scaled onto the card (the renderer's
// 'cardfit'). Either way it is one cheer, one card. The app builds a card cheer as an 80 mm roll and
// leaves the fitting to the renderer; the browser suite holds the renderer's own card layout. These
// pin the pure-core model.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();

test("the card paper: 400 CSS px wide, 1680 dots, 71.4 px to the inch, a card of 257 px; built as an 80 mm roll", () => {
  eq(C.paperSpec("card"), { mm: "card", cssWidth: 400, contentW: 244, dots: 1680, pxPerInch: 1680 / 5.6, pagePx: 257, card: true });
});

test("targetPaper: a cheer of the card bits prints on the card; the highest threshold wins", () => {
  const tp = (o) => C.targetPaper(o);
  assert.equal(tp({ bits: 100, cardBits: 100 }), "card");
  assert.equal(tp({ bits: 99, cardBits: 100 }), 80, "below the card bits: the roll");
  assert.equal(tp({ bits: 100, cardBits: 0 }), 80, "0 = no card printer");
  // Three special printers: the most specific (highest threshold met) wins; a tie keeps the earlier.
  assert.equal(tp({ bits: 1000, letterBits: 500, stickerBits: 100, cardBits: 800 }), "card", "card's 800 is highest here");
  assert.equal(tp({ bits: 1000, letterBits: 900, stickerBits: 100, cardBits: 800 }), "letter", "letter's 900 is highest");
  assert.equal(tp({ bits: 300, letterBits: 500, cardBits: 100 }), "card", "only the card's 100 is met");
});

test("a card is one cheer, never split by height (the renderer fits one card)", () => {
  const lim = C.contentLimitPx({ cheer: true, bits: 100, hrThreshold: 25, cardBits: 100 });
  assert.equal(lim.by, "card");
  assert.ok(lim.px > 1e6, "a never-split limit, so height never makes a second card");
  // A tall stack of bodies stays one part on a card (only the 500-char budget can split it).
  const ctx = C.stackContext({ cheer: true, bits: 100, hrThreshold: 25, cardBits: 100, noNonce: true });
  assert.equal(ctx.paperMm, "card");
  const tall = Array.from({ length: 30 }, () => ({ html: "<div>X</div>", chars: 12, heightPx: 200 }));  // 6000px of bodies
  const parts = C.packStackBodies(tall, ctx);
  assert.equal(parts.length, 1, "one card, however tall the content");
  // A card prints High Roller cheers (its Allow High Roller prints is taken as on).
  assert.equal(C.printMode({ cheer: true, bits: 100, hrThreshold: 25, cardBits: 100, allowHighRoller: false }), "raw");
});

test("normalizeControls carries the card printer's settings", () => {
  const n = C.normalizeControls({ cardBits: "250", cardFit: "fill" });
  assert.equal(n.cardBits, 250);
  assert.equal(n.cardFit, "fill");
  const d = C.normalizeControls({});
  assert.equal(d.cardBits, 0);
  assert.equal(d.cardFit, "fit");
});
