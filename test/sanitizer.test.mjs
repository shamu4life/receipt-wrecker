import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, scanTags } from "./_harness.mjs";
const C = loadCore();

// THE SANITIZER CONTRACT (printer-bot, confirmed live 2026-09-15).
// printer-bot now runs the chat message through an allow-list DOMParser walk before
// rendering: it keeps only these tags and attributes, deletes an <img> without an
// emote/bits class, and UNWRAPS everything else (tag gone, text kept). This file
// pins the app's output to that contract — what must survive it, and (as a guard
// against re-promotion) what is known-dead because it doesn't.
//
// Scope note: these assertions check the markup THIS TOOL emits, which is simple and
// fully under our control — they do not re-implement a general HTML sanitizer, and a
// real print on the rig is still the only proof a surviving payload actually prints.
const ALLOWED_TAGS = new Set(["img", "span", "b", "i", "br", "em", "strong"]);
const ALLOWED_ATTRS = new Set(["src", "class"]);
const IMG_CLASSES = new Set(["emote", "bits"]);

// Every tag name that appears in a blob (opening tags only; our output never nests
// unusually, so a token scan is faithful here).
const tagsIn = (html) => [...html.matchAll(/<([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase());
// Does a blob survive the allow-list intact — every tag kept, every attr (on every
// occurrence) kept, every <img> carrying an emote/bits class?
function survivesWhole(html) {
  for (const t of scanTags(html)) {
    if (!ALLOWED_TAGS.has(t.tag)) return false;
    if (t.closing) continue;
    for (const a of t.attrs) if (!ALLOWED_ATTRS.has(a.name)) return false;
    if (t.tag === "img") {
      const cls = (t.attrs.find((a) => a.name === "class") || {}).value || "";
      if (!cls.split(/\s+/).some((c) => IMG_CLASSES.has(c))) return false;
    }
  }
  return true;
}

test("a CJK/Hanzi glyph grid is pure text — nothing for the sanitizer to strip", () => {
  // The markup-free survival property: render() of a tone-tier grid is one string with
  // no markup at all, so the allow-list is a no-op on it. (Hanzi tiling ships exactly
  // this; the CJK picture path adds only <br> row breaks, which are on the allow-list.)
  // Hanzi is no longer the only text path that prints (Giant type, below, borrows
  // printer-bot's own classes), but it is still the one that needs no class at all,
  // which is why it is the fallback if nutty ever changes global.css.
  const ramp = C.getTier("cjk").ramp;
  const grid = [ramp.slice(0, 4), ramp.slice(4, 8), ramp.slice(8, 12)];
  const out = C.render(grid);
  assert.equal(out.indexOf("<"), -1, "a glyph grid must contain no '<': " + out);
  assert.equal(out.indexOf(">"), -1, "a glyph grid must contain no '>': " + out);
  assert.equal(out.indexOf("&"), -1, "a glyph grid must contain no '&': " + out);
  assert.ok(survivesWhole(out), "a pure-text glyph grid must survive untouched");
  // And <br> (the row separator the CJK picture path uses) is on the allow-list.
  assert.ok(survivesWhole("丶丿二<br>三十土"), "<br>-separated Han rows must survive");
});

test("the SVG Big Text mode is correctly known-dead — it emits tags the sanitizer strips", () => {
  // Regression guard: if someone re-promotes Big Text's SVG "Type" as a printing path,
  // this fails. It emits <svg>/<text>, neither on the allow-list, so the sanitizer
  // unwraps it to bare text — it does not print.
  const big = C.buildBigTextSvg("HELLO", 1, {});
  assert.ok(tagsIn(big).includes("svg"), "buildBigTextSvg should still emit <svg>: " + big);
  assert.ok(!survivesWhole(big), "the SVG big-text path must be known-dead under the sanitizer");
});

test("the attribute scan reads EVERY occurrence and splits bare names the way a parser does", () => {
  // Both blind spots of the old first-occurrence `name=` scan, pinned so a "simpler"
  // scanner can't quietly come back. Each of these blobs is something giant type could
  // plausibly emit by mistake, and each loses its effect at printer-bot's sanitizer.
  //  - a stray attribute on the SECOND level of a nest (level 1 is clean);
  assert.ok(!survivesWhole("<b class=title>A<b class=title style=\"x\">B</b></b>"),
    "a style= on level 2 of a .title nest must be seen");
  //  - an unquoted multi-class value: a parser reads class="title" plus a boolean
  //    attribute named setting-description, which the sanitizer strips.
  assert.ok(!survivesWhole("<b class=title setting-description>A</b>"),
    "the unquoted multi-class value must read as a stripped boolean attribute");
  assert.ok(survivesWhole("<b class=\"title setting-description\">A</b>"),
    "the quoted form is one class attribute and survives");
});

test("Giant type survives the allow-list whole: b/br, class only", () => {
  // Giant type works ONLY because the sanitizer keeps `class` and printer-bot's printed
  // page carries nutty's global.css (see PB_CLASSES). So the whole feature lives or dies
  // on this scan: a tag outside b/br, or any attribute but class, and the size silently
  // falls off on paper. Checked on the CONCATENATED payload the packer emits, every size
  // class and every layout, repeat digits on and off, plus the ruler.
  const texts = ["HELLO", "PENIS", "A&B <i>x</i> \"Q\"", "HAPPY\nBIRTHDAY\nCHAT", "Kappa KEKW\nPogChamp"];
  const blobs = [C.buildGiantRuler().html];
  for (const text of texts) {
    for (const layout of ["auto", "lines", "stack", "emote"]) {
      for (const size of ["fit1", "width", 1, 9, 18]) {
        for (const noNonce of [false, true]) {
          const opts = { cheer: true, bits: 100, noNonce };
          const bodies = C.buildGiantBodies(text, {
            layout, size, budget: C.MAX_CHARS - C.leadLength(opts) });
          for (const p of C.packStackBodies(bodies, opts)) blobs.push(p.payload);
        }
      }
    }
  }
  // Both shrink wrappers really appear, or this proves nothing about them.
  const all = blobs.join("");
  for (const e of C.PB_CLASSES.filter((x) => x.role === "shrink")) {
    assert.ok(all.includes("class=" + e.cls), "no payload exercised the " + e.cls + " wrapper");
  }
  for (const html of blobs) {
    assert.ok(survivesWhole(html), "giant payload loses markup at the sanitizer: " + html);
    for (const t of scanTags(html)) {
      assert.ok(["b", "br"].includes(t.tag), "giant type emitted <" + t.tag + ">: " + html);
      for (const a of t.attrs) assert.equal(a.name, "class", "giant type emitted a " + a.name + " attribute: " + html);
    }
  }
});
