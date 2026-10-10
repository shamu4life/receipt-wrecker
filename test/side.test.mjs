// Sideways text for SassyTP's printer-bot (1.0.0): writing-mode turns the layout box, so a
// line becomes a column across the paper and its length is real height in the bot's message
// box. Sizes follow the reviewed sideways design (Arial Bold metrics, edge reach contentW/2 - 6)
// with the reviews' fix: the comma, the semicolon and Q take the 1.15 rule, not the capitals'.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq, scanTags } from "./_harness.mjs";
const C = loadCore();

const J = (x) => JSON.parse(JSON.stringify(x));
const ctx = (o) => C.stackContext(Object.assign({ cheer: true, bits: 100, noNonce: true, hrThreshold: 25 }, o || {}));
const build = (text, o, c) => {
  const k = c || ctx();
  return C.buildSideBodies(text, Object.assign({ budget: k.budget, heightPx: k.room, contentW: k.contentW }, o || {}));
};

test("byte pins: top to bottom and bottom to top, one and two lines, a comma", () => {
  const html = (t, o, c) => build(t, o, c).map((b) => b.html);
  eq(html("HELLO", {}), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 280px/.8 Arial;white-space:nowrap;margin:auto">HELLO</div>']);
  eq(html("HELLO", { dir: "up" }), ['<div style="writing-mode:sideways-lr;font:700 280px/.8 Arial;white-space:nowrap;margin:auto">HELLO</div>']);
  eq(html("HAPPY\nBIRTHDAY", {}), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 150px/.8 Arial;white-space:nowrap;margin:auto">HAPPY<br>BIRTHDAY</div>']);
  eq(html("HI, BOB", {}), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 193px/1.15 Arial;white-space:nowrap;margin:auto">HI, BOB</div>'],
    "the comma's tail would clip at the capitals' 280px");
  eq(html("HELLO", {}, ctx({ paperMm: 58 })), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 175px/.8 Arial;white-space:nowrap;margin:auto">HELLO</div>']);
  const parts = C.packStackBodies(build("HELLO", {}), ctx());
  eq(parts.map((p) => p.payload), ['Cheer100 <div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 280px/.8 Arial;white-space:nowrap;margin:auto">HELLO</div>']);
});

test("the width rule for 1-5 lines, capitals and mixed, 80 and 58 mm", () => {
  eq([1, 2, 3, 4, 5].map((n) => C.sideWidthPx(n, true, 244)), [280, 150, 99, 73, 58]);
  eq([1, 2, 3, 4].map((n) => C.sideWidthPx(n, false, 244)), [193, 98, 66, 49]);
  for (const cw of [244, 153]) {
    const E = cw / 2 - 6;
    for (let n = 1; n <= 5; n++) {
      // The outer column's ink stays inside E from the centre.
      const s1 = C.sideWidthPx(n, true, cw), s2 = C.sideWidthPx(n, false, cw);
      assert.ok(s1 * (0.4 * (n - 1) + 0.3695) <= E + 1e-9, cw + " caps " + n);
      assert.ok(s2 * (0.575 * (n - 1) + 0.6) <= E + 1e-9, cw + " mixed " + n);
    }
  }
  for (const [t, lh] of [["QUIZ", "1.15"], ["YES; NO", "1.15"], ["Hello", "1.15"], ["HELLO!", ".8"], ["GG WP", ".8"]]) {
    assert.equal(C.sideFit(t, {}).lh, lh, t);
  }
});

test("length down the tape is S x the advance sum (+0.5px a glyph), and every part fits the box", () => {
  const f = C.sideFit("HELLO", {});
  assert.ok(Math.abs(f.lengthPx - (280 * 3.389 + 2.5)) < 1e-6, String(f.lengthPx));
  for (const k of [ctx(), ctx({ bitsPerInch: 25 }), ctx({ paperMm: 58, bitsPerInch: 10 }), ctx({ maxInches: 30 })]) {
    for (const t of ["HELLO", "HAPPY BIRTHDAY TO THE BEST STREAMER", "Thank you so much for the raid!",
                     "ONE\nTWO\nTHREE", "SUPERCALIFRAGILISTICEXPIALIDOCIOUS".repeat(3)]) {
      for (const dir of ["down", "up"]) {
        for (const size of ["fit1", "width", 40]) {
          const b = build(t, { dir, size }, k), where = t.slice(0, 14) + " " + dir + " " + size + " room " + k.room;
          for (const x of b) {
            assert.equal(x.chars, C.payloadLength(x.html), where);
            assert.ok(x.chars <= k.budget, where + ": " + x.chars);
            assert.ok(x.heightPx <= k.room + 1e-6, where + ": " + x.heightPx);
          }
          const parts = C.packStackBodies(b, k);
          assert.equal(parts.length, b[0].side.cheers, where + ": the cheer count is the packer's");
          for (const p of parts) {
            assert.ok(p.chars <= C.MAX_CHARS, where);
            assert.ok(p.contentPx <= k.limit.px + 1e-6, where + ": " + p.contentPx);
          }
        }
      }
    }
  }
});

test("splitting never truncates: the columns put back together are the text", () => {
  const k = ctx({ bitsPerInch: 25 });   // a 384px box: long runs split
  const t = "HAPPY BIRTHDAY TO THE BEST STREAMER\nSEE YOU TOMORROW";
  const b = build(t, { size: 50 }, k);
  assert.ok(b.length > 2);
  const cols = (x) => x.html.replace(/^<br>/, "").replace(/^<div[^>]*>|<\/div>$/g, "").split("<br>");
  const lines = [[], []];
  b.forEach((x) => cols(x).forEach((c, i) => { if (c !== "\u00A0") lines[i].push(c); }));
  assert.equal(lines[0].join(" "), "HAPPY BIRTHDAY TO THE BEST STREAMER");
  assert.equal(lines[1].join(" "), "SEE YOU TOMORROW");
  // A body that continues after a word gap opens with <br>, which costs height only after
  // another body in the same part.
  assert.ok(b.slice(1).some((x) => x.html.startsWith("<br><div") && x.joinPx === C.LEAD_LINE_PX));
  // A single word longer than the box is cut between letters, not dropped.
  const w = build("A".repeat(60), { size: 100 }, k);
  assert.equal(w.map((x) => x.html.replace(/<[^>]*>/g, "")).join(""), "A".repeat(60));
});

test("bottom to top: the bodies go out last first", () => {
  const k = ctx({ bitsPerInch: 25 });
  const down = build("ONE TWO THREE FOUR FIVE", { size: 80 }, k), up = build("ONE TWO THREE FOUR FIVE", { dir: "up", size: 80 }, k);
  assert.ok(down.length > 1 && up.length === down.length);
  const text = (x) => x.html.replace(/<[^>]*>/g, "");
  eq(up.map(text), J(down.map(text)).reverse());
  assert.match(C.sideReport(up, { cheers: up.length }), /last first/);
});

test("fit1 is the biggest of the least bad sizes, found by trying every size, and sizes are clamped", () => {
  // The cheer count is not monotonic in the size for sideways text (where the word and letter
  // cuts land moves it up and down), so a binary search could settle on a size that costs a
  // cheer more than a smaller one (round 3). fit1 tries every size; check it against the
  // fixed sizes one by one, including the two cases the review found.
  const rank = (f) => (f.over ? 2e6 : 0) + (f.tall ? 1e6 : 0) + f.cheers;
  const cases = [];
  for (const k of [ctx(), ctx({ bitsPerInch: 25 }), ctx({ paperMm: 58 })]) {
    for (const t of ["HELLO", "HAPPY\nBIRTHDAY", "HI, BOB", "A LONG LINE OF WORDS THAT NEEDS TO SPLIT ACROSS SEVERAL CHEERS FOR SURE",
                     "ONE\nTWO\nTHREE\nFOUR\nFIVE\nSIX", "mixed Case text"]) {
      for (const dir of ["down", "up"]) cases.push([t, dir, k.budget, k.room, k.contentW]);
    }
  }
  cases.push([", aOjcTQdCQJ, \nQ", "down", 488, 119.4, 153], ["a\nf aOjcTQdCQJ, happy", "down", 488, 119.4, 244]);
  for (const [t, dir, budget, heightPx, contentW] of cases) {
    const o = { dir, budget, heightPx, contentW }, a = C.sideFit(t, o), where = JSON.stringify(t) + " " + dir + " " + heightPx;
    let best = null;
    for (let S = C.SIDE_MIN_PX; S <= Math.max(C.SIDE_MIN_PX, a.maxPx); S++) {
      const f = C.sideFit(t, { ...o, size: S });
      if (!best || rank(f) <= rank(best)) best = f;
    }
    eq({ px: a.px, cheers: a.cheers }, { px: best.px, cheers: best.cheers }, where);
  }
  const r1 = C.sideFit(", aOjcTQdCQJ, \nQ", { dir: "down", budget: 488, heightPx: 119.4, contentW: 153 });
  eq({ px: r1.px, cheers: r1.cheers }, { px: 28, cheers: 2 }, "the review's first case: 34px for 3 cheers before");
  for (const [v, want] of [["fit1", "fit1"], ["width", "width"], [100, 100], ["100", 100], [1, 20], [999, 300], ["x", "fit1"]]) {
    assert.equal(C.sideSizeOf(v), want, JSON.stringify(v));
  }
  eq(J(C.sideOpts({ sideDir: "sideways", sideSize: "50" })), { dir: "down", size: 50 });
  eq(J(C.sideOpts({ sideDir: "up" })), { dir: "up", size: "fit1" });
});

test("too many lines for the width is reported, never silently clipped", () => {
  const t = "ABCDEFGHIJKLMNOP".split("").join("\n");   // 16 columns of capitals
  const f = C.sideFit(t, {});
  assert.equal(f.fits, false);
  assert.match(C.sideReport(build(t, {})), /Too many lines to fit across the paper even at the smallest size/);
  // Wider than the paper, the block sits against the left edge and the right edge cuts it:
  // top to bottom puts line 1 on the right, so the FIRST lines go; bottom to top, the LAST.
  assert.match(C.sideReport(build(t, {})), /the first lines \(the top of the turned receipt\) will be cut off/);
  assert.match(C.sideReport(build(t, { dir: "up" })), /the last lines \(the bottom of the turned receipt\) will be cut off/);
  assert.doesNotMatch(C.sideReport(build(t, {})), /outer/);
  assert.equal(C.sideFit("HELLO", { size: 290 }).fits, false, "an explicit size past the width rule");
  assert.match(C.sideReport(build("HELLO", { size: 290 })), /at this size/);
});

test("the report: capitals across, length down, cheers", () => {
  const r = C.sideReport(build("HELLO", {}));
  assert.equal(r, "Capitals ≈ " + (280 * 0.716 * 25.4 / 96 / 10).toFixed(1) + " cm across the paper, "
    + ((280 * 3.389 + 2.5) * 25.4 / 96 / 10).toFixed(1) + " cm down the tape · fits 1 cheer");
  assert.equal(C.sideReport(build("", {})), "Type something to print it running down the tape.");
  assert.match(C.sideReport(build("HI 🔥", {})), /grey dots/);
  assert.match(C.sideReport(build("GO KAPPA50 GO", { size: 100 })), /“KAPPA50” as another cheer/);
});

test("literal tokens only, every user character escaped", () => {
  const hostile = '<img src=x> & </div><svg onload=1> "q"';
  for (const dir of ["down", "up"]) {
    for (const b of build(hostile, { dir })) {
      assert.ok(scanTags(b.html).every((t) => t.tag === "div" || t.tag === "br"), b.html);
      assert.ok(!/[<>]/.test(b.html.replace(/<\/?div[^>]*>|<br>/g, "")));
      assert.ok(b.html.includes("writing-mode:") && b.html.includes("font:700 "));
      assert.ok(!/\\|-webkit-|&#|[\u200B-\u200F\u2060\uFEFF]/.test(b.html), b.html);
    }
  }
});

test("top to bottom turns every character: Han, kana and emoji lie down like the Latin letters", () => {
  // Without text-orientation:sideways, vertical-rl stands Han, kana, Hangul and emoji upright
  // (the round-3 bench: 你好 printed over HE, and the box was 729px where the model said 1119).
  // With it the box is 1115px, so the length model (sideways advances) holds.
  for (const t of ["你好 HELLO", "ありがとう", "GG 🎉", "© 2026"]) {
    for (const b of build(t, {})) assert.ok(b.html.includes("writing-mode:vertical-rl;text-orientation:sideways;"), t + ": " + b.html);
    for (const b of build(t, { dir: "up" })) {
      assert.ok(b.html.includes("writing-mode:sideways-lr;") && !b.html.includes("text-orientation"), t + ": " + b.html);
    }
  }
  const f = C.sideFit("你好 HELLO", {});
  assert.ok(Math.abs(f.lengthPx - 1115) < 1115 * 0.02, "the bench measured 1115px: " + f.lengthPx);
});
