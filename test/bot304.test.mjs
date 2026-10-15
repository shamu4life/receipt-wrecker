// 1.8.0: Printer Bot 3.0.4 takes the cheermotes out of a cheer's message before it prints it
// (cheerWords), so the app's own Cheer word prints nothing. A High Roller part's lead has no line
// of its own unless the repeat number is on, a box can only be "full" when the repeat number's
// line fills it, and a plain part ends in a tail that gives the closing quote mark its line.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCore } from "./_harness.mjs";

const C = loadCore();
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || "") + ": " + a + " vs " + b);

test("printedMessage is the renderer's cheerWords: a cheermote word of its own goes, anything else stays", () => {
  assert.equal(C.printedMessage("Cheer100 <div>HI</div>"), " <div>HI</div>");
  assert.equal(C.printedMessage("Cheer100 07 <div>HI</div>"), " 07 <div>HI</div>", "the repeat number stays");
  assert.equal(C.printedMessage("丶丶丶 Cheer24"), "丶丶丶 ", "a plain part keeps the space before its token");
  assert.equal(C.printedMessage("丶丶 丶 Cheer24 07"), "丶丶 丶  07");
  assert.equal(C.printedMessage("CHEER5 hi"), " hi", "in any capitals");
  assert.equal(C.printedMessage("Kappa50 Cheer100 hi"), "  hi", "two side by side");
  assert.equal(C.printedMessage("Cheer100"), "", "a message of cheermotes alone is no message");
  assert.equal(C.printedMessage(C.LEAD_GUARD + "<div>HI</div>"), C.LEAD_GUARD + "<div>HI</div>", "LEAD_GUARD stays");
  for (const kept of ["<div>Cheer100</div>", "Cheer", "Cheer100x", "Win10", "xCheer100", "Cheer1234567890", "hi Cheer100<div>"]) {
    assert.equal(C.printedMessage(kept), kept, kept);
  }
});

test("BOT_CHEERMOTES is the vendored renderer's own CHEERMOTE_NAMES", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const m = /const CHEERMOTE_NAMES = \[([^\]]*)\]/.exec(html);
  assert.ok(m, "the vendored renderer names its cheermotes");
  assert.deepEqual([...C.BOT_CHEERMOTES], Array.from(m[1].matchAll(/'([^']+)'/g), (x) => x[1]));
  assert.ok(/said\.replace\(CHEERMOTE_WORD, '\$1'\)/.test(html), "and takes them out as printedMessage does");
});

test("the lead's line: none for a cheer since 3.0.4, one with the repeat number or in a free test", () => {
  assert.equal(C.leadLinePx({ cheer: true, noNonce: true }), 0);
  assert.equal(C.leadLinePx({ cheer: true, noNonce: false }), C.LEAD_LINE_PX);
  assert.equal(C.leadLinePx({ cheer: true, nonce: false }), 0, "the settings panel's field");
  assert.equal(C.leadLinePx({ cheer: true, nonce: true }), C.LEAD_LINE_PX);
  assert.equal(C.leadLinePx({ cheer: true }), C.LEAD_LINE_PX, "unsaid, the repeat number is on, as the packer has it");
  assert.equal(C.leadLinePx({ cheer: false, noNonce: true }), C.LEAD_LINE_PX, "a free test's LEAD_GUARD prints a line");
  const k = C.stackContext({ cheer: true, bits: 100, hrThreshold: 25, noNonce: true });
  eq3(k.leadPx, k.room, k.limit.leadPx, [0, 1600, 0]);
  const n = C.stackContext({ cheer: true, bits: 100, hrThreshold: 25, noNonce: false });
  eq3(n.leadPx, n.room, n.limit.leadPx, [21.6, 1600 - 21.6, 21.6]);
  const f = C.stackContext({ cheer: false, bits: 100, hrThreshold: 25, noNonce: true });
  assert.equal(f.leadPx, 21.6, "a free test");
  // The parts: as tall as their bodies, with the lead's line only where it prints.
  const body = { html: "<div>A</div>", chars: 12, heightPx: 100 };
  const [p] = C.packStackBodies([body], k), [q] = C.packStackBodies([body], n);
  eq3(p.leadPx, p.contentPx, p.heightPx, [0, 100, 100]);
  assert.equal(q.leadPx, 21.6); near(q.contentPx, 121.6);
  assert.equal(C.printedMessage(p.payload), " <div>A</div>", "3.0.4 prints the body alone");
  function eq3(a, b, c, want) { assert.deepEqual([a, b, c], want); }
});

test("no room is the repeat number's line filling the box: without it every box has room", () => {
  const s = { cheer: true, bits: 25, hrThreshold: 25, bitsPerInch: 200 };   // a 12 px box
  assert.equal(C.contentLimitPx(s).px, 12);
  assert.equal(C.boxNoRoom(C.contentLimitPx({ ...s, nonce: true })), true);
  assert.equal(C.boxNoRoom(C.contentLimitPx({ ...s, nonce: false })), false);
  assert.equal(C.boxNoRoom({ px: 12, by: "bits", fades: true }), true, "a box made by hand keeps the old line");
  assert.match(C.modeNotice({ ...s, nonce: true }), /the repeat number's line fills it.*Turn off “Add a repeat number”/);
  assert.equal(C.modeNotice({ ...s, nonce: false }), "");
  assert.equal(C.bitsRaiseFor({ ...s, bits: 10, nonce: true }).action, "noRoom");
  assert.notEqual(C.bitsRaiseFor({ ...s, bits: 10, nonce: false }).action, "noRoom");
  assert.equal(C.limitLeadPx(C.contentLimitPx({ ...s, nonce: false })), 0);
  assert.equal(C.limitLeadPx(undefined), C.LEAD_LINE_PX);
});

test("a plain Design T part ends in the tail, which gives the closing quote mark a line of its own", () => {
  assert.equal(C.DESIGN_T_TAIL, " 丶");
  for (const mm of [80, 58]) {
    const cols = C.hanziCols(C.paperSpec(mm).contentW), rows = Array.from({ length: 3 }, () => Array(cols).fill("鬱"));
    const [b] = C.buildDesignT(rows, { mode: "plain", paperMm: mm, cheer: true, bits: 24, noNonce: true });
    assert.ok(b.html.endsWith(C.DESIGN_T_TAIL), mm + " mm");
    near(b.heightPx, (1 + 3 + 1) * 21.6, mm + " mm: header, rows and the tail's line");
    const [raw] = C.buildDesignT(rows, { mode: "raw", paperMm: mm, cheer: true, bits: 100, noNonce: true });
    assert.ok(!raw.html.endsWith(C.DESIGN_T_TAIL), "no quote mark in a High Roller part, so no tail");
    near(raw.heightPx, (1 + 3) * 21.6, mm + " mm: and since 3.0.4 no token line");
    const [digits] = C.buildDesignT(rows, { mode: "raw", paperMm: mm, cheer: true, bits: 100, noNonce: false });
    near(digits.heightPx, (1 + 3 + 1) * 21.6, mm + " mm: the repeat number's digits print a line");
  }
});
