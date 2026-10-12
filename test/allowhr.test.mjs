// Printer Bot 3.0 can switch High Roller prints off for one printer ("Allow High Roller prints", on by
// default): that printer prints every cheer as plain text, however many bits. 1.2.0 models it as one of
// the streamer's settings (allowHighRoller in rw_controls_v1, on unless saved as false).
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";

const C = loadCore();
const ON = { cheer: true, bits: 100, hrThreshold: 25, bitsPerInch: 0, maxInches: 0 };

test("normalizeControls: Allow High Roller prints is on unless saved as false", () => {
  assert.equal(C.normalizeControls({}).allowHighRoller, true);
  assert.equal(C.normalizeControls({ allowHighRoller: false }).allowHighRoller, false);
  for (const v of [true, "false", 0, null, "no"]) assert.equal(C.normalizeControls({ allowHighRoller: v }).allowHighRoller, true, JSON.stringify(v));
});

test("printMode: a printer that doesn't allow High Roller prints every cheer plain; a free test still builds the High Roller form", () => {
  assert.equal(C.printMode(ON), "raw");
  assert.equal(C.printMode({ ...ON, allowHighRoller: true }), "raw");
  assert.equal(C.printMode({ ...ON, allowHighRoller: false }), "plain");
  assert.equal(C.buildMode({ ...ON, cheer: false, allowHighRoller: false }), "raw");
});

test("bitsRaiseFor: no raise when the printer doesn't allow High Roller prints", () => {
  assert.equal(C.bitsRaiseFor({ ...ON, bits: 10, allowHighRoller: false }), null);
});

test("modeNotice names the switch, and the free test says what a real cheer would print", () => {
  assert.match(C.modeNotice({ ...ON, allowHighRoller: false }),
    /^The streamer's printer has Allow High Roller prints off \(a Printer Bot 3\.0 setting\), so the bot prints every cheer as plain text\. Every block prints in its plain form: big and sideways text as Han tiling, pictures as a grid of Han characters\. Han text as typed prints at any cheer\. Big text, sideways text and glyph-art in the characters you picked need that setting on\.$/);
  assert.match(C.modeNotice({ ...ON, cheer: false, allowHighRoller: false }),
    /The streamer's printer has Allow High Roller prints off, so a real cheer prints in its plain form instead \(big and sideways text as Han tiling\): this tests the High Roller form, which needs that setting on\.$/);
});

test("the High Roller test: no test with the switch off; otherwise its note names the switch as a cause", () => {
  const off = C.buildHighRollerProbe({ ...ON, allowHighRoller: false });
  assert.equal(off.works, false);
  assert.match(off.note, /^The streamer's printer has Allow High Roller prints off, so this prints as plain text, tags and all\./);
  assert.match(C.buildHighRollerProbe(ON).note,
    /If it all prints small inside quote marks, the threshold is higher than 25, or \(on Printer Bot 3\.0\) the streamer's printer has Allow High Roller prints off\./);
});

test("the Plain test with the switch off: every cheer prints plain, so it is one bit", () => {
  const p = C.buildPlainProbe({ ...ON, allowHighRoller: false });
  assert.equal(p.bits, 1);
  assert.equal(p.mode, "plain");
  assert.match(p.note, /^One 1-bit cheer\. The streamer's printer has Allow High Roller prints off, so every cheer prints plain/);
});

test("previewEvent: with the switch off a part is drawn the way that printer prints it", () => {
  // The preview's page is 3.0's (1.3.0), which reads the switch itself, so the call is the one a
  // 3.0 printer with the switch off gets: the streamer's real threshold and allowHighRoller false.
  // (1.2.0 drew it on 2.5.4's page, which has no switch, as threshold 0: the same plain receipt.)
  const off = C.previewEvent({ payload: "x", bits: 100, cheer: true, hrThreshold: 25, allowHighRoller: false }).options;
  assert.equal(off.highRollerBits, 25);
  assert.equal(off.allowHighRoller, false);
  assert.equal(off.pxPerInch, 96);
  // Exactly as 3.0's action (ProcessEvent: HighRoller = !CouldBeHighRoller || the printer's switch):
  // a cheer that can't be High Roller, below the threshold or with threshold 0, is sent true
  // whatever the switch says (the page reads it only for a High Roller cheer: the same receipt).
  assert.equal(C.previewEvent({ payload: "x", bits: 24, cheer: true, hrThreshold: 25, allowHighRoller: false }).options.allowHighRoller, true);
  assert.equal(C.previewEvent({ payload: "x", bits: 100, cheer: true, hrThreshold: 0, allowHighRoller: false }).options.allowHighRoller, true);
  assert.equal(C.previewEvent({ payload: "x", bits: 25, cheer: true, hrThreshold: 25, allowHighRoller: false }).options.allowHighRoller, false);
  // A free test is drawn as the High Roller cheer whose markup it tests, switch or not.
  const free = C.previewEvent({ payload: "x", bits: 100, cheer: false, hrThreshold: 25, allowHighRoller: false }).options;
  assert.equal(free.highRollerBits, 1);
  assert.equal(free.allowHighRoller, true);
});
