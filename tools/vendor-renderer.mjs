#!/usr/bin/env node
// tools/vendor-renderer.mjs: (re)generate the vendored copy of SassyTP printer-bot's receipt page
// that public/index.html carries, the page the app's preview draws every part with.
//
// The preview is the bot's own renderer (v/2.5.0/renderer.html -> PrinterBot.render), not a model
// of it. The app keeps the page as INERT text, a <script type="text/plain" id="sassytp-renderer">
// block after its own script, and loads it into one sandboxed frame per part. This tool writes
// that block from the pinned upstream file by applying exactly three edits, each marked RW-EDIT
// inside the block:
//   1. the ICONS logo data URIs (Twitch, YouTube, Kick: trademarks of their owners, outside the MIT
//      licence) become one plain grey PNG the size of the Twitch logo, so the footer keeps its size;
//   2. the page's Content-Security-Policy becomes a no-network policy (and lets the app's small glue
//      script run next to the renderer's own);
//   3. every closing script tag is written with a backslash before its slash, so the page can sit
//      inside index.html; the app takes the backslash out when it reads the block.
// Above the block it writes SassyTP's copyright line and MIT permission notice (from the LICENSE
// file at the same commit), the source repo, path and commit, and a note of the three edits.
//
// It is the "SassyTP shipped a new version" routine: --ref <sha> vendors another commit (its
// renderer path comes from that commit's versions.json, or --path). Not in CI (CI is offline):
// run it by hand, then run both test suites, whose contract test drives every mode through the
// vendored page.
//
// Usage:
//   node tools/vendor-renderer.mjs              write the pinned renderer into public/index.html
//   node tools/vendor-renderer.mjs --check      exit 1 if the committed block differs from what the
//                                               pinned upstream file gives (writes nothing)
//   node tools/vendor-renderer.mjs --ref <40-hex sha> [--path v/X.Y.Z/renderer.html]
//   node tools/vendor-renderer.mjs --renderer PATH [--license PATH] [--ref <sha>]
//
// Flags:
//   --check            compare only; exit 0 same, 1 different (the first differing line is printed)
//   --ref SHA          the printer-bot commit to vendor (default: the pinned one below). A full
//                      40-character sha, so the block always names one exact commit
//   --path P           the renderer's path in that commit (default: v/<latest>/renderer.html, from
//                      that commit's versions.json; for the pinned commit, v/2.5.0/renderer.html)
//   --renderer PATH    use a local renderer.html instead of fetching it. If it is not the pinned
//                      file (by sha256), --ref must say which commit it is
//   --license PATH     the LICENSE to quote (default: next to --renderer in a checkout, else fetched)
//   --offline          never touch the network: everything must already be in the cache
//   --file PATH        the page to write or check (default public/index.html)
//
// Cache: the same gitignored .render/sassytp/<sha>/ folder tools/forkbench.mjs uses
// (<path> and LICENSE, each with a .json note of its url, sha256 and fetch time).
// Behind a proxy Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set.
//
// Exit status: 0 written / check passed; 1 check failed; 2 usage, network or a source this tool
// cannot vendor safely (it refuses rather than guess). The reason is on stderr.
//
// Licence: printer-bot is MIT-licensed (Copyright (c) 2026 SassyTP). The block is the one
// sanctioned copy of it in this repo; the upstream page verbatim (with its logos) is never
// committed, and SassyTP's name is credited, never used as the name of this app.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

// The same pin as tools/forkbench.mjs: printer-bot 2.5.4, receipt page version 202610090056.
const REPO_URL = "https://github.com/SassyTP/printer-bot";
const RAW = "https://raw.githubusercontent.com/SassyTP/printer-bot/";
const PINNED_SHA = "b9f12b0cbaf680b01d4e72fb96b3d5e9aa0aa0ef";
const PINNED_PATH = "v/2.5.0/renderer.html";
const PINNED_SHA256 = "51b1f93f901c6b0895b428b697bc02cf19280049c0346f4d5aac172cc0c6bdff";
const DEFAULT_FILE = join(REPO, "public", "index.html");

const BEGIN = "<!-- BEGIN vendored SassyTP printer-bot renderer: tools/vendor-renderer.mjs writes everything from here to END; do not edit by hand -->";
const END = "<!-- END vendored SassyTP printer-bot renderer -->";

// RW-EDIT 1: one plain grey (#cccccc) 8-bit greyscale PNG, 336 x 112 px: the size of the Twitch
// logo it stands in for (the footer's icon is 3em tall at its own aspect ratio). Written out here
// rather than encoded at run time, so the block is byte-for-byte the same on every machine; the
// tool decodes it and checks its size and colour before using it.
const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAVAAAABwCAAAAABtWHeHAAAApElEQVR42u3QMQ0AAAgDsAX/0hCFiT0krYRmqZpQJVSoUKEIFSoUoUKFIlSoUKEIFSoUoUKFIlSoUIQKFSoUoUKFIlSoUIQKFYpQoUKFIlSoUIQKFYpQoUIRKlSoUIQKFYpQoUIRKlSoUIQKFYpQoUIRKlQoQoUKFYpQoUIRKlQoQoUKRahQoUIRKlQoQoUKRahQoQgVKlQoQoUKRahQoQgV+s0BrCMMrtBkMGMAAAAASUVORK5CYII=";
const PLACEHOLDER_W = 336, PLACEHOLDER_H = 112, PLACEHOLDER_GREY = 0xcc;

// RW-EDIT 2: nothing leaves the frame. No connections, images only from data: URLs (the
// placeholder), no frames, forms, objects or base URL. 'unsafe-inline' scripts instead of the
// renderer script's hash, because the app's glue script runs next to it.
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";

class Exit extends Error {
    constructor(code, msg) { super(msg); this.code = code; }
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function usage(msg) {
    throw new Exit(2, (msg ? msg + ". " : "") + "usage: node tools/vendor-renderer.mjs [--check] [--ref SHA] [--path P] " +
        "[--renderer PATH] [--license PATH] [--offline] [--file PATH]");
}

function parseArgs(argv) {
    const o = { check: false, ref: null, path: null, renderer: null, license: null, offline: false, file: DEFAULT_FILE };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i], v = argv[i + 1];
        switch (a) {
            case "--check": o.check = true; break;
            case "--offline": o.offline = true; break;
            case "--ref":
                if (!/^[0-9a-f]{40}$/.test(v || "")) usage("--ref needs a full 40-character commit sha");
                o.ref = v; i++; break;
            case "--path":
                if (!v || !/^[\w./-]+\.html$/.test(v) || v.includes("..")) usage("--path needs a repo path ending in .html");
                o.path = v; i++; break;
            case "--renderer": if (!v || !existsSync(v)) usage("--renderer needs an existing file"); o.renderer = resolve(v); i++; break;
            case "--license": if (!v || !existsSync(v)) usage("--license needs an existing file"); o.license = resolve(v); i++; break;
            case "--file": if (!v || !existsSync(v)) usage("--file needs an existing file"); o.file = resolve(v); i++; break;
            case "-h": case "--help": usage();
            default: usage("unknown argument " + a);
        }
    }
    return o;
}

// ---- sources: the cache shared with forkbench, else GitHub at one exact commit -------------------
async function fetchCached(sha, path, offline, expectSha256) {
    const file = join(REPO, ".render", "sassytp", sha, path), note = file + ".json", url = RAW + sha + "/" + path;
    if (existsSync(file)) {
        const buf = readFileSync(file);
        if (!expectSha256 || sha256(buf) === expectSha256) return { buf, url, source: "cache" };
        if (offline) throw new Exit(2, "the cached " + path + " no longer matches its pinned sha256 (" + file + ")");
    } else if (offline) {
        throw new Exit(2, "--offline, but " + path + " @ " + sha.slice(0, 7) + " is not cached yet (" + file + "); run once without --offline");
    }
    let res;
    try {
        res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    } catch (e) {
        const hint = process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY ? " (behind a proxy? set NODE_USE_ENV_PROXY=1)" : "";
        throw new Exit(2, "could not fetch " + url + ": " + String(e && e.cause || e).slice(0, 200) + hint);
    }
    if (!res.ok) throw new Exit(2, "could not fetch " + url + ": HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (expectSha256 && sha256(buf) !== expectSha256) {
        throw new Exit(2, url + " has sha256 " + sha256(buf) + ", not the pinned " + expectSha256 + "; refusing to vendor it");
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, buf);
    writeFileSync(note, JSON.stringify({ url, commit: sha, path, sha256: sha256(buf), bytes: buf.length, fetched_at: new Date().toISOString() }, null, 2) + "\n");
    return { buf, url, source: "fetched" };
}

function findLicenseUpward(from) {
    let dir = dirname(from);
    for (let i = 0; i < 6; i++) {
        const f = join(dir, "LICENSE");
        if (existsSync(f)) return f;
        const up = dirname(dir);
        if (up === dir) break;
        dir = up;
    }
    return null;
}

async function resolveSources(o) {
    let sha = o.ref || PINNED_SHA, path = o.path, page, license;
    if (o.renderer) {
        const buf = readFileSync(o.renderer);
        const pinned = sha256(buf) === PINNED_SHA256;
        if (!pinned && !o.ref) throw new Exit(2, "--renderer " + o.renderer + " is not the pinned file (sha256 " + sha256(buf) + "): add --ref <sha> to say which commit it is");
        if (pinned && !o.ref) sha = PINNED_SHA;
        if (!path) path = pinned && sha === PINNED_SHA ? PINNED_PATH : null;
        if (!path) throw new Exit(2, "--renderer with --ref needs --path (the renderer's path in that commit)");
        page = buf;
        const lf = o.license || findLicenseUpward(o.renderer);
        license = lf ? readFileSync(lf) : (await fetchCached(sha, "LICENSE", o.offline, null)).buf;
    } else {
        if (!path) {
            if (sha === PINNED_SHA) path = PINNED_PATH;
            else {
                const vj = JSON.parse((await fetchCached(sha, "versions.json", o.offline, null)).buf.toString("utf8"));
                if (!vj || typeof vj.latest !== "string" || !/^\d+\.\d+\.\d+$/.test(vj.latest)) throw new Exit(2, "versions.json @ " + sha.slice(0, 7) + " names no latest frontend; pass --path");
                path = "v/" + vj.latest + "/renderer.html";
            }
        }
        page = (await fetchCached(sha, path, o.offline, sha === PINNED_SHA && path === PINNED_PATH ? PINNED_SHA256 : null)).buf;
        license = o.license ? readFileSync(o.license) : (await fetchCached(sha, "LICENSE", o.offline, null)).buf;
    }
    return { sha, path, page, license };
}

// ---- the three edits -------------------------------------------------------------------------------
function checkPlaceholder() {
    const buf = Buffer.from(PLACEHOLDER.split(",")[1], "base64");
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], type = buf[25];
    if (w !== PLACEHOLDER_W || h !== PLACEHOLDER_H || depth !== 8 || type !== 0) throw new Exit(2, "the placeholder PNG is not a " + PLACEHOLDER_W + "x" + PLACEHOLDER_H + " greyscale image");
    let off = 8; const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off), kind = buf.toString("latin1", off + 4, off + 8);
        if (kind === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
        off += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat)), stride = w + 1, row = Buffer.alloc(w);
    for (let y = 0; y < h; y++) {
        const f = raw[y * stride];
        for (let x = 0; x < w; x++) {
            const v = raw[y * stride + 1 + x];
            row[x] = f === 0 ? v : f === 2 ? (row[x] + v) & 0xff : -1;
            if (row[x] !== PLACEHOLDER_GREY) throw new Exit(2, "the placeholder PNG is not one plain grey");
        }
    }
}

function vendor(src) {
    let s = src.toString("utf8");
    if (s.includes("\r")) throw new Exit(2, "the renderer has CR characters; a browser would rewrite them in the block, so it could never --check clean");
    if (/<\\\/script/i.test(s)) throw new Exit(2, "the renderer already contains a backslash-escaped closing script tag; the escape would not be reversible");
    if (/RW-EDIT/.test(s)) throw new Exit(2, "the renderer already contains an RW-EDIT marker: is this an already-vendored copy?");
    const version = (/<meta name="printer-bot-renderer" content="(\d+)">/.exec(s) || [])[1];
    if (!version) throw new Exit(2, "no <meta name=\"printer-bot-renderer\"> version in the renderer");

    // Edit 1: the logos.
    const icons = [...s.matchAll(/^([ \t]*)const ICONS = (\{.*\});$/gm)];
    if (icons.length !== 1) throw new Exit(2, "expected exactly one `const ICONS = {...};` line, found " + icons.length);
    let map;
    try { map = JSON.parse(icons[0][2]); } catch { throw new Exit(2, "the ICONS line is not one JSON object"); }
    const keys = Object.keys(map);
    if (!keys.length || keys.some((k) => !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(map[k]))) throw new Exit(2, "ICONS holds something other than PNG data URIs");
    const ind = icons[0][1], grey = {};
    for (const k of keys) grey[k] = PLACEHOLDER;
    s = s.replace(icons[0][0], ind + "// RW-EDIT 1 (Receipt Wrecker): the " + logoNames(keys) + " logos (trademarks of their owners, outside the MIT licence) are replaced by one plain grey box the size of the Twitch logo (" +
        PLACEHOLDER_W + " x " + PLACEHOLDER_H + " px), so the footer keeps its size.\n" + ind + "const ICONS = " + JSON.stringify(grey) + ";");

    // Edit 2: the policy (and edit 3's note, next to it at the top of the page).
    const csp = [...s.matchAll(/^([ \t]*)<meta http-equiv="Content-Security-Policy" content="[^"]*">$/gm)];
    if (csp.length !== 1) throw new Exit(2, "expected exactly one Content-Security-Policy <meta> line, found " + csp.length);
    const ci = csp[0][1];
    s = s.replace(csp[0][0],
        ci + "<!-- RW-EDIT 2 (Receipt Wrecker): this policy replaces the page's own. Nothing loads from the network (no connections, images only from data: URLs) and no frame, form or object; inline scripts are allowed instead of the renderer script's hash, so the preview's glue script can run next to it. -->\n" +
        ci + "<!-- RW-EDIT 3 (Receipt Wrecker): every closing script tag in this copy is written with a backslash before its slash, so the page can sit inside Receipt Wrecker's own page as inert text. The app takes the backslash out again before it loads the page. -->\n" +
        ci + '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">');

    // Edit 3: the escape.
    let escaped = 0;
    s = s.replace(/<\/(script)/gi, (m, tag) => { escaped++; return "<\\/" + tag; });
    if (!escaped) throw new Exit(2, "the renderer has no closing script tag: not the page this tool expects");
    checkScriptData(s);
    return { text: s, version, escaped, icons: keys };
}
const LOGO_NAMES = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" };
function logoNames(keys) {
    const n = keys.map((k) => LOGO_NAMES[k] || k);
    return n.length > 1 ? n.slice(0, -1).join(", ") + " and " + n[n.length - 1] : n[0];
}

// The block is the raw text of a <script> element, so the HTML tokenizer's script-data states
// decide where it ends. Walk them (WHATWG "script data", "escaped" and "double escaped" states):
// no end tag may close the element early, and the real one at the end must still close it.
function checkScriptData(s) {
    let state = "data";
    const endTag = (i) => /^<\/script[\s/>]/i.test(s.slice(i, i + 9));
    const openTag = (i) => /^<script[\s/>]/i.test(s.slice(i, i + 8));
    for (let i = 0; i < s.length; i++) {
        if (s.startsWith("<!--", i) && state === "data") { state = "escaped"; i += 3; continue; }
        if (s.startsWith("-->", i) && state !== "data") { state = "data"; i += 2; continue; }
        if (state === "escaped" && openTag(i)) { state = "double"; continue; }
        if (endTag(i)) {
            if (state === "double") { state = "escaped"; continue; }
            throw new Exit(2, "a closing script tag survives at character " + i + ": the block would end early");
        }
    }
    if (state === "double") throw new Exit(2, "the block ends inside an unclosed <!-- ... <script: its closing tag would not end it");
}

function buildRegion(src, sha, path, license) {
    const v = vendor(src);
    const lic = license.toString("utf8").replace(/\r\n?/g, "\n").trim();
    if (!/^MIT License\b/.test(lic) || !/Copyright \(c\) .*SassyTP/.test(lic)) throw new Exit(2, "the LICENSE is not SassyTP's MIT licence");
    if (lic.includes("--")) throw new Exit(2, "the LICENSE contains \"--\", which an HTML comment cannot hold");
    const head = [
        BEGIN,
        "<!--",
        "  The receipt preview is drawn by SassyTP's printer-bot renderer (MIT): the receipt page the bot",
        "  itself prints from, kept here as inert text and loaded into one sandboxed frame per part.",
        "  Source: " + REPO_URL + "  path " + path + "  commit " + sha,
        "  (renderer version " + v.version + ", upstream file sha256 " + sha256(src) + ")",
        "",
        ...lic.split("\n").map((l) => (l ? "  " + l : "")),
        "",
        "  Three edits, each marked RW-EDIT in the text below: (1) the " + logoNames(v.icons) + " logos",
        "  (trademarks of their owners, outside the licence) are one plain grey box the size of the Twitch",
        "  logo; (2) the page's Content-Security-Policy is a no-network policy; (3) every closing script tag",
        "  is written with a backslash before its slash, undone when the app reads the block.",
        "-->",
    ].join("\n");
    return head + "\n" + '<script type="text/plain" id="sassytp-renderer" data-commit="' + sha + '" data-path="' + path +
        '" data-version="' + v.version + '">\n' + v.text.replace(/\n$/, "") + "\n</script>\n" + END;
}

// ---- index.html: the region after the app's own script ---------------------------------------------
function locate(html) {
    const b = html.indexOf(BEGIN), e = html.indexOf(END);
    if (b >= 0 && e > b) return { start: b, end: e + END.length };
    if (b >= 0 || e >= 0) throw new Exit(2, "index.html has a BEGIN or END marker without the other");
    return null;
}

async function main() {
    const o = parseArgs(process.argv);
    checkPlaceholder();
    const { sha, path, page, license } = await resolveSources(o);
    const region = buildRegion(page, sha, path, license);
    const html = readFileSync(o.file, "utf8");
    const at = locate(html);
    if (o.check) {
        if (!at) { process.stderr.write("check FAILED: " + o.file + " has no vendored renderer block\n"); process.exit(1); }
        const have = html.slice(at.start, at.end);
        if (have === region) { process.stderr.write("check passed: the vendored renderer is " + path + " @ " + sha + " with exactly the three edits\n"); return; }
        const a = have.split("\n"), w = region.split("\n");
        let i = 0;
        while (i < a.length && i < w.length && a[i] === w[i]) i++;
        process.stderr.write("check FAILED: the vendored block differs from " + path + " @ " + sha.slice(0, 7) + " at its line " + (i + 1) + ":\n" +
            "  committed: " + JSON.stringify((a[i] ?? "<end>").slice(0, 160)) + "\n  expected:  " + JSON.stringify((w[i] ?? "<end>").slice(0, 160)) + "\n");
        process.exit(1);
    }
    let out;
    if (at) out = html.slice(0, at.start) + region + html.slice(at.end);
    else {
        // First run: right after the app's own script (id="rw-app"), before </body>.
        const app = html.match(/<script id="rw-app">[\s\S]*?<\/script>\n/);
        if (!app) throw new Exit(2, "could not find the app's own <script id=\"rw-app\"> in " + o.file);
        const k = app.index + app[0].length;
        out = html.slice(0, k) + region + "\n" + html.slice(k);
    }
    writeFileSync(o.file, out);
    process.stderr.write("wrote " + path + " @ " + sha + " into " + o.file + (out === html ? " (unchanged)" : "") + "\n");
}

main().catch((e) => {
    process.stderr.write((e instanceof Exit ? "" : "error: ") + String(e && e.message || e) + "\n");
    process.exit(e instanceof Exit ? e.code : 2);
});
