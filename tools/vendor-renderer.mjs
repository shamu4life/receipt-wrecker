#!/usr/bin/env node
// tools/vendor-renderer.mjs: (re)generate the vendored copy of SassyTP printer-bot's receipt page
// that public/index.html carries, the page the app's preview draws every part with.
//
// The preview is the bot's own renderer (the vendored v/<version>/renderer.html -> PrinterBot.render), not a model
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
// It is the "SassyTP shipped a new version" routine: --prerelease vendors the prerelease that
// versions.json names (core.prerelease), at --ref or at the head of the beta branch (the app
// follows the newest beta since 1.3.0), and --ref <sha> vendors another commit (its renderer path
// comes from that commit's versions.json, or --path). Not in CI (CI is offline): run it by hand, then run both test suites, whose contract
// test drives every mode through the vendored page. tools/upstream-watch.mjs says when there is
// something new to vendor.
//
// Usage:
//   node tools/vendor-renderer.mjs              rewrite the block from the commit it names
//   node tools/vendor-renderer.mjs --check      exit 1 if the committed block differs from what its
//                                               commit's upstream file gives (writes nothing)
//   node tools/vendor-renderer.mjs --ref <40-hex sha> [--path v/X.Y.Z/renderer.html]
//   node tools/vendor-renderer.mjs --prerelease [--ref <40-hex sha>]
//   node tools/vendor-renderer.mjs --renderer PATH [--license PATH] [--ref <sha>]
//
// Which commit: --ref when given; with --prerelease and no --ref, the head of printer-bot's beta
// branch (one anonymous read of api.github.com); otherwise the one the committed block names (its
// data-commit and data-path, and the upstream sha256 in its notice), so after a --ref update a plain
// --check checks the new block and a plain write can't put the old renderer back over it; the
// PINNED_* constants below only on a first run, when the page has no block yet. (The tool used to
// fall back to PINNED_* every time: right after a correct --ref update, --check failed, and a plain
// write silently restored 2.5.4.) Update PINNED_* to the new commit too, with tools/forkbench.mjs.
//
// It always prints the renderer VERSION it found (the page's <meta name="printer-bot-renderer">).
// On the beta branch versions.json's "latest" is still the stable frontend, so --ref <beta commit>
// alone resolves v/2.5.0/renderer.html, the 2.5.4 page. It stops when --ref (without --path or
// --prerelease) resolves a renderer OLDER than the vendored one (a lower VERSION): since 1.3.0 the
// block holds a beta, and that would quietly put 2.5.4 back under the beta's commit. It also
// stops when --ref names a commit other than the block's but resolves the very file the block
// holds (the same sha256), which would only relabel it. Pass --prerelease (a beta) or --path
// v/<version>/renderer.html (anything else, an older page on purpose included) then.
//
// Flags:
//   --check            compare only; exit 0 same, 1 different (the first differing line is printed)
//   --ref SHA          the printer-bot commit to vendor (default: the committed block's, else the
//                      pinned one below). A full 40-character sha, so the block always names one
//                      exact commit
//   --path P           the renderer's path in that commit (default: v/<latest>/renderer.html, from
//                      that commit's versions.json; for the pinned commit, PINNED_PATH)
//   --prerelease       the renderer's path is v/<core.prerelease>/renderer.html, from the
//                      versions.json at --ref (default: at the head of the beta branch). Not with --path
//   --renderer PATH    use a local renderer.html instead of fetching it. If it is not the pinned
//                      file (by sha256), --ref must say which commit it is
//   --license PATH     the LICENSE to quote (default: next to --renderer in a checkout, else fetched)
//   --offline          never touch the network: everything must already be in the cache (so
//                      --prerelease needs --ref)
//   --file PATH        the page to write or check (default public/index.html)
//
// Cache: the same gitignored .render/sassytp/<sha>/ folder tools/forkbench.mjs uses
// (<path>, versions.json and LICENSE, each with a .json note of its url, sha256 and fetch time).
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

// The same pin as tools/forkbench.mjs: printer-bot 3.0.5, its page v/3.0.0/renderer.html, receipt
// page version 202610150536 (1.8.1; the app follows the newest release, beta or stable, since 1.3.0,
// which vendored 3.0.0-beta.6 at b7f9991; 1.3.1 3.0.0-beta.7 at 64afbfc; 1.4.1 3.0.1 at 1049292;
// 1.8.0 3.0.4 at fae1b6d; 2.5.4's page was b9f12b0, v/2.5.0/renderer.html).
const REPO_URL = "https://github.com/SassyTP/printer-bot";
const RAW = "https://raw.githubusercontent.com/SassyTP/printer-bot/";
const API = "https://api.github.com/repos/SassyTP/printer-bot";
const BETA_BRANCH = "beta";
// A version as versions.json names one (core.prerelease "3.0.0-beta.7"), which becomes a folder name:
// no slash, no "..".
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/;
const PINNED_SHA = "0b2793e723f4cf146ca84316defbb5be1c9fa4fe";
const PINNED_PATH = "v/3.2.0/renderer.html";
const PINNED_SHA256 = "973c58a3c5487cdb638f928bf89bf606d18773d908b73bba947879bfc756e216";
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
    throw new Exit(2, (msg ? msg + ". " : "") + "usage: node tools/vendor-renderer.mjs [--check] [--ref SHA] [--path P | --prerelease] " +
        "[--renderer PATH] [--license PATH] [--offline] [--file PATH]");
}

function parseArgs(argv) {
    const o = { check: false, ref: null, path: null, prerelease: false, renderer: null, license: null, offline: false, file: DEFAULT_FILE };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i], v = argv[i + 1];
        switch (a) {
            case "--check": o.check = true; break;
            case "--offline": o.offline = true; break;
            case "--prerelease": o.prerelease = true; break;
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
    if (o.prerelease && o.path) usage("--prerelease and --path both say which renderer to take; pass one of them");
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

// The commit at the head of one of printer-bot's branches: one anonymous read of GitHub's API.
async function branchHead(name, offline) {
    const url = API + "/branches/" + name;
    if (offline) throw new Exit(2, "--offline, but finding the head of the " + name + " branch needs " + url + "; pass --ref");
    let res;
    try {
        res = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "receipt-wrecker-vendor-renderer" }, signal: AbortSignal.timeout(30000) });
    } catch (e) {
        const hint = process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY ? " (behind a proxy? set NODE_USE_ENV_PROXY=1)" : "";
        throw new Exit(2, "could not fetch " + url + ": " + String(e && e.cause || e).slice(0, 200) + hint);
    }
    if (!res.ok) {
        const limited = res.headers.get("x-ratelimit-remaining") === "0" ? " (GitHub's limit of 60 anonymous API reads an hour is used up; pass --ref)" : "";
        throw new Exit(2, "could not fetch " + url + ": HTTP " + res.status + limited);
    }
    let sha;
    try { sha = (await res.json()).commit.sha; } catch { sha = null; }
    if (!/^[0-9a-f]{40}$/.test(sha || "")) throw new Exit(2, url + " names no head commit");
    return sha;
}

// --prerelease: the commit (--ref, else the beta branch's head) and v/<core.prerelease>/renderer.html
// from that commit's versions.json, as if they had been passed as --ref and --path.
async function resolvePrerelease(o) {
    if (!o.ref) {
        o.ref = await branchHead(BETA_BRANCH, o.offline);
        process.stderr.write("the " + BETA_BRANCH + " branch's head is " + o.ref + "\n");
    }
    let vj;
    try { vj = JSON.parse((await fetchCached(o.ref, "versions.json", o.offline, null)).buf.toString("utf8")); } catch (e) {
        if (e instanceof Exit) throw e;
        throw new Exit(2, "versions.json @ " + o.ref.slice(0, 7) + " is not JSON");
    }
    const pre = vj && vj.core && vj.core.prerelease;
    if (typeof pre !== "string" || !VERSION_RE.test(pre)) throw new Exit(2, "versions.json @ " + o.ref.slice(0, 7) + " names no prerelease (core.prerelease); pass --path");
    o.path = "v/" + pre + "/renderer.html";
    process.stderr.write("versions.json @ " + o.ref.slice(0, 7) + " names the prerelease " + pre + ": " + o.path + "\n");
    return pre;
}

// The renderer's own version stamp: its <meta name="printer-bot-renderer">, else its VERSION constant.
function rendererVersion(buf) {
    const s = buf.toString("utf8");
    return (/<meta name="printer-bot-renderer" content="(\d+)">/.exec(s) || /\bconst VERSION = '(\d+)'/.exec(s) || [])[1] || null;
}

// The commit the page's committed block names, from its data-commit and data-path attributes and
// the upstream sha256 in its notice; null when the page has no block (a first run).
function committedPin(html) {
    const at = locate(html);
    if (!at) return null;
    const blk = html.slice(at.start, at.end);
    const m = blk.match(/id="sassytp-renderer" data-commit="([0-9a-f]{40})" data-path="([\w./-]+\.html)"/);
    if (!m) throw new Exit(2, "the vendored block names no commit (data-commit / data-path); pass --ref and --path");
    const h = blk.match(/upstream file sha256 ([0-9a-f]{64})/), v = blk.match(/ data-version="(\d+)"/);
    return { sha: m[1], path: m[2], sha256: h ? h[1] : null, version: v ? v[1] : null };
}

async function resolveSources(o) {
    // The pin: --ref, else the committed block's commit, else PINNED_* (a first run). A --ref that
    // names a commit known here (the block's or PINNED_*) also takes its path and sha256.
    const known = [o.pin, { sha: PINNED_SHA, path: PINNED_PATH, sha256: PINNED_SHA256 }].filter(Boolean);
    const pin = o.ref ? known.find((k) => k.sha === o.ref) || null : known[0];
    let sha = o.ref || pin.sha, path = o.path, page, license;
    if (o.renderer) {
        const buf = readFileSync(o.renderer);
        const pinned = !!pin && !!pin.sha256 && sha256(buf) === pin.sha256;
        if (!pinned && !o.ref) throw new Exit(2, "--renderer " + o.renderer + " is not the pinned file (sha256 " + sha256(buf) + "): add --ref <sha> to say which commit it is");
        if (!path) path = pinned ? pin.path : null;
        if (!path) throw new Exit(2, "--renderer with --ref needs --path (the renderer's path in that commit)");
        page = buf;
        const lf = o.license || findLicenseUpward(o.renderer);
        license = lf ? readFileSync(lf) : (await fetchCached(sha, "LICENSE", o.offline, null)).buf;
    } else {
        if (!path) {
            if (pin) path = pin.path;
            else if (sha === PINNED_SHA) path = PINNED_PATH;
            else {
                const vj = JSON.parse((await fetchCached(sha, "versions.json", o.offline, null)).buf.toString("utf8"));
                if (!vj || typeof vj.latest !== "string" || !/^\d+\.\d+\.\d+$/.test(vj.latest)) throw new Exit(2, "versions.json @ " + sha.slice(0, 7) + " names no latest frontend; pass --path");
                path = "v/" + vj.latest + "/renderer.html";
            }
        }
        const expect = pin && sha === pin.sha && path === pin.path ? pin.sha256
            : sha === PINNED_SHA && path === PINNED_PATH ? PINNED_SHA256 : null;
        page = (await fetchCached(sha, path, o.offline, expect)).buf;
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
    const namedPath = !!o.path;                                  // --path given by hand (resolvePrerelease sets one too)
    checkPlaceholder();
    const html = readFileSync(o.file, "utf8");
    o.pin = committedPin(html);
    if (!o.ref && !o.prerelease) {
        if (o.pin && (o.pin.sha !== PINNED_SHA || o.pin.path !== PINNED_PATH)) {
            process.stderr.write("following the committed block: " + o.pin.path + " @ " + o.pin.sha.slice(0, 7) + " (this tool's PINNED_* still say " +
                PINNED_PATH + " @ " + PINNED_SHA.slice(0, 7) + ": update them, and tools/forkbench.mjs's pin)\n");
        }
    }
    const pre = o.prerelease ? await resolvePrerelease(o) : null;
    const { sha, path, page, license } = await resolveSources(o);
    process.stderr.write("renderer VERSION " + (rendererVersion(page) || "(none found)") + ": " + path + " @ " + sha.slice(0, 7) + "\n");
    // A --ref that resolves a renderer older than the vendored one, with no --path or --prerelease
    // asking for it: the beta branch's versions.json still names the stable frontend as "latest",
    // so a beta's commit alone resolves 2.5.4's page, and since 1.3.0 the block holds a beta.
    const ver = rendererVersion(page);
    if (o.ref && !namedPath && !pre && o.pin && o.pin.version && ver && Number(ver) < Number(o.pin.version)) {
        throw new Exit(2, "this commit's " + path + " (VERSION " + ver + ") is older than the vendored renderer (VERSION " + o.pin.version
            + "): versions.json's latest is the stable frontend; pass --prerelease for a beta, or --path v/<version>/renderer.html to vendor this one anyway");
    }
    // A --ref that resolves the very file the block already holds would only relabel it.
    if (o.ref && o.pin && o.pin.sha256 && o.ref !== o.pin.sha && sha256(page) === o.pin.sha256) {
        throw new Exit(2, pre
            ? "this commit's " + path + " is the renderer you already have: versions.json's core.prerelease is still " + pre + ", so there is nothing new to vendor"
            : "this commit's " + path + " is the renderer you already have: pass --prerelease or --path v/<version>/renderer.html");
    }
    const region = buildRegion(page, sha, path, license);
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
