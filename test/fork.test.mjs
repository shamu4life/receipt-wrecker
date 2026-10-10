// SassyTP printer-bot 2.5.4 (1.0.0): the target's geometry, the streamer's settings, the
// High Roller decision, the message-box limit, the lead and the plain parts' trailing token,
// and how the packer carries them. Every number here is a fact read from the bot's receipt
// page (v/2.5.0/renderer.html @ b9f12b0, MIT) or measured through it with tools/forkbench.mjs;
// the page itself is never imported (CI is offline, and nothing of the bot is vendored here).
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
const C = loadCore();

const body = (chars, heightPx, html, extra) =>
  Object.assign({ chars, heightPx, html: html == null ? "x".repeat(chars) : html }, extra || {});

test("paper: the page is 272 / 181 CSS px, the message 28px narrower, the raster 576 / 384 dots", () => {
  assert.deepEqual({ ...C.paperSpec(80) }, { mm: 80, cssWidth: 272, contentW: 244, dots: 576 });
  assert.deepEqual({ ...C.paperSpec(58) }, { mm: 58, cssWidth: 181, contentW: 153, dots: 384 });
  for (const mm of [80, 58]) {
    const p = C.paperSpec(mm);
    assert.equal(p.contentW, p.cssWidth - 28, mm + " mm: the receipt pads 14px each side");
  }
  // Anything that is not 58 is the 80 mm roll, the default; a saved string works too.
  assert.equal(C.paperSpec("58").mm, 58);
  for (const v of [undefined, null, "", "junk", 0, 72, "80"]) assert.equal(C.paperSpec(v).mm, 80, String(v));
});

test("the streamer's settings: threshold 0..1,000,000 (0 = off), bits per inch >= 0, maximum length 0..40", () => {
  assert.equal(C.hrThresholdOf(25), 25);
  assert.equal(C.hrThresholdOf("100"), 100);
  assert.equal(C.hrThresholdOf(0), 0, "0 turns High Roller off and must survive");
  assert.equal(C.hrThresholdOf(12.9), 12);
  assert.equal(C.hrThresholdOf(5e9), C.HR_MAX);
  for (const junk of [undefined, null, "", "junk", NaN, -1]) assert.equal(C.hrThresholdOf(junk), C.HR_DEFAULT, String(junk));
  assert.equal(C.HR_DEFAULT, 25);
  assert.equal(C.bitsPerInchOf(25), 25);
  assert.equal(C.bitsPerInchOf("2.5"), 2.5);
  for (const off of [0, -3, "", "x", undefined]) assert.equal(C.bitsPerInchOf(off), 0, String(off));
  assert.equal(C.maxInchesOf(30), 30);
  assert.equal(C.maxInchesOf(99), 40, "the dock tops out at 40 inches");
  for (const off of [0, -3, "", "x", undefined]) assert.equal(C.maxInchesOf(off), 0, String(off));
});

test("printMode mirrors the bot: High Roller iff the threshold is above 0 and the bits reach it", () => {
  const m = (cheer, bits, hrThreshold) => C.printMode({ cheer, bits, hrThreshold });
  assert.equal(m(true, 100, 25), "raw");
  assert.equal(m(true, 25, 25), "raw", "exactly the threshold is High Roller");
  assert.equal(m(true, 24, 25), "plain", "one bit under prints as plain text");
  assert.equal(m(true, 1, 1), "raw", "a 1-bit cheer is High Roller at threshold 1 (no 100-bit floor)");
  assert.equal(m(true, 1000000, 0), "plain", "threshold 0 = never High Roller, however many bits");
  assert.equal(m(true, 100, undefined), "raw", "absent threshold is the bot's default 25");
  assert.equal(m(false, 100, 25), "plain", "a message with no cheer is not a High Roller cheer");
  // A free test (Cheer-ready off) builds the High Roller form, so it tests that markup.
  assert.equal(C.buildMode({ cheer: false, bits: 1, hrThreshold: 25 }), "raw");
  assert.equal(C.buildMode({ cheer: true, bits: 24, hrThreshold: 25 }), "plain");
  assert.equal(C.buildMode({ cheer: true, bits: 25, hrThreshold: 25 }), "raw");
});

test("contentLimitPx mirrors highRollerMaxHeight and show(): 1600 by default, bits per inch, maximum length", () => {
  const L = (o) => ({ ...C.contentLimitPx(o) });
  assert.deepEqual(L({ bits: 100 }), { px: 1600, by: "ceiling", fades: false }, "no setting: the box, cut hard");
  assert.deepEqual(L({ bits: 100, bitsPerInch: 25 }), { px: 384, by: "bits", fades: true }, "bench c07: 384px, faded");
  assert.deepEqual(L({ bits: 100, bitsPerInch: 10 }), { px: 960, by: "bits", fades: true });
  // Bits per inch alone can only tighten the box: past 1600 the ceiling binds, still faded
  // (the bot gives the box a max-height, so a cut message gets its fade).
  assert.deepEqual(L({ bits: 1000, bitsPerInch: 10 }), { px: 1600, by: "ceiling", fades: true });
  // A maximum length replaces the ceiling, up to 40 in = 3840px.
  assert.deepEqual(L({ bits: 100, maxInches: 30 }), { px: 2880, by: "cap", fades: true });
  assert.deepEqual(L({ bits: 100, maxInches: 40 }), { px: 3840, by: "cap", fades: true });
  assert.deepEqual(L({ bits: 100, maxInches: 50 }), { px: 3840, by: "cap", fades: true });
  assert.deepEqual(L({ bits: 100, maxInches: 2 }), { px: 192, by: "cap", fades: true });
  // Both set: the smaller wins, and the ceiling is gone either way.
  assert.deepEqual(L({ bits: 100, bitsPerInch: 25, maxInches: 30 }), { px: 384, by: "bits", fades: true });
  assert.deepEqual(L({ bits: 5000, bitsPerInch: 1, maxInches: 30 }), { px: 2880, by: "cap", fades: true });
  // floor, then at least 1px.
  assert.deepEqual(L({ bits: 1, bitsPerInch: 1000 }), { px: 1, by: "bits", fades: true });
  assert.equal(C.contentLimitPx({ bits: 7, bitsPerInch: 3 }).px, Math.floor(7 / 3 * 96));
});

test("stackContext: one place for mode, box, room after the lead, character budget and trail", () => {
  const raw = C.stackContext({ cheer: true, bits: 100, hrThreshold: 25, paperMm: 80 });
  assert.equal(raw.mode, "raw");
  assert.equal(raw.contentW, 244);
  assert.equal(raw.limit.px, 1600);
  assert.equal(raw.room, 1600 - 21.6, "the lead's line comes out of every High Roller part");
  assert.equal(raw.budget, 500 - 12, "Cheer100 07 ");
  const bare = C.stackContext({ cheer: true, bits: 100, noNonce: true, bitsPerInch: 25, paperMm: 58 });
  assert.equal(bare.budget, 500 - 9);
  assert.equal(bare.room, 384 - 21.6);
  assert.equal(bare.contentW, 153);
  assert.equal(bare.trail, " Cheer100".length);
  const plain = C.stackContext({ cheer: true, bits: 10, hrThreshold: 25, bitsPerInch: 1 });
  assert.equal(plain.mode, "plain");
  assert.deepEqual({ ...plain.limit }, { px: 1600, by: "ceiling", fades: false },
    "a plain message is never length-limited by bits per inch");
  assert.equal(C.stackContext({ cheer: true, bits: 10, mode: "raw" }).mode, "raw", "probes may force the mode");
});

test("the trailing token: ' Cheer<bits>' plus the repeat digits, nothing when not cheering", () => {
  assert.equal(C.buildTrail({ cheer: true, bits: 25 }, ""), " Cheer25");
  assert.equal(C.buildTrail({ cheer: true, bits: 100 }, "07"), " Cheer100 07");
  assert.equal(C.buildTrail({ cheer: false, bits: 100 }, "07"), "");
  for (const bits of [1, 24, 100, 99999]) {
    assert.equal(C.trailLength({ cheer: true, bits, noNonce: true }), 1 + ("Cheer" + bits).length);
    assert.equal(C.trailLength({ cheer: true, bits }), 4 + ("Cheer" + bits).length);
  }
  assert.equal(C.trailLength({ cheer: false }), 0);
});

test("a plain body rides ALONE: no lead, the token last, never shares a part", () => {
  const grid = "丶".repeat(14 + 15 * 3);
  const plain = body(grid.length, 5 * 21.6, grid, { alone: true });
  const raw = body(60, 100, "<div>A</div>" + "x".repeat(48));
  for (const noNonce of [true, false]) {
    const opts = { cheer: true, bits: 24, noNonce, nonceFn: (i) => C.makeNonce(i + 3) };
    const parts = C.packStackBodies([raw, plain, raw, raw, plain], opts);
    eq(parts.map((p) => !!p.alone), [false, true, false, true], "the two raws in between share; each plain is alone");
    for (const p of parts) {
      assert.ok(p.chars <= C.MAX_CHARS);
      assert.equal(p.chars, C.payloadLength(p.payload));
      if (p.alone) {
        assert.equal(p.lead, "");
        assert.equal(p.payload, grid + p.trail);
        assert.equal(p.trail, C.buildTrail(opts, p.nonce));
        assert.ok(p.payload.endsWith(noNonce ? " Cheer24" : " Cheer24 " + p.nonce), p.payload.slice(-14));
        assert.equal(p.payload[0], "丶", "never starts with '<'");
        assert.equal(p.leadPx, 0);
        assert.equal(p.contentPx, p.heightPx);
        assert.equal(p.heightPx, 5 * 21.6);
      } else {
        assert.equal(p.payload, p.lead + p.bodies.map((b) => b.html).join(""));
        assert.equal(p.trail, "");
      }
    }
    // One nonce per part, in part order, plain or not.
    if (!noNonce) eq(parts.map((p) => p.nonce), [3, 4, 5, 6].map((i) => C.makeNonce(i)));
  }
});

test("empty bodies never become a cheer of their own, around a plain part either", () => {
  const empty = body(0, 0, "");
  const plain = body(20, 64.8, "丶".repeat(20), { alone: true });
  for (const stack of [[empty, plain], [plain, empty], [empty, plain, empty]]) {
    const parts = C.packStackBodies(stack, { cheer: true, bits: 10, noNonce: true });
    assert.equal(parts.length, 1, stack.length + " bodies -> " + parts.map((p) => JSON.stringify(p.payload)).join(" | "));
    assert.equal(parts[0].payload, "丶".repeat(20) + " Cheer10");
  }
});

test("joinPx is charged only when a body follows another in the same part", () => {
  // Each body alone fits the room; together they fit only without the join.
  const room = 300;
  const a = body(20, 140), b = body(20, 140, null, { joinPx: 21.6 });
  const opts = { cheer: true, bits: 100, noNonce: true, heightPx: room };
  assert.equal(C.packStackBodies([a, body(20, 140)], opts).length, 1, "280 <= 300 without a join");
  const split = C.packStackBodies([a, b], opts);
  assert.equal(split.length, 2, "140 + 21.6 + 140 > 300");
  assert.equal(split[1].heightPx, 140, "first in its part, the join costs nothing");
  const joined = C.packStackBodies([a, b], { ...opts, heightPx: 400 });
  assert.equal(joined.length, 1);
  assert.ok(Math.abs(joined[0].heightPx - (140 + 21.6 + 140)) < 1e-9);
  assert.ok(Math.abs(joined[0].contentPx - (21.6 + 140 + 21.6 + 140)) < 1e-9, "the lead's line on top");
  assert.equal(joined[0].leadPx, C.LEAD_LINE_PX);
});

test("the lead helpers live in the pure core and keep their contract (bits from 1 up)", () => {
  assert.equal(C.LEAD_GUARD, "\u00A0");
  assert.equal(C.buildLead({ cheer: true, bits: 1 }, ""), "Cheer1 ");
  assert.equal(C.buildLead({ cheer: true, bits: 25 }, "07"), "Cheer25 07 ");
  assert.equal(C.leadLength({ cheer: true, bits: 25, noNonce: true }), 8);
  assert.equal(C.leadLength({ cheer: false }), 1);
  assert.equal(C.bandReserve(491), 14);
  assert.equal(C.bandReserve(400), 100);
});
