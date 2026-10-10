#!/usr/bin/env node
// tools/forkbench.mjs: render one Twitch cheer through SassyTP printer-bot's REAL receipt page
// (v/2.5.0/renderer.html) in headless Chromium, the way the bot's Streamer.bot action drives it in
// headless Edge, and report what would print.
//
// How the bot prints (printer-bot 2.5.4, verified against its source): the action opens the
// receipt page in headless Edge with a 272 x 5000 CSS px viewport on 80 mm paper (181 px on
// 58 mm) at deviceScaleFactor 576/272 (384/181), calls PrinterBot.render(event, options),
// screenshots the height render() returns, converts it to 8-bit grey ((77R + 151G + 28B) >> 8),
// dithers it to 1 bit (Floyd-Steinberg by default; Atkinson; or a plain < 128 threshold) and
// sends the dots to the printer as an ESC/POS raster on a continuous roll. The cheer's chat text
// is passed to the page untouched; the page alone decides whether it is a High Roller message
// (styled HTML, through its sanitizer) or plain text.
//
// This tool does the same, minus the printer:
//   1. loads the renderer page as a file:// page (yours with --renderer, or by default the copy
//      fetched from GitHub at the PINNED commit below and cached under the gitignored
//      .render/sassytp/, with its sha256 checked against the one recorded here);
//   2. blocks EVERY request that is not file:// (data: URLs never reach the router), so the page
//      is offline and inert. The event carries no userName, so no avatar lookup starts. The
//      page's own Content-Security-Policy stays in force;
//   3. renders the event, measures the receipt in the page, screenshots it exactly as the bot
//      does, and dithers it with a line-for-line port of the bot's C# Ditherer (forkDither below).
//
// Writes:  <out>.png        the screenshot, clipped to the height render() returns (576 or 384
//                           device px wide: the printer's dots)
//          <out>-1bit.png   that screenshot dithered to 1 bit the way the bot does it, i.e. the dots
//                           the printer burns
//          <out>.json       the JSON report (also printed to stdout as ONE line)
//
// Usage:
//   node tools/forkbench.mjs --message 'Cheer100 <div style="font:700 60px/.8 Arial">BIG</div>'
//   node tools/payload.mjs '<spec>' | node tools/forkbench.mjs --paper 58 --out .render/forkbench/x.png
//   npm run bench -- --message 'Cheer25 hi' --bits 25
//
// Flags:
//   --message TEXT | --message-file FILE   the chat message (otherwise stdin; one trailing newline
//                                          is dropped from a file or stdin)
//   --bits N              the cheer's bits (default 100)
//   --threshold N         the streamer's High Roller threshold, highRollerBits (default 25; 0 = never)
//   --bits-per-inch N     the streamer's High Roller bits-per-inch limit (default 0 = off)
//   --max-inches N        the streamer's High Roller maximum length in inches (default 0 = off)
//   --paper 80|58         roll width in mm (default 80): page 272 or 181 CSS px, 576 or 384 dots
//   --dither floyd|atkinson|threshold      the bot's dither setting (default floyd)
//   --user NAME           the header's sender (default Viewer)
//   --theme-file FILE     the streamer's theme.css (PrinterBot.setTheme)
//   --hide-links          the bot's hideLinks option
//   --renderer PATH       render this renderer.html instead of the pinned copy
//   --offline             never touch the network: the pinned copy must already be cached
//   --fonts DIR           add YOUR OWN font folder (e.g. Segoe UI copied from C:\Windows\Fonts) on
//                         top of the system fonts, through a fontconfig file under .render/fonts/.
//                         Never downloads a font.
//   --out FILE.png        default .render/forkbench/receipt.png
//   --pretty              pretty-print the JSON on stdout
//
// Exit status: 0 rendered; 1 the render failed; 2 usage or environment (no renderer, no cache
// under --offline, a fetched file with the wrong sha256, no Chromium). The reason is the "error"
// field of the one-line JSON on stdout.
//
// Fonts: a Linux bench usually has no Segoe UI, so the first face in the receipt's font stack that
// exists here is used (the report names it under "fonts"); metrics differ a little from the rig.
// Text the app pins to Arial lands on Liberation Sans, which has Arial's metrics.
//
// Licence: printer-bot is MIT-licensed (Copyright (c) 2026 SassyTP). This tool fetches the page at
// run time and never commits the upstream page verbatim; do not add it (or any font) to this repo.
// The one sanctioned copy is the edited block tools/vendor-renderer.mjs writes into
// public/index.html. forkDither below is a port of the bot's C# Ditherer and carries the licence
// notice with it.
// Dev-only: not part of `npm test` or CI, and no test imports this file.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

// The printer-bot commit this bench is pinned to (2.5.4), and the sha256 of its renderer page.
// A fetched copy that does not match is refused rather than measured.
const PINNED_SHA = "b9f12b0cbaf680b01d4e72fb96b3d5e9aa0aa0ef";
const RENDERER_PATH = "v/2.5.0/renderer.html";
const RENDERER_SHA256 = "51b1f93f901c6b0895b428b697bc02cf19280049c0346f4d5aac172cc0c6bdff";
const RENDERER_URL = "https://raw.githubusercontent.com/SassyTP/printer-bot/" + PINNED_SHA + "/" + RENDERER_PATH;
const CACHE_DIR = join(REPO, ".render", "sassytp", PINNED_SHA);
const CACHE_FILE = join(CACHE_DIR, RENDERER_PATH);
const CACHE_NOTE = CACHE_FILE + ".json";
const DEFAULT_OUT = join(REPO, ".render", "forkbench", "receipt.png");

// Paper geometry, from the bot's routine: the page is laid out at 96 CSS px per inch of printed
// width (72 mm on an 80 mm roll, 48 mm on 58 mm) and screenshotted at the printer's dot width.
const PAPER = {
    80: { pageW: 272, dotsW: 576 },
    58: { pageW: 181, dotsW: 384 },
};
const PAGE_H = 5000;          // the bot lays the receipt out in a 5000 px tall window
const DOTS_PER_MM = 8;        // 203 dpi

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

class Exit extends Error {
    constructor(code, msg) { super(msg); this.code = code; }
}
function usage(msg) {
    throw new Exit(2, (msg ? msg + ". " : "") +
        "usage: node tools/forkbench.mjs [--message TEXT | --message-file FILE | < stdin] [--bits 100] [--threshold 25] " +
        "[--bits-per-inch N] [--max-inches N] [--paper 80|58] [--dither floyd|atkinson|threshold] [--user NAME] " +
        "[--theme-file FILE] [--hide-links] [--renderer PATH] [--offline] [--fonts DIR] [--out FILE.png] [--pretty]");
}

function dropOneNewline(s) {
    if (s.endsWith("\r\n")) return s.slice(0, -2);
    if (s.endsWith("\n")) return s.slice(0, -1);
    return s;
}

function parseArgs(argv) {
    const o = { bits: 100, threshold: 25, maxInches: 0, bitsPerInch: 0, user: "Viewer", out: DEFAULT_OUT, dither: "floyd",
                hideLinks: false, renderer: null, offline: false, pretty: false, message: null, themeCss: "", fontsDir: null, paper: 80 };
    const num = (flag, v) => {
        const n = Number(v);
        if (v === undefined || v === "" || !Number.isFinite(n)) usage(flag + " needs a number");
        return n;
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i], v = argv[i + 1];
        switch (a) {
            case "--message": if (v === undefined) usage("--message needs a value"); o.message = v; i++; break;
            case "--message-file":
                if (!v || !existsSync(v)) usage("--message-file needs an existing file");
                o.message = dropOneNewline(readFileSync(v, "utf8")); i++; break;
            case "--bits": o.bits = num(a, v); i++; break;
            case "--threshold": o.threshold = num(a, v); i++; break;
            case "--max-inches": o.maxInches = num(a, v); i++; break;
            case "--bits-per-inch": o.bitsPerInch = num(a, v); i++; break;
            case "--paper": {
                const p = num(a, v);
                if (!PAPER[p]) usage("--paper is 80 or 58");
                o.paper = p; i++; break;
            }
            case "--user": if (v === undefined) usage("--user needs a value"); o.user = v; i++; break;
            case "--out": if (!v) usage("--out needs a path"); o.out = resolve(v); i++; break;
            case "--theme-file":
                if (!v || !existsSync(v)) usage("--theme-file needs an existing file");
                o.themeCss = readFileSync(v, "utf8"); i++; break;
            case "--dither":
                if (!["floyd", "atkinson", "threshold"].includes(v)) usage("--dither is floyd, atkinson or threshold");
                o.dither = v; i++; break;
            case "--renderer": if (!v) usage("--renderer needs a path"); o.renderer = resolve(v); i++; break;
            case "--offline": o.offline = true; break;
            case "--fonts":
                if (!v || !existsSync(v)) usage("--fonts needs an existing folder (your own copy of Segoe UI, e.g. segoeui.ttf + segoeuib.ttf)");
                o.fontsDir = resolve(v); i++; break;
            case "--hide-links": o.hideLinks = true; break;
            case "--pretty": o.pretty = true; break;
            case "-h": case "--help": usage();
            default: usage("unknown argument " + a);
        }
    }
    if (!o.out.toLowerCase().endsWith(".png")) o.out += ".png";
    return o;
}

async function readStdin() {
    if (process.stdin.isTTY) usage("give --message, --message-file or a message on stdin");
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return dropOneNewline(Buffer.concat(chunks).toString("utf8"));
}

// ---- the renderer page: --renderer, or the pinned copy from the cache / GitHub --------------------
async function resolveRenderer(o) {
    if (o.renderer) {
        if (!existsSync(o.renderer)) throw new Exit(2, "renderer not found: " + o.renderer);
        const buf = readFileSync(o.renderer);
        return { file: o.renderer, source: "local", sha256: sha256(buf), pinned: sha256(buf) === RENDERER_SHA256 };
    }
    if (existsSync(CACHE_FILE)) {
        const buf = readFileSync(CACHE_FILE);
        if (sha256(buf) === RENDERER_SHA256) {
            let note = null;
            try { note = JSON.parse(readFileSync(CACHE_NOTE, "utf8")); } catch { /* the note is informational */ }
            return { file: CACHE_FILE, source: "cache", url: RENDERER_URL, commit: PINNED_SHA, sha256: RENDERER_SHA256,
                     fetched_at: note && note.fetched_at, pinned: true };
        }
        if (o.offline) throw new Exit(2, "the cached renderer no longer matches its pinned sha256 (" + CACHE_FILE + "); run once without --offline to fetch it again");
    } else if (o.offline) {
        throw new Exit(2, "--offline, but the pinned renderer is not cached yet (" + CACHE_FILE + "); run once without --offline");
    }
    let res;
    try {
        res = await fetch(RENDERER_URL, { signal: AbortSignal.timeout(30000) });
    } catch (e) {
        const hint = process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY
            ? " (behind a proxy? Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1)" : "";
        throw new Exit(2, "could not fetch " + RENDERER_URL + ": " + String(e && e.cause || e).slice(0, 200) + hint);
    }
    if (!res.ok) throw new Exit(2, "could not fetch " + RENDERER_URL + ": HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== RENDERER_SHA256) throw new Exit(2, "the fetched renderer's sha256 is " + got + ", not the pinned " + RENDERER_SHA256 + "; refusing to measure it");
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, buf);
    const note = { url: RENDERER_URL, commit: PINNED_SHA, path: RENDERER_PATH, sha256: got, bytes: buf.length, fetched_at: new Date().toISOString() };
    writeFileSync(CACHE_NOTE, JSON.stringify(note, null, 2) + "\n");
    return { file: CACHE_FILE, source: "fetched", url: RENDERER_URL, commit: PINNED_SHA, sha256: got, fetched_at: note.fetched_at, pinned: true };
}

// ---- the bot's dither: a line-for-line port of printer-bot 2.5.4's C# Ditherer ---------------------
// Ported from SassyTP's printer-bot (https://github.com/SassyTP/printer-bot), under its licence:
//
//   MIT License
//
//   Copyright (c) 2026 SassyTP
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// (plus DecodePngToGray's luma). Integer arithmetic and arithmetic right shifts, exactly as the C#.
// rgba: the screenshot's RGBA bytes, w x h. outWidth: 576 (80 mm) or 384 (58 mm).
// mode: "floyd" | "atkinson" | "threshold". The diffusion modes force >= 250 to white and <= 5 to
// black without spreading any error. Returns Uint8Array(outWidth * h), 1 = a burnt (black) dot.
function forkDither(rgba, w, h, outWidth, mode) {
    const gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
        let l = (rgba[p] * 77 + rgba[p + 1] * 151 + rgba[p + 2] * 28) >> 8;
        const a = rgba[p + 3];
        if (a !== 255) l = 255 - (((255 - l) * a / 255) | 0);
        gray[i] = l;
    }
    const out = new Uint8Array(outWidth * h), n = Math.min(w, outWidth), pw = outWidth + 4;
    let a0 = new Int32Array(pw), a1 = new Int32Array(pw), a2 = new Int32Array(pw), t;
    const thr = mode === "threshold", atk = mode === "atkinson";
    for (let y = 0; y < h; y++) {
        const go = y * w, bo = y * outWidth;
        let x, v, err, e;
        if (thr) {
            for (x = 0; x < n; x++) if (gray[go + x] < 128) out[bo + x] = 1;
        } else if (atk) {
            let next1 = 0, next2 = 0;
            for (x = 0; x < n; x++) {
                v = gray[go + x];
                if (v >= 250) { next1 = next2; next2 = 0; }
                else if (v <= 5) { out[bo + x] = 1; next1 = next2; next2 = 0; }
                else {
                    v += a0[x + 2] + next1;
                    if (v < 128) { out[bo + x] = 1; err = v; } else err = v - 255;
                    if (err !== 0) { e = err >> 3; next1 = next2 + e; next2 = e; a1[x + 1] += e; a1[x + 2] += e; a1[x + 3] += e; a2[x + 2] += e; }
                    else { next1 = next2; next2 = 0; }
                }
            }
        } else {
            let carry = 0;
            for (x = 0; x < n; x++) {
                v = gray[go + x];
                if (v >= 250) carry = 0;
                else if (v <= 5) { out[bo + x] = 1; carry = 0; }
                else {
                    v += a0[x + 2] + carry;
                    if (v < 128) { out[bo + x] = 1; err = v; } else err = v - 255;
                    if (err !== 0) { carry = (err * 7) >> 4; a1[x + 1] += (err * 3) >> 4; a1[x + 2] += (err * 5) >> 4; a1[x + 3] += err >> 4; }
                    else carry = 0;
                }
            }
        }
        t = a0; a0 = a1; a1 = a2; a2 = t; a2.fill(0);
    }
    return out;
}

// ---- a minimal PNG codec (8-bit greyscale/RGB(A) in, 1-bit greyscale out), so no dependency -------
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
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
function encodePng1bit(w, h, dots) {
    const stride = Math.ceil(w / 8), raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
        const row = y * (stride + 1);
        for (let x = 0; x < w; x++) if (!dots[y * w + x]) raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7);   // 1 = white in a greyscale PNG
    }
    const chunk = (kind, data) => {
        const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(kind, 4, "latin1");
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
        return Buffer.concat([head, data, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 1; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---- in the renderer page, after render(): plain DOM reads only -----------------------------------
function measureInPage() {
    const r2 = (n) => Math.round(n * 100) / 100;
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r2(r.x), y: r2(r.y), width: r2(r.width), height: r2(r.height), bottom: r2(r.bottom), right: r2(r.right) }; };
    const content = document.getElementById("receipt-content");
    const container = document.getElementById("receipt-container");
    const part = content ? content.firstElementChild : null;
    const firstViewerEl = part ? part.firstElementChild : null;

    // the union of every descendant's box (elements and text runs), unclipped: how far the message
    // reaches past the content box, whose overflow:hidden cuts it off on paper
    let u = null;
    const add = (r) => {
        if (!r || (r.width === 0 && r.height === 0)) return;
        if (!u) u = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        else { u.l = Math.min(u.l, r.left); u.t = Math.min(u.t, r.top); u.r = Math.max(u.r, r.right); u.b = Math.max(u.b, r.bottom); }
    };
    const runs = [], turned = [];
    if (content) {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
            if (n.nodeType === Node.ELEMENT_NODE) {
                add(n.getBoundingClientRect());
                const cs = getComputedStyle(n);
                let angle = null;
                const m = /^matrix\(([^)]+)\)$/.exec(cs.transform);
                if (m) { const p = m[1].split(",").map(Number); angle = r2(Math.atan2(p[1], p[0]) * 180 / Math.PI); }
                if (cs.transform !== "none" || cs.rotate !== "none" || cs.writingMode !== "horizontal-tb") {
                    turned.push({ tag: n.localName, transform: cs.transform, angleDeg: angle, rotate: cs.rotate, writingMode: cs.writingMode,
                                  textOrientation: cs.textOrientation, rect: box(n) });
                }
            } else if (n.data.trim()) {
                const rg = document.createRange(); rg.selectNodeContents(n);
                const r = rg.getBoundingClientRect(); add(r);
                if (runs.length < 20) runs.push({ text: n.data.slice(0, 40), rect: { x: r2(r.x), y: r2(r.y), width: r2(r.width), height: r2(r.height) }, lines: rg.getClientRects().length });
            }
        }
    }
    const cr = content ? content.getBoundingClientRect() : null;
    const union = u && { x: r2(u.l), y: r2(u.t), width: r2(u.r - u.l), height: r2(u.b - u.t) };
    const overflow = (u && cr) ? { top: r2(Math.max(0, cr.top - u.t)), right: r2(Math.max(0, u.r - cr.right)), bottom: r2(Math.max(0, u.b - cr.bottom)), left: r2(Math.max(0, cr.left - u.l)) } : null;
    const fv = firstViewerEl ? getComputedStyle(firstViewerEl) : null;
    const pcs = content ? getComputedStyle(content) : null;
    return {
        contentHtml: content ? content.innerHTML : null,
        contentMaxHeight: pcs ? pcs.maxHeight : null,
        contentClasses: content ? content.className : null,
        partClass: part ? part.className : null,
        rects: { content: box(content), firstChild: box(part), firstViewerElement: box(firstViewerEl), container: box(container),
                 avatar: box(document.getElementById("receipt-avatar")), footer: box(document.getElementById("receipt-footer")) },
        contentScroll: content ? { scrollHeight: content.scrollHeight, clientHeight: content.clientHeight, scrollWidth: content.scrollWidth, clientWidth: content.clientWidth } : null,
        messageUnion: union, overflowPastContent: overflow,
        firstViewerElement: firstViewerEl ? { tag: firstViewerEl.localName, style: firstViewerEl.getAttribute("style"),
            computed: { fontSize: fv.fontSize, fontWeight: fv.fontWeight, fontFamily: fv.fontFamily, lineHeight: fv.lineHeight, transform: fv.transform,
                        rotate: fv.rotate, writingMode: fv.writingMode, display: fv.display, color: fv.color } } : null,
        turned, textRuns: runs,
        scrollHeight: document.documentElement.scrollHeight,
        violations: window.PrinterBot.violations(), violationLog: window.PrinterBot.violationLog(),
        rendererVersion: window.PrinterBot.version,
    };
}

// dark-pixel bounding box of the grey screenshot (the bot's luma < 128) inside a device-px region
function inkBox(rgba, W, H, x0, y0, x1, y1) {
    let l = Infinity, t = Infinity, r = -1, b = -1, count = 0;
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const p = (y * W + x) * 4;
        if (((rgba[p] * 77 + rgba[p + 1] * 151 + rgba[p + 2] * 28) >> 8) < 128) { count++; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    }
    return count ? { left: l, top: t, right: r + 1, bottom: b + 1, count } : null;
}

async function main() {
    const o = parseArgs(process.argv);
    if (o.message === null) o.message = await readStdin();
    const { pageW, dotsW } = PAPER[o.paper];
    const dsf = dotsW / pageW;
    const renderer = await resolveRenderer(o);

    let chromium;
    try {
        ({ chromium } = await import("playwright"));
    } catch (e) {
        throw new Exit(2, "Playwright is not installed: run `npm install` (devDependencies) and `npx playwright install chromium` once (" + String(e.message).split("\n")[0] + ")");
    }
    mkdirSync(dirname(o.out), { recursive: true });
    const base = o.out.slice(0, -4);
    const outGrey = o.out, out1bit = base + "-1bit.png", outJson = base + ".json";

    // --fonts DIR: your own font folder on top of the system fonts, via a fontconfig file written
    // under the gitignored .render/fonts/. Never downloads anything.
    const env = { ...process.env };
    if (o.fontsDir) {
        const fcDir = join(REPO, ".render", "fonts");
        mkdirSync(join(fcDir, "cache"), { recursive: true });
        const conf = join(fcDir, "fonts.conf");
        const x = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        writeFileSync(conf, '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n' +
            "  <dir>" + x(o.fontsDir) + "</dir>\n  <cachedir>" + x(join(fcDir, "cache")) + "</cachedir>\n</fontconfig>\n");
        env.FONTCONFIG_FILE = conf;
    }
    let browser;
    try {
        browser = await chromium.launch({ headless: true, env });
    } catch (e) {
        throw new Exit(2, "Chromium would not start: run `npx playwright install chromium` once (" + String(e.message).split("\n")[0] + ")");
    }
    const blocked = [], consoleLines = [], pageErrors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: pageW, height: PAGE_H }, deviceScaleFactor: dsf, locale: "en-US", timezoneId: "UTC" });
        await ctx.route("**/*", (route) => {
            const u = route.request().url();
            if (u.startsWith("file:")) return route.continue();
            blocked.push(u.slice(0, 200));
            return route.abort("blockedbyclient");
        });
        const page = await ctx.newPage();
        page.on("console", (m) => { if (consoleLines.length < 40) consoleLines.push(m.type() + ": " + m.text().slice(0, 300)); });
        page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));

        await page.goto(pathToFileURL(renderer.file).href, { waitUntil: "load" });
        try {
            await page.waitForFunction(() => window.PrinterBot && window.PrinterBot.ready === true, null, { timeout: 10000 });
        } catch {
            throw new Error("window.PrinterBot never appeared (did the page script fail its CSP hash?) " + JSON.stringify({ pageErrors, consoleLines }));
        }
        if (o.themeCss) await page.evaluate((css) => window.PrinterBot.setTheme(css), o.themeCss);

        const event = { __source: "TwitchCheer", bits: o.bits, user: o.user, message: o.message };      // no userName: no avatar lookup
        const options = { highRollerBits: o.threshold, highRollerBitsPerInch: o.bitsPerInch, highRollerMaxInches: o.maxInches, hideLinks: o.hideLinks };
        const result = await page.evaluate(async ({ event, options }) => window.PrinterBot.render(event, options), { event, options });
        if (!result || !result.ok) throw new Error("render failed: " + JSON.stringify(result));
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));   // let the final layout paint
        const m = await page.evaluate(measureInPage);

        // which real font the first text run used (a Linux bench has no Segoe UI)
        let fonts = null;
        try {
            const cdp = await ctx.newCDPSession(page);
            await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
            await cdp.send("DOM.getDocument", { depth: 0 });
            const { result: ro } = await cdp.send("Runtime.evaluate", { expression: "(() => { const c = document.getElementById('receipt-content'); const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.data.trim()) return n.parentElement; return c; })()" });
            if (ro && ro.objectId) {
                const { nodeId } = await cdp.send("DOM.requestNode", { objectId: ro.objectId });
                const pf = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
                fonts = pf.fonts.map((f) => ({ family: f.familyName, postScriptName: f.postScriptName, glyphs: f.glyphCount }));
            }
            await cdp.detach();
        } catch (e) { fonts = [{ error: String(e).slice(0, 120) }]; }

        // the screenshot, clipped to the height render() returns (the bot prints that much of the page)
        const clipH = Math.min(PAGE_H, Math.max(1, result.height));
        const shot = await page.screenshot({ clip: { x: 0, y: 0, width: pageW, height: clipH }, type: "png" });
        writeFileSync(outGrey, shot);

        // the bot's 1-bit conversion, and the ink measurements, on the screenshot's own pixels
        const img = decodePng(shot);
        const dots = forkDither(img.rgba, img.w, img.h, dotsW, o.dither);
        writeFileSync(out1bit, encodePng1bit(dotsW, img.h, dots));
        let blackDots = 0;
        for (let i = 0; i < dots.length; i++) blackDots += dots[i];

        const c = m.rects.content;
        const region = (c && c.height > 0) ? { x0: Math.floor(c.x * dsf), y0: Math.floor(c.y * dsf), x1: Math.ceil(c.right * dsf), y1: Math.ceil(c.bottom * dsf) } : null;
        const inkRegion = region ? inkBox(img.rgba, img.w, img.h, region.x0, region.y0, region.x1, region.y1) : null;
        const inkPage = inkBox(img.rgba, img.w, img.h, 0, 0, img.w, img.h);
        const css = (n) => Math.round(n / dsf * 100) / 100;
        let ink = null, inkCutSides = [];
        if (inkRegion && c) {
            const k = inkRegion;
            const bx = { x: css(k.left), y: css(k.top), width: css(k.right - k.left), height: css(k.bottom - k.top) };
            const gapBottom = css(region.y1 - k.bottom);              // CSS px of blank between the last ink and the content box's bottom edge
            const scroll = m.contentScroll;
            ink = {
                pageCss: bx,                                           // page coordinates, CSS px
                inContentCss: { x: Math.round((bx.x - c.x) * 100) / 100, y: Math.round((bx.y - c.y) * 100) / 100, width: bx.width, height: bx.height },
                devicePx: k, darkPixels: k.count,
                aspectHOverW: Math.round(bx.height / bx.width * 100) / 100,
                tallNarrow: bx.height > bx.width * 1.5,
                gapToContentBottomCss: gapBottom,
                reachesContentBottom: gapBottom <= 2,                  // ink within 2 CSS px of the box's bottom edge
                touchesContentLeft: css(k.left - region.x0) <= 1, touchesContentRight: css(region.x1 - k.right) <= 1,
                contentClippedVertically: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : null,
                contentClippedHorizontally: scroll ? scroll.scrollWidth > scroll.clientWidth + 1 : null,
            };
            // Ink in the content box's outermost device row or column on a side: the ink runs into
            // the edge there, so overflow:hidden cuts it. (The bottom stops at the screenshot,
            // which ends at the height render() returns.)
            if (k.top <= Math.max(0, region.y0)) inkCutSides.push("top");
            if (k.right >= Math.min(img.w, region.x1)) inkCutSides.push("right");
            if (k.bottom >= Math.min(img.h, region.y1)) inkCutSides.push("bottom");
            if (k.left <= Math.max(0, region.x0)) inkCutSides.push("left");
        }

        // one-glance verdicts for whoever reads the report
        // The box overflow is the message's element and text-run boxes past #receipt-content. Those
        // are font boxes (1.117em tall against big text's line-height .8, a sideways column's whole
        // font box), not ink, so nearly every big and sideways part overflows with its ink well
        // clear of the edges. It is reported for whoever needs the boxes; the clipping verdict is
        // the ink's.
        const ov = m.overflowPastContent || { top: 0, right: 0, bottom: 0, left: 0 };
        const boxOverflowSides = ["top", "right", "bottom", "left"].filter((s) => ov[s] > 0.5);
        const angles = m.turned.map((t) => t.angleDeg).filter((a) => a !== null && Math.abs(a) > 0.5);
        const summary = {
            highRoller: m.partClass ? /\braw\b/.test(m.partClass) : null,          // 'part raw' = styled High Roller copy, 'part message' = literal text in quotes
            securityNotes: Array.isArray(result.security) ? result.security.length : 0,   // anything the sanitizer dropped or refused
            rotated: m.turned.length > 0,                                          // some element has a transform / rotate / vertical writing-mode
            angles, writingModes: [...new Set(m.turned.map((t) => t.writingMode).filter((w) => w !== "horizontal-tb"))],
            clippedByContentBox: inkCutSides.length > 0,                           // ink runs into an edge of #receipt-content, so overflow:hidden cuts it off
            clippedSides: inkCutSides,                                             // which edges, from the ink (dark dots in the box's outermost row or column)
            boxOverflowSides,                                                      // font boxes past the content box: NOT a clipping verdict (see above)
            cutByLengthLimit: !!result.trimmed,                                    // render() cut it at the bits-per-inch / maximum-length limit (fades out)
            inkReachesContentBottom: ink ? ink.reachesContentBottom : null,
            inkTallNarrow: ink ? ink.tallNarrow : null,
        };

        const report = {
            ok: true, summary,
            input: { message: o.message, messageChars: Array.from(o.message).length, bits: o.bits, threshold: o.threshold,
                     highRoller: o.threshold > 0 && o.bits >= o.threshold, bitsPerInch: o.bitsPerInch, maxInches: o.maxInches,
                     paperMm: o.paper, pageCssW: pageW, dotsW, user: o.user, theme: !!o.themeCss, hideLinks: o.hideLinks,
                     dither: o.dither, fontsDir: o.fontsDir },
            renderer: { ...renderer, version: m.rendererVersion },
            result: { ok: result.ok, height: result.height, trimmed: result.trimmed, security: result.security },
            contentHtml: m.contentHtml, partClass: m.partClass, contentClasses: m.contentClasses, contentMaxHeight: m.contentMaxHeight,
            rects: m.rects, contentScroll: m.contentScroll, messageUnion: m.messageUnion, overflowPastContent: m.overflowPastContent,
            firstViewerElement: m.firstViewerElement, turned: m.turned, textRuns: m.textRuns, scrollHeight: m.scrollHeight,
            ink, inkPageCss: inkPage ? { x: css(inkPage.left), y: css(inkPage.top), width: css(inkPage.right - inkPage.left), height: css(inkPage.bottom - inkPage.top) } : null,
            fonts, printedLengthMm: Math.round(img.h / DOTS_PER_MM * 10) / 10,
            images: { screenshot: outGrey, screenshotPx: [img.w, img.h], oneBit: out1bit, oneBitPx: [dotsW, img.h], oneBitBlackDots: blackDots, json: outJson },
            cspViolations: m.violations, cspViolationLog: m.violationLog, blockedRequests: blocked, pageErrors, console: consoleLines,
        };
        writeFileSync(outJson, JSON.stringify(report, null, 2) + "\n");
        process.stdout.write((o.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report)) + "\n");
    } finally {
        await browser.close();
    }
}

main().catch((e) => {
    process.stdout.write(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 2000) }) + "\n");
    process.exit(e instanceof Exit ? e.code : 1);
});
