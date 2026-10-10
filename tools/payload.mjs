// Emit a cheer message built by the app's OWN pure core, for tools/forkbench.mjs to render through
// SassyTP printer-bot's real receipt page.
//
// The point is that the bench measures what the app really sends. Hand-writing the markup for a
// bench case is how you end up measuring a page the app would never produce and then writing the
// result into CLAUDE.md as though it meant something. Every kind below goes through the app's
// builder AND its packer, so the lead (or a plain part's trailing token), the split into cheers
// and the size are the app's.
//
// Usage:
//   node tools/payload.mjs '<json spec>' | node tools/forkbench.mjs <the flags it prints>
//   node tools/payload.mjs spec.json | npm run bench -- --out .render/forkbench/case.png
//
// The forkbench flags that match the spec (bits, threshold, bits per inch, maximum length,
// paper) are printed on stderr: give the bench the same ones, or its High Roller decision and
// box will not be the ones the app sized the message for.
//
// Fields every kind takes (all optional):
//   "paper": 80|58            roll width (default 80)
//   "bits": 100               the cheer's bits, any whole number from 1 up
//   "threshold": 25           the streamer's High Roller threshold (0 = never)
//   "bpi": 0, "maxin": 0      the streamer's bits-per-inch limit and maximum length (inches)
//   "cheer": true             false = the free chat-test message (LEAD_GUARD, no token)
//   "nonce": false            the app's "Add a repeat number" toggle, off by default like the app's
//   "part": 0                 which part (cheer) to emit, 0-based; the count goes to stderr
//
// Kinds:
//   {"kind":"big","text":"HELLO","layout":"auto|lines|stack|each","size":"fit1|width"|px,"flip":false}
//   {"kind":"side","text":"HELLO","dir":"down|up","size":"fit1|width"|px}
//   {"kind":"glyph","tier":"cjk|ascii|asciifull|safe|braille","cols":16,
//    "picture":"disc|ring|smiley|heart","dither":true,"invert":false}
//        A built-in test picture (drawn here in plain JS), sampled and quantized by the app's own
//        pure core (sampleLuma, ditherFloydSteinberg, quantizeTone, lumaToDots, packBraille) at
//        the app's rows for that form; the grid then goes through the app's builder. Only the
//        picture is the bench's: the payload's shape is the app's.
//   {"kind":"plain","text":"HI"}         Design T Han tiling. The text is rasterized by the app's
//        own canvas code (designTTextGrid, in the browser glue), run in Playwright's Chromium,
//        so this one needs Chromium like forkbench does.
//   {"kind":"plain","picture":"heart","cols":13}   a Design T picture (pure, no browser)
//        Plain kinds build the form the app builds for these settings: plain below the
//        threshold (the default bits for "plain" is threshold - 1), High Roller at or above it.
//   {"kind":"hrprobe"}      the High Roller test (bits = the threshold)
//   {"kind":"plainprobe"}   the Plain test (bits = threshold - 1)
//   {"kind":"raw","html":"<b>anything</b>","lead":true}   escape hatch ("lead" adds the app's lead)
import { readFileSync, existsSync } from "node:fs";
import { loadCore } from "../test/_harness.mjs";

const C = loadCore();
const arg = process.argv[2];
if (!arg) {
  console.error("usage: node tools/payload.mjs '<json>'|<spec.json>  [ | node tools/forkbench.mjs ]");
  process.exit(2);
}
let spec;
try {
  spec = JSON.parse(existsSync(arg) ? readFileSync(arg, "utf8") : arg);
} catch (e) {
  console.error("could not parse the spec as JSON: " + e.message);
  process.exit(2);
}
const say = (s) => console.error("[payload] " + s);

const threshold = C.hrThresholdOf(spec.threshold);
const paperMm = C.paperSpec(spec.paper).mm;
let bits = C.cheerBits(spec.bits);
if (spec.kind === "plain" && spec.bits == null && threshold > 1) bits = threshold - 1;
if (spec.kind === "hrprobe") bits = C.buildHighRollerProbe({ hrThreshold: threshold, bits }).bits;
if (spec.kind === "plainprobe") bits = C.buildPlainProbe({ hrThreshold: threshold }).bits;
const settings = { cheer: spec.cheer !== false, bits, noNonce: spec.nonce !== true, hrThreshold: threshold,
                   bitsPerInch: spec.bpi, maxInches: spec.maxin, paperMm };
const k = C.stackContext(settings);
const bopts = { budget: k.budget, heightPx: k.room, contentW: k.contentW, paperMm };

// ── built-in test pictures: an RGBA buffer drawn with plain maths ──
function picture(name, W, H) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W * 2 - 1, v = (y + 0.5) / H * 2 - 1, d = Math.hypot(u, v);
      let lum = 255;
      if (name === "ring") lum = d > 0.55 && d < 0.85 ? 0 : 255;
      else if (name === "heart") {
        const a = u * 1.15, b = -v * 1.15 + 0.25;
        lum = Math.pow(a * a + b * b - 0.5, 3) - a * a * b * b * b <= 0 ? 0 : 255;
      } else if (name === "smiley") {
        const eye = Math.hypot(Math.abs(u) - 0.33, v + 0.3) < 0.13;
        const mouth = d > 0.45 && d < 0.6 && v > 0.15;
        lum = d < 0.9 && !eye && !mouth ? 40 : 255;
        if (d >= 0.82 && d < 0.9) lum = 0;
      } else lum = d < 0.85 ? Math.round(255 * Math.min(1, d / 0.85) * 0.9) : 255;   // "disc": a shaded ball
      const i = (y * W + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = lum; px[i + 3] = 255;
    }
  }
  return px;
}
function pictureGrid(tier, cols, aspect, o) {
  const W = 240, H = 240, px = picture(o.picture || "disc", W, H);
  const t = C.getTier(tier);
  if (t.kind === "braille") {
    const fineCols = cols * 2, fineRows = Math.max(4, Math.round(fineCols * H / W));
    return C.packBraille(C.lumaToDots(C.sampleLuma(px, W, H, fineCols, fineRows), { invert: !!o.invert }));
  }
  const rows = C.gridRows(cols, W, H, aspect);
  let luma = C.sampleLuma(px, W, H, cols, rows);
  if (o.dither !== false) luma = C.ditherFloydSteinberg(luma, t.ramp.length);
  return C.quantizeTone(luma, t.ramp, { invert: !!o.invert });
}
// Design T Han tiling needs the app's canvas code: run its own script in Chromium, with a hook
// added at the one place the glue ends, and call designTTextGrid there.
async function hanTilingGrid(text, mm) {
  const { chromium } = await import("playwright");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  const anchor = 'document.addEventListener("DOMContentLoaded", init);';
  if (!m || !m[1].includes(anchor)) throw new Error("could not find the app's script or its init hook");
  const src = m[1].replace(anchor, "window.__rwGlue = { designTTextGrid: designTTextGrid }; " + anchor);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (r) => r.abort());
    await page.setContent("<!doctype html><meta charset=utf-8><body></body>");
    await page.addScriptTag({ content: src });
    return await page.evaluate(([t, p]) => window.__rwGlue.designTTextGrid(t, p, 700), [text, mm]);
  } finally {
    await browser.close();
  }
}

let bodies, html, note = "";
switch (spec.kind) {
  case "big":
    bodies = C.buildBigBodies(String(spec.text ?? ""), { ...bopts, layout: spec.layout, size: spec.size, flip: spec.flip === true });
    if (bodies[0].big.px) {
      const g = bodies[0].big;
      say("big: layout " + g.layout + ", " + (g.pxs ? "sizes " + g.pxs.filter(Boolean).join("/") : g.px + "px") + "/" + g.lh
        + (g.flip ? ", upside down" : "") + ", gap " + g.gap + ", capitals " + g.capCm.toFixed(2) + " cm"
        + (g.fits ? "" : ", TOO WIDE: " + JSON.stringify(g.overflowText)) + "; " + g.cheers + " cheer(s)");
    }
    break;
  case "side":
    bodies = C.buildSideBodies(String(spec.text ?? ""), { ...bopts, dir: spec.dir, size: spec.size });
    if (bodies[0].side.px) {
      const g = bodies[0].side;
      say("side: " + g.dir + ", " + g.px + "px/" + g.lh + " (width rule " + g.maxPx + "), " + g.columns + " column(s), "
        + g.lengthCm.toFixed(1) + " cm down the tape" + (g.fits ? "" : ", TOO MANY LINES") + "; " + g.cheers + " cheer(s)");
    }
    break;
  case "glyph": {
    const tier = spec.tier || "cjk", form = C.glyphForm(tier), cols = C.glyphCols(form, spec.cols ?? (form === "cjk" ? 16 : 24), paperMm);
    const grid = pictureGrid(tier, cols, C.GLYPH_ASPECT[form] || 1, spec);
    say("glyph: tier " + tier + " (" + form + "), " + grid[0].length + " x " + grid.length + " cells of " + (spec.picture || "disc"));
    bodies = C.buildGlyphBodies(tier, grid, bopts);
    break;
  }
  case "plain": {
    const o = { mode: k.mode, paperMm, cheer: k.cheer, bits, noNonce: k.noNonce, limitPx: k.limit.px };
    if (spec.text != null) {
      const grid = await hanTilingGrid(String(spec.text), paperMm);
      say("plain: Han tiling of " + JSON.stringify(spec.text) + ", " + grid[0].length + " x " + grid.length + " cells, " + k.mode + " form");
      bodies = C.buildDesignT(grid, o);
    } else {
      const cols = C.designTPictureCols(paperMm);
      const grid = pictureGrid("cjk", cols, C.GLYPH_ASPECT.plain, { ...spec, dither: false });
      say("plain: picture " + (spec.picture || "disc") + ", " + cols + " x " + grid.length + " cells, " + k.mode + " form");
      bodies = C.buildDesignTPicture(grid, o);
    }
    break;
  }
  case "hrprobe": {
    const p = C.buildHighRollerProbe({ hrThreshold: threshold, bits, paperMm });
    bodies = p.bodies; note = p.note;
    break;
  }
  case "plainprobe": {
    const p = C.buildPlainProbe({ hrThreshold: threshold, paperMm, noNonce: k.noNonce });
    bodies = p.bodies; note = p.note;
    break;
  }
  case "raw":
    html = String(spec.html || "");
    if (spec.lead) html = C.packStackBodies([{ html, chars: C.payloadLength(html), heightPx: 0 }], settings)[0].payload;
    break;
  default:
    console.error("unknown kind: " + JSON.stringify(spec.kind) + " — expected big, side, glyph, plain, hrprobe, plainprobe or raw");
    process.exit(2);
}

if (bodies) {
  const parts = C.packStackBodies(bodies, k);
  const idx = spec.part == null ? 0 : Number(spec.part);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parts.length) {
    console.error("part " + JSON.stringify(spec.part) + " does not exist: this packs into " + parts.length + " part(s), numbered from 0");
    process.exit(2);
  }
  html = parts[idx].payload;
  say(parts.length + " part(s): " + parts.map((p, i) => (i === idx ? "[" : "") + p.chars + " chars, "
    + (Math.round(p.contentPx * 100) / 100) + "px" + (i === idx ? "]" : "")).join("; ")
    + " — box " + k.limit.px + "px (" + k.limit.by + "), mode " + (parts[idx].alone ? "plain part" : k.mode));
  if (note) say("note: " + note);
}
say("forkbench flags: --paper " + paperMm + " --bits " + bits + " --threshold " + threshold
  + (C.bitsPerInchOf(spec.bpi) ? " --bits-per-inch " + C.bitsPerInchOf(spec.bpi) : "")
  + (C.maxInchesOf(spec.maxin) ? " --max-inches " + C.maxInchesOf(spec.maxin) : ""));
process.stdout.write(html);
if (process.stdout.isTTY) process.stdout.write("\n");
say(Array.from(html).length + " chars of " + C.MAX_CHARS + (Array.from(html).length > C.MAX_CHARS ? "  — OVER, Twitch would reject this" : ""));
