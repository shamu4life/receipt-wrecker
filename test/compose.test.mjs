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
