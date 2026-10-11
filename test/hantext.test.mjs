// Han text (1.2.0). Big text's Wrap layout breaks a run of Han, kana or Hangul between its characters
// (the page breaks such runs anyway); Latin words stay whole. And a Text render, "Han text as typed",
// prints the typed characters themselves at the receipt's own 16px, in rows of exactly C Han cells,
// packed like Han tiling (Design T): a light first row for the quote mark in a plain cheer, none in a
// High Roller cheer. Only Han characters go in; the rest are left out and reported.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();

test("bigWrapWords: a Han run breaks between its characters", () => {
  // At 60px a Han character is 1.05em = 63px: three fit 244px (189px), four don't (252px).
  eq(C.bigWrapWords("你好你好你好你好", 60, 244), ["你好你", "好你好", "你好"]);
});

test("bigWrapWords: never a line that starts with a closing mark, or ends with an opening one", () => {
  eq(C.bigWrapWords("你好。你好", 60, 244), ["你好。", "你好"]);
  eq(C.bigWrapWords("「你好」世界", 60, 244), ["「你", "好」世", "界"]);
});

test("bigWrapWords: Latin words stay whole beside a Han run, and a space still separates words", () => {
  eq(C.bigWrapWords("你好 HELLO", 100, 244), ["你好", "HELLO"]);
  eq(C.bigWrapWords("WE ARE SO BACK", 30, 244), ["WE ARE SO", "BACK"]);
});

test("bigWrapWords: an opening mark never ends a line and a closing one never starts one, quotation marks included", () => {
  eq(C.bigWrapWords("你好「世界」", 60, 244), ["你好", "「世", "界」"]);
  eq(C.bigWrapWords("我说你好世界吗“好”", 60, 244), ["我说你", "好世界", "吗", "“好”"]);
  eq(C.bigWrapWords("他说“你好世界”我们", 60, 244), ["他说", "“你好", "世界”", "我们"]);
  eq(C.bigWrapWords("今日は〝最高〟です", 60, 244), ["今日は", "〝最", "高〟で", "す"]);
  eq(C.bigWrapWords("他说‘你好’", 60, 244), ["他说", "‘你", "好’"]);
});

test("bigWrapWords: a Han run after a space, a Han run next to Latin, and kana and Hangul runs", () => {
  eq(C.bigWrapWords("OK 你好你好你好", 60, 244), ["OK 你好", "你好你", "好"]);
  eq(C.bigWrapWords("你好你OK", 60, 244), ["你好你", "OK"]);
  eq(C.bigWrapWords("ありがとうございます", 60, 244), ["ありが", "とうご", "ざいま", "す"]);
  eq(C.bigWrapWords("감사합니다감사합니다", 60, 244), ["감사합", "니다감", "사합니", "다"]);
});

test("bigWrapWords: a Hangul word fills the line it starts on, as the page fills a line of Chinese", () => {
  // At 45px a five-syllable word is 236px; 반갑습니다 starts on the line after 여러분 and breaks.
  eq(C.bigWrapWords("안녕하세요 여러분 반갑습니다", 45, 244), ["안녕하세요", "여러분 반", "갑습니다"]);
  eq(C.bigWrapWords("네 안녕하세요", 60, 244), ["네 안녕", "하세요"]);
  // Latin words around it still never break.
  eq(C.bigWrapWords("HI 안녕하세요 FRIENDS", 40, 244), ["HI 안녕하세", "요 FRIENDS"]);
});

test("Auto never picks a wrap with one character on every line: that is Stack without its word gaps", () => {
  // Spaced Hangul at the biggest wrapped size has one syllable a line, so the word gaps would go:
  // these two sentences mean different things and used to send the same message.
  const a = C.bigFit("아버지가 방에", { layout: "auto", paperMm: 80 });
  const b = C.bigFit("아버지 가방에", { layout: "auto", paperMm: 80 });
  assert.notEqual(a.layout, "wrap");
  eq(C.bigFit("谢谢 大家", { layout: "auto", paperMm: 80 }).lines.includes(""), true);
  const pa = C.buildBigBodies("아버지가 방에", { layout: "auto", paperMm: 80 }).map((x) => x.html).join("");
  const pb = C.buildBigBodies("아버지 가방에", { layout: "auto", paperMm: 80 }).map((x) => x.html).join("");
  assert.notEqual(pa, pb);
  assert.notEqual(b.layout, "wrap");
});

test("Wrap: the balanced lines never cost more than the greedy ones they replace", () => {
  // Balancing can move a break from a space (which goes) to between two characters (where a space in
  // the middle of a line stays), so it can add characters, and "fits one cheer" came back as two
  // (review: 35px at 2 cheers where 33px fit 1). Over random CJK texts with spaces, whenever the
  // smallest size fits one cheer, fit1 must too, and the parts must be what fit1 says.
  const pool = "가나다라마바사아자차카타파하你好世界朋友今日は天気ありがとう";
  let seed = 7;
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const ctx = (mm) => C.stackContext({ cheer: true, bits: 100, noNonce: true, paperMm: mm, hrThreshold: 25 });
  let checked = 0;
  for (let t = 0; t < 60; t++) {
    let s = "";
    const len = 100 + rnd(160);
    for (let i = 0; i < len; i++) s += rnd(5) === 0 ? " " : pool[rnd(pool.length)];
    s = s.replace(/ +/g, " ").trim();
    for (const mm of [80, 58]) {
      if (C.bigFit(s, { layout: "wrap", size: 20, paperMm: mm }).cheers !== 1) continue;
      checked++;
      for (const layout of ["wrap", "auto"]) {
        const f = C.bigFit(s, { layout, size: "fit1", paperMm: mm });
        const parts = C.packStackBodies(C.buildBigBodies(s, { layout, size: "fit1", paperMm: mm }), ctx(mm));
        assert.equal(f.cheers, 1, layout + " " + mm + " " + f.px + "px: " + s);
        assert.equal(parts.length, 1, layout + " " + mm + ": " + s);
      }
    }
  }
  assert.ok(checked > 20, "only " + checked + " texts fit one cheer at 20px");
});

test("Wrap fit1: the review's texts fit one cheer, where they came back as two", () => {
  // From the 1.2.0 review: fit1 settled on 35px (58 mm) and 34px (80 mm) by the greedy wrapping,
  // then balanced it into a second cheer; and the third fits one cheer only balanced, at 20 or 21px.
  const cases = [
    [58, "반가워요 우리\n축하해요 여러분\n사랑해요 반가워요 항상 여러분 방송 날씨가\n오늘 축하해요 우리 스트리머 최고 축하해요 스트리머\n여러분 함께 시청자 해요 함께 오늘 재밌어요 여러분 함께\n반가워요 여러분 항상\n스트리머 축하해요"],
    [80, "ね ありがとう 配信 今日 明日 明日\nまた 大好き みんな 配信 最高 ありがとう お疲れ様\n楽しい 配信 また また すごい です また お疲れ様\nです ありがとう 楽しい 楽しい また すごい みんな 楽しい また\n明日 楽しい 今日 ありがとう 最高 今日 最高 ありがとう\n楽しい みんな 今日 すごい\n最高 よろしく ありがとう 明日"],
    [58, "최고\n함께 최고 우리 함께 최고 정말 우리 반가워요 사랑해요\n스트리머 감사합니다 여러분\n우리 날씨가 여러분 축하해요 항상 재밌어요 함께 그리고 항상\n사랑해요 해요 시청자 축하해요 사랑해요 안녕 재밌어요 스트리머 오늘\n그리고 오늘 좋네요 그리고 함께 축하해요 항상 최고\n여러분 그리고 재밌어요 해요 사랑해요 반가워요"],
  ];
  for (const [mm, t] of cases) {
    const ctx = C.stackContext({ cheer: true, bits: 100, noNonce: true, paperMm: mm, hrThreshold: 25 });
    for (const layout of ["wrap", "auto"]) {
      const f = C.bigFit(t, { layout, size: "fit1", paperMm: mm });
      assert.equal(f.cheers, 1, layout + " " + mm + " at " + f.px + "px");
      assert.equal(C.packStackBodies(C.buildBigBodies(t, { layout, size: "fit1", paperMm: mm }), ctx).length, 1, layout + " " + mm);
    }
  }
});

test("Auto prints a long Han run wrapped in one cheer, where it used to stack it over three", () => {
  const f = C.bigFit("你好".repeat(40), { layout: "auto", paperMm: 80 });
  assert.equal(f.layout, "wrap");
  assert.equal(f.cheers, 1);
  assert.ok(f.px > 50, "bigger than the 50px stack: " + f.px);
  // Words wrapped on its own is that same wrapping, not Lines.
  assert.equal(C.bigFit("你好".repeat(40), { layout: "wrap", paperMm: 80 }).layout, "wrap");
});

test("hanTypedGrid: rows of exactly C Han cells; a typed line break starts a new row; light cells fill the rest", () => {
  const g = C.hanTypedGrid("你好\n世界", 80);
  eq(g.rows.map((r) => r.join("")), ["你好" + "丶".repeat(13), "世界" + "丶".repeat(13)]);
  eq(g.dropped, []);
  eq(C.hanTypedGrid("一二三四五六七八九十", 58).rows.map((r) => r.join("")), ["一二三四五六七八九", "十丶丶丶丶丶丶丶丶"]);
  // A blank typed line is a light row.
  eq(C.hanTypedGrid("你\n\n好", 58).rows.map((r) => r.join("")), ["你丶丶丶丶丶丶丶丶", "丶丶丶丶丶丶丶丶丶", "好丶丶丶丶丶丶丶丶"]);
});

test("hanTypedGrid: only Han characters go in; the rest are left out and reported", () => {
  const g = C.hanTypedGrid("你好 ABC！<b>&", 80);
  eq(g.rows.map((r) => r.join("")), ["你好" + "丶".repeat(13)]);
  eq(g.dropped, [" ", "A", "B", "C", "！", "<", "b", ">", "&"]);
  // The ideographic space is a space: it can break or vanish at a line's end, so it is left out too.
  eq(C.hanTypedGrid("你　好", 80).dropped, ["　"]);
  eq(C.hanTypedGrid("ABC", 80).rows, []);
});

// 1.2.0 review: a mark the page never starts a line with (、。」！？…), at a row's start, pulled the
// character before it down, and one it never ends a line with (「（…), at a row's end, went down to
// the next row; Chromium also squeezes two such marks side by side into less than two cells. Either
// way every row after it slipped by a cell. They are left out (owner, 2026-10-11) and named.
// (Copied out of the app's realm, so two of them compare equal.)
const ROWS = (t, mm) => JSON.parse(JSON.stringify(C.hanTypedGrid(t, mm).rows.map((r) => r.join(""))));

test("hanTypedGrid: CJK punctuation is left out and reported, so it can never push a row out of line", () => {
  const g = C.hanTypedGrid("今天天气很好，我们去公园吧。你觉得怎么样？「好的」（对）", 80);
  eq(g.rows.map((r) => r.join("")), ["今天天气很好我们去公园吧你觉得", "怎么样好的对" + "丶".repeat(9)]);
  eq(g.dropped, ["，", "。", "？", "「", "」", "（", "）"]);
  // Every mark the page won't start or end a line with, and the ones Chromium squeezes.
  const out = "、。〈〉《》「」『』【】〔〕〖〗〘〙〚〛〜〝〞〟゠・！＄％（），．：；？［］｛｝｟｠￠￡￥￦︵︶";
  const og = C.hanTypedGrid(out, 80);
  eq(og.rows, []);
  eq(og.dropped.join(""), out);
});

test("hanTypedGrid: kana, Hangul and full-width letters are left out too: only Han characters are a full cell in every font", () => {
  // A Mac's Hangul printed 16 a row through the vendored renderer, Noto's is 0.92 of a cell, and
  // Windows draws kana with the condensed Yu Gothic UI (owner, 2026-10-11: Han characters only).
  const mixed = "ありがとうっャー감사합니다ＡＢ１２〒〆㈱漢字〇⼀";
  eq(ROWS(mixed, 80), ["漢字〇⼀" + "丶".repeat(11)]);
  eq(C.hanTypedGrid(mixed, 80).dropped.join(""), "ありがとうっャー감사합니다ＡＢ１２〒〆㈱");
  // Compatibility ideographs and the Hangzhou numerals are Han too, and stay as typed.
  eq(ROWS("豈〡", 58), ["豈〡丶丶丶丶丶丶丶"]);
});

test("hanTypedGrid: an iteration mark never starts a row: the character before it moves down with it", () => {
  // 80 mm: 15 cells. 人 is the 15th character and 々 the 16th, which the page won't start a line with.
  eq(ROWS("一二三四五六七八九十一二三四人々", 80), ["一二三四五六七八九十一二三四丶", "人々" + "丶".repeat(13)]);
  // Two in a row move down together with the character before them.
  eq(ROWS("一二三四五六七八九十一二三時々々", 80), ["一二三四五六七八九十一二三丶丶", "時々々" + "丶".repeat(12)]);
  // A typed line that starts with one gets a light cell before it.
  eq(ROWS("你\n々", 58), ["你丶丶丶丶丶丶丶丶", "丶々丶丶丶丶丶丶丶"]);
  // Away from a row's start it stays where it is.
  eq(ROWS("人々", 58), ["人々丶丶丶丶丶丶丶"]);
});

test("hanTypedGrid: blank and Latin-only lines, CRLF and U+2028 line breaks", () => {
  eq(ROWS("\n你\nABC\n好\n\n", 58), ["你丶丶丶丶丶丶丶丶", "好丶丶丶丶丶丶丶丶"]);
  eq(C.hanTypedGrid("\n你\nABC\n好\n\n", 58).dropped, ["A", "B", "C"]);
  eq(ROWS("你\r\n好", 58), ["你丶丶丶丶丶丶丶丶", "好丶丶丶丶丶丶丶丶"]);
  eq(C.hanTypedGrid("你\r\n好", 58).dropped, []);
  eq(ROWS("你\u2028好\u2029世", 58), ["你丶丶丶丶丶丶丶丶", "好丶丶丶丶丶丶丶丶", "世丶丶丶丶丶丶丶丶"]);
});

test("hanTypedGrid: invisible characters are dropped and reported apart from the visible ones", () => {
  const g = C.hanTypedGrid("你\u200B好\u2060", 80);
  eq(g.rows.map((r) => r.join("")), ["你好" + "丶".repeat(13)]);
  eq(g.dropped, []);
  eq(g.invisible, ["\u200B", "\u2060"]);
});

test("hanTypedGrid: a cell may be several code points, and decomposed kana and Hangul go out whole", () => {
  // NFD Hangul is three jamo a syllable, and NFD kana carry a separate voicing mark: one grapheme
  // each, left out whole.
  eq(C.hanTypedGrid("한국".normalize("NFD"), 80).dropped.length, 2);
  eq(ROWS("が".normalize("NFD") + "字", 80), ["字" + "丶".repeat(14)]);
  // An ideographic variation sequence is one cell.
  const ivs = "葛\u{E0100}";
  eq(C.hanTypedGrid(ivs + "飾", 80).rows[0].slice(0, 2), [ivs, "飾"]);
  // Supplementary-plane Han and emoji stay out (bigIsWide is the BMP only), and so does a Han-like
  // symbol asking to be drawn as an emoji (U+FE0F).
  eq(C.hanTypedGrid("𠮷野家😀〰\uFE0F", 80).dropped, ["𠮷", "😀", "〰\uFE0F"]);
});

test("buildDesignT: rows per cheer follow the longest row's characters, so a part never passes 500", () => {
  // 400 cells of two code points each: 30 a row, so 16 rows a High Roller cheer (491 / 30), not 32.
  const text = ("葛\u{E0100}").repeat(400);
  for (const mode of ["raw", "plain"]) {
    const b = C.buildHanTyped(text, { mode, paperMm: 80, cheer: true, bits: mode === "raw" ? 100 : 24, noNonce: true, limitPx: 1600 });
    const parts = C.packStackBodies(b, C.stackContext({ cheer: true, bits: mode === "raw" ? 100 : 24, noNonce: true, paperMm: 80, hrThreshold: 25 }));
    for (const p of parts) assert.ok(C.payloadLength(p.payload) <= 500, mode + " " + C.payloadLength(p.payload));
    eq(b.map((x) => x.hanzi.rows), mode === "raw" ? [14, 13] : [14, 13]);
  }
});

test("buildHanTyped: a plain cheer gets the light first row for the quote mark and the cheer word last", () => {
  const text = "一二三四五六七八九十一二三四五" + "六七八九十一二三四五六七八九十";
  const b = C.buildHanTyped(text, { mode: "plain", paperMm: 80, cheer: true, bits: 24, noNonce: true, limitPx: 1600 });
  assert.equal(b.length, 1);
  assert.equal(b[0].html, "丶".repeat(14) + text);
  assert.equal(b[0].alone, true);
  eq(C.packStackBodies(b, C.stackContext({ cheer: true, bits: 24, noNonce: true, paperMm: 80, hrThreshold: 25 })).map((p) => p.payload),
    ["丶".repeat(14) + text + " Cheer24"]);
});

test("buildHanTyped: a High Roller cheer has no quote marks, so no light first row", () => {
  const text = "你好世界";
  const b = C.buildHanTyped(text, { mode: "raw", paperMm: 80, cheer: true, bits: 100, noNonce: true, limitPx: 1600 });
  assert.equal(b[0].html, "你好世界" + "丶".repeat(11));
  eq(C.packStackBodies(b, C.stackContext({ cheer: true, bits: 100, noNonce: true, paperMm: 80, hrThreshold: 25 })).map((p) => p.payload),
    ["你好世界" + "丶".repeat(11) + " Cheer100"]);
  assert.ok(!b[0].html.startsWith("<"));
});

test("buildHanTyped: rows per cheer are what 500 characters hold, spread evenly over the cheers", () => {
  // 40 rows on 80 mm. Plain: (500 - 9 - 14) / 15 = 31 rows a cheer -> 2 cheers of 20.
  const rows40 = Array.from({ length: 40 }, () => "鬱".repeat(15)).join("");
  const plain = C.buildHanTyped(rows40, { mode: "plain", paperMm: 80, cheer: true, bits: 24, noNonce: true, limitPx: 1600 });
  eq(plain.map((b) => b.hanzi.rows), [20, 20]);
  // High Roller, no header: (500 - 9) / 15 = 32 rows a cheer -> 2 cheers of 20 still.
  const raw = C.buildHanTyped(rows40, { mode: "raw", paperMm: 80, cheer: true, bits: 100, noNonce: true, limitPx: 1600 });
  eq(raw.map((b) => b.hanzi.rows), [20, 20]);
  // 32 rows fit one High Roller cheer and no plain one.
  const rows32 = rows40.slice(0, 32 * 15);
  assert.equal(C.buildHanTyped(rows32, { mode: "raw", paperMm: 80, cheer: true, bits: 100, noNonce: true, limitPx: 1600 }).length, 1);
  assert.equal(C.buildHanTyped(rows32, { mode: "plain", paperMm: 80, cheer: true, bits: 24, noNonce: true, limitPx: 1600 }).length, 2);
  for (const b of raw.concat(plain)) assert.ok(C.payloadLength(b.html) + 9 <= 500, b.html.length);
});

test("buildHanTyped: nothing Han to print gives no bodies, and what was left out rides on the result", () => {
  eq(C.buildHanTyped("HELLO", { mode: "raw", paperMm: 80, cheer: true, bits: 100, limitPx: 1600 }).map((b) => b.html), [""]);
  const b = C.buildHanTyped("你好 A", { mode: "raw", paperMm: 80, cheer: true, bits: 100, limitPx: 1600 });
  eq(b[0].typed.dropped, [" ", "A"]);
});
