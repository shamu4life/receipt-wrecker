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
  // One line of capitals takes the width rule's size (313px on 80 mm) up to the Size menu's 300.
  // Its ink is centred on Arial Bold's outlines: the capitals reach 0.716em (O, C, G and S
  // 0.728, and 0.013 below the baseline), so a line-height .8 column's ink sits 0.0115em toward
  // the letter tops, and the block moves 3px the other way at 300px (polish review 3).
  eq(html("HELLO", {}), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 300px/.8 Arial;white-space:nowrap;margin:auto;position:relative;left:-3px">HELLO</div>']);
  eq(html("HELLO", { dir: "up" }), ['<div style="writing-mode:sideways-lr;font:700 300px/.8 Arial;white-space:nowrap;margin:auto;position:relative;left:3px">HELLO</div>']);
  eq(html("HAPPY\nBIRTHDAY", {}), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 150px/.8 Arial;white-space:nowrap;margin:auto;position:relative;left:-2px">HAPPY<br>BIRTHDAY</div>']);
  // The comma's tail would clip at the capitals' 280px; with it the column's ink sits 12px
  // toward the descenders' side, so the block moves 12px the other way (see the centring test).
  eq(html("HI, BOB", {}), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 193px/1.15 Arial;white-space:nowrap;margin:auto;position:relative;left:12px">HI, BOB</div>']);
  eq(html("HI, BOB", { dir: "up" }), ['<div style="writing-mode:sideways-lr;font:700 193px/1.15 Arial;white-space:nowrap;margin:auto;position:relative;left:-12px">HI, BOB</div>']);
  eq(html("HELLO", {}, ctx({ paperMm: 58 })), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 190px/.8 Arial;white-space:nowrap;margin:auto;position:relative;left:-2px">HELLO</div>']);
  // Small enough that the ink is within half a px of the middle: no shift, the bare tag.
  eq(html("HELLO", { size: 40 }), ['<div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 40px/.8 Arial;white-space:nowrap;margin:auto">HELLO</div>']);
  const parts = C.packStackBodies(build("HELLO", {}), ctx());
  eq(parts.map((p) => p.payload), ['Cheer100 <div style="writing-mode:vertical-rl;text-orientation:sideways;font:700 300px/.8 Arial;white-space:nowrap;margin:auto;position:relative;left:-3px">HELLO</div>']);
});

test("the width rule for 1-5 lines, capitals and mixed, 80 and 58 mm", () => {
  // One line of capitals was held to 280px (scaled to the paper), below the rule, and 281-300
  // was called too wide while it printed whole (bench with Arial Bold, the ink centred: HELLO at
  // 300px 11.5 / 10.6px clear of the edges on 80 mm; at 190px 7.2 / 5.3px on 58 mm).
  eq([1, 2, 3, 4, 5].map((n) => C.sideWidthPx(n, true, 244)), [313, 150, 99, 73, 58]);
  eq([1, 2, 3, 4].map((n) => C.sideWidthPx(n, false, 244)), [193, 98, 66, 49]);
  eq([1, 2, 3, 4, 5].map((n) => C.sideWidthPx(n, true, 153)), [190, 91, 60, 44, 35]);
  eq([1, 2, 3, 4].map((n) => C.sideWidthPx(n, false, 153)), [117, 60, 40, 30]);
  for (const px of [281, 290, 300]) {
    assert.equal(C.sideFit("HI", { size: px }).fits, true, px + "px on 80 mm");
    assert.doesNotMatch(C.sideReport(build("HI", { size: px })), /too wide|Too many|Too big/, px + "px");
  }
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
  assert.ok(Math.abs(f.lengthPx - (300 * 3.389 + 2.5)) < 1e-6, String(f.lengthPx));
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
  // An explicit size past the width rule: one line has no lines to lose, so its note says the
  // letters run past the edge; two lines lose the first (or last) one.
  const k58 = ctx({ paperMm: 58 });
  assert.equal(C.sideFit("HELLO", { size: 200, paperMm: 58 }).fits, false, "an explicit size past the width rule");
  const one = C.sideReport(build("HELLO", { size: 200 }, k58));
  assert.match(one, /Too big to fit across the paper at this size: the letters run past the paper's edge and will be cut off\. Pick a smaller size\./);
  assert.doesNotMatch(one, /lines/);
  assert.match(C.sideReport(build("HELLO\nTHERE", { size: 200 })), /Too many lines to fit across the paper at this size: the first lines/);
});

test("the report: capitals across, length down, cheers", () => {
  const r = C.sideReport(build("HELLO", {}));
  assert.equal(r, "Capitals ≈ " + (300 * 0.716 * 25.4 / 96 / 10).toFixed(1) + " cm across the paper, "
    + ((300 * 3.389 + 2.5) * 25.4 / 96 / 10).toFixed(1) + " cm down the tape · fits 1 cheer");
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

test("a long line with small capitals: the report says Enter makes more columns and bigger letters", () => {
  const hint = /Press Enter between words to make more columns: each line becomes its own column, and fewer words per line print bigger\./;
  // One column of a long sentence: Auto shrinks it to 55px (1.0 cm) to fit one cheer.
  assert.match(C.sideReport(build("this is a really long sideways sentence that goes on and on", {})), hint);
  // Already as big as the width allows, a single word, a size picked by hand, or big letters: no hint.
  for (const [t, o] of [["this is a really long\nsideways sentence that\ngoes on and on", {}], ["A\nB\nC\nD", {}],
                        ["Happy birthday", {}], ["this is a really long sideways sentence that goes on and on", { size: 40 }]]) {
    assert.ok(!hint.test(C.sideReport(build(t, o))), JSON.stringify(t) + " " + JSON.stringify(o));
  }
});

test("the ink is centred, not the line box: lowercase and mixed text move toward the letter tops' side, capitals a little the other way", () => {
  // Benched through the pinned renderer (tools/forkbench.mjs, 80 and 58 mm, both directions):
  // 'gg' at 193px printed 34.5px off centre, "Happy birthday" 16.3px, "Hey, you" 19.8px; with the
  // shift every one is within 2px.
  const fit = (t, o, c) => { const k = c || ctx(); return C.sideFit(t, Object.assign({ budget: k.budget, heightPx: k.room, contentW: k.contentW }, o || {})); };
  eq([fit("gg").shift, fit("gg", { dir: "up" }).shift, fit("Happy birthday").shift, fit("Hey, you").shift], [36, -36, 17, 18]);
  assert.match(build("gg", {})[0].html, /;margin:auto;position:relative;left:36px">gg<\/div>$/);
  // Capitals take Arial Bold's own outlines (the rig's face): flat capitals reach 0.716em, O, C,
  // G and S 0.728 with 0.013 below the baseline, digits 0.719. In a line-height .8 column that
  // ink sits 0.0115em toward the letter tops, so capitals move the other way: 3px at 300px, 2px
  // at 190 on 58 mm. They were modelled with Liberation Sans Bold's 0.70 and never moved, and on
  // the bench with Arial Bold added (forkbench --fonts) they printed 2 to 3.5px off centre, and
  // 3px from the paper's edge on 58 mm (polish review 3).
  eq([fit("HELLO").shift, fit("HELLO", { dir: "up" }).shift, fit("HELLO", {}, ctx({ paperMm: 58 })).shift, fit("HELLO", { size: 40 }).shift], [-3, 3, -2, 0]);
  // After the shift (any whole px, even 1: the ink moves to within half a px of the middle) the
  // modelled ink sits as far from one edge as from the other, within 1px, and never nearer than
  // the width rule's 6px to either. Capitals included.
  const texts = ["gg", "jumping", "Happy birthday", "Hey, you", "こんにちは", "GG 🎉🔥", "Rise, up", "HELLO\nworld", "gg\nWP\njoy",
    "a\nb\nc\nd\ne", "quick brown fox", "(parens) [and] {braces}", "Ünïcödé", "x",
    "HELLO", "HAPPY\nBIRTHDAY", "GOOD\nGAME", "I\nLOVE\nYOU\nSO\nMUCH", "GG WP 123", "NO WAY!", "SOS", "100%"];
  for (const paperMm of [80, 58]) for (const dir of ["down", "up"]) for (const size of ["fit1", "width", 96]) for (const t of texts) {
    const f = fit(t, { dir, size }, ctx({ paperMm }));
    if (!f.fits) continue;   // too many lines for the paper at 96px: it can't be centred (below)
    const label = [paperMm, dir, size, JSON.stringify(t), JSON.stringify(f.inkGaps)].join(" ");
    assert.ok(f.inkGaps, label);
    assert.ok(Math.abs(f.inkGaps.top - f.inkGaps.bottom) <= 1.1, label);
    assert.ok(f.inkGaps.top >= 6 && f.inkGaps.bottom >= 6, label);
  }
  // Q: its tail drops 0.072em in Arial Bold (the rig's face, measured from the font's outline)
  // and 0.197em in the bench's Liberation Sans Bold, so the model takes Arial's, with Arial's
  // 0.728em overshoot on top. The midpoint (-0.13) printed "QUIZ" 5.7px off centre on the bench
  // and would have on the rig too, the other way (polish review 2). With Arial Bold added to the
  // bench (forkbench --fonts), every Q-led block below printed within 1.42px of centre.
  for (const t of ["QUIZ", "Quiz", "HELLO\nQUEEN", "Hey, you\nQuick"]) {
    for (const paperMm of [80, 58]) for (const dir of ["down", "up"]) {
      const f = fit(t, { dir }, ctx({ paperMm })), label = [paperMm, dir, JSON.stringify(t), JSON.stringify(f.inkGaps)].join(" ");
      assert.ok(Math.abs(f.inkGaps.top - f.inkGaps.bottom) <= 2 && f.inkGaps.top >= 6 && f.inkGaps.bottom >= 6, label);
    }
  }
  eq([fit("QUIZ").shift, fit("QUIZ", { dir: "up" }).shift, fit("Quiz").shift, fit("HELLO\nQUEEN").shift], [3, -3, 3, 2]);
  // A block wider than the paper sits against the left edge (margin:auto can't centre it), so it
  // is not moved; an unknown script's glyphs take the font's whole box, which moves nothing.
  assert.equal(fit("a b\nc d\ne f\ng h\ni j\nk l\nm n", { size: 300 }).shift, 0);
  assert.equal(fit("ΑΒΓ").shift, 0);
});

