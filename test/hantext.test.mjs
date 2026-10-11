// Han text (1.2.0). Big text's Wrap layout breaks a run of Han, kana or Hangul between its characters
// (the page breaks such runs anyway); Latin words stay whole. And a Text render, "Han text as typed",
// prints the typed characters themselves at the receipt's own 16px, in rows of exactly C Han cells,
// packed like Han tiling (Design T): a light first row for the quote mark in a plain cheer, none in a
// High Roller cheer. Only Han-width characters go in; the rest are left out and reported.
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

test("hanTypedGrid: only Han-width characters go in; the rest are left out and reported", () => {
  const g = C.hanTypedGrid("你好 ABC！<b>&", 80);
  eq(g.rows.map((r) => r.join("")), ["你好！" + "丶".repeat(12)]);
  eq(g.dropped, [" ", "A", "B", "C", "<", "b", ">", "&"]);
  // The ideographic space is a space: it can break or vanish at a line's end, so it is left out too.
  eq(C.hanTypedGrid("你　好", 80).dropped, ["　"]);
  eq(C.hanTypedGrid("ABC", 80).rows, []);
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

test("buildHanTyped: nothing Han-width to print gives no bodies, and what was left out rides on the result", () => {
  eq(C.buildHanTyped("HELLO", { mode: "raw", paperMm: 80, cheer: true, bits: 100, limitPx: 1600 }).map((b) => b.html), [""]);
  const b = C.buildHanTyped("你好 A", { mode: "raw", paperMm: 80, cheer: true, bits: 100, limitPx: 1600 });
  eq(b[0].typed.dropped, [" ", "A"]);
});
