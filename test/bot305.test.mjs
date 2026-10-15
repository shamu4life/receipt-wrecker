// 1.8.1: Printer Bot 3.0.5. A Letter printer set to Large message gives its large page only to a
// cheer of at least the High Roller threshold (present()'s layoutFor, the TwitchCheer handler's
// largePage: isHighRoller): a smaller cheer, or every cheer while High Roller is off, prints as
// Scaled like 80 mm does. The amount decides, not the printer's Allow High Roller prints.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const SCALED = 533 - 407.8125, LARGE = 533 - 189.96875;

test("letterLayoutFor: Large message only for a cheer of the High Roller threshold or more, and for a free test", () => {
  const f = (o) => C.letterLayoutFor({ letterLayout: "message", cheer: true, hrThreshold: 500, bits: 600, ...o });
  assert.equal(f({}), "message");
  assert.equal(f({ bits: 500 }), "message", "at the threshold");
  assert.equal(f({ bits: 499 }), "scaled", "below it");
  assert.equal(f({ hrThreshold: 0 }), "scaled", "High Roller off: no cheer is a High Roller one");
  assert.equal(f({ allowHighRoller: false }), "message", "the amount decides, not the switch");
  // A free test is drawn as the High Roller cheer whose markup it tests (previewEvent sends the
  // page a threshold of 1), so the page gives it the large page.
  assert.equal(f({ cheer: false, bits: 10 }), "message");
  assert.equal(f({ cheer: false, hrThreshold: 0 }), "message");
  assert.equal(f({ letterLayout: "scaled" }), "scaled");
  assert.equal(f({ letterLayout: "junk" }), "scaled");
});

test("the vendored page decides as letterLayoutFor does: largePage is isHighRoller, and layoutFor drops the layout without it", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("largePage: isHighRoller(d.bits, opts)"), "the TwitchCheer handler's largePage");
  assert.ok(/function layoutFor\(model, opts\) \{\s*if \(!opts \|\| opts\.layout !== 'message' \|\| model\.largePage === true\) return opts;/.test(html),
            "present()'s layoutFor keeps the layout only for a model with largePage");
  assert.ok(html.includes("const opts = layoutFor(model, options);"), "and present() lays the receipt out with it");
});

test("stackContext on a Large message printer: a cheer below the threshold gets the Scaled page's room and no centring", () => {
  const base = { cheer: true, bits: 600, hrThreshold: 25, letterBits: 500, letterLayout: "message" };
  const hr = C.stackContext(base);
  eq([hr.mode, hr.letter.layout, hr.center, hr.limit.by, r4(hr.limit.px)], ["raw", "message", true, "page", r4(LARGE)]);
  const plain = C.stackContext({ ...base, hrThreshold: 1000 });
  eq([plain.mode, plain.letter.layout, plain.center, plain.limit.by, r4(plain.limit.px)], ["plain", "scaled", false, "page", r4(SCALED)]);
  const off = C.stackContext({ ...base, hrThreshold: 0 });
  eq([off.mode, off.letter.layout, r4(off.limit.px)], ["plain", "scaled", r4(SCALED)]);
  const free = C.stackContext({ ...base, cheer: false, hrThreshold: 1000 });
  eq([free.mode, free.letter.layout, free.center, r4(free.limit.px)], ["raw", "message", true, r4(LARGE)]);
});

test("contentLimitPx on a Large message printer goes by the cheer's own bits", () => {
  const L = (o) => C.contentLimitPx({ cheer: true, bits: 600, hrThreshold: 25, letterBits: 500, letterLayout: "message", ...o });
  assert.equal(r4(L({}).px), r4(LARGE));
  assert.equal(r4(L({ hrThreshold: 1000 }).px), r4(SCALED));
});

test("the probes on a Large message printer: the High Roller test gets the large page, the plain test the Scaled one", () => {
  const o = { hrThreshold: 600, letterBits: 500, letterLayout: "message", paperMm: 80, noNonce: true };
  const hr = C.buildHighRollerProbe(o);
  eq([hr.paperMm, hr.bits], ["letter", 600]);
  assert.ok(hr.bodies.length > 0 && hr.bodies.every((b) => /text-align:center/.test(b.html)), "its shapes centre themselves");
  // Judged by the streamer's own threshold, under the bot's default of 25 too.
  const low = C.buildHighRollerProbe({ ...o, hrThreshold: 10, letterBits: 5 });
  eq([low.paperMm, low.bits], ["letter", 10]);
  assert.ok(low.bodies.length > 0 && low.bodies.every((b) => /text-align:center/.test(b.html)), "a 10-bit threshold's test centres too");
  const pl = C.buildPlainProbe(o);
  eq([pl.paperMm, pl.bits, pl.mode], ["letter", 599, "plain"]);
  assert.match(pl.note, /The Letter page leaves room for only \d rows?, so HI is left out\./,
               "599 bits get the Scaled page, whose room HI doesn't fit");
  // With the Scaled layout picked, the same.
  assert.equal(C.buildPlainProbe({ ...o, letterLayout: "scaled" }).note, pl.note);
});
