import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

const isBMPSingle = (g) => [...g].length === 1 && g.codePointAt(0) <= 0xFFFF;

test("TIERS: expected ids present with valid shape", () => {
  const byId = Object.fromEntries(C.TIERS.map(t => [t.id, t]));
  for (const id of ["safe", "cjk", "braille", "text"]) assert.ok(byId[id], "missing tier " + id);
  assert.equal(byId.safe.kind, "tone");
  assert.equal(byId.text.kind, "binary");
  assert.equal(byId.braille.kind, "braille");
});

test("TIERS: tone ramps are light→dark arrays of single BMP glyphs, no space, no emoji", () => {
  for (const t of C.TIERS.filter(x => x.kind === "tone")) {
    assert.ok(Array.isArray(t.ramp) && t.ramp.length >= 2);
    for (const g of t.ramp) {
      assert.ok(isBMPSingle(g), "non-single/astral glyph in " + t.id + ": " + JSON.stringify(g));
      assert.notEqual(g, " ");
    }
  }
});

test("TIERS: binary tier uses non-space single glyphs and a distinct off", () => {
  const t = C.getTier("text");
  assert.ok(isBMPSingle(t.on) && isBMPSingle(t.off));
  assert.notEqual(t.off, " ");
  assert.notEqual(t.on, t.off);
});

test("getTier throws on unknown id", () => {
  assert.throws(() => C.getTier("nope"));
});
