// Picking a High Roller-only control below the streamer's threshold raises Bits per cheer to
// the threshold (1.1.0), unless that can't help or would be a jump worth asking about first.
// bitsRaiseFor decides; the glue does the writing, the note and the Undo.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const BELOW = { cheer: true, bits: 10, hrThreshold: 25, bitsPerInch: 0, maxInches: 0 };

test("bitsRaiseFor: a cheer below the threshold is raised to exactly the threshold", () => {
  eq(C.bitsRaiseFor(BELOW), { action: "raise", from: 10, to: 25 });
  eq(C.bitsRaiseFor({ ...BELOW, bits: 24 }), { action: "raise", from: 24, to: 25 });
  eq(C.bitsRaiseFor({ ...BELOW, bits: 100, hrThreshold: 300 }), { action: "raise", from: 100, to: 300 });
});

test("bitsRaiseFor: settings read from the form as strings count as numbers", () => {
  eq(C.bitsRaiseFor({ cheer: true, bits: "10", hrThreshold: "25", bitsPerInch: "0", maxInches: "0" }),
     { action: "raise", from: 10, to: 25 });
});

test("bitsRaiseFor: nothing to do when no amount changes what is built", () => {
  // Cheer-ready off is a free test: it already builds the High Roller form at any bits.
  assert.equal(C.bitsRaiseFor({ ...BELOW, cheer: false }), null);
  // High Roller off: no amount of bits makes a High Roller cheer.
  assert.equal(C.bitsRaiseFor({ ...BELOW, hrThreshold: 0 }), null);
  // Already a High Roller cheer.
  assert.equal(C.bitsRaiseFor({ ...BELOW, bits: 25 }), null);
  assert.equal(C.bitsRaiseFor({ ...BELOW, bits: 100 }), null);
});

test("bitsRaiseFor: a jump past 4x the amount asks first; exactly 4x raises", () => {
  eq(C.bitsRaiseFor({ ...BELOW, bits: 10, hrThreshold: 40 }), { action: "raise", from: 10, to: 40 });
  eq(C.bitsRaiseFor({ ...BELOW, bits: 10, hrThreshold: 41 }), { action: "ask", from: 10, to: 41 });
  eq(C.bitsRaiseFor({ ...BELOW, bits: 5 }), { action: "ask", from: 5, to: 25 });
  eq(C.bitsRaiseFor({ ...BELOW, bits: 1 }), { action: "ask", from: 1, to: 25 });
});

test("bitsRaiseFor: a threshold over 500 bits asks first; exactly 500 raises", () => {
  eq(C.bitsRaiseFor({ ...BELOW, bits: 200, hrThreshold: 500 }), { action: "raise", from: 200, to: 500 });
  eq(C.bitsRaiseFor({ ...BELOW, bits: 200, hrThreshold: 501 }), { action: "ask", from: 200, to: 501 });
});

test("bitsRaiseFor: after an Undo or a hand-lowered amount (noAuto) it only asks", () => {
  eq(C.bitsRaiseFor({ ...BELOW, noAuto: true }), { action: "ask", from: 10, to: 25 });
  assert.equal(C.bitsRaiseFor({ ...BELOW, bits: 25, noAuto: true }), null);
});

test("bitsRaiseFor: no raise when the streamer's length settings leave no room after the Cheer line at the threshold", () => {
  // 25 bits at 200 bits per inch: floor(25 / 200 x 96) = 12 px, under the 21.6 px Cheer line.
  eq(C.bitsRaiseFor({ ...BELOW, bitsPerInch: 200 }), { action: "noRoom", from: 10, to: 25, by: "bits" });
  // A maximum length of 0.2 inches: 19 px, at any amount.
  eq(C.bitsRaiseFor({ ...BELOW, maxInches: 0.2 }), { action: "noRoom", from: 10, to: 25, by: "cap" });
  // No room wins over asking: raising can't help, so there is nothing to offer.
  eq(C.bitsRaiseFor({ ...BELOW, bits: 1, bitsPerInch: 200 }), { action: "noRoom", from: 1, to: 25, by: "bits" });
  eq(C.bitsRaiseFor({ ...BELOW, noAuto: true, bitsPerInch: 200 }), { action: "noRoom", from: 10, to: 25, by: "bits" });
  // Nothing to say at all when no amount changes what is built, whatever the box.
  assert.equal(C.bitsRaiseFor({ ...BELOW, cheer: false, bitsPerInch: 200 }), null);
  assert.equal(C.bitsRaiseFor({ ...BELOW, bits: 25, bitsPerInch: 200 }), null);
  assert.equal(C.bitsRaiseFor({ ...BELOW, bits: 100, maxInches: 0.2 }), null);
});

test("bitsRaiseFor: a length setting that leaves room at the threshold still raises", () => {
  // 25 bits at 100 bits per inch: 24 px, more than the Cheer line.
  eq(C.bitsRaiseFor({ ...BELOW, bitsPerInch: 100 }), { action: "raise", from: 10, to: 25 });
  // A maximum length of 0.25 inches: 24 px.
  eq(C.bitsRaiseFor({ ...BELOW, maxInches: 0.25 }), { action: "raise", from: 10, to: 25 });
});

test("partsTally: cheers and bits for the copyable parts, cheer words in the text added in", () => {
  eq(C.partsTally([]), { cheers: 0, bits: 0 });
  eq(C.partsTally([{ bits: 25 }, { bits: 25 }]), { cheers: 2, bits: 50 });
  // A standalone Cheer50 in the text is a cheer of its own to Twitch (partsCostWords adds it the same way).
  eq(C.partsTally([{ bits: 25, extra: { sure: ["Cheer50"], maybe: [], bits: 50 } }, { bits: 25 }]), { cheers: 2, bits: 100 });
  // A maybe-cheer word is only a hedge: it is not added.
  eq(C.partsTally([{ bits: 10, extra: { sure: [], maybe: ["Kappa50"], bits: 0 } }]), { cheers: 1, bits: 10 });
  eq(C.partsTally([{ bits: "10" }]), { cheers: 1, bits: 10 });
});

test("raiseNote: the raise says from, to, for what, and the stack's cost now and before", () => {
  assert.equal(C.raiseNote({ action: "raise", from: 10, to: 25 }, "Big text", { cheers: 3, bits: 30 }, { cheers: 1, bits: 25 }),
    "Bits per cheer raised from 10 to 25 for Big text: 1 cheer, 25 bits (was 3 plain cheers, 30 bits).");
  assert.equal(C.raiseNote({ action: "raise", from: 1, to: 4 }, "the characters you picked", { cheers: 1, bits: 1 }, { cheers: 2, bits: 8 }),
    "Bits per cheer raised from 1 to 4 for the characters you picked: 2 cheers, 8 bits (was 1 plain cheer, 1 bit).");
  // Nothing printable yet (an empty block): no cost to report.
  assert.equal(C.raiseNote({ action: "raise", from: 10, to: 25 }, "Sideways text", { cheers: 0, bits: 0 }, { cheers: 0, bits: 0 }),
    "Bits per cheer raised from 10 to 25 for Sideways text.");
  assert.equal(C.raiseNote({ action: "raise", from: 10, to: 25 }, "Big text", null, { cheers: 1, bits: 25 }),
    "Bits per cheer raised from 10 to 25 for Big text: 1 cheer, 25 bits.");
});

test("raiseNote: asking first names the threshold and what the stack prints meanwhile", () => {
  assert.equal(C.raiseNote({ action: "ask", from: 10, to: 41 }, "Big text"),
    "For Big text a cheer needs 41 bits or more (the streamer's High Roller threshold). At 10 bits the stack prints in its plain form.");
});

test("raiseNote: no room says which of the streamer's settings is in the way", () => {
  assert.equal(C.raiseNote({ action: "noRoom", from: 10, to: 25, by: "bits" }, "Big text"),
    "Bits per cheer stays at 10: at 25 bits the streamer's bits per inch leaves no room after the Cheer line, so the stack prints in its plain form.");
  assert.equal(C.raiseNote({ action: "noRoom", from: 10, to: 25, by: "cap" }, "Big text"),
    "Bits per cheer stays at 10: the streamer's maximum length leaves no room after the Cheer line at any amount, so the stack prints in its plain form.");
});
