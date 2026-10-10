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
  assert.equal(Object.keys(C.BIG_W).length, 75, "the 75 measured characters");
  const spot = { H: 0.722, E: 0.667, L: 0.611, O: 0.778, M: 0.833, W: 0.944, I: 0.278, " ": 0.278, "5": 0.556,
                 a: 0.556, i: 0.278, m: 0.889, r: 0.389, z: 0.5, "@": 0.975, ",": 0.278, "'": 0.238 };
  for (const [ch, w] of Object.entries(spot)) assert.equal(C.BIG_W[ch], w, JSON.stringify(ch));
  close(C.bigLineEm("HELLO"), 3.389, "HELLO (bench c01: 240.61 = 3.389 x 71)");
  close(C.bigLineEm("MMMMM"), 4.165, "MMMMM (bench c13)");
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
  assert.equal(C.bigFit(long, {}).layout, "lines", "as lines they fit one, so auto keeps the lines");
  assert.equal(C.bigFit("THANK YOU\nFOR THE RAID", {}).layout, "stack", "both fit one cheer: the stack's letters are bigger");
  const wide = "A".repeat(40);
  assert.equal(C.bigFit(wide, { layout: "lines" }).fits, false, "40 capitals are too wide even at 20px");
  assert.equal(C.bigFit(wide, {}).layout, "stack", "so auto stacks it");
  assert.equal(C.bigFit("HI", { layout: "each" }).layout, "each", "each is only ever chosen by hand");
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
