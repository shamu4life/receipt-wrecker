import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

// Task 1: bits amount -> Cheer<N> token. packageCheer already supports opts.cheerToken;
// pin it so the bits control can rely on it.
test("packageCheer swaps in a custom cheer token (the bit amount)", () => {
  assert.equal(C.packageCheer("X", { cheer: true, cheerToken: "Cheer500", nonce: "07" }), "X Cheer500 07");
  assert.equal(C.packageCheer("X", { cheer: true, cheerToken: "Cheer100", nonce: "07" }), "X Cheer100 07");
});

test("packageCheer with no cheer returns the body unchanged (bits irrelevant)", () => {
  assert.equal(C.packageCheer("X", { cheer: false, cheerToken: "Cheer500" }), "X");
});

// Task 2: packStackBodies — dual char + height budget packing.
const body = (chars, heightPx, html) => ({ chars, heightPx, html: html || "x".repeat(chars) });

test("packs small bodies together, splits when the char budget is exceeded", () => {
  // 3 x 200 chars: 200+200 fit one receipt, the third spills -> 2 receipts.
  const parts = C.packStackBodies([body(200,50), body(200,50), body(200,50)], { bits: 100, cheer: true });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].bodies.length, 2);
  assert.equal(parts[1].bodies.length, 1);
});

test("splits on the physical height budget even when chars are tiny", () => {
  // Two ~900px-tall strips (few chars each) can't share one ~1500px page.
  const parts = C.packStackBodies([body(10,900), body(10,900)], { bits: 100, cheer: true });
  assert.equal(parts.length, 2);
});

test("a single over-budget body still gets its own receipt", () => {
  const parts = C.packStackBodies([body(800,50)], { bits: 100, cheer: true });
  assert.equal(parts.length, 1);
});

test("the cheer token reflects the bit amount", () => {
  const parts = C.packStackBodies([body(5,10)], { bits: 500, cheer: true });
  assert.ok(parts[0].payload.includes("Cheer500"), parts[0].payload);
});

test("each receipt gets one nonce and one leading guard", () => {
  const parts = C.packStackBodies([body(300,50), body(300,50)], { bits: 100, cheer: true });
  assert.equal(parts.length, 2);
  assert.notEqual(parts[0].nonce, parts[1].nonce);           // rotating nonce per receipt
  for (const p of parts) assert.equal(p.payload.charCodeAt(0), 0x00A0); // LEAD_GUARD once, at the front
});
