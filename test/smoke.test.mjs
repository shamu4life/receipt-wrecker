import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";

test("(smoke) inline script loads and exposes a module.exports object", () => {
  const C = loadCore();
  assert.equal(typeof C, "object");
});
