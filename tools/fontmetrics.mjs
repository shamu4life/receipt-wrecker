#!/usr/bin/env node
// tools/fontmetrics.mjs — measures the faces Big and Sideways text can print in, and writes
// their tables into public/index.html. Dev-only: never in CI and no test imports it (CI's
// Linux has none of these fonts). Needs Playwright's Chromium (npx playwright install
// chromium) and the fonts themselves on this machine: every face below ships with Windows,
// and a Mac has Microsoft's own copies in /System/Library/Fonts/Supplemental.
//
//   node tools/fontmetrics.mjs           measure, then write the generated block
//   node tools/fontmetrics.mjs --check   measure, then exit 1 if the committed block differs
//   node tools/fontmetrics.mjs --json    print the raw measurements
//
// HOW IT MEASURES. Each face is measured in Chromium (the engine the streamer's Edge runs) with
// canvas measureText at 1000px, character by character, over the characters Arial Bold's own
// table (BIG_W) lists: printable ASCII and Latin-1. measureText gives the advance, the ink's box
// (left and right of the pen, above and below the baseline) and the face's ascent and descent.
// The method is calibrated on Arial Bold first: its advances must equal BIG_W exactly, or the
// tool stops, since then the browser has not found the fonts it was asked for. Each face must
// also measure differently from the browser's generic fonts at its own weight, or the face is
// missing (Impact is weight 400: checked against 700 only, a missing Impact went unnoticed).
//
// WHAT IT WRITES, per face (in em; the arrays follow FACE_CHARS, in thousandths of an em):
//   w        the advance of each character (rounded to 1/1000 em, as BIG_W is)
//   wDefault what a character the tables lack counts: the widest one listed, at least 1em
//            (BIG_W_DEFAULT's rule: it errs wide)
//   wide     characters beyond FACE_CHARS that the face itself draws WIDER than wDefault, in
//            thousandths of an em, rounded up: the rest of Windows' code pages (WGL4: Latin
//            Extended-A, Greek, Cyrillic, the Windows-1252 extras) and the numero sign. Without
//            them wDefault was no upper bound: Arial Black's Ш is 1.11em and cut "ШОК" at the
//            paper's edge, Verdana's per-mille 1.78em; even Arial Bold's numero sign is 1.115em,
//            and "№1" was cut in 1.3.1. Arial Bold's own (FACE_EXTRA_ARIAL) are measured the same
//            way. A character counts only when every generic fallback measures it the same, so the
//            face itself draws it (a character it lacks prints in another font: wDefault).
//   lo, hi   the ink below (negative) and above the baseline, rounded outward
//   edge     ink at or past the advance's edges: every side whose ink comes within 0.01em of
//            the advance's edge, or crosses it, as how far it crosses (0 if it doesn't) plus
//            0.001em for the anti-aliased edge, the WGL4 characters included. A sideways run's
//            END has no margin, and anti-aliasing spills about half a px past ink that only
//            touches the edge: Georgia's g, Impact's t and j and Arial Bold's per-mille each lost
//            a dot row or two there (sidePad pads any listed glyph at the end by at least 1px).
//            BIG_EDGE lists Arial Bold's Latin-1 past 0.003em only (bigFitPx's margin covers the
//            rest across the paper); its WGL4 extras follow the rule here.
//   kern     the pairs the face spaces APART (kerning that widens), {"ab": thousandths of an em},
//            rounded up. Arial Black has 66 within words (rv, ry, f! up to 0.083em) and one with
//            the space (f followed by a space, 0.058em), Impact 258 (X., vy up to 0.035em),
//            Trebuchet MS one (vi). The model sums advances and leaves out kerning that tightens
//            (an upper bound), so these are added back: with them left out, Arial Black's "fluff"
//            ran 4.9px longer down the tape than modelled, and "if of if of" wrapped once more
//            than counted. Pairs within a word are measured on a canvas; pairs with the space are
//            measured in laid-out text, since canvas measureText doesn't kern across a space.
//            Arial Bold must have none (the tool stops if it does: its hand tables assume so).
//   capEm    the ink height of H (BIG_CAP_EM's rule)
//   lhCaps   the tightest of .8 .85 .9 .95 1 at which every capital but Q fits its line box,
//            above and below, with 0.012em to spare for the anti-aliased edge; the box puts the
//            baseline (L + ascent - descent) / 2 below its top (CSS half-leading). Arial Bold:
//            .8. Comic Sans's capitals dip up to 0.06em below the baseline by design: a fixed
//            cut-off for "a tail" can't tell them from Arial's Q (0.07em), so the line box decides.
//            The spare room: with the ink's outline exactly at the box's edge, the last line's
//            descenders (and a flipped block's overshoot) lost 0.5 to 0.9px to the box's clip
//            (Comic Sans's j at 65px, Georgia's y at 29px). It covers that from about 40px up;
//            below, a dot row can still go, as for Arial Bold's flipped capitals.
//   caps     the caps-safe characters: BIG_CAPS_SAFE's candidates (the capitals, digits, space
//            and . ! ? ' " & # : / + -), Q included, that fit the line box at lhCaps. Georgia's
//            old-style 3 4 5 7 9 do not, nor does a / that reaches below the baseline.
//   lhText   the tightest of 1.15 1.2 ... 1.5 at which every character listed fits its line box,
//            with the same spare room. (Arial Bold's 1.15, BIG_LH_TEXT, is hand-set.)
//   box      [-descent, ascent]: the face's whole box, which a sideways column centres
//   side     the sideways width rule's constants, as sideWidthPx uses Arial Bold's
//            (0.4N - 0.0305 for capitals, 0.575(N - 1) + 0.6 otherwise): [lhCaps / 2,
//            lhCaps / 2 - the capitals' ink half-span, lhText / 2, the text's ink half-span +
//            0.044, 0.5] (0.044 is the margin Arial Bold's 0.6 keeps over its own half-span; the
//            0.5 is px the rule keeps back from each edge for the centring shift, which is
//            whole px: with the capitals' exact half-span and none kept back, Impact's HELLO
//            on 58 mm was modelled 5.6px from one edge)
//
// The ids are what a block saves (its `face` field); the labels are what the Font menu shows.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCore } from "../test/_harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, "../public/index.html");
const BEGIN = "  // BEGIN generated faces (node tools/fontmetrics.mjs writes this block; never edit it by hand)\n";
const END = "  // END generated faces\n";

export const FACES = [
  { id: "arialblack", label: "Arial Black", css: "Arial Black", weight: "900" },
  { id: "impact", label: "Impact", css: "Impact", weight: "400" },
  { id: "comic", label: "Comic Sans MS", css: "Comic Sans MS", weight: "700" },
  { id: "georgia", label: "Georgia", css: "Georgia", weight: "700" },
  { id: "times", label: "Times New Roman", css: "Times New Roman", weight: "700" },
  { id: "courier", label: "Courier New", css: "Courier New", weight: "700" },
  { id: "trebuchet", label: "Trebuchet MS", css: "Trebuchet MS", weight: "700" },
  { id: "verdana", label: "Verdana", css: "Verdana", weight: "700" },
  { id: "tahoma", label: "Tahoma", css: "Tahoma", weight: "700" },
];
const LH_CAPS = [".8", ".85", ".9", ".95", "1"];
const LH_TEXT = ["1.15", "1.2", "1.25", "1.3", "1.35", "1.4", "1.45", "1.5"];
const CAPS_CANDIDATES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .!?'\"&#:/+-";
const CORE_CAPS = "ABCDEFGHIJKLMNOPRSTUVWXYZ";
const SIDE_TEXT_MARGIN = 0.044, SIDE_SHIFT_PX = 0.5;
const EDGE_NEAR = 0.01, EDGE_AA = 0.001, LH_SPARE = 0.012;
// The WGL4 characters beyond BIG_W's (code points, so nothing here is a literal the editors could
// mangle): the Windows-1252 extras, Latin Extended-A, Greek, Cyrillic, and the numero sign.
const EXTRA_CHARS = (() => {
  const cps = [0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x2039, 0x2018, 0x2019, 0x201C, 0x201D,
               0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x203A, 0x2116];
  const span = (a, b) => { for (let cp = a; cp <= b; cp++) cps.push(cp); };
  span(0x100, 0x17F);
  span(0x386, 0x386); span(0x388, 0x38A); span(0x38C, 0x38C); span(0x38E, 0x3A1); span(0x3A3, 0x3CE);
  span(0x400, 0x45F); span(0x490, 0x491);
  return [...new Set(cps)].map((cp) => String.fromCodePoint(cp));
})();

const up3 = (x) => Math.ceil(x * 1000 - 1e-6) / 1000;
const near3 = (x) => Math.round(x * 1000) / 1000;
const thou = (x) => Math.round(x * 1000);

async function measureAll(chars) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // css: a face's family, or null for one of the generic families (generic).
    const run = (weight, css, generic) => page.evaluate(([chars, extras, weight, css, generic]) => {
      const font = weight + " 1000px " + (css ? '"' + css + '"' : generic);
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = font; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      const r = {};
      for (const ch of chars) {
        const t = ctx.measureText(ch);
        r[ch] = [t.width, t.actualBoundingBoxLeft, t.actualBoundingBoxRight, t.actualBoundingBoxAscent, t.actualBoundingBoxDescent];
      }
      const h = ctx.measureText("H");
      // Every pair's kerning: what the two together measure beyond their own advances.
      const kern = {};
      for (const a of chars) for (const b of chars) {
        const k = ctx.measureText(a + b).width - r[a][0] - r[b][0];
        if (k > 0.5) kern[a + b] = k;
      }
      // The WGL4 characters: measured only where the face itself draws them (every generic
      // fallback measures them the same).
      const extra = {};
      if (css) for (const ch of extras) {
        const ws = ["monospace", "serif", "sans-serif"].map((fb) => { ctx.font = weight + ' 1000px "' + css + '", ' + fb; return ctx.measureText(ch).width; });
        if (Math.max(...ws) - Math.min(...ws) > 0.01) continue;
        ctx.font = font;
        const t = ctx.measureText(ch);
        extra[ch] = [t.width, t.actualBoundingBoxLeft, t.actualBoundingBoxRight];
      }
      ctx.font = font;
      // Pairs with the space, in laid-out text: canvas measureText doesn't kern across a space.
      if (css) {
        const box = document.createElement("div");
        box.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;white-space:pre;font:" + font;
        document.body.appendChild(box);
        const span = document.createElement("span");
        box.appendChild(span);
        const W = (s) => { span.textContent = s; return span.getBoundingClientRect().width; };
        const sp = W(" ");
        for (const a of chars) {
          if (a === " ") continue;
          const wa = W(a), before = W(a + " ") - wa - sp, after = W(" " + a) - sp - wa;
          if (before > 0.5) kern[a + " "] = before;
          if (after > 0.5) kern[" " + a] = after;
        }
        box.remove();
      }
      return { chars: r, extra, kern, ascent: h.fontBoundingBoxAscent, descent: h.fontBoundingBoxDescent };
    }, [chars, EXTRA_CHARS, weight, css, generic]);
    const out = { arial: await run("700", "Arial"), fallbacks: {} };
    for (const wt of [...new Set(["700", ...FACES.map((f) => f.weight)])]) {
      out.fallbacks[wt] = [await run(wt, null, "serif"), await run(wt, null, "sans-serif"), await run(wt, null, "monospace")];
    }
    for (const f of FACES) out[f.id] = await run(f.weight, f.css);
    return out;
  } finally { await browser.close(); }
}

// The line box of a line height L (in em) puts the baseline (L + a - d) / 2 below its top; the ink
// must stay LH_SPARE inside it, above and below.
function fits(L, a, d, hi, depth) { return hi + LH_SPARE <= (L + a - d) / 2 + 1e-9 && depth + LH_SPARE <= (L - a + d) / 2 + 1e-9; }
// One side of a glyph as an edge entry: listed when its ink comes within `near` of the advance's edge
// (or crosses it; `near` 0: only past `min`), as how far it crosses plus the anti-aliased edge.
function edgeSide(over, near, min) {
  if (near > 0) return over > -near ? up3(Math.max(0, over) + EDGE_AA) : 0;
  return over > min ? up3(over + EDGE_AA) : 0;
}

// The WGL4 characters a face draws wider than `wDefault` (thousandths, rounded up), and their ink
// past the advance beyond `edgeMin` (em, rounded up, with the anti-aliased edge).
function extras(m, wDefault, near, min) {
  const wide = {}, edge = {};
  for (const ch of Object.keys(m.extra)) {
    const [w, l, r] = m.extra[ch].map((x) => x / 1000);
    if (w > wDefault + 1e-9) wide[ch] = Math.ceil(w * 1000 - 1e-6);
    const e = [edgeSide(l, near, min), edgeSide(r - w, near, min)];
    if (e[0] || e[1]) edge[ch] = e;
  }
  return { wide, edge };
}

function derive(face, m, chars) {
  const em = (x) => x / 1000;
  const a = em(m.ascent), d = em(m.descent);
  const c = (ch) => m.chars[ch];
  const adv = (ch) => em(c(ch)[0]), hi = (ch) => em(c(ch)[3]), depth = (ch) => em(c(ch)[4]);
  const w = chars.map((ch) => near3(adv(ch)));
  const wDefault = Math.max(1, ...w);
  const lo = chars.map((ch) => -up3(Math.max(0, depth(ch))));
  const his = chars.map((ch) => up3(Math.max(0, hi(ch))));
  const edge = {};
  for (const ch of chars) {
    if (ch === " ") continue;
    const e = [edgeSide(em(c(ch)[1]), EDGE_NEAR, 0), edgeSide(em(c(ch)[2]) - adv(ch), EDGE_NEAR, 0)];
    if (e[0] || e[1]) edge[ch] = e;
  }
  const capEm = near3(hi("H"));
  // The capitals but Q set the tightest line height; every candidate that fits it is caps-safe.
  const core = CORE_CAPS.split("");
  const lhCaps = LH_CAPS.find((L) => core.every((ch) => fits(+L, a, d, hi(ch), Math.max(0, depth(ch)))));
  if (!lhCaps) throw new Error(face.label + ": no line height up to 1 fits its capitals");
  const caps = CAPS_CANDIDATES.split("").filter((ch) => ch === " " || fits(+lhCaps, a, d, hi(ch), Math.max(0, depth(ch)))).join("");
  const lhText = LH_TEXT.find((L) => chars.every((ch) => fits(+L, a, d, hi(ch), Math.max(0, depth(ch)))));
  if (!lhText) throw new Error(face.label + ": no line height up to 1.5 fits every character");
  const inkSpan = (set) => {
    let top = 0, bot = 0;
    for (const ch of set) { if (ch === " ") continue; top = Math.max(top, hi(ch)); bot = Math.max(bot, Math.max(0, depth(ch))); }
    return up3((top + bot) / 2);
  };
  const capsHalf = inkSpan(caps.split("")), textHalf = inkSpan(chars);
  const side = [+lhCaps / 2, near3(+lhCaps / 2 - capsHalf), +lhText / 2, near3(textHalf + SIDE_TEXT_MARGIN), SIDE_SHIFT_PX];
  const kern = {};
  for (const pair of Object.keys(m.kern).sort()) kern[pair] = Math.ceil(m.kern[pair] - 1e-6);
  const x = extras(m, up3(wDefault), EDGE_NEAR, 0);
  Object.assign(edge, x.edge);
  return { label: face.label, css: face.css, weight: face.weight, capEm, lhCaps, lhText, box: [-up3(d), up3(a)], wDefault: up3(wDefault), side, caps,
    w: w.map(thou), lo: lo.map(thou), hi: his.map(thou), edge, kern, wide: x.wide };
}

function jsString(s) { return JSON.stringify(s); }
function mapOf(o, val) { return "{ " + Object.keys(o).map((k) => jsString(k) + ": " + val(o[k])).join(", ") + " }"; }
function block(chars, tables, arialExtra) {
  const lines = [BEGIN];
  lines.push("  // Measured from Microsoft's own font files in Chromium, canvas measureText at 1000px. The\n");
  lines.push("  // arrays follow FACE_CHARS, in thousandths of an em: w the advance, lo and hi the ink below\n");
  lines.push("  // and above the baseline. See the tool's header for every other field.\n");
  lines.push("  var FACE_CHARS = " + jsString(chars.join("")) + ";\n");
  // Arial Bold's own WGL4 extras: its hand tables stop at Latin-1.
  lines.push("  var FACE_EXTRA_ARIAL = { wide: " + mapOf(arialExtra.wide, String) + ",\n");
  lines.push("    edge: " + mapOf(arialExtra.edge, (v) => "[" + v.join(", ") + "]") + " };\n");
  lines.push("  var FACE_TABLES = {\n");
  const ids = Object.keys(tables);
  ids.forEach((id, k) => {
    const t = tables[id];
    const edge = Object.keys(t.edge).map((ch) => jsString(ch) + ": [" + t.edge[ch].join(", ") + "]").join(", ");
    lines.push("    " + id + ": { label: " + jsString(t.label) + ", css: " + jsString(t.css) + ", weight: " + jsString(t.weight)
      + ", capEm: " + t.capEm + ", lhCaps: " + jsString(t.lhCaps) + ", lhText: " + jsString(t.lhText) + ",\n");
    lines.push("      box: [" + t.box.join(", ") + "], wDefault: " + t.wDefault + ", side: [" + t.side.join(", ") + "], caps: " + jsString(t.caps) + ",\n");
    lines.push("      w: [" + t.w.join(",") + "],\n");
    lines.push("      lo: [" + t.lo.join(",") + "],\n");
    lines.push("      hi: [" + t.hi.join(",") + "],\n");
    lines.push("      edge: { " + edge + " },\n");
    const kern = Object.keys(t.kern).map((p) => jsString(p) + ": " + t.kern[p]).join(", ");
    lines.push("      kern: { " + kern + " },\n");
    lines.push("      wide: " + mapOf(t.wide, String) + " }" + (k < ids.length - 1 ? "," : "") + "\n");
  });
  lines.push("  };\n");
  lines.push(END);
  return lines.join("");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const C = loadCore();
  const chars = Object.keys(C.BIG_W);
  const m = await measureAll(chars);
  // Calibration: Arial Bold's advances, measured here, must be BIG_W's.
  const off = chars.filter((ch) => near3(m.arial.chars[ch][0] / 1000) !== C.BIG_W[ch]);
  if (off.length) {
    console.error("Calibration failed: Arial Bold measures differently from BIG_W for " + off.slice(0, 8).map(jsString).join(" ")
      + ". This browser is not drawing Arial Bold; is the font installed?");
    process.exit(2);
  }
  if (Object.keys(m.arial.kern).length) {
    console.error("Calibration failed: Arial Bold spaces some pairs apart (" + Object.keys(m.arial.kern).slice(0, 8).map(jsString).join(" ")
      + "), which its hand tables assume it never does.");
    process.exit(2);
  }
  const sig = (r) => chars.map((ch) => r.chars[ch][0].toFixed(2)).join(",");
  for (const f of FACES) {
    if (m.fallbacks[f.weight].map(sig).includes(sig(m[f.id]))) {
      console.error(f.label + " is not installed here: it measures as the browser's fallback face.");
      process.exit(2);
    }
  }
  if (args.has("--json")) { process.stdout.write(JSON.stringify(m) + "\n"); return; }
  const tables = {};
  for (const f of FACES) tables[f.id] = derive(f, m[f.id], chars);
  const arialExtra = extras(m.arial, C.BIG_W_DEFAULT, EDGE_NEAR, 0);
  const fresh = block(chars, tables, arialExtra);
  const html = readFileSync(INDEX, "utf8");
  const i = html.indexOf(BEGIN), j = html.indexOf(END);
  if (i < 0 || j < i) {
    console.error("public/index.html has no generated-faces markers; add the two marker lines where the block belongs:\n" + BEGIN + END);
    process.exit(2);
  }
  const current = html.slice(i, j + END.length);
  for (const id of Object.keys(tables)) {
    const t = tables[id];
    console.log(`${t.label.padEnd(16)} capEm ${t.capEm}  lhCaps ${t.lhCaps}  lhText ${t.lhText}  box [${t.box}]  wDefault ${t.wDefault}  side [${t.side}]  caps ${t.caps.length} chars  edges ${Object.keys(t.edge).length}  kern ${Object.keys(t.kern).length}  wide ${Object.keys(t.wide).length}`);
  }
  {
    const wide = Object.keys(arialExtra.wide);
    console.log(`${"Arial Bold".padEnd(16)} beyond Latin-1: wide ${wide.length} (${wide.slice(0, 8).join(" ")}), edges ${Object.keys(arialExtra.edge).length}`);
  }
  if (args.has("--check")) {
    if (current === fresh) { console.log("check passed: the committed face tables are what this machine measures"); return; }
    console.error("check FAILED: the committed face tables differ from what this machine measures (run without --check to rewrite them)");
    process.exit(1);
  }
  if (current === fresh) { console.log("unchanged"); return; }
  writeFileSync(INDEX, html.slice(0, i) + fresh + html.slice(j + END.length));
  console.log("wrote the face tables into public/index.html");
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
