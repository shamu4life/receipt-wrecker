// The app's state, read through sanitizers (1.0.0): the settings panel (rw_controls_v1), the
// block fields the cards and builders read, the notice above the parts, the bot's ditherer
// the Thermal preview draws with, and the preview's request to SassyTP's renderer and its verdict.
//
// Settings and block fields arrive from saved blobs, presets, imported JSON and form controls
// (as strings), so every reader goes through these, and these never trust their input.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const DEFAULTS = { cheer: true, bits: 100, hrThreshold: 25, bitsPerInch: 0, maxInches: 0, paperMm: 80,
                   nonce: false, thermalView: false, thermalDither: "floyd" };

test("normalizeControls: nothing saved is the defaults (SassyTP's own: threshold 25, no limits, 80 mm)", () => {
  for (const s of [null, undefined, {}, "junk", 7, []]) eq(C.normalizeControls(s), DEFAULTS, JSON.stringify(s));
});

test("normalizeControls: every field validated, strings from the form read as numbers", () => {
  eq(C.normalizeControls({ cheer: false, bits: "25", hrThreshold: "0", bitsPerInch: "12.5", maxInches: "10",
                           paperMm: "58", nonce: true, thermalView: true, thermalDither: "atkinson" }),
     { cheer: false, bits: 25, hrThreshold: 0, bitsPerInch: 12.5, maxInches: 10, paperMm: 58,
       nonce: true, thermalView: true, thermalDither: "atkinson" });
  const n = (o) => C.normalizeControls(o);
  // Bits: any whole number from 1 (the old >= 100 floor is gone); junk is 100.
  assert.equal(n({ bits: 1 }).bits, 1);
  assert.equal(n({ bits: "7.9" }).bits, 7);
  for (const junk of [0, -5, "", "abc", null, 0.5]) assert.equal(n({ bits: junk }).bits, 100, String(junk));
  // Threshold: 0..1,000,000, 0 meaning off; junk or negative is the default 25.
  assert.equal(n({ hrThreshold: 0 }).hrThreshold, 0);
  assert.equal(n({ hrThreshold: 5e6 }).hrThreshold, 1000000);
  for (const junk of [-1, "", "x", null]) assert.equal(n({ hrThreshold: junk }).hrThreshold, 25, String(junk));
  // Bits per inch above 0, else off; maximum length capped at 40 inches.
  assert.equal(n({ bitsPerInch: -3 }).bitsPerInch, 0);
  assert.equal(n({ maxInches: 99 }).maxInches, 40);
  assert.equal(n({ maxInches: "x" }).maxInches, 0);
  // Paper is 80 or 58, nothing else.
  for (const p of [72, "57", null, "58mm"]) assert.equal(n({ paperMm: p }).paperMm, 80, String(p));
  // The repeat number and the thermal view are on only for an explicit true.
  assert.equal(n({ nonce: "true" }).nonce, false);
  assert.equal(n({ thermalView: 1 }).thermalView, false);
  assert.equal(n({ thermalDither: "bayer" }).thermalDither, "floyd");
  for (const d of C.THERMAL_DITHERS) assert.equal(n({ thermalDither: d }).thermalDither, d);
});

test("normalizeControls: an old blob's fields are ignored, and only the 1.0.0 fields come out", () => {
  const old = { mode: "text", tier: "ascii", cols: 40, text: "HI", textSize: 90, bigStyle: "x", rotateLen: 800,
                imgUrl: "u", imgWidth: 70, covers: true, tuck: true, receiptLen: "500", cheer: true, bits: "100",
                nonce: false, thermalView: true };
  const out = C.normalizeControls(old);
  eq(Object.keys(out).sort(), Object.keys(DEFAULTS).sort());
  eq(out, { ...DEFAULTS, thermalView: true });
});

test("blockRender: big, sideways and hanzi by name; anything else is big", () => {
  for (const r of ["big", "sideways", "hanzi"]) assert.equal(C.blockRender({ render: r }), r);
  for (const junk of [{}, { render: "giant" }, { render: "type" }, { render: "BIG" }, { render: null }, null, undefined]) {
    assert.equal(C.blockRender(junk), "big", JSON.stringify(junk));
  }
  eq(C.TEXT_RENDERS, ["big", "sideways", "hanzi"]);
});

test("glyphOpts and hanziWeightOf clamp whatever a preset hands them", () => {
  eq(C.glyphOpts({}), { tier: "cjk", contrast: 128, dither: true, invert: false });
  eq(C.glyphOpts(null), { tier: "cjk", contrast: 128, dither: true, invert: false });
  for (const t of C.GLYPH_TIERS) assert.equal(C.glyphOpts({ tier: t }).tier, t);
  for (const junk of ["text", "constructor", "CJK", 3]) assert.equal(C.glyphOpts({ tier: junk }).tier, "cjk", String(junk));
  assert.equal(C.glyphOpts({ contrast: 999 }).contrast, 255);
  assert.equal(C.glyphOpts({ contrast: "-4" }).contrast, 0);
  assert.equal(C.glyphOpts({ contrast: "x" }).contrast, 128);
  assert.equal(C.glyphOpts({ dither: false }).dither, false);
  assert.equal(C.glyphOpts({ dither: "no" }).dither, true);
  assert.equal(C.glyphOpts({ invert: "yes" }).invert, false);
  assert.equal(C.hanziWeightOf(400), 400);
  assert.equal(C.hanziWeightOf("400"), 400);
  for (const w of [700, 900, undefined, "bold"]) assert.equal(C.hanziWeightOf(w), 700, String(w));
});

test("modeNotice: says why below the threshold, with High Roller off, and in a free test; nothing otherwise", () => {
  assert.equal(C.modeNotice({ cheer: true, bits: 100, hrThreshold: 25 }), "");
  assert.equal(C.modeNotice({ cheer: true, bits: 25, hrThreshold: 25 }), "", "at the threshold is High Roller");
  const below = C.modeNotice({ cheer: true, bits: 10, hrThreshold: 25 });
  assert.match(below, /^A 10-bit cheer is below the streamer's High Roller threshold \(25 bits\), so the bot prints plain text\./);
  assert.match(below, /text as Han tiling, pictures as a grid of Han characters/);
  assert.match(below, /set Bits per cheer to 25 or more/);
  assert.match(C.modeNotice({ cheer: true, bits: 100, hrThreshold: 0 }), /threshold is 0 \(off\)/);
  assert.match(C.modeNotice({ cheer: false, bits: 10, hrThreshold: 25 }), /^Free test/);
  // A free test is the High Roller form; when the real cheer is below the threshold it says
  // the real one prints as Han tiling instead (round 3).
  assert.match(C.modeNotice({ cheer: false, bits: 10, hrThreshold: 25 }),
    /Your 10-bit cheer will print as Han tiling instead: this tests the High Roller form, which needs 25 bits or more\.$/);
  assert.match(C.modeNotice({ cheer: false, bits: 10, hrThreshold: 0 }), /High Roller is off \(threshold 0\), so a real cheer prints as Han tiling/);
  assert.doesNotMatch(C.modeNotice({ cheer: false, bits: 100, hrThreshold: 25 }), /Han tiling/);
  // It agrees with printMode, which is the bot's own test.
  for (const [bits, t] of [[1, 1], [24, 25], [25, 25], [1000000, 1000000], [5, 0]]) {
    assert.equal(C.modeNotice({ cheer: true, bits, hrThreshold: t }) === "", C.printMode({ cheer: true, bits, hrThreshold: t }) === "raw");
  }
});

// The bench's port of the same C# Ditherer, lifted out of tools/forkbench.mjs (read, not
// imported: that file is a CLI). The app's preview and the bench must dither identically.
function benchDither() {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../tools/forkbench.mjs"), "utf8");
  const m = src.match(/function forkDither\([\s\S]*?\n}\n/);
  assert.ok(m, "could not find forkDither in tools/forkbench.mjs");
  const box = {};
  vm.runInNewContext(m[0] + "\nbox.f = forkDither;", { box, Uint8Array, Int32Array, Math });
  return box.f;
}
function noise(w, h, seed) {
  const d = new Uint8ClampedArray(w * h * 4);
  let x = seed >>> 0;
  for (let i = 0; i < d.length; i++) { x = (x * 1664525 + 1013904223) >>> 0; d[i] = x >>> 24; }
  for (let i = 3; i < d.length; i += 4) if (d[i] < 200) d[i] = 255;   // mostly opaque, some blended
  return d;
}

test("forkDither: dot for dot the bench's port, in every mode, at both dot widths", () => {
  const bench = benchDither();
  for (const [w, outW] of [[576, 576], [384, 384], [300, 384], [600, 576]]) {
    const h = 23, px = noise(w, h, w * 7 + outW);
    for (const mode of C.THERMAL_DITHERS) {
      const a = C.forkDither(px, w, h, outW, mode), b = bench(px, w, h, outW, mode);
      assert.equal(a.length, outW * h);
      let diff = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
      assert.equal(diff, 0, `${mode} at ${w}->${outW}: ${diff} dots differ`);
    }
  }
});

test("forkDither: the bot's grey, its clamps, and threshold at 128", () => {
  const px = (r, g, b, a = 255) => new Uint8ClampedArray([r, g, b, a]);
  // grey = (77R + 151G + 28B) >> 8: pure green 255 is 150 (white), pure red 255 is 76 (black).
  assert.equal(C.forkDither(px(0, 255, 0), 1, 1, 1, "threshold")[0], 0);
  assert.equal(C.forkDither(px(255, 0, 0), 1, 1, 1, "threshold")[0], 1);
  assert.equal(C.forkDither(px(127, 127, 127), 1, 1, 1, "threshold")[0], 1);
  assert.equal(C.forkDither(px(128, 128, 128), 1, 1, 1, "threshold")[0], 0);
  // Transparent is white (blended over white).
  assert.equal(C.forkDither(px(0, 0, 0, 0), 1, 1, 1, "threshold")[0], 0);
  // A flat 50% grey diffuses to about half the dots; >= 250 stays white and <= 5 black.
  const w = 200, h = 50, flat = (v) => { const d = new Uint8ClampedArray(w * h * 4).fill(v); for (let i = 3; i < d.length; i += 4) d[i] = 255; return d; };
  for (const mode of ["floyd", "atkinson"]) {
    const half = C.forkDither(flat(128), w, h, w, mode).reduce((t, v) => t + v, 0) / (w * h);
    assert.ok(half > 0.4 && half < 0.6, mode + ": " + half);
    assert.equal(C.forkDither(flat(250), w, h, w, mode).reduce((t, v) => t + v, 0), 0, mode + " 250 is white");
    assert.equal(C.forkDither(flat(5), w, h, w, mode).reduce((t, v) => t + v, 0), w * h, mode + " 5 is black");
  }
});

test("previewEvent: the part's exact payload as a TwitchCheer, the streamer's settings, no userName", () => {
  const payload = 'Cheer25 <div style="font:700 60px/.8 Arial">BIG</div>';
  eq(C.previewEvent({ payload, bits: 25, cheer: true, hrThreshold: 25, bitsPerInch: 12.5, maxInches: 3 }), {
    event: { __source: "TwitchCheer", bits: 25, user: "viewer", message: payload },
    options: { highRollerBits: 25, highRollerBitsPerInch: 12.5, highRollerMaxInches: 3, hideLinks: false } });
  // No userName (the renderer would start an avatar lookup), and the message is never touched.
  const e = C.previewEvent({ payload: "  " + payload + "  ", bits: "7", cheer: true, hrThreshold: "0" });
  assert.ok(!("userName" in e.event));
  assert.equal(e.event.message, "  " + payload + "  ");
  eq(e.options, { highRollerBits: 0, highRollerBitsPerInch: 0, highRollerMaxInches: 0, hideLinks: false });
  assert.equal(e.event.bits, 7);
  // A free test never prints; it is drawn as the High Roller cheer whose markup it tests.
  assert.equal(C.previewEvent({ payload, bits: 100, cheer: false, hrThreshold: 500 }).options.highRollerBits, 1);
  // Junk settings read through the same sanitizers as the panel.
  eq(C.previewEvent({ payload: null, bits: "x", hrThreshold: -5, bitsPerInch: "y", maxInches: 99 }).options,
     { highRollerBits: C.hrThresholdOf(-5), highRollerBitsPerInch: 0, highRollerMaxInches: 40, hideLinks: false });
});

test("previewVerdict says what the bot's renderer said, in plain words", () => {
  const texts = (d, o) => Array.from(C.previewVerdict(d, o), (l) => (l.warn ? "! " : "") + l.text);
  const ok = (extra) => ({ result: { ok: true, height: 295, trimmed: null, security: [] }, measure: { contentPx: 69.6, fullPx: 69.6 }, violations: 0, ...extra });
  // A part that prints in full: its length, and nothing to warn about.
  // The preview has no profile picture (no userName); a real cheer's receipt usually does, and
  // the line says how much it adds: 182px on 80 mm, 151px on 58 mm (#receipt-avatar).
  assert.deepEqual(texts(ok(), {}), ["About 7.8 cm of receipt (295 px), header and footer included, plus about 4.8 cm if the bot finds the viewer's profile picture."]);
  assert.deepEqual(texts(ok(), { paperMm: 58 }), ["About 7.8 cm of receipt (295 px), header and footer included, plus about 4.0 cm if the bot finds the viewer's profile picture."]);
  assert.deepEqual([C.avatarExtraPx(80), C.avatarExtraPx(58)], [182, 151]);
  // render()'s own cut: the streamer's bits-per-inch limit, or the maximum length.
  const bits = texts(ok({ result: { ok: true, height: 600, trimmed: { limitIn: 3, fullIn: 4.38, by: "bits" }, security: [] } }), { bits: 300, warned: true });
  // In cm, like every other length here (3 in = 7.6 cm, 4.38 in = 11.1 cm).
  assert.match(bits[1], /^! The bot cuts this message at 7\.6 cm, all that 300 bits buy at the streamer's bits-per-inch setting\. The whole message is 11\.1 cm, so its end fades out\.$/);
  const cap = texts(ok({ result: { ok: true, height: 600, trimmed: { limitIn: 2, fullIn: 4.38, by: "cap" }, security: [] } }), { warned: false });
  // The maximum length is set in inches, so it is echoed in inches too.
  assert.match(cap[1], /^! The bot cuts this message at 5\.1 cm, the streamer's maximum length \(2 in\)\..* This app expected it to fit: this computer's fonts may differ/);
  // The 1600px box cuts hard and render() never reports it: the frame's own measurement does.
  const box = texts(ok({ measure: { contentPx: 1600, fullPx: 1700 } }), { warned: true });
  assert.match(box[1], /^! The bot's message box cuts this message off at 42\.3 cm, with no fade\. The whole message is 45\.0 cm\.$/);
  assert.equal(texts(ok({ measure: { contentPx: 100, fullPx: 100.9 } }), {}).length, 1, "sub-pixel is not a cut");
  // Anything the sanitizer took out, a blocked request, a browser that can't draw sideways-lr.
  assert.match(texts(ok({ result: { ok: true, height: 9, trimmed: null, security: ["css value", "untrusted image"] } }), {})[1],
    /^! The bot's sanitizer would take something out of this message \(css value, untrusted image\)\. .*please report it\.$/);
  assert.match(texts(ok({ violations: 2 }), {})[1], /^! The preview's page blocked 2 requests/);
  assert.match(texts(ok(), { upUnsupported: true })[1], /^! This browser can't draw upward sideways text \(writing-mode: sideways-lr\).*Edge/);
  // A free test says so first; a failed render says why, and nothing else.
  assert.match(texts(ok(), { free: true })[0], /^Free test: this message never reaches the printer\./);
  assert.deepEqual(texts({ result: { ok: false, reason: "skipped" } }, {}), ["! SassyTP's renderer could not draw this part (skipped)."]);
  assert.deepEqual(texts({ error: "boom" }, {}), ["! SassyTP's renderer could not draw this part (boom)."]);
  assert.deepEqual(texts(null, null), ["! SassyTP's renderer could not draw this part (no answer)."]);
});

test("noRoomAdvice: what to change when the streamer's settings leave no room after the Cheer line", () => {
  const a = C.noRoomAdvice({ cheer: true, bits: 25, hrThreshold: 25, bitsPerInch: 200 });
  assert.equal(a, "Nothing worth sending: every part would print only its Cheer line. Set Bits per cheer higher: the streamer gives 1 inch (2.5 cm) of receipt per 200 bits.");
  assert.match(C.noRoomAdvice({ cheer: true, bits: 25, hrThreshold: 25, bitsPerInch: 1, maxInches: 0.2 }),
    /whatever the bits\. The streamer's maximum length would have to be longer/);
  assert.match(C.noRoomAdvice({ cheer: true, bits: 1, hrThreshold: 1, bitsPerInch: 1 / 0.1 }), /per 10 bits\.$/);
});

