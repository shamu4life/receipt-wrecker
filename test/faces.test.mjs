// 1.4.0: Big and Sideways text print in a face the block picks (its `face` field): Arial Bold,
// the default, or one of nine Windows faces measured by tools/fontmetrics.mjs (FACE_TABLES).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCore, scanTags } from "./_harness.mjs";

const C = loadCore();
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures/arial-1.3.json");
const FACES = ["arial", "arialblack", "impact", "comic", "georgia", "times", "courier", "trebuchet", "verdana", "tahoma"];
const LABELS = ["Arial Bold", "Arial Black", "Impact", "Comic Sans MS", "Georgia", "Times New Roman", "Courier New", "Trebuchet MS", "Verdana", "Tahoma"];

// ── ARIAL IS UNCHANGED, BYTE FOR BYTE ──
// Every Arial message, height, fit and card note is what 1.3.1 sent. The fixture holds a hash of
// each case, written once from 1.3.1's core (RW_WRITE_FIXTURE=1 node --test test/faces.test.mjs).
const TEXTS = ["HELLO", "Hello world", "Happy birthday Rob!", "WE ARE SO BACK", "jeff stuff", "QUIZ", "你好你好",
  "GG 😀", "a\nbb\nccc", "The quick brown fox jumps over the lazy dog", "ÀÉÎÕÜ çß", "100% & #1", "1,2;3", "if j", "  "];
function arialCases(face) {
  const cases = {};
  const add = (key, fn) => { cases[key] = fn; };
  for (const text of TEXTS) for (const paperMm of [80, 58]) {
    for (const layout of ["auto", "lines", "wrap", "stack", "each"]) for (const size of ["fit1", "width", 60, 200]) {
      const opts = { layout, size, paperMm, ...(face ? { face } : {}) };
      add(`big|${text}|${paperMm}|${layout}|${size}`, () => {
        const b = C.buildBigBodies(text, opts);
        return [b.map((x) => [x.html, x.chars, x.heightPx, x.joinPx || 0]), C.bigFit(text, opts), C.bigReport(b, { bits: 100 })];
      });
    }
    add(`bigflip|${text}|${paperMm}`, () => C.buildBigBodies(text, { layout: "auto", size: "fit1", flip: true, paperMm, ...(face ? { face } : {}) }).map((x) => x.html));
    add(`bigtall|${text}|${paperMm}`, () => {
      const b = C.buildBigBodies(text, { layout: "lines", size: 120, paperMm, heightPx: 90, ...(face ? { face } : {}) });
      return [b.map((x) => [x.html, x.heightPx]), C.bigReport(b, { bits: 100, limit: { px: 111.6, by: "bits", fades: true } })];
    });
    for (const dir of ["down", "up"]) for (const size of ["fit1", "width", 120]) {
      const opts = { dir, size, paperMm, ...(face ? { face } : {}) };
      add(`side|${text}|${paperMm}|${dir}|${size}`, () => {
        const b = C.buildSideBodies(text, opts);
        return [b.map((x) => [x.html, x.chars, x.heightPx]), C.sideFit(text, opts), C.sideReport(b, { bits: 100 })];
      });
    }
  }
  for (const n of [1, 2, 3, 5]) for (const caps of [true, false]) for (const w of [244, 153]) add(`width|${n}|${caps}|${w}`, () => C.sideWidthPx(n, caps, w));
  for (const px of [20, 60, 301]) add(`capcm|${px}`, () => C.bigCapCm(px));
  return cases;
}
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

test("Arial Bold prints exactly what 1.3.1 sent: messages, heights, fits and the card's notes", () => {
  const cases = arialCases(null);
  const now = Object.fromEntries(Object.entries(cases).map(([k, fn]) => [k, hash(fn())]));
  if (process.env.RW_WRITE_FIXTURE) { writeFileSync(FIXTURE, JSON.stringify(now, null, 0) + "\n"); return; }
  assert.ok(existsSync(FIXTURE), "the fixture is missing");
  const was = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.deepEqual(Object.keys(now).sort(), Object.keys(was).sort(), "the same cases");
  const changed = Object.keys(was).filter((k) => was[k] !== now[k]);
  assert.deepEqual(changed, [], "Arial cases that changed");
  // A block that names Arial, or a face that doesn't exist, is the same Arial.
  for (const face of ["arial", "nope", 7]) {
    const named = arialCases(face);
    const off = Object.keys(was).filter((k) => !k.startsWith("width|") && !k.startsWith("capcm|") && was[k] !== hash(named[k]()));
    assert.deepEqual(off, [], "face " + JSON.stringify(face));
  }
});

// ── THE FACES ──
const ctx = (o) => C.stackContext(Object.assign({ cheer: true, bits: 100, noNonce: true, hrThreshold: 25 }, o || {}));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("ten faces in the Font menu's order, Arial Bold first; anything else reads as Arial Bold", () => {
  assert.deepEqual([...C.FACE_IDS], FACES);
  assert.deepEqual([...C.FACE_IDS].map((id) => C.faceOf(id).label), LABELS);
  for (const junk of [undefined, null, "", "Impact", "comic sans", 7, {}, "__proto__", "constructor", "toString"]) {
    assert.equal(C.faceOf(junk).id, "arial", String(junk));
  }
  // A block's face reads through bigOpts and sideOpts, like its other fields.
  assert.equal(C.bigOpts({ face: "georgia" }).face, "georgia");
  assert.equal(C.bigOpts({}).face, "arial");
  assert.equal(C.bigOpts({ face: "Georgia" }).face, "arial");
  assert.equal(C.sideOpts({ face: "verdana" }).face, "verdana");
  assert.equal(C.sideOpts({ face: 3 }).face, "arial");
});

test("every face's tables cover Arial Bold's characters: advances, ink above and below the baseline", () => {
  const chars = Object.keys(C.BIG_W);
  for (const id of FACES.slice(1)) {
    const f = C.faceOf(id);
    assert.equal(f.id, id);
    for (const ch of chars) {
      assert.ok(f.w[ch] > 0 && f.w[ch] < 2, id + " advance of " + JSON.stringify(ch));
      assert.ok(Array.isArray(f.ink[ch]) && f.ink[ch][0] <= f.ink[ch][1], id + " ink of " + JSON.stringify(ch));
    }
    assert.ok(f.wDefault >= 1, id);
    assert.ok(f.capEm > 0.5 && f.capEm < 0.85, id);
    assert.ok(parseFloat(f.lhCaps) < parseFloat(f.lhText), id);
    assert.ok(f.box[0] < 0 && f.box[1] > 0.8, id);
    assert.ok(f.caps.test("HELLO") && !f.caps.test("hello") && !f.caps.test("JUMP,"), id);
  }
});

test("a face prints in its own family and weight, under the same \\66ont escape, and nothing literal says font", () => {
  for (const id of FACES.slice(1)) {
    const f = C.faceOf(id);
    const open = '<div style="\\66ont:' + f.weight + " ";
    const big = C.buildBigBodies("HELLO", { layout: "lines", size: 100, paperMm: 80, face: id });
    assert.equal(big[0].html, open + "100px/" + f.lhCaps + " " + f.css + '">HELLO</div>', id);
    const low = C.buildBigBodies("hello", { layout: "lines", size: 60, paperMm: 80, face: id });
    assert.ok(low[0].html.startsWith(open + "60px/" + f.lhText + " " + f.css + '">'), id + " " + low[0].html);
    const side = C.buildSideBodies("HELLO", { size: 100, paperMm: 80, face: id });
    assert.match(side[0].html, new RegExp(";\\\\66ont:" + f.weight + " 100px/" + reEsc(f.lhCaps) + " " + reEsc(f.css) + ";white-space:nowrap;margin:auto"), id);
    for (const b of [...big, ...low, ...side]) {
      assert.ok(!/font/i.test(b.html), id + " " + b.html);
      for (const t of scanTags(b.html)) {
        assert.equal(t.tag, "div", id);
        for (const a of t.attrs) assert.equal(a.name, "style", id);
      }
    }
  }
});

test("a face's line is sized by its own advances and the ink past them", () => {
  for (const id of FACES) {
    const f = C.faceOf(id);
    for (const [text, paperMm] of [["HELLO WORLD", 80], ["jiff", 80], ["Wow", 58], ["QUICK", 58], ["Æther", 80]]) {
      const gs = Array.from(text);
      // Advances, plus the kerning a face widens a pair by (Arial Black's ff), in reading order.
      const em = gs.reduce((s, g, i) => s + (f.w[g] + (i && f.kern && f.kern[gs[i - 1] + g] ? f.kern[gs[i - 1] + g] : 0)), 0);
      const edge = (g, side) => (Object.prototype.hasOwnProperty.call(f.edge, g) ? f.edge[g] : [0, 0])[side];
      const ink = em + 2 * Math.max(edge(gs[0], 0), edge(gs[gs.length - 1], 1));
      const room = C.paperSpec(paperMm).contentW - 2 - 0.5 * gs.length;
      const fit = C.bigFit(text, { layout: "lines", size: "width", paperMm, face: id });
      assert.equal(fit.px, Math.min(400, Math.floor(room / ink)), id + " " + text + " " + paperMm);
    }
  }
});

test("each face takes its own line heights: tight for capitals that fit it, roomier for the rest", () => {
  const lh = (t, id) => C.bigFit(t, { layout: "lines", size: 60, paperMm: 80, face: id }).lh;
  for (const id of FACES) {
    const f = C.faceOf(id);
    assert.equal(lh("HELLO", id), f.lhCaps, id);
    assert.equal(lh("hello", id), f.lhText, id);
  }
  // Georgia's old-style 3 4 5 7 9 hang below the baseline; its 0 1 2 6 8 don't.
  assert.equal(lh("1260", "georgia"), ".8");
  assert.equal(lh("3457", "georgia"), C.faceOf("georgia").lhText);
  assert.equal(lh("3457", "arial"), ".8");
  // Comic Sans's capitals dip below the baseline by design; Impact's stand tall. Each keeps 0.012em
  // spare above and below its ink for the anti-aliased edge (review of 1.4.0).
  assert.equal(lh("HELLO", "comic"), "1");
  assert.equal(lh("HELLO", "impact"), ".9");
});

test("the card's capitals in cm follow the face's cap height", () => {
  const cm = (id) => C.bigReport(C.buildBigBodies("HI", { layout: "lines", size: 100, paperMm: 80, face: id }), { bits: 100 }).split(" · ")[0];
  assert.equal(cm("arial"), "Capitals ≈ 1.9 cm");
  assert.equal(cm("impact"), "Capitals ≈ 2.1 cm");
  for (const id of FACES) assert.equal(C.bigCapCm(100, id), 100 * C.faceOf(id).capEm * C.MM_PER_PX / 10, id);
  assert.equal(C.bigCapCm(100), C.bigCapCm(100, "arial"));
});

test("the sideways width rule takes each face's own constants", () => {
  for (const id of FACES) {
    const s = C.faceOf(id).side;
    assert.equal(s[4], id === "arial" ? undefined : 0.5, id);
    for (const [n, caps, w] of [[1, true, 244], [3, true, 153], [2, false, 244], [5, false, 153]]) {
      const E = w / 2 - 6 - (s[4] || 0);
      const want = Math.max(1, Math.floor(caps ? E / (s[0] * n - s[1]) : E / (s[2] * (n - 1) + s[3])));
      assert.equal(C.sideWidthPx(n, caps, w, id), want, id + " " + [n, caps, w].join(" "));
    }
  }
});

test("sideways ink is centred in every face and keeps 6px from both edges", () => {
  const texts = ["gg", "HELLO", "Happy birthday", "HAPPY\nBIRTHDAY", "jumping", "Rise, up", "QUIZ", "100%"];
  for (const id of FACES) for (const paperMm of [80, 58]) for (const dir of ["down", "up"]) for (const t of texts) {
    const k = ctx({ paperMm });
    const f = C.sideFit(t, { dir, size: "fit1", face: id, budget: k.budget, heightPx: k.room, contentW: k.contentW });
    if (!f.fits) continue;
    const label = [id, paperMm, dir, JSON.stringify(t), JSON.stringify(f.inkGaps)].join(" ");
    assert.ok(f.inkGaps, label);
    assert.ok(Math.abs(f.inkGaps.top - f.inkGaps.bottom) <= 1.1, label);
    assert.ok(f.inkGaps.top >= 6 && f.inkGaps.bottom >= 6, label);
  }
});

test("a sideways run is as long as the face's own advances, its space included", () => {
  const k = ctx();
  const f = C.faceOf("courier");
  const body = C.buildSideBodies("A B", { size: 100, face: "courier", budget: k.budget, heightPx: k.room, contentW: k.contentW })[0];
  // Courier New: every character 0.6em, the space too (Arial Bold's is 0.278), plus half a px a glyph.
  const pad = C.sidePad(100, [(Object.prototype.hasOwnProperty.call(f.edge, "B") ? f.edge.B : [0, 0])[1]]);
  assert.equal(body.heightPx, Math.round((100 * (f.w.A + f.w[" "] + f.w.B) + 0.5 * 3 + pad) * 1000) / 1000);
});

test("the High Roller test stays in Arial Bold", () => {
  const p = C.buildHighRollerProbe({ cheer: true, bits: 25, hrThreshold: 25, paperMm: 80 });
  const html = p.bodies.map((b) => b.html).join("");
  assert.match(html, / Arial/);
  for (const id of FACES.slice(1)) assert.ok(!html.includes(C.faceOf(id).css), id);
});

test("a face's widening kerning is counted: a pair the face spaces apart makes the line longer", () => {
  // Arial Black spaces some pairs apart (rv +0.058em, ff, f! +0.083em), Impact others (X. +0.035em),
  // Trebuchet MS one (vi). Kerning that tightens is left out, as for Arial Bold (an upper bound),
  // but a pair that widens made Arial Black's "fluff" 4.9px longer down the tape than modelled.
  const f = C.faceOf("arialblack");
  assert.ok(f.kern.rv > 0.05 && f.kern["f!"] > 0.08, JSON.stringify(f.kern).slice(0, 80));
  assert.equal(C.faceOf("arial").kern, null);
  assert.ok(C.faceOf("trebuchet").kern.vi > 0.03);
  const k = ctx();
  const S = 100;
  const body = C.buildSideBodies("rv", { size: S, face: "arialblack", budget: k.budget, heightPx: k.room, contentW: k.contentW })[0];
  const pad = C.sidePad(S, [(Object.prototype.hasOwnProperty.call(f.edge, "v") ? f.edge.v : [0, 0])[1]]);
  assert.equal(body.heightPx, Math.round((S * (f.w.r + f.w.v + f.kern.rv) + 0.5 * 2 + pad) * 1000) / 1000);
  // Big text's width fit counts it too: each glyph's advance plus the kerning it widens with the
  // glyph before it, summed in reading order as the model sums them.
  const kp = (x, y) => f.kern[x + y] || 0;
  let em = 0, prev = null;
  for (const g of "rvrv") { em += f.w[g] + (prev ? kp(prev, g) : 0); prev = g; }
  const edge = (g, side) => (Object.prototype.hasOwnProperty.call(f.edge, g) ? f.edge[g] : [0, 0])[side];
  const ink = em + 2 * Math.max(edge("r", 0), edge("v", 1));
  const fit = C.bigFit("rvrv", { layout: "lines", size: "width", paperMm: 80, face: "arialblack" });
  assert.equal(fit.px, Math.min(400, Math.floor((244 - 2 - 0.5 * 4) / ink)));
});

// ── Review of 1.4.0 ──
const SHA = String.fromCodePoint(0x428), NUMERO = String.fromCodePoint(0x2116), PERMILLE = String.fromCodePoint(0x2030);
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
// A face's width for one character, as the model counts it.
const glyphW = (f, ch) => own(f.w, ch) ? f.w[ch] : own(f.wide, ch) ? f.wide[ch] : f.wDefault;
const edgeOf = (f, ch, side) => (own(f.edge, ch) ? f.edge[ch] : [0, 0])[side];

test("beyond Latin-1, a face counts its own width where it draws a character wider than its default", () => {
  // The default width (the widest Latin-1 letter, at least 1em) was no upper bound: Arial Black's
  // Ш is 1.11em and cut "ШОК" at the paper's edge; Verdana's per-mille is 1.78em; even Arial Bold's
  // numero sign is 1.115em, and "№1" was cut in 1.3.1.
  assert.ok(C.faceOf("arialblack").wide[SHA] > 1.05, "Arial Black Sha");
  assert.ok(C.faceOf("verdana").wide[PERMILLE] > 1.7, "Verdana per-mille");
  assert.ok(C.faceOf("arial").wide[NUMERO] > 1.1, "Arial Bold numero sign");
  for (const [face, text] of [["arialblack", SHA + "OK"], ["verdana", "100" + PERMILLE], ["arial", NUMERO + "1"]]) {
    const f = C.faceOf(face), gs = Array.from(text);
    let em = 0;
    gs.forEach((g, i) => { em += glyphW(f, g) + (i && own(f.kern, gs[i - 1] + g) ? f.kern[gs[i - 1] + g] : 0); });
    const ink = em + 2 * Math.max(edgeOf(f, gs[0], 0), edgeOf(f, gs[gs.length - 1], 1));
    const fit = C.bigFit(text, { layout: "lines", size: "width", paperMm: 80, face });
    assert.equal(fit.px, Math.min(400, Math.floor((244 - 2 - 0.5 * gs.length) / ink)), face + " " + text);
  }
});

test("Arial Black's f before a space widens it, in a line, at a line break and down the tape", () => {
  // Canvas measureText doesn't kern across a space, but the page does: Arial Black adds 0.058em
  // after an f that a space follows, even where the line breaks at that space. "if of if of"
  // wrapped once more than the model counted, and a sideways run ran past the bot's box.
  const f = C.faceOf("arialblack"), k = (pair) => (own(f.kern, pair) ? f.kern[pair] : 0);
  assert.ok(k("f ") > 0.05, JSON.stringify(k("f ")));
  // A word's width as the model counts it before a break: its glyphs, the pairs inside it, and
  // the pairs it makes with the spaces around it.
  const wordEm = (w, i, n) => {
    const gs = Array.from(w);
    let em = 0;
    gs.forEach((g, j) => { em += f.w[g] + (j ? k(gs[j - 1] + g) : 0); });
    return em + (i < n - 1 ? k(gs[gs.length - 1] + " ") : 0) + (i ? k(" " + gs[0]) : 0);
  };
  const linesAt = (text, px, kerned) => {
    const words = text.split(" "), sp = f.w[" "];
    let n = 0, em = 0, g = 0, open = false;
    words.forEach((w, i) => {
      const e = kerned ? wordEm(w, i, words.length) : wordEm(w, 0, 1), wg = Array.from(w).length;
      if (open && (em + sp + e) * px <= 244 - 2 - 0.5 * (g + 1 + wg) + 1e-6) { em += sp + e; g += 1 + wg; return; }
      n++; em = e; g = wg; open = true;
    });
    return n;
  };
  let seen = 0;
  for (let px = 60; px <= 200; px++) {
    const fit = C.bigFit("if of if of", { layout: "lines", size: px, paperMm: 80, face: "arialblack" });
    const one = px * (wordEm("if", 0, 4) + f.w[" "] + wordEm("of", 1, 4) + k(" i")) <= 0;   // never: keeps the lint quiet
    if (fit.fits || one) continue;
    const want = linesAt("if of if of", px, true);
    if (want !== linesAt("if of if of", px, false)) seen++;
    assert.equal(Math.round(fit.lengthPx / (px * 1.25)), want, "at " + px + "px");
  }
  assert.ok(seen > 0, "fixture: no size where the f's kerning changes the count");
  // Down the tape: the f before the space counts in the run's length.
  const kx = C.stackContext({ cheer: true, bits: 100, noNonce: true, hrThreshold: 25 });
  const body = C.buildSideBodies("if of", { size: 100, face: "arialblack", budget: kx.budget, heightPx: kx.room, contentW: kx.contentW })[0];
  const em = wordEm("if", 0, 2) + f.w[" "] + wordEm("of", 1, 2);
  const pad = C.sidePad(100, [edgeOf(f, "f", 1)]);
  assert.equal(body.heightPx, Math.round((100 * em + 0.5 * 5 + pad) * 1000) / 1000);
});

test("faceMatches: a device draws a face when its widths are the face's own", () => {
  const probe = Array.from(C.FACE_PROBE);
  for (const id of C.FACE_IDS) {
    const f = C.faceOf(id), px = probe.map((ch) => 100 * f.w[ch]);
    assert.equal(C.faceMatches(id, px), true, id);
    // Another font under the face's name (a phone's stand-in) measures differently somewhere.
    const off = px.slice(); off[off.length - 1] += 2;
    assert.equal(C.faceMatches(id, off), false, id);
  }
  // A metric twin within a quarter of a px is the face's sizes, rightly (Liberation for Arial).
  assert.equal(C.faceMatches("arial", probe.map((ch) => 100 * C.BIG_W[ch] + 0.25)), true);
  for (const junk of [null, [], "x", probe.map(() => NaN)]) assert.equal(C.faceMatches("arial", junk), false, String(junk));
});
