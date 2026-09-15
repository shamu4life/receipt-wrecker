import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
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
// The attribute names on the first occurrence of a given tag.
function attrsOf(html, tag) {
  const m = html.match(new RegExp("<" + tag + "\\b([^>]*)>", "i"));
  if (!m) return [];
  return [...m[1].matchAll(/([a-zA-Z][\w-]*)=/g)].map((a) => a[1].toLowerCase());
}
// Does a blob survive the allow-list intact — every tag kept, every attr kept, every
// <img> carrying an emote/bits class?
function survivesWhole(html) {
  for (const t of tagsIn(html)) if (!ALLOWED_TAGS.has(t)) return false;
  for (const t of new Set(tagsIn(html))) {
    for (const a of attrsOf(html, t)) if (!ALLOWED_ATTRS.has(a)) return false;
  }
  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
    const cls = (m[1].match(/class="([^"]*)"/) || [])[1] || "";
    if (!cls.split(/\s+/).some((c) => IMG_CLASSES.has(c))) return false;
  }
  return true;
}

const BOX = { url: "https://i.uwutoowo.com/a1b2c3d4e5f6.png", w: 240, h: 180, mm: 64 };

test("the default picture carrier is sanitizer-legal (img + emote/bits class, nothing stripped)", () => {
  const html = C.buildImageEmbed(C.EMBED_DEFAULT, BOX);
  assert.deepEqual(tagsIn(html), ["img"], "default should emit a single <img>: " + html);
  for (const a of attrsOf(html, "img")) assert.ok(ALLOWED_ATTRS.has(a), "default emits stripped attr '" + a + "': " + html);
  assert.ok(survivesWhole(html), "default carrier does not survive the sanitizer: " + html);
});

test("both live carriers survive; every blocked carrier is known-dead because it does not", () => {
  for (const e of C.EMBEDS) {
    const html = C.buildImageEmbed(e.id, BOX);
    if (e.blocked) {
      assert.ok(!survivesWhole(html), e.id + " is flagged blocked but its markup survives the sanitizer: " + html);
    } else {
      assert.ok(survivesWhole(html), e.id + " is live but does NOT survive the sanitizer: " + html);
    }
  }
});

test("a CJK/Hanzi glyph grid is pure text — nothing for the sanitizer to strip", () => {
  // The backbone's survival property: render() of a tone-tier grid is one string with
  // no markup at all, so the allow-list is a no-op on it. (Hanzi tiling ships exactly
  // this; the CJK picture path adds only <br> row breaks, which are on the allow-list.)
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

test("the SVG modes are correctly known-dead — they emit tags the sanitizer strips", () => {
  // Regression guard: if someone re-promotes Big Text's SVG "Type" or the Takeover as
  // a printing path, this fails. They emit <svg>/<text>/<rect>, none on the allow-list,
  // so the sanitizer unwraps them to bare text (or nothing) — they do not print.
  const big = C.buildBigTextSvg("HELLO", 1, {});
  assert.ok(tagsIn(big).includes("svg"), "buildBigTextSvg should still emit <svg>: " + big);
  assert.ok(!survivesWhole(big), "the SVG big-text path must be known-dead under the sanitizer");

  const tk = C.buildTakeover({ items: [{ kind: "text", text: "TAX LIEN", size: 24 }], pullPt: 240, w: 263 });
  assert.ok(tagsIn(tk).includes("svg") && tagsIn(tk).includes("rect"),
    "buildTakeover should still emit <svg>/<rect>: " + tk);
  assert.ok(!survivesWhole(tk), "the takeover overlay must be known-dead under the sanitizer");
});
