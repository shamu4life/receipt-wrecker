import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
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
  eq(ids, ["", "black", "impact", "comic", "georgia", "serif", "mono", "script", "fantasy"]);
  assert.equal(C.FONTS[0].css, "", "the default emits no font-family at all");
  for (const f of C.FONTS.slice(1)) assert.ok(f.css && f.label, "every entry needs a css value and a label");
});

test("NO entry is a bare CSS generic that duplicates a named one", () => {
  // FIELD-CONFIRMED: `cursive` and `fantasy` shipped as Script and Fantasy, and the
  // owner printed them — Script came out as COMIC SANS MS and Fantasy came out as
  // IMPACT, the standard Windows mappings, both already in the list. A generic resolves
  // on the streamer's machine, which is not something this repo can measure, so a
  // decorative slot must NAME a face and keep the generic behind it as a fallback.
  // macOS maps the same two generics elsewhere, which is exactly why no local render
  // could catch this and why it is pinned here instead.
  assert.equal(C.getFont("script").css, "Segoe Script,cursive");
  assert.equal(C.getFont("fantasy").css, "Papyrus,fantasy");
  assert.equal(C.getFont("fantasy").label, "Papyrus", "label the face it actually asks for");
  for (const f of C.FONTS) {
    assert.ok(!/^(cursive|fantasy)$/.test(f.css),
      f.label + " is a bare decorative generic — name the face, keep the generic behind it");
    // A list must end in a generic, so the entry can never be worse than the bare one.
    if (f.css.includes(",")) {
      assert.match(f.css, /,(serif|sans-serif|monospace|cursive|fantasy)$/,
        f.label + " has no generic fallback behind its named face");
    }
  }
  // And the two survivors are deliberate: Windows maps them to faces nothing else here
  // duplicates. If either ever gains a named twin in this table, it has to go too.
  eq(C.FONTS.filter((f) => /^(serif|monospace)$/.test(f.css)).map((f) => f.id),
     ["serif", "mono"]);
});

test("an unknown font id falls back to the default rather than emitting junk", () => {
  // "papyrus" is NOT the id of the Papyrus entry — that is still `fantasy`, because ids
  // are what saved blocks reference and relabelling a slot must not move one.
  assert.equal(C.fmtAttrs({ font: "papyrus" }), "");
  assert.equal(C.getFont("nope").id, "");
});
