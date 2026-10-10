// The app's state, read through sanitizers (1.0.0): the settings panel (rw_controls_v1), the
// block fields the cards and builders read, the notice above the parts, the bot's ditherer
// the Thermal preview draws with, and the interim preview's vw -> px helper.
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

test("previewHtml turns vw inside OUR tags into px at the paper's page width, and leaves text alone", () => {
  const cjk = '<div style=width:12.2em;font-size:6.88vw;line-height:1>丶丶 5vw</div>';
  assert.equal(C.previewHtml(cjk, 80), '<div style=width:12.2em;font-size:18.714px;line-height:1>丶丶 5vw</div>');
  assert.equal(C.previewHtml(cjk, 58), '<div style=width:12.2em;font-size:12.453px;line-height:1>丶丶 5vw</div>');
  const mono = "<pre style=\"font:5.83vw/1.2 'Courier New';margin:0\">a<br>b</pre>";
  assert.equal(C.previewHtml(mono, 80), "<pre style=\"font:15.858px/1.2 'Courier New';margin:0\">a<br>b</pre>");
  const big = '<div style="font:700 70px/.8 Arial">10vw &lt;b&gt;</div>';
  assert.equal(C.previewHtml(big, 80), big, "a payload with no vw is unchanged");
});
