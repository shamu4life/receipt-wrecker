#!/usr/bin/env node
// tools/facecheck.mjs — prints every face's Big and Sideways text through the app's own vendored
// receipt page (SassyTP's renderer, the block in public/index.html) in Playwright's Chromium,
// with this machine's fonts, and checks what the bot would print against what the app predicted.
// Dev-only, like the bench: never in CI (CI has none of these fonts) and no test imports it.
//
//   node tools/facecheck.mjs                  every face, 80 and 58 mm
//   node tools/facecheck.mjs --face impact    one face (repeatable)
//   node tools/facecheck.mjs --verbose        every case, not just the summary and the failures
//
// For each message (a packed part, Cheer line first, as Copy sends it) it renders the cheer the
// way the bot does (the page at its print width and dot scale, PrinterBot.render with what a 3.0
// roll printer gets), then lifts #receipt-content's clip (overflow, max-height, contain), so
// ink the box would cut shows, and reads the dark pixels (the bot's own grey < 128) across the
// whole page width over the message box's height:
//   - Big text: the ink must stay inside the message box with at least BIG_MARGIN px each side.
//   - Sideways text: at least SIDE_MARGIN px each side (the app models 6, and keeps 0.5 back for
//     the whole-px centring shift; the bench's rounding takes up to about 1.3px).
//   - The message box's height: what the page laid out against the packer's contentPx: at most
//     1px over, and at most 1px under for big text. Sideways text's length is an upper bound (the
//     model leaves out kerning that tightens), so it may come up short by 20px or 4% of the
//     message, whichever is more: HAPPY over BIRTHDAY kerns 23px shorter in Arial Black, Times
//     New Roman and Trebuchet MS (3.2% in Trebuchet). Short only splits a run a little early.
// A message the card already warns about (a line too wide for the paper at a fixed size, taller
// than the box, too long to send) is held only to "never taller than predicted": its letters are
// cut where the card says, and a too-wide line's height is counted as an upper bound.
// A face this machine doesn't draw (it measures as a fallback) stops the run: the check would be
// of the wrong font.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { loadCore } from "../test/_harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../.render/facecheck");
const PAPER = { 80: { pageW: 272, dotsW: 576 }, 58: { pageW: 181, dotsW: 384 } };
const BIG_MARGIN = 0.5, SIDE_MARGIN = 4.5;
const BIG_TEXTS = ["HELLO", "jiff jog", "Happy birthday", "QUIZ 100%", "WWW MMM", "Ægir ÎÏ", "gjpqy", "THE END",
  "Sphinx of black quartz", "1234567890", "fifty-five?!", "Stuff & Things"];
const SIDE_TEXTS = ["HELLO", "jumping", "Happy birthday", "HAPPY\nBIRTHDAY", "gg", "QUIZ", "fluff", "1, 2; 3"];

function parseArgs(argv) {
  const o = { faces: [], verbose: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--face") o.faces.push(argv[++i]);
    else if (argv[i] === "--verbose") o.verbose = true;
    else { console.error("usage: node tools/facecheck.mjs [--face ID]... [--verbose]"); process.exit(2); }
  }
  return o;
}

// The vendored receipt page, as the app loads it: the inert block's text with the backslash
// taken back out of every closing script tag (RW-EDIT 3).
function rendererHtml() {
  const html = readFileSync(join(HERE, "../public/index.html"), "utf8");
  const m = /<script type="text\/plain" id="sassytp-renderer"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("no vendored renderer block in public/index.html");
  return m[1].replace(/<\\\/script/gi, "</script");
}

function inkBox(rgba, W, H, x0, y0, x1, y1) {
  let l = Infinity, t = Infinity, r = -1, b = -1;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
    const p = (y * W + x) * 4;
    if (((rgba[p] * 77 + rgba[p + 1] * 151 + rgba[p + 2] * 28) >> 8) < 128) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  }
  return r < 0 ? null : { left: l, top: t, right: r + 1, bottom: b + 1 };
}

function cases(C, face) {
  const out = [];
  for (const paperMm of [80, 58]) {
    const k = C.stackContext({ cheer: true, bits: 100, noNonce: true, hrThreshold: 25, paperMm });
    const o = { budget: k.budget, heightPx: k.room, contentW: k.contentW, face };
    const warnedBody = (b) => { const r = b.big || b.side; return !!r && (!r.fits || r.tall || r.over); };
    const add = (what, bodies) => C.packStackBodies(bodies, k).forEach((p, i) => out.push({ paperMm, what: what + (i ? " part " + (i + 1) : ""), part: p,
      side: /^side/.test(what), warned: p.bodies.some(warnedBody) }));
    for (const t of BIG_TEXTS) {
      for (const [layout, size] of [["lines", "fit1"], ["lines", "width"], ["wrap", "fit1"], ["auto", "fit1"], ["each", "fit1"], ["lines", 48]]) {
        add("big " + layout + " " + size + " " + JSON.stringify(t), C.buildBigBodies(t, { ...o, layout, size }));
      }
      add("big flipped " + JSON.stringify(t), C.buildBigBodies(t, { ...o, layout: "lines", size: "fit1", flip: true }));
    }
    for (const t of SIDE_TEXTS) for (const dir of ["down", "up"]) for (const size of ["fit1", "width"]) {
      add("side " + dir + " " + size + " " + JSON.stringify(t), C.buildSideBodies(t, { ...o, dir, size }));
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const C = loadCore();
  const ids = args.faces.length ? args.faces : [...C.FACE_IDS];
  for (const id of ids) if (C.faceOf(id).id !== id) { console.error("no face " + JSON.stringify(id)); process.exit(2); }
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, "renderer.html");
  writeFileSync(file, rendererHtml());
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const paperMm of [80, 58]) {
      const { pageW, dotsW } = PAPER[paperMm], dsf = dotsW / pageW;
      const ctx = await browser.newContext({ viewport: { width: pageW, height: 5000 }, deviceScaleFactor: dsf });
      await ctx.route("**/*", (r) => (r.request().url().startsWith("file:") ? r.continue() : r.abort()));
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
      await page.waitForFunction(() => window.PrinterBot && window.PrinterBot.ready === true, null, { timeout: 10000 });
      for (const id of ids) {
        const face = C.faceOf(id);
        // Does this machine draw the face? (The same test the card makes.)
        const drawn = await page.evaluate((f) => {
          const c = document.createElement("canvas").getContext("2d"), t = "HELLO world 0123 mmmWWWiii";
          return ["monospace", "serif", "sans-serif"].some((fb) => {
            c.font = f.weight + " 40px " + fb; const plain = c.measureText(t).width;
            c.font = f.weight + ' 40px "' + f.css + '", ' + fb; return Math.abs(c.measureText(t).width - plain) > 0.5;
          });
        }, { weight: face.weight, css: face.css });
        if (!drawn) { console.error(face.label + " is not installed here: this check would measure another font."); process.exit(2); }
        const all = cases(C, id).filter((c) => c.paperMm === paperMm);
        const stats = { n: 0, warned: 0, bigL: Infinity, bigR: Infinity, sideL: Infinity, sideR: Infinity, over: 0, under: 0, fails: [] };
        for (const c of all) {
          const r = await page.evaluate(async ({ message }) => {
            const res = await window.PrinterBot.render({ __source: "TwitchCheer", bits: 100, user: "viewer", message },
              { highRollerBits: 25, highRollerBitsPerInch: 0, highRollerMaxInches: 0, hideLinks: false, allowHighRoller: true, pxPerInch: 96 });
            const box = document.getElementById("receipt-content");
            box.style.overflow = "visible"; box.style.maxHeight = "none"; box.style.contain = "none";
            await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
            const rc = box.getBoundingClientRect(), part = box.querySelector(".part");
            return { ok: res && res.ok, security: (res && res.security) || [], raw: !!(part && part.classList.contains("raw")),
                     box: { x: rc.x, y: rc.y, right: rc.right, bottom: rc.bottom, height: rc.height }, page: document.documentElement.scrollHeight };
          }, { message: c.part.payload });
          if (!r.ok || r.security.length || !r.raw) { stats.fails.push(c.what + ": render " + JSON.stringify(r).slice(0, 160)); continue; }
          const shot = await page.screenshot({ clip: { x: 0, y: r.box.y, width: pageW, height: Math.max(1, r.box.height) }, type: "png" });
          const img = decodePng(shot);
          const k = inkBox(img.rgba, img.w, img.h, 0, 0, img.w, img.h);
          stats.n++;
          // The message box's own height (the lead's line is inside it) against the packer's.
          const dh = r.box.height - c.part.contentPx;
          if (dh > 1.01) { stats.over++; stats.fails.push(c.what + ": " + r.box.height.toFixed(2) + "px laid out, predicted " + c.part.contentPx); }
          if (!c.warned && dh < (c.side ? -Math.max(20, 0.04 * c.part.contentPx) - 0.01 : -1.01)) { stats.under++; stats.fails.push(c.what + ": " + r.box.height.toFixed(2) + "px laid out, predicted " + c.part.contentPx); }
          if (!k || c.warned) { if (c.warned) stats.warned++; continue; }
          const left = k.left / dsf - r.box.x, right = r.box.right - k.right / dsf;
          const min = c.side ? SIDE_MARGIN : BIG_MARGIN;
          if (c.side) { stats.sideL = Math.min(stats.sideL, left); stats.sideR = Math.min(stats.sideR, right); }
          else { stats.bigL = Math.min(stats.bigL, left); stats.bigR = Math.min(stats.bigR, right); }
          if (left < min || right < min) stats.fails.push(c.what + ": ink " + left.toFixed(1) + "px from the left edge, " + right.toFixed(1) + "px from the right");
          if (args.verbose) console.log(paperMm + " " + face.label + " " + c.what + ": edges " + left.toFixed(1) + " / " + right.toFixed(1) + ", height " + dh.toFixed(2));
        }
        const f = (x) => (x === Infinity ? "-" : x.toFixed(1));
        console.log(`${String(paperMm).padEnd(3)} ${face.label.padEnd(16)} ${String(stats.n).padStart(4)} messages (${stats.warned} warned on the card) · big edges ${f(stats.bigL)} / ${f(stats.bigR)}px · sideways ${f(stats.sideL)} / ${f(stats.sideR)}px · heights over ${stats.over}, under ${stats.under}`
          + (stats.fails.length ? " · " + stats.fails.length + " FAIL" : ""));
        for (const x of stats.fails.slice(0, 12)) console.log("      " + x);
        if (stats.fails.length > 12) console.log("      … and " + (stats.fails.length - 12) + " more");
        failures += stats.fails.length;
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(failures ? failures + " failures" : "every face prints inside the box at the heights predicted");
  process.exit(failures ? 1 : 0);
}

// PNG -> RGBA, as tools/forkbench.mjs decodes its screenshots (no dependency).
function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
    let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off), kind = buf.toString("latin1", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
        if (kind === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
        else if (kind === "IDAT") idat.push(data);
        else if (kind === "IEND") break;
        off += 12 + len;
    }
    const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
    if (depth !== 8 || !bpp || interlace) throw new Error("unsupported PNG (depth " + depth + ", colour type " + type + ", interlace " + interlace + ")");
    const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp;
    const px = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = (x >= bpp && y) ? px[dst - stride + x - bpp] : 0;
            let v = raw[src + x];
            if (f === 1) v += a;
            else if (f === 2) v += b;
            else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            px[dst + x] = v & 0xff;
        }
    }
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const s = i * bpp, d = i * 4;
        if (type === 0) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = 255; }
        else if (type === 4) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = px[s + 1]; }
        else { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = type === 6 ? px[s + 3] : 255; }
    }
    return { w, h, rgba };
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
