// Big text for SassyTP's printer-bot (1.0.0): the user's words in Arial Bold inside one
// literal div per chunk, sized by the app so they fill the paper's width and fit the bot's
// message box. Sizes and heights below are the bench-verified figures from the modes brief
// (tools/forkbench.mjs through the bot's real renderer: width = sum of advances x px on Arial
// Bold metrics, height = lines x px x LH within 0.15px).
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq, scanTags } from "./_harness.mjs";
const C = loadCore();

const ctx = (o) => C.stackContext(Object.assign({ cheer: true, bits: 100, noNonce: true, hrThreshold: 25 }, o || {}));
const build = (text, o, c) => {
  const k = c || ctx();
  return C.buildBigBodies(text, Object.assign({ budget: k.budget, heightPx: k.room, contentW: k.contentW }, o || {}));
};
const J = (x) => JSON.parse(JSON.stringify(x));
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || "") + ": " + a + " vs " + b);

test("BIG_W is Arial Bold's exact, case-aware advance table", () => {
  assert.equal(Object.keys(C.BIG_W).length, 189, "printable ASCII and Latin-1, every one measured");
  for (let c = 0x20; c <= 0xff; c++) {
    if (c > 0x7e && c < 0xa1 || c === 0xad) continue;   // C1 controls, NBSP and the soft hyphen
    assert.ok(Object.prototype.hasOwnProperty.call(C.BIG_W, String.fromCharCode(c)), "BIG_W lacks U+" + c.toString(16));
  }
  const spot = { H: 0.722, E: 0.667, L: 0.611, O: 0.778, M: 0.833, W: 0.944, I: 0.278, " ": 0.278, "5": 0.556,
                 a: 0.556, i: 0.278, m: 0.889, r: 0.389, z: 0.5, "@": 0.975, ",": 0.278, "'": 0.238,
                 ";": 0.333, "+": 0.584, "(": 0.333, ")": 0.333, "%": 0.889, "*": 0.389, "=": 0.584, "$": 0.556,
                 "_": 0.556, "É": 0.667, "é": 0.556, "Ñ": 0.722, "ß": 0.611, "Æ": 1 };
  for (const [ch, w] of Object.entries(spot)) assert.equal(C.BIG_W[ch], w, JSON.stringify(ch));
  close(C.bigLineEm("HELLO"), 3.389, "HELLO (bench c01: 240.61 = 3.389 x 71)");
  close(C.bigLineEm("MMMMM"), 4.165, "MMMMM (bench c13)");
  // A ';' used to count 1em: "QUIZ; Q&A" read 5.889em against Arial Bold's real 5.222, and fit1
  // printed it at 40px on 80 mm where 45 fits (fitPx 237.5 / 5.222).
  close(C.bigLineEm("QUIZ; Q&A"), 5.222, "QUIZ; Q&A");
  assert.equal(C.bigFit("QUIZ; Q&A\nok?", { layout: "lines", paperMm: 80 }).px, 45);
  assert.equal(C.bigFit("QUIZ; Q&A\nok?", { layout: "lines", paperMm: 58 }).px, 28);
  assert.ok(C.bigLineEm("hello") < C.bigLineEm("HELLO"), "never uppercased: lowercase is narrower");
  assert.equal(C.bigLineEm("ж"), C.BIG_W_DEFAULT, "an unlisted character errs wide");
  assert.equal(C.bigLineEm("🔥"), C.BIG_W_EMOJI);
  assert.equal(C.bigLineEm("👍🏽"), C.BIG_W_EMOJI, "an emoji with a skin tone is one glyph");
  assert.equal(C.bigLineEm("❤\uFE0F"), C.BIG_W_EMOJI, "a BMP heart with VS16 is an emoji");
  assert.equal(C.bigLineEm("E\u0301"), C.BIG_W.E, "a decomposed accent rides on its letter");
});

test("line height: .8 only for capitals-safe lines; Q , ; lowercase accents and emoji take 1.15", () => {
  assert.equal(C.bigLineHeight(["HELLO", "WORLD 2026!"]), ".8");
  assert.equal(C.bigLineHeight(["A-B/C+D&E#F:G?'\""]), ".8");
  for (const bad of ["HI, BOB", "YES; NO", "QUIZ", "Hello", "jog", "CAFÉ", "@ME", "HI 🔥"]) {
    assert.equal(C.bigLineHeight(["HELLO", bad]), "1.15", bad);
  }
});

test("byte pins: the benched payload bodies, 80 and 58 mm", () => {
  const html = (t, o, c) => build(t, o, c).map((b) => b.html);
  eq(html("HELLO", { layout: "lines" }), ['<div style="font:700 70px/.8 Arial">HELLO</div>']);
  eq(html("HELLO", { layout: "stack" }), ['<div style="font:700 310px/.8 Arial">H<br>E<br>L<br>L<br>O</div>']);
  eq(html("MMMMM", { layout: "lines" }), ['<div style="font:700 57px/.8 Arial">MMMMM</div>']);
  eq(html("HELLO WORLD", { layout: "lines" }), ['<div style="font:700 31px/.8 Arial">HELLO WORLD</div>']);
  eq(html("Happy birthday", { layout: "lines" }), ['<div style="font:700 32px/1.15 Arial">Happy birthday</div>']);
  eq(html("HELLO", { layout: "lines" }, ctx({ paperMm: 58 })), ['<div style="font:700 43px/.8 Arial">HELLO</div>']);
  eq(html("HELLO", { layout: "lines", flip: true }), ['<div style="font:700 70px/.8 Arial;rotate:180deg">HELLO</div>']);
  // The brief's per-line example (bench v8: 270.36 = 21.59 + 248.8).
  eq(html("HAPPY\nBIRTHDAY\nTO THE\nBEST\nSTREAMER", { layout: "each" }), [
    '<div style="font:700 69px/.8 Arial">HAPPY</div><div style="font:700 46px/.8 Arial">BIRTHDAY</div>'
    + '<div style="font:700 65px/.8 Arial">TO THE</div><div style="font:700 89px/.8 Arial">BEST</div>'
    + '<div style="font:700 42px/.8 Arial">STREAMER</div>']);
  // The full message, lead included.
  const parts = C.packStackBodies(build("HELLO", { layout: "lines" }), ctx());
  eq(parts.map((p) => p.payload), ['Cheer100 <div style="font:700 70px/.8 Arial">HELLO</div>']);
});

test("height is lines x px x LH, width stays inside the paper, and the part fits the box", () => {
  const cases = [["HELLO", "stack", 5 * 310 * 0.8], ["HELLO", "lines", 70 * 0.8], ["Happy birthday", "lines", 32 * 1.15],
                 ["HI\n\nYOU", "lines", 3 * C.bigFit("HI\n\nYOU", { layout: "lines" }).px * 0.8]];
  for (const [t, layout, h] of cases) {
    const b = build(t, { layout });
    assert.equal(b.length, 1, t);
    close(b[0].heightPx, h, t + " " + layout);
  }
  for (const mm of [80, 58]) {
    const k = ctx({ paperMm: mm });
    for (const t of ["HELLO", "MMMMM", "WWW", "I", "HAPPY BIRTHDAY", "Mixed case words", "100%", "jog"]) {
      for (const layout of ["lines", "stack", "each"]) {
        const f = C.bigFit(t, { layout, budget: k.budget, heightPx: k.room, contentW: k.contentW });
        if (!f.fits) {
          // Only a line too wide even at the smallest size may overflow, and only as typed.
          assert.notEqual(layout, "stack", mm + "mm " + t);
          assert.ok(f.overflow.length && f.overflow.every((i) => C.bigLineEm(f.lines[i]) * C.BIG_MIN_PX
            > C.bigFitPx(k.contentW, C.bigGraphemes(f.lines[i]).length)), mm + "mm " + t + " " + layout);
          continue;
        }
        const pxs = f.pxs || f.lines.map(() => f.px);
        f.lines.forEach((l, i) => {
          if (!l) return;
          const n = C.bigGraphemes(l).length;
          assert.ok(C.bigLineEm(l) * pxs[i] <= C.bigFitPx(k.contentW, n) + 1e-9, mm + "mm " + layout + " " + JSON.stringify(l) + " at " + pxs[i]);
        });
        for (const p of C.packStackBodies(build(t, { layout }, k), k)) {
          assert.ok(p.contentPx <= k.limit.px + 1e-6, t + " " + layout + ": " + p.contentPx + "px");
          assert.ok(p.chars <= C.MAX_CHARS);
        }
      }
    }
  }
});

test("auto: the bigger type when lines and stack both fit one cheer, else fewer cheers; never a layout that is cut off", () => {
  assert.equal(C.bigFit("HELLO", {}).layout, "stack", "HELLO stacks at 310px against 70px as a line");
  const long = new Array(8).fill("HAPPY BIRTHDAY").join("\n");
  assert.equal(C.bigFit(long, { layout: "stack" }).cheers > 1, true, "fixture: stacked, 8 lines take more than one cheer");
  const lf = C.bigFit(long, { layout: "lines" }), af = C.bigFit(long, {});
  assert.equal(lf.cheers, 1, "fixture: as lines they fit one cheer");
  // Wrapped, each HAPPY BIRTHDAY is two lines: 16 lines at 46px still fit one cheer, against
  // 26px as typed, so auto wraps them. It never falls back to the stack's extra cheers.
  assert.equal(af.layout, "wrap");
  assert.equal(af.cheers, 1);
  assert.ok(af.px > lf.px, af.px + " vs " + lf.px);
  eq(af.lines, new Array(8).fill(["HAPPY", "BIRTHDAY"]).flat());
  assert.equal(C.bigFit(long, { layout: "lines" }).layout, "lines", "a layout picked by hand is kept as it is");
  assert.equal(C.bigFit("THANK YOU\nFOR THE RAID", {}).layout, "stack", "both fit one cheer: the stack's letters are bigger");
  const wide = "A".repeat(40);
  assert.equal(C.bigFit(wide, { layout: "lines" }).fits, false, "40 capitals are too wide even at 20px");
  assert.equal(C.bigFit(wide, {}).layout, "stack", "so auto stacks it");
  assert.equal(C.bigFit("HI", { layout: "each" }).layout, "each", "each is only ever chosen by hand");
});

test("auto wraps a sentence at its spaces: every word whole, every line inside the paper, the lines balanced", () => {
  // A sentence typed on one line had no good layout: as one line 0.4 cm and cut off, stacked
  // a 47 cm column of 0.6 cm letters. Wrapped, it is six lines of 50px type in one cheer.
  const s = "gg wp, thanks for the raid everyone; Q&A later";
  const f = C.bigFit(s, {}), st = C.bigFit(s, { layout: "stack" });
  assert.equal(f.layout, "wrap");
  assert.equal(f.cheers, 1);
  assert.ok(f.fits && !f.over && !f.tall);
  assert.ok(f.px > st.px, "bigger than the stack: " + f.px + " vs " + st.px);
  assert.equal(f.lines.join(" "), s, "the words, in order, none of them broken");
  for (const l of f.lines) assert.ok(C.bigLineEm(l) * f.px <= C.bigFitPx(244, C.bigGraphemes(l).length) + 1e-9, l);
  const b = build(s, {});
  assert.equal(b.length, 1);
  assert.equal(b[0].html, '<div style="font:700 50px/1.15 Arial">' + f.lines.map(C.escapeHtml).join("<br>") + "</div>");
  close(b[0].heightPx, f.lines.length * 50 * 1.15, "height: one line of type per wrapped line");
  // Balanced: as many lines as the greedy wrap needs, each as short as it can be.
  eq(C.bigWrapWords("WE ARE SO BACK", 30, 244), ["WE ARE SO", "BACK"]);
  eq(C.bigFit("WE ARE SO BACK", { size: 30 }).lines, ["WE ARE", "SO BACK"]);
  eq(C.bigFit("HI MOM HI DAD", { size: 32 }).lines, ["HI MOM", "HI DAD"]);
  // Typed line breaks are kept; only a line too wide is broken.
  eq(C.bigFit("THANKS FOR THE RAID\nGG", { size: 48 }).lines, ["THANKS", "FOR THE", "RAID", "GG"]);
  // No space anywhere: nothing to wrap, so Lines and Stack decide as before.
  for (const t of ["HELLO", "HELLO\nWORLD"]) assert.notEqual(C.bigFit(t, {}).layout, "wrap", t);
  // At a fixed size, wrapped lines that fit beat a stack of the same size (they read as words).
  assert.equal(C.bigFit("THANKS FOR THE RAID", { size: 48 }).layout, "wrap");
  // A word too wide at that size can't be wrapped narrower: the stack fits, so it wins.
  assert.equal(C.bigFit("WELCOME TO THE STREAM", { size: 64 }).layout, "stack");
});

test("Words wrapped is a layout of its own, and every fit says how much tape it takes", () => {
  // Round 3: Auto stacks "good game everyone" (bigger letters, about 48 cm of tape) and the
  // shorter wrapped form had no pick of its own. It is one now, built like Auto's candidate.
  assert.ok(C.BIG_LAYOUTS.includes("wrap"));
  eq(C.bigOpts({ bigLayout: "wrap" }).layout, "wrap");
  const t = "good game everyone";
  const auto = C.bigFit(t, {}), wrap = C.bigFit(t, { layout: "wrap" });
  assert.equal(auto.layout, "stack");
  assert.equal(wrap.layout, "wrap");
  assert.equal(wrap.lines.join(" "), t);
  assert.ok(wrap.lengthPx < auto.lengthPx / 2, "much less tape: " + wrap.lengthPx + " vs " + auto.lengthPx);
  close(wrap.lengthPx, build(t, { layout: "wrap" }).reduce((n, b) => n + b.heightPx, 0), "lengthPx is the bodies' height");
  close(auto.lengthPx, build(t, {}).reduce((n, b) => n + b.heightPx, 0), "for Auto too");
  // A line with no space is Lines exactly, and says so.
  const one = C.bigFit("HELLO", { layout: "wrap" });
  assert.equal(one.layout, "lines");
  eq(build("HELLO", { layout: "wrap" }).map((b) => b.html), J(build("HELLO", { layout: "lines" }).map((b) => b.html)));
  // A wrapped word too wide on its own: the report points at Stack.
  assert.match(C.bigReport(build("SUPERCALIFRAGILISTICEXPIALIDOCIOUS YES", { layout: "wrap", size: 60 })), /set Layout to Stack the letters/);
});

test("height: a too-wide spaced line counts the lines its words really wrap to", () => {
  // "WWW WWW WWW" at 48px: each WWW is 136px, and two of them and a space don't fit 244px, so it
  // is three lines on the paper. Counting width / line width said two, the packer put all 20
  // lines in one cheer, and the bot's box cut a third of them off.
  eq(C.bigWrapWords("WWW WWW WWW", 48, 244), ["WWW", "WWW", "WWW"]);
  eq(C.bigWrapWords("SUPERCALIFRAGILISTIC IS LONG", 40, 244), ["SUPERCALIFRAGILISTIC", "IS LONG"], "a word too wide sits alone");
  eq(C.bigWrapWords("ONEWORD", 400, 244), ["ONEWORD"]);
  const k = ctx();
  const txt = new Array(20).fill("WWW WWW WWW").join("\n");
  const b = build(txt, { layout: "lines", size: 48 }, k);
  close(b.reduce((t, x) => t + x.heightPx, 0), 20 * 3 * 48 * 0.8, "60 printed lines");
  const parts = C.packStackBodies(b, k);
  assert.ok(parts.length >= 2);
  for (const p of parts) assert.ok(p.contentPx <= k.limit.px + 1e-6, p.contentPx + "px");
});

test("Each: a spaced line too wide even at the smallest size counts the lines it wraps to", () => {
  // Round 3: a long spaced line in Each was counted one line tall (px x LH) while the bot's
  // page wrapped it, so a part printed up to 20x taller than the packer planned.
  for (const k of [ctx(), ctx({ paperMm: 58 })]) {
    const line = new Array(150).fill("WW").join(" ");
    const b = build(line, { layout: "each" }, k);
    const px = b[0].big.px, rows = C.bigWrapWords(line, px, k.contentW).length;
    assert.ok(rows > 10, "it wraps to many lines: " + rows);
    close(b.reduce((t, x) => t + x.heightPx, 0), rows * px * 0.8, k.paperMm + " mm, " + rows + " printed lines");
    for (const p of C.packStackBodies(b, k)) assert.ok(p.contentPx <= k.limit.px + 1e-6 || b.some((x) => x.big.tall), p.contentPx + "px");
  }
  // A line that fits keeps px x LH.
  const one = build("HELLO", { layout: "each" });
  close(one[0].heightPx, one[0].big.px * 0.8, "HELLO");
});

test("East Asian wide characters count 1.05em, so a kana stack sized to the width stays inside it", () => {
  assert.equal(C.BIG_W_WIDE, 1.05);
  for (const ch of ["あ", "ア", "你", "한", "Ａ", "。"]) assert.equal(C.bigLineEm(ch), 1.05, ch);
  assert.equal(C.bigLineEm("Ж"), C.BIG_W_DEFAULT, "an unlisted narrow character keeps the default");
  // The bench's kana face advances 1.0235em: at 241px (the old fit) a line was 246.7px in a 244px box.
  for (const [mm, w] of [[80, 244], [58, 153]]) {
    const f = C.bigFit("ありがとう", { size: "fit1", paperMm: mm });
    assert.ok(f.px * 1.0235 <= w - 1, mm + " mm: " + f.px + "px");
  }
});

test("emoji print (Edge draws them) and widen the line; invisible characters are dropped and reported", () => {
  const f = C.bigFit("HI 🔥", { layout: "lines" });
  assert.equal(f.lh, "1.15");
  assert.equal(f.emoji, true);
  eq(f.lines, ["HI 🔥"]);
  const b = build("HI 🔥", { layout: "lines" });
  assert.ok(b[0].html.includes("🔥"));
  assert.match(C.bigReport(b), /grey dots/);
  // A zero-width space or a Hangul filler is not a line of its own in a stack.
  for (const ghost of ["\u200B", "\u3164", "\u2060", "\u00AD", "\u0007"]) {
    const s = C.bigFit("HI" + ghost + "YOU", { layout: "stack" });
    eq(s.lines, ["H", "I", "Y", "O", "U"], JSON.stringify(ghost));
    assert.equal(s.dropped.length, 1);
    assert.match(C.bigReport(build("HI" + ghost + "YOU", { layout: "stack" })), /Invisible characters/);
  }
  // The joiners inside an emoji sequence stay with it.
  eq(C.bigFit("👩\u200D💻", { layout: "stack" }).lines, ["👩\u200D💻"]);
  eq(C.bigFit("👩\u200D💻", { layout: "stack" }).dropped, []);
  // U+2800 is a space; CR and U+2028 are line breaks.
  eq(C.bigLines("HI\u2800YOU", "stack"), ["H", "I", "", "Y", "O", "U"]);
  eq(C.bigLines("A\rB\u2028C", "lines"), ["A", "B", "C"]);
});

test("the grapheme fallback agrees with Intl.Segmenter on the cases that matter", () => {
  for (const s of ["HELLO", "CAFÉ", "Cafe\u0301", "👍🏽👩\u200D👩\u200D👧", "🇬🇧🇫🇷", "1\uFE0F\u20E3#\uFE0F\u20E3", "A B", "日本語", "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"]) {
    eq(C.bigGraphemesFallback(s), J(C.bigGraphemes(s)), JSON.stringify(s));
  }
});

test("chunking holds on both budgets and never loses a letter; the cheer count is the packer's", () => {
  const texts = ["HAPPY BIRTHDAY TO THE BEST STREAMER ON TWITCH", "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
    "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z", "SUPERCALIFRAGILISTICEXPIALIDOCIOUS",
    "line one\nline two\n\nline four\nline five\nline six\nline seven\nline eight\nline nine\nline ten"];
  for (const k of [ctx(), ctx({ bitsPerInch: 25 }), ctx({ paperMm: 58, noNonce: false }), ctx({ bits: 5, bitsPerInch: 1, hrThreshold: 1 })]) {
    for (const t of texts) {
      for (const layout of ["lines", "stack", "each"]) {
        for (const size of ["fit1", "width", 120]) {
          const b = build(t, { layout, size }, k);
          const where = JSON.stringify(t.slice(0, 12)) + " " + layout + " " + size + " room " + k.room;
          for (const x of b) {
            assert.equal(x.chars, C.payloadLength(x.html), where);
            if (!x.big.over) assert.ok(x.chars <= k.budget, where + ": " + x.chars + " chars");
            if (!x.big.tall) assert.ok(x.heightPx <= k.room + 1e-6, where + ": " + x.heightPx + "px");
          }
          const parts = C.packStackBodies(b, k);
          assert.equal(parts.length, b[0].big.cheers, where + ": the fit's cheer count is what the packer makes");
          for (const p of parts) if (!p.bodies.some((x) => x.big.over)) assert.ok(p.chars <= C.MAX_CHARS, where);
          // Every letter arrives, in order (stack: one per line; tags and gaps removed).
          const letters = (s) => s.replace(/\s+/g, "");
          const sent = b.map((x) => x.html.replace(/<[^>]*>/g, "")).join("");
          assert.equal(letters(sent), letters(C.bigClean(t).text), where);
        }
      }
    }
  }
});

test("fit1's binary search finds what a linear scan finds", () => {
  const texts = ["HELLO", "HI", "HAPPY BIRTHDAY", "I RAID RAID", "GG WP", "Happy birthday to you", "THANK YOU SO MUCH",
    "A B C D E F G H I J", "ONE\nTWO\nTHREE\nFOUR\nFIVE\nSIX\nSEVEN", "SUPERCALIFRAGILISTICEXPIALIDOCIOUS IS LONG",
    "NO WAY", "LET'S GO!!!", "q", "WWWWWWWWWWWWWWWW", "the end"];
  const ctxs = [ctx(), ctx({ bitsPerInch: 25 }), ctx({ bitsPerInch: 10 }), ctx({ paperMm: 58 }), ctx({ maxInches: 3 })];
  let n = 0;
  for (const k of ctxs) {
    for (const t of texts) {
      for (const layout of ["lines", "stack", "each"]) {
        for (const flip of [false, true]) {
          const o = { layout, flip, budget: k.budget, heightPx: k.room, contentW: k.contentW };
          const fast = C.bigFit(t, o), slow = C.bigFit(t, { ...o, linear: true });
          eq({ px: fast.px, pxs: fast.pxs, cheers: fast.cheers, gap: fast.gap },
             J({ px: slow.px, pxs: slow.pxs, cheers: slow.cheers, gap: slow.gap }),
             JSON.stringify(t) + " " + layout + (flip ? " flipped" : "") + " room " + k.room + " w " + k.contentW);
          n++;
        }
      }
    }
  }
  assert.ok(n >= 400);
});

test("upside down: ;rotate:180deg on every div, divs and chunks go out last first", () => {
  const each = build("ONE\nTWO\nTHREE", { layout: "each", flip: true });
  assert.equal(each.length, 1);
  const order = scanTags(each[0].html).filter((t) => !t.closing).length;
  assert.equal(order, 3);
  assert.deepEqual(each[0].html.replace(/<[^>]*>/g, "|").split("|").filter(Boolean), ["THREE", "TWO", "ONE"]);
  assert.equal((each[0].html.match(/;rotate:180deg/g) || []).length, 3);
  // A stack that needs two cheers: upright, part 1 has the first word; upside down, the last.
  const k = ctx({ bitsPerInch: 50 });   // a 192px box
  const up = build("HELLO THERE", { layout: "stack", size: 60 }, k);
  const down = build("HELLO THERE", { layout: "stack", size: 60, flip: true }, k);
  assert.ok(up.length > 1 && down.length === up.length);
  const text = (b) => b.html.replace(/<[^>]*>/g, "");
  assert.equal(text(down[0]), text(up[up.length - 1]));
  assert.equal(text(down[down.length - 1]), text(up[0]));
  assert.match(C.bigReport(down, { cheers: down.length }), /last first/);
});

test("a word gap carried over a split: <br> on the next chunk, 21.6px only when it follows another body", () => {
  const b = build("HAPPY BIRTHDAY", { layout: "stack" });
  assert.equal(b.length, 2, "split at the word gap");
  assert.ok(b[1].html.startsWith("<br><div"));
  assert.equal(b[1].joinPx, C.LEAD_LINE_PX);
  assert.equal(b[0].joinPx, 0);
  const parts = C.packStackBodies(b, ctx());
  assert.equal(parts.length, 1, "the packer puts both words back in one cheer");
  close(parts[0].heightPx, b[0].heightPx + 21.6 + b[1].heightPx, "the gap is one small line");
  assert.ok(parts[0].contentPx <= 1600);
});

test("explicit sizes are honoured exactly and reported honestly", () => {
  const f = C.bigFit("HELLO", { layout: "lines", size: 100 });
  assert.equal(f.px, 100);
  assert.equal(f.fits, false, "3.389em x 100 is wider than 244px");
  eq(f.overflow, [0]);
  assert.match(C.bigReport(build("HELLO", { layout: "lines", size: 100 })), /Too wide for the paper at this size/);
  assert.equal(C.bigFit("HELLO", { layout: "lines", size: 60 }).fits, true);
  for (const [v, want] of [["fit1", "fit1"], ["width", "width"], [120, 120], ["120", 120], [5, 20], [9999, 400], ["junk", "fit1"], [null, "fit1"]]) {
    assert.equal(C.bigSizeOf(v), want, JSON.stringify(v));
  }
  eq({ ...C.bigOpts({ bigLayout: "weird", bigSize: "90", bigFlip: "yes" }) }, { layout: "auto", size: 90, flip: false });
});

test("width: fill the paper whatever it costs", () => {
  const k = ctx();
  const f = C.bigFit("I", { layout: "stack", size: "width", budget: k.budget, heightPx: k.room, contentW: k.contentW });
  assert.equal(f.px, 400, "a lone I is capped at 400px");
  const g = C.bigFit("HELLO", { layout: "stack", size: "width", heightPx: 384 - 21.6 });
  assert.equal(g.px, 310);
  assert.ok(g.cheers > 1, "a short box makes it several cheers rather than smaller letters");
});

test("tall: one line taller than the box is flagged and explained, never silently clipped", () => {
  const k = ctx({ bitsPerInch: 100 });   // 96px box
  const b = build("HI", { layout: "lines", size: 200 }, k);
  assert.ok(b.some((x) => x.big.tall));
  const msg = C.bigReport(b, { limit: k.limit });
  assert.match(msg, /taller than this cheer’s part of the receipt/);
  assert.match(C.bigReport(build("HI", { layout: "lines", size: 400 }, ctx({ bitsPerInch: 400 })), { limit: { px: 1600, by: "ceiling", fades: false } }),
    /no warning/);
});

test("a box no taller than the Cheer line is NO room, not the default 1600px box", () => {
  // bits 40 at 200 bits per inch: a 19px box, 2.6px less than the lead's 21.6px line. It used to
  // read as "unset" and size and pack the stack for 1600px: 310px capitals, "fits 1 cheer", no
  // warning, while the bot printed the Cheer line and faded the rest.
  for (const [bits, bpi] of [[40, 200], [25, 200], [21, 96]]) {
    const k = C.stackContext({ cheer: true, bits, noNonce: true, hrThreshold: 20, bitsPerInch: bpi, paperMm: 80 });
    assert.ok(k.room <= 0, bits + "/" + bpi + ": room " + k.room);
    const b = build("HELLO", {}, k);
    assert.ok(b.every((x) => x.big.tall), bits + "/" + bpi + ": every body is flagged too tall");
    const msg = C.bigReport(b, { bits, limit: k.limit });
    assert.match(msg, /Nothing after the Cheer line prints/);
    assert.doesNotMatch(msg, /Pick a smaller size/, "no size fits, so the report must not suggest one");
    const s = C.buildSideBodies("HELLO", { budget: k.budget, heightPx: k.room, contentW: k.contentW });
    assert.ok(s.some((x) => x.tall || x.side.tall), "sideways is flagged too");
    assert.match(C.sideReport(s, { bits, limit: k.limit }), /Nothing after the Cheer line prints/);
    const g = C.buildCjkGrid([["丶", "鬱"], ["鬱", "丶"]].map((r) => r.concat(Array(10).fill("丶"))), { budget: k.budget, heightPx: k.room, paperMm: 80 });
    // Nothing after the Cheer line prints whatever a band's height, so the rows are banded by
    // characters alone: one cheer, where banding by height made a cheer of every row.
    assert.equal(g.length, 1, "glyph rows band by characters in a box the Cheer line fills");
    const parts = C.packStackBodies(b.concat(build("WORLD", {}, k)), k);
    assert.equal(parts.length, 2, "the packer gives each over-tall body its own part rather than packing for 1600px");
    assert.match(C.modeNotice({ cheer: true, bits, hrThreshold: 20, bitsPerInch: bpi }),
      new RegExp("gives a " + bits + "-bit cheer about \\d+ mm of receipt, and the Cheer line fills it.*1 inch \\(2\\.5 cm\\) of receipt per " + bpi + " bits"));
  }
  for (const h of [undefined, NaN]) {
    const f = C.bigFit("HELLO", { heightPx: h, paperMm: 80 });
    assert.ok(f.px >= 300 && !f.tall, "heightPx " + h + ": absent still means the default box");
  }
  assert.match(C.modeNotice({ cheer: true, bits: 100, hrThreshold: 25, maxInches: 0.2 }), /maximum length \(about 5 mm\) is no taller than the Cheer line/);
  assert.equal(C.modeNotice({ cheer: true, bits: 50, hrThreshold: 25, bitsPerInch: 200 }), "", "a 24px box has room, and each body says it is too tall");
});

test("the report: size in cm, cheers and bits, cheer-shaped words", () => {
  const b = build("HELLO", { layout: "lines" });
  assert.equal(C.bigReport(b), "Capitals ≈ " + (70 * 0.716 * 25.4 / 96 / 10).toFixed(1) + " cm · fits 1 cheer");
  assert.equal(C.bigCapCm(70).toFixed(2), "1.33");
  assert.match(C.bigReport(b, { cheers: 3, bits: 25 }), /needs 3 cheers \(75 bits\)/);
  const cw = build("HI CHEER100 YOU", { layout: "lines" });
  assert.match(C.bigReport(cw), /“CHEER100” as another cheer/);
  const maybe = build("NEW PS5 GAME", { layout: "lines" });
  assert.match(C.bigReport(maybe), /If “PS5” is a cheer name on this channel/);
  assert.equal(C.bigReport(build("", {})), "Type something to print it in big letters.");
  assert.match(C.bigReport(build("\u200B", {})), /Nothing else is left to print/);
  // A free test (Cheer-ready off) spends nothing and prints nothing: it counts messages.
  assert.match(C.bigReport(b, { cheers: 2, bits: 100, free: true }), /\u00B7 2 messages, free: a test with Cheer-ready off never prints$/);
  assert.ok(!/bits/.test(C.bigReport(b, { cheers: 2, bits: 100, free: true })));
  assert.match(C.bigReport(b, { free: true }), /\u00B7 1 message, free/);
  // Cut-off letters never read "fits".
  const wide = C.bigReport(build("HELLO", { layout: "lines", size: 100 }));
  assert.match(wide, /^Capitals \u2248 [\d.]+ cm \u00B7 1 cheer, but too wide for the paper \(see below\)\n/);
  assert.ok(!/fits 1 cheer/.test(wide));
  // A too-wide line in Lines: break it (or let Auto wrap it) before stacking it.
  assert.match(C.bigReport(build("A".repeat(20) + " " + "B".repeat(20), { layout: "lines" })),
    /Press Enter between words to break the line, or set Layout to Words wrapped to the paper\./);
  assert.match(C.bigReport(build("A".repeat(40), { layout: "lines" })), /even at the smallest size.* Set Layout to Stack the letters\./);
});

test("every user character is escaped; only our own tags remain", () => {
  const hostile = '<img src=x onerror=alert(1)> & "q" <script>x</script>';
  for (const layout of ["lines", "stack", "each"]) {
    for (const flip of [false, true]) {
      for (const b of build(hostile, { layout, flip })) {
        const tags = scanTags(b.html);
        assert.ok(tags.every((t) => t.tag === "div" || t.tag === "br"), layout + ": " + b.html);
        const stripped = b.html.replace(/<\/?div[^>]*>|<br>/g, "");
        assert.ok(!/[<>]/.test(stripped), layout + ": " + stripped);
        assert.ok(!/\\/.test(b.html), "no backslash");
      }
    }
  }
});
