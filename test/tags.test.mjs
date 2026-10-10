// AMENDMENT B1 (field, 2026-10-10): this channel's chat filter still blocks the old picture
// tags, and the app never routes around a filter. So no payload from any 1.0.0 builder, for
// any mode, paper or input, may contain <img, <object, <image, <embed, <iframe, <svg or
// <input in any letter case, and the tags it does send are exactly the ones the app uses:
// div, pre and br. A user who TYPES one of those tags gets it escaped, as text.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, scanTags } from "./_harness.mjs";
const C = loadCore();

const USED = ["div", "pre", "br"];
const FORBIDDEN = /<\s*\/?\s*(img|object|image|embed|iframe|svg|input)/i;
const TEXTS = ["HELLO", "Happy birthday 🎉", '<img src="https://static-cdn.jtvnw.net/x.png"> <IMG SRC=x> <ImAgE> <svg/onload=1>',
  "<object data=x></object> <embed src=x> <iframe src=x> <input type=image src=x>", "A\nB\n\nC", "HI, BOB; QUIZ"];

function everyPayload(mm) {
  const out = [];
  for (const k of [C.stackContext({ cheer: true, bits: 100, noNonce: true, paperMm: mm }),
                   C.stackContext({ cheer: true, bits: 100, bitsPerInch: 25, paperMm: mm }),
                   C.stackContext({ cheer: false, paperMm: mm })]) {
    const o = { budget: k.budget, heightPx: k.room, contentW: k.contentW };
    const add = (what, bodies) => {
      bodies.forEach((b) => out.push([what + " body", b.html]));
      C.packStackBodies(bodies, k).forEach((p) => out.push([what + " payload", p.payload]));
    };
    for (const t of TEXTS) {
      for (const layout of ["auto", "lines", "stack", "each"]) {
        for (const flip of [false, true]) add("big " + layout + (flip ? " flipped" : ""), C.buildBigBodies(t, { ...o, layout, flip }));
      }
      for (const dir of ["down", "up"]) add("side " + dir, C.buildSideBodies(t, { ...o, dir }));
    }
    const cjk = C.getTier("cjk").ramp;
    const grid = (cols, rows, ramp) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ramp[(r * 7 + c * 3) % ramp.length]));
    for (const tier of ["cjk", "ascii", "asciifull", "safe", "braille"]) {
      const ramp = tier === "braille" ? ["\u2800", "⠁", "⣿"] : tier === "cjk" ? cjk : C.getTier(tier).ramp.concat(["<", ">", "&"]);
      add("glyph " + tier, C.buildGlyphBodies(tier, grid(tier === "cjk" ? 16 : 24, 30, ramp), { paperMm: mm, budget: k.budget, heightPx: k.room }));
    }
    const cols = C.hanziCols(k.contentW);
    add("plain Han tiling", C.buildDesignT(grid(cols, 40, cjk), { mode: k.mode, paperMm: mm, cheer: k.cheer, bits: k.bits, limitPx: k.limit.px }));
    add("plain picture", C.buildDesignTPicture(grid(cols - 2, 20, cjk), { mode: "plain", paperMm: mm, cheer: true, bits: 10, limitPx: 1600 }));
  }
  for (const t of [0, 1, 25]) {
    for (const probe of [C.buildHighRollerProbe({ hrThreshold: t, paperMm: mm }), C.buildPlainProbe({ hrThreshold: t, paperMm: mm })]) {
      probe.bodies.forEach((b) => out.push(["probe body", b.html]));
      C.packStackBodies(probe.bodies, { cheer: true, bits: probe.bits }).forEach((p) => out.push(["probe payload", p.payload]));
    }
  }
  return out;
}

test("B1: every builder and both probes, 80 and 58 mm: only div, pre and br; never a picture tag in any case", () => {
  const seen = new Set();
  let n = 0;
  for (const mm of [80, 58]) {
    for (const [what, html] of everyPayload(mm)) {
      n++;
      assert.ok(!FORBIDDEN.test(html), mm + " mm " + what + ": " + html.slice(0, 200));
      for (const t of scanTags(html)) {
        assert.ok(USED.includes(t.tag), mm + " mm " + what + " sends <" + t.tag + ">: " + html.slice(0, 200));
        seen.add(t.tag);
        // The only attribute any of them carries is style; nothing else, no event handlers.
        for (const a of t.attrs) assert.equal(a.name, "style", mm + " mm " + what + ": " + a.name);
      }
      // A message never starts with "<" (a body may: it always follows a lead or a grid).
      if (what.endsWith("payload")) assert.ok(!html.startsWith("<"), mm + " mm " + what + " starts with '<'");
    }
  }
  assert.deepEqual([...seen].sort(), [...USED].sort(), "the list of tags the app uses is exactly what it sends");
  assert.ok(n > 1000, n + " payloads checked");
});

test("B1: a typed picture tag arrives as text, escaped, in every text builder", () => {
  const t = '<img src="x"> <SVG> <iframe>';
  for (const b of C.buildBigBodies(t, { layout: "lines" }).concat(C.buildSideBodies(t, {}))) {
    assert.ok(b.html.includes("&lt;img") && b.html.includes("&lt;SVG&gt;"), b.html);
  }
});
