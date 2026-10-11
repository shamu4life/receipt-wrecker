// AMENDMENT B1 (field, 2026-10-10): this channel's chat filter blocks the old picture tags,
// `<br` and the literal word "font" (as a wildcard: `font:` and `font-size:` both held). The
// app never routes around a filter EXCEPT at the two owner-chosen exceptions: lines are
// `<div>`s, not `<br>`; and the font property name is written with a CSS unicode escape
// (`\66ont`) so the chat filter's "font" wildcard doesn't match it, while the browser's CSS
// parser resolves it back to `font` with no change to what prints. So no payload from any
// 1.0.0 builder, for any mode, paper or input, may contain <img, <object, <image, <embed,
// <iframe, <svg, <input or <br in any letter case, OR the LITERAL word "font" anywhere. The
// tags it does send are exactly div and pre. A user who TYPES one of the forbidden tokens
// (picture tag, <br>, "font") gets it escaped, as text, or not emitted at all.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, scanTags } from "./_harness.mjs";
const C = loadCore();

// No <br>, by the owner's decision (2026-10-10): this channel's chat filter held the paste
// test that carried one. Every line and row is its own <div>.
const USED = ["div", "pre"];
const FORBIDDEN = /<\s*\/?\s*(img|object|image|embed|iframe|svg|input|br)\b/i;
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
      for (const layout of ["auto", "lines", "wrap", "stack", "each"]) {
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
    // 1.2.0: Han text as typed carries the viewer's own characters, but only Han-width ones, so a
    // typed tag or the word "font" never goes out, in either mode.
    for (const t of TEXTS.concat(["你好，世界！\n「東京」", "font <b>字</b> <br> 한국어 カタカナ"])) {
      for (const mode of ["raw", "plain"]) add("typed " + mode, C.buildHanTyped(t, { mode, paperMm: mm, cheer: k.cheer, bits: k.bits, limitPx: k.limit.px }));
    }
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

test("B1: every builder and both probes, 80 and 58 mm: only div and pre; never a picture tag, a <br>, or the literal word 'font'", () => {
  const seen = new Set();
  let n = 0, hasEscape = 0;
  for (const mm of [80, 58]) {
    for (const [what, html] of everyPayload(mm)) {
      n++;
      assert.ok(!FORBIDDEN.test(html), mm + " mm " + what + ": " + html.slice(0, 200));
      // No literal "font" anywhere (chat filter wildcard). The one place "font" would appear is
      // the CSS property name, which is written \66ont instead.
      assert.ok(!/font/i.test(html), mm + " mm " + what + ": literal 'font' in: " + html.slice(0, 200));
      if (/\\66ont/.test(html)) hasEscape++;
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
  // The escape is actually being used by the builders that style text; otherwise this test
  // could silently pass by all payloads being plain Han tiling.
  assert.ok(hasEscape > 100, "styled payloads carry the \\66ont escape (saw " + hasEscape + ")");
});

test("B1: a typed picture tag arrives as text, escaped, in every text builder", () => {
  // Each builder's bodies together (a long line may be cut into several bodies at a space).
  const t = '<img src="x"> <SVG> <iframe>';
  for (const bodies of [C.buildBigBodies(t, { layout: "lines" }), C.buildSideBodies(t, {})]) {
    const all = bodies.map((b) => b.html).join("");
    assert.ok(all.includes("&lt;img") && all.includes("&lt;SVG&gt;") && all.includes("&lt;iframe&gt;"), all);
    assert.doesNotMatch(all, /<\s*(img|svg|iframe)/i, all);
  }
});

test("the tag scan reads EVERY occurrence and splits bare names the way a parser does", () => {
  // Both blind spots of a first-occurrence `name=` scan, pinned so a "simpler" scanner can't
  // quietly come back and wave through markup the tests above exist to catch.
  //  - an attribute on the SECOND element of a kind (the first one is clean);
  const two = scanTags('<div style="a:1">A</div><div style="a:1" onclick="x">B</div>');
  assert.deepEqual(two.filter((t) => !t.closing).map((t) => t.attrs.map((a) => a.name)), [["style"], ["style", "onclick"]]);
  //  - an unquoted value with a space in it: a parser reads style="a" plus a boolean
  //    attribute named b, which is not what the builder meant to send.
  assert.deepEqual(scanTags("<div style=a b>x</div>")[0].attrs, [
    { name: "style", value: "a", quoted: false }, { name: "b", value: null, quoted: false }]);
  assert.deepEqual(scanTags('<div style="a b">x</div>')[0].attrs, [{ name: "style", value: "a b", quoted: true }]);
});
