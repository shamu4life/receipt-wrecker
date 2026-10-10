import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

test("makeNonce is a short visible token that changes across sends", () => {
  const a = C.makeNonce(0), b = C.makeNonce(1);
  assert.notEqual(a, b);
  assert.ok([...a].length >= 1 && [...a].length <= 3);
  for (const bad of [" ", "​", "⁠", "<", ">", "&"]) assert.ok(!a.includes(bad));
});
