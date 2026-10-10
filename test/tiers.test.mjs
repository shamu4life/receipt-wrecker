import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
const C = loadCore();

const isBMPSingle = (g) => [...g].length === 1 && g.codePointAt(0) <= 0xFFFF;

test("TIERS: exactly the glyph-art tiers the Image card offers, with valid shape", () => {
  const byId = Object.fromEntries(C.TIERS.map(t => [t.id, t]));
  eq(C.TIERS.map(t => t.id).sort(), [...C.GLYPH_TIERS].sort());
  assert.equal(byId.safe.kind, "tone");
  assert.equal(byId.cjk.kind, "tone");
  assert.equal(byId.braille.kind, "braille");
});

test("TIERS: tone ramps are light→dark single BMP glyphs, HTML-safe, space only as the lightest level", () => {
  // The ASCII ramps print inside a <pre> (R4), so a leading space IS the lightest level and
  // survives; the other ramps carry ink at every level. No <>&: buildMonoGrid escapes each
  // row anyway, but the R1 grid and the plain Han rows put the ramp's glyphs in as they are.
  for (const t of C.TIERS.filter(x => x.kind === "tone")) {
    assert.ok(Array.isArray(t.ramp) && t.ramp.length >= 2);
    t.ramp.forEach((g, i) => {
      assert.ok(isBMPSingle(g), "non-single/astral glyph in " + t.id + ": " + JSON.stringify(g));
      if (g === " ") assert.equal(i, 0, "space allowed only as the lightest level in " + t.id);
      assert.ok(!/[<>&]/.test(g), "HTML-unsafe glyph in " + t.id + ": " + JSON.stringify(g));
    });
  }
});

test("TIERS: both ASCII ramps start from a space (the lightest level)", () => {
  const byId = Object.fromEntries(C.TIERS.map(t => [t.id, t]));
  for (const id of ["ascii", "asciifull"]) {
    assert.ok(byId[id], "missing tier " + id);
    assert.equal(byId[id].ramp[0], " ", id + " should start at space (lightest)");
  }
});

test("getTier throws on unknown id", () => {
  assert.throws(() => C.getTier("nope"));
});
