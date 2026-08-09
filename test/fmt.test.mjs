import test from "node:test";
import assert from "node:assert";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

test("a default fmt emits nothing — every attribute costs payload", () => {
  assert.equal(C.fmtAttrs(), "");
  assert.equal(C.fmtAttrs({}), "");
  assert.equal(C.fmtAttrs({ font: "", weight: 400, italic: false }), "");
});

test("each option emits its own attribute, in a stable order", () => {
  assert.equal(C.fmtAttrs({ weight: 900 }), ' font-weight="900"');
  assert.equal(C.fmtAttrs({ italic: true }), ' font-style="italic"');
  assert.equal(C.fmtAttrs({ underline: true }), ' text-decoration="underline"');
  assert.equal(C.fmtAttrs({ strike: true }), ' text-decoration="line-through"');
  assert.equal(C.fmtAttrs({ font: "black" }), ' font-family="Arial Black"');
  // order is font, weight, style, decoration — pinned so payload lengths are stable
  assert.equal(C.fmtAttrs({ font: "black", weight: 900, italic: true, underline: true }),
    ' font-family="Arial Black" font-weight="900" font-style="italic" text-decoration="underline"');
});

test("underline and strike together are one attribute", () => {
  assert.equal(C.fmtAttrs({ underline: true, strike: true }),
    ' text-decoration="underline line-through"');
});

test("the font table only offers engine-verified families", () => {
  const ids = C.FONTS.map((f) => f.id);
  assert.deepEqual(ids, ["", "black", "impact", "comic", "georgia", "serif", "mono", "script", "fantasy"]);
  assert.equal(C.FONTS[0].css, "", "the default emits no font-family at all");
  for (const f of C.FONTS.slice(1)) assert.ok(f.css && f.label, "every entry needs a css value and a label");
});

test("an unknown font id falls back to the default rather than emitting junk", () => {
  assert.equal(C.fmtAttrs({ font: "papyrus" }), "");
  assert.equal(C.getFont("nope").id, "");
});

test("a font name is attribute-escaped", () => {
  // ids are ours, but getFont must never let a quote reach the markup
  assert.ok(!/["]/.test(C.fmtAttrs({ font: "comic" }).replace(/^ font-family="|"$/g, "")));
});
