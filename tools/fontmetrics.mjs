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
// also measure differently from the browser's fallback, or the face is missing.
//
// WHAT IT WRITES, per face (in em; the arrays follow FACE_CHARS, in thousandths of an em):
//   w        the advance of each character (rounded to 1/1000 em, as BIG_W is)
//   wDefault what a character the table lacks counts: the widest one listed, at least 1em
//            (BIG_W_DEFAULT's rule: it errs wide)
//   lo, hi   the ink below (negative) and above the baseline, rounded outward
//   edge     ink past the advance (BIG_EDGE's rule): characters whose ink starts more than
//            0.003em left of the pen or ends more than 0.003em past the advance, plus 0.001em
//            for the anti-aliased edge (with that, Arial Bold's f, j and r come out as BIG_EDGE
//            has them)
//   capEm    the ink height of H (BIG_CAP_EM's rule)
//   lhCaps   the tightest of .8 .85 .9 .95 1 at which every capital but Q fits its line box,
//            above and below; the box puts the baseline (L + ascent - descent) / 2 below its top
//            (CSS half-leading). Arial Bold: .8. Comic Sans's capitals dip up to 0.06em below
//            the baseline by design, so it needs .95: a fixed cut-off for "a tail" can't tell
//            them from Arial's Q (0.07em), so the line box decides.
//   caps     the caps-safe characters: BIG_CAPS_SAFE's candidates (the capitals, digits, space
//            and . ! ? ' " & # : / + -), Q included, that fit the line box at lhCaps. Georgia's
//            old-style 3 4 5 7 9 do not, nor does a / that reaches below the baseline.
//   lhText   the tightest of 1.15 1.2 ... 1.5 at which every character listed fits its line box.
//            Arial Bold: 1.15, as BIG_LH_TEXT
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
const EDGE_MIN = 0.003, EDGE_AA = 0.001;

const up3 = (x) => Math.ceil(x * 1000 - 1e-6) / 1000;
const near3 = (x) => Math.round(x * 1000) / 1000;
const thou = (x) => Math.round(x * 1000);

async function measureAll(chars) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const run = (font) => page.evaluate(([chars, font]) => {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = font; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      const r = {};
      for (const ch of chars) {
        const t = ctx.measureText(ch);
        r[ch] = [t.width, t.actualBoundingBoxLeft, t.actualBoundingBoxRight, t.actualBoundingBoxAscent, t.actualBoundingBoxDescent];
      }
      const h = ctx.measureText("H");
      return { chars: r, ascent: h.fontBoundingBoxAscent, descent: h.fontBoundingBoxDescent };
    }, [chars, font]);
    const out = { arial: await run("700 1000px Arial"), fallbacks: [await run("700 1000px serif"), await run("700 1000px sans-serif"), await run("700 1000px monospace")] };
    for (const f of FACES) out[f.id] = await run(`${f.weight} 1000px "${f.css}"`);
    return out;
  } finally { await browser.close(); }
}

// The line box of a line height L (in em) puts the baseline (L + a - d) / 2 below its top.
function fits(L, a, d, hi, depth) { return hi <= (L + a - d) / 2 + 1e-9 && depth <= (L - a + d) / 2 + 1e-9; }

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
    const left = Math.max(0, em(c(ch)[1])), right = Math.max(0, em(c(ch)[2]) - adv(ch));
    if (left > EDGE_MIN || right > EDGE_MIN) edge[ch] = [left > EDGE_MIN ? up3(left + EDGE_AA) : 0, right > EDGE_MIN ? up3(right + EDGE_AA) : 0];
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
  return { label: face.label, css: face.css, weight: face.weight, capEm, lhCaps, lhText, box: [-up3(d), up3(a)], wDefault: up3(wDefault), side, caps,
    w: w.map(thou), lo: lo.map(thou), hi: his.map(thou), edge };
}

function jsString(s) { return JSON.stringify(s); }
function block(chars, tables) {
  const lines = [BEGIN];
  lines.push("  // Measured from Microsoft's own font files in Chromium, canvas measureText at 1000px. The\n");
  lines.push("  // arrays follow FACE_CHARS, in thousandths of an em: w the advance, lo and hi the ink below\n");
  lines.push("  // and above the baseline. See the tool's header for every other field.\n");
  lines.push("  var FACE_CHARS = " + jsString(chars.join("")) + ";\n");
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
    lines.push("      edge: { " + edge + " } }" + (k < ids.length - 1 ? "," : "") + "\n");
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
  const sig = (r) => chars.map((ch) => r.chars[ch][0].toFixed(2)).join(",");
  const fallbackSigs = new Set(m.fallbacks.map(sig));
  for (const f of FACES) {
    if (fallbackSigs.has(sig(m[f.id]))) {
      console.error(f.label + " is not installed here: it measures as the browser's fallback face.");
      process.exit(2);
    }
  }
  if (args.has("--json")) { process.stdout.write(JSON.stringify(m) + "\n"); return; }
  const tables = {};
  for (const f of FACES) tables[f.id] = derive(f, m[f.id], chars);
  const fresh = block(chars, tables);
  const html = readFileSync(INDEX, "utf8");
  const i = html.indexOf(BEGIN), j = html.indexOf(END);
  if (i < 0 || j < i) {
    console.error("public/index.html has no generated-faces markers; add the two marker lines where the block belongs:\n" + BEGIN + END);
    process.exit(2);
  }
  const current = html.slice(i, j + END.length);
  for (const id of Object.keys(tables)) {
    const t = tables[id];
    console.log(`${t.label.padEnd(16)} capEm ${t.capEm}  lhCaps ${t.lhCaps}  lhText ${t.lhText}  box [${t.box}]  wDefault ${t.wDefault}  side [${t.side}]  caps ${t.caps.length} chars  edges ${Object.keys(t.edge).length}`);
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
