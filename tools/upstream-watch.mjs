#!/usr/bin/env node
// tools/upstream-watch.mjs: has SassyTP's printer-bot shipped a receipt page (renderer.html) other than
// the one public/index.html vendors, and does it change anything Receipt Wrecker depends on?
//
// It reads, anonymously, from api.github.com and raw.githubusercontent.com and nowhere else: every
// branch's head (master and beta among them), the tags and the releases (3 API reads), versions.json at
// the heads of master and beta, master's stable renderer (v/<versions.json "latest">/renderer.html,
// v/2.5.0 today) with its version.json, and the tree of the beta branch (1 API read, cached by commit)
// for its newest v/*/renderer.html, by version (and the one beta's versions.json names as
// core.prerelease, when that is another). A prerelease that master's versions.json names is read too.
// The vendored renderer is the one the block in public/index.html names: its data-commit, data-path and
// data-version, and the upstream sha256 in the notice above it (tools/vendor-renderer.mjs writes all
// four).
//
// Every renderer whose sha256 differs from the vendored one is cached in .render/sassytp/<sha>/<path>
// (with a .json note: the cache tools/vendor-renderer.mjs and tools/forkbench.mjs share), and the
// regions Receipt Wrecker depends on are compared with the vendored copy's, found by text markers:
//   safety              from "const MAX_PLAIN_CHARS" to "function formatCurrency": the allow-lists,
//                       plainText, the URL and image checks, copyStyle and sanitizeRich (to the end
//                       of sanitizeRich when formatCurrency no longer follows it)
//   CSS                 every rule whose selector names #receipt-container, #receipt-content or .part
//                       (one region each, @media wrappers included)
//   isHighRoller        the function and its paragraph (DEFAULT_HIGH_ROLLER_BITS)
//   highRollerMaxHeight everything from the end of isHighRoller to the end of highRollerMaxHeight
//                       (PX_PER_INCH, MAX_CAP_INCHES, and in the 3.0.0 betas pxPerInch, pageHeightPx)
//   viewOf              when either copy has it (the 3.0.0 betas moved the High Roller limit into it)
//   show                the function that builds the receipt and sets the message box's limit
//   MAX_RECEIPT_HEIGHT  the receipt's height cap
//   CSS #receipt-avatar the profile picture's rules, its 58 mm @media rule included (1.3.0)
//   larger picture      from "const OLD_AVATAR_PX" to the end of tightenGaps: the gap trimming the
//                       preview's stand-in repeats with the page's own shareCuts and gapRooms (3.0)
//   TwitchCheer         the cheer handler (High Roller or plain, the plain copy for viewOf)
//   present             what render() does with a receipt model since 3.0 (the trimmed report)
//   API notes           the page's notes on render()'s options and result
//   internals' gaps     the lines of `const internals = {...}` that export shareCuts and gapRooms,
//                       which the preview's stand-in calls (a beta that drops them leaves the
//                       stand-in's gaps untrimmed and its receipt 38 / 20 px taller)
// A function's region is its paragraph (the comment and constants right above it, back to a blank
// line or the end of the block before) and its body, to the first line that closes it at the same
// indent. Regions are compared as text (trailing spaces aside), so a reworded comment counts as a
// change: read the diff. A renderer whose VERSION is below the vendored one's (master's 2.5.x, now
// that the app vendors a beta) is listed, and its regions compared without diffs, but it is not new.
//
// Writes only under .render/upstream/ (last.json: the baseline it saw, compared with the previous
// run's; last-report.txt: the report; trees/<sha>.json: a commit's tree) and .render/sassytp/<sha>/.
// Dev-only: not part of `npm test`, never in CI (CI is offline), and no test imports it.
//
// Usage:
//   node tools/upstream-watch.mjs [--no-diff] [--file PATH]
//   node tools/upstream-watch.mjs --renderer PATH [--no-diff]   compare one local renderer.html with the
//                                                                vendored one (no GitHub listing, no
//                                                                baseline)
// Flags:
//   --no-diff         the verdicts only, no unified diffs
//   --file PATH       the page whose vendored block is the reference (default public/index.html)
//   --renderer PATH   compare this file's regions with the vendored renderer's, and nothing else
//
// Exit status: 0 nothing new (every renderer found is the vendored one, or older); 10 a new renderer
// upstream, and every region compared is identical; 20 a region changed (or appeared, or its markers are
// gone), a renderer that versions.json names is missing, or master is gone; 2 usage, network, GitHub's
// rate limit (60 anonymous API reads an hour; a run makes 3 or 4) or a page this tool cannot read.
// The report is on stdout, a failure's reason on stderr. Behind a proxy Node's fetch ignores
// HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set.
//
// Licence: printer-bot is MIT-licensed (Copyright (c) 2026 SassyTP). The cached upstream files stay in
// the gitignored .render/; never commit them.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const OWNER_REPO = "SassyTP/printer-bot";
const API = "https://api.github.com/repos/" + OWNER_REPO;
const RAW = "https://raw.githubusercontent.com/" + OWNER_REPO + "/";
const UA = "receipt-wrecker-upstream-watch";
const API_HEADERS = { Accept: "application/vnd.github+json", "User-Agent": UA, "X-GitHub-Api-Version": "2022-11-28" };
const DEFAULT_FILE = join(REPO, "public", "index.html");
const OUT_DIR = join(REPO, ".render", "upstream");
const CACHE_DIR = join(REPO, ".render", "sassytp");
const STABLE = "master", BETA = "beta";
const BEGIN = "<!-- BEGIN vendored SassyTP printer-bot renderer";
const END = "<!-- END vendored SassyTP printer-bot renderer -->";
const SHA_RE = /^[0-9a-f]{40}$/;
// A version as versions.json and the v/ folders name one ("2.5.0", "3.0.0-beta.6"): no slash, no "..".
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/;
const TREE_RENDERER_RE = /^v\/([^/]+)\/renderer\.html$/;
const ATTENTION = new Set(["changed", "new", "gone", "missing"]);

class Exit extends Error {
    constructor(code, msg) { super(msg); this.code = code; }
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const gitBlob = (buf) => createHash("sha1").update("blob " + buf.length + "\0").update(buf).digest("hex");
const short = (sha) => String(sha || "").slice(0, 7);
// Upstream text is data: no control character reaches the terminal.
const clean = (s, max = 120) => String(s ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, max);
const rel = (f) => relative(REPO, f).split(sep).join("/");

function usage(msg) {
    throw new Exit(2, (msg ? msg + ". " : "") + "usage: node tools/upstream-watch.mjs [--no-diff] [--file PATH] [--renderer PATH]");
}

function parseArgs(argv) {
    const o = { diff: true, file: DEFAULT_FILE, renderer: null };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i], v = argv[i + 1];
        switch (a) {
            case "--no-diff": o.diff = false; break;
            case "--file": if (!v || !existsSync(v)) usage("--file needs an existing file"); o.file = resolve(v); i++; break;
            case "--renderer": if (!v || !existsSync(v)) usage("--renderer needs an existing file"); o.renderer = resolve(v); i++; break;
            case "-h": case "--help": usage();
            default: usage("unknown argument " + a);
        }
    }
    return o;
}

// ---- the vendored renderer ---------------------------------------------------------------------------
function readPin(file) {
    const html = readFileSync(file, "utf8");
    const b = html.indexOf(BEGIN), e = html.indexOf(END);
    if (b < 0 || e < b) throw new Exit(2, file + " has no vendored renderer block");
    const blk = html.slice(b, e);
    const m = blk.match(/id="sassytp-renderer" data-commit="([0-9a-f]{40})" data-path="([\w./-]+\.html)" data-version="(\d+)"/);
    const h = blk.match(/upstream file sha256 ([0-9a-f]{64})/);
    if (!m || !h) throw new Exit(2, "the vendored block in " + file + " names no commit, path, version or upstream sha256");
    return { commit: m[1], path: m[2], version: m[3], sha256: h[1] };
}

// The renderer's own version stamp: its <meta name="printer-bot-renderer">, else its VERSION constant.
function rendererVersion(buf) {
    const s = buf.toString("utf8");
    return (/<meta name="printer-bot-renderer" content="(\d+)">/.exec(s) || /\bconst VERSION = '(\d+)'/.exec(s) || [])[1] || null;
}

// VERSION is a build stamp (YYYYMMDDhhmm): which of two was built later. null when either is missing.
function versionOrder(a, b) {
    if (!a || !b) return null;
    const d = BigInt(a) - BigInt(b);
    return d > 0n ? 1 : d < 0n ? -1 : 0;
}

// ---- reading GitHub --------------------------------------------------------------------------------
async function get(url, headers) {
    try {
        return await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    } catch (e) {
        const hint = (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY ? " (behind a proxy? set NODE_USE_ENV_PROXY=1)" : "";
        throw new Exit(2, "could not fetch " + url + ": " + String(e && e.cause || e).slice(0, 200) + hint);
    }
}

let apiReads = 0;
// One anonymous read of GitHub's REST API. A list follows its "next" links, at most `pages` of them.
async function api(path, pages = 1) {
    let url = API + path, out = null;
    for (let p = 0; url && p < pages; p++) {
        const res = await get(url, API_HEADERS);
        apiReads++;
        if (!res.ok) {
            if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
                const reset = Number(res.headers.get("x-ratelimit-reset"));
                throw new Exit(2, "GitHub's limit of 60 anonymous API reads an hour is used up" + (reset ? "; it resets at " + new Date(reset * 1000).toISOString() : ""));
            }
            throw new Exit(2, "could not read " + url + ": HTTP " + res.status);
        }
        const body = await res.json();
        if (!Array.isArray(body)) return body;
        out = (out || []).concat(body);
        const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") || "");
        url = next && next[1].startsWith(API + "/") ? next[1] : null;
    }
    return out || [];
}

// One file at one commit, through the cache tools/vendor-renderer.mjs and tools/forkbench.mjs share:
// .render/sassytp/<sha>/<path> and a .json note. A file at a commit never changes, so a cached copy is
// used while it still has the sha256 its note recorded (or the git blob sha the tree lists).
// null for a file that is not there (404) when `optional`.
async function rawAt(sha, path, { optional = false, blob = null } = {}) {
    if (!SHA_RE.test(sha) || !/^[\w.-]+(?:\/[\w.-]+)*$/.test(path) || path.split("/").includes("..")) {
        throw new Exit(2, "refusing an odd upstream path: " + clean(sha, 40) + " " + clean(path));
    }
    const base = join(CACHE_DIR, sha), file = join(base, path), noteFile = file + ".json", url = RAW + sha + "/" + path;
    if (!file.startsWith(base + sep)) throw new Exit(2, "refusing an odd upstream path: " + clean(path));
    if (existsSync(file)) {
        const buf = readFileSync(file);
        let note = null;
        try { note = JSON.parse(readFileSync(noteFile, "utf8")); } catch { /* no note: fetch it again */ }
        if (blob ? gitBlob(buf) === blob : !!note && note.sha256 === sha256(buf)) return { buf, file, fetched: false };
    }
    const res = await get(url, { "User-Agent": UA });
    if (res.status === 404 && optional) return null;
    if (!res.ok) throw new Exit(2, "could not fetch " + url + ": HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (blob && gitBlob(buf) !== blob) throw new Exit(2, url + " is not the file the tree lists (git blob " + gitBlob(buf) + ", not " + blob + ")");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, buf);
    writeFileSync(noteFile, JSON.stringify({ url, commit: sha, path, sha256: sha256(buf), bytes: buf.length, fetched_at: new Date().toISOString() }, null, 2) + "\n");
    return { buf, file, fetched: true };
}

// A commit's tree (every file and its git blob sha), cached by commit, since it never changes.
async function treeAt(sha) {
    const file = join(OUT_DIR, "trees", sha + ".json");
    try {
        const t = JSON.parse(readFileSync(file, "utf8"));
        if (t && t.sha === sha && Array.isArray(t.tree)) return t;
    } catch { /* not cached yet */ }
    const t = await api("/git/trees/" + sha + "?recursive=1");
    if (!t || !Array.isArray(t.tree)) throw new Exit(2, "the tree of " + short(sha) + " came back without its files");
    const slim = { sha, truncated: !!t.truncated, tree: t.tree.filter((e) => e && e.type === "blob").map((e) => ({ path: String(e.path), sha: String(e.sha) })) };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(slim) + "\n");
    return slim;
}

function readJson(buf) {
    try { return JSON.parse(buf.toString("utf8")); } catch { return null; }
}

// ---- versions ----------------------------------------------------------------------------------------
function parseVersion(v) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?$/.exec(String(v ?? ""));
    return m ? { nums: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split(".") : [] } : null;
}

// Semantic version order: a release ranks above its prereleases, and beta.10 above beta.9.
function compareVersions(a, b) {
    for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] - b.nums[i];
    if (!a.pre.length || !b.pre.length) return (b.pre.length ? 1 : 0) - (a.pre.length ? 1 : 0);
    for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
        const x = a.pre[i], y = b.pre[i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
        if (nx && ny) { if (+x !== +y) return +x - +y; }
        else if (nx !== ny) return nx ? -1 : 1;
        else if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}

const versionName = (v) => (typeof v === "string" && VERSION_RE.test(v) ? v : null);

// ---- regions -----------------------------------------------------------------------------------------
// A page as numbered lines ([{ no, text }], trailing spaces dropped) and its style sheets as rules.
function readPage(buf) {
    const text = buf.toString("utf8").replace(/\r\n?/g, "\n");
    const lines = text.split("\n").map((t, i) => ({ no: i + 1, text: t.replace(/[ \t]+$/, "") }));
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
    const lineOf = (offset) => {           // the 0-based index of the line holding `offset`
        let lo = 0, hi = starts.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
        return lo;
    };
    return { lines, css: cssRules(text), lineOf };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const indentOf = (s) => /^[ \t]*/.exec(s)[0];
const span = (L, a, b) => L.slice(a, b + 1);

function findLine(L, re, from = 0) {
    for (let i = Math.max(0, from); i < L.length; i++) if (re.test(L[i].text)) return i;
    return -1;
}

// The line that declares a function: "function NAME(" (or async), else "const NAME = ... =>".
function fnStart(L, name, from = 0) {
    const n = escapeRe(name);
    const i = findLine(L, new RegExp("^\\s*(?:async\\s+)?function\\s+" + n + "\\s*\\("), from);
    return i >= 0 ? i : findLine(L, new RegExp("^\\s*(?:const|let|var)\\s+" + n + "\\s*=.*(?:=>|\\bfunction\\b)"), from);
}

// The line that closes the block opened on line i: the first later line that is only "}" (with ")",
// ";" or "," after it) at line i's indent; i itself when that line opens and closes it.
function blockEnd(L, i) {
    const t = L[i].text, opens = (t.match(/\{/g) || []).length, closes = (t.match(/\}/g) || []).length;
    if (opens > 0 && opens === closes) return i;
    const close = new RegExp("^" + escapeRe(indentOf(t)) + "\\}[);,]*\\s*(?:\\/\\/.*)?$");
    for (let j = i + 1; j < L.length; j++) if (close.test(L[j].text)) return j;
    return -1;
}

// The first line of the paragraph line i sits in: the lines right above it, at its indent or deeper,
// back to a blank line or the end of the block before (a "}" at its indent).
function paragraphStart(L, i) {
    const ind = indentOf(L[i].text), close = new RegExp("^" + escapeRe(ind) + "\\}");
    let k = i;
    while (k > 0) {
        const prev = L[k - 1].text;
        if (!prev.trim() || indentOf(prev).length < ind.length || close.test(prev)) break;
        k--;
    }
    return k;
}

function fnRegion(L, name) {
    const i = fnStart(L, name);
    if (i < 0) return null;
    const e = blockEnd(L, i);
    return e < 0 ? null : span(L, paragraphStart(L, i), e);
}

function safetyRegion(L) {
    const s = findLine(L, /\bconst MAX_PLAIN_CHARS\b/);
    if (s < 0) return null;
    const sr = fnStart(L, "sanitizeRich", s), srEnd = sr >= 0 ? blockEnd(L, sr) : -1;
    const fc = findLine(L, /^\s*(?:async\s+)?function\s+formatCurrency\s*\(/, s);
    let e;
    if (fc > s && fc > srEnd) {
        e = paragraphStart(L, fc) - 1;
        while (e > s && !L[e].text.trim()) e--;
    } else if (srEnd >= 0) e = srEnd;
    else return null;
    return span(L, s, e);
}

function limitRegion(L) {
    const j = fnStart(L, "highRollerMaxHeight");
    if (j < 0) return null;
    const e = blockEnd(L, j);
    if (e < 0) return null;
    const i = fnStart(L, "isHighRoller"), ie = i >= 0 ? blockEnd(L, i) : -1;
    let s = paragraphStart(L, j);
    if (ie >= 0 && ie < j) {
        s = ie + 1;
        while (s < j && !L[s].text.trim()) s++;
    }
    return span(L, s, e);
}

function receiptHeightRegion(L) {
    const i = findLine(L, /\bconst MAX_RECEIPT_HEIGHT\b/);
    if (i < 0) return null;
    let e = i;
    while (e < L.length - 1 && e < i + 5 && !/;\s*(?:\/\/.*)?$/.test(L[e].text)) e++;
    return span(L, i, e);
}

// The page's style sheets (the <style> elements before </head>) as rules: { prelude, start, end, at },
// with offsets into the page and the at-rules (@media ...) a rule sits in. Comments and strings are
// skipped while looking for braces.
function cssRules(text) {
    const endHead = text.search(/<\/head\s*>/i), head = endHead >= 0 ? text.slice(0, endHead) : text;
    const out = [], re = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
    let m;
    while ((m = re.exec(head))) {
        const from = m.index + m[0].indexOf(">") + 1;
        scanRules(text, from, from + m[1].length, [], out);
    }
    return out;
}

function skipComment(text, i, to) {
    const e = text.indexOf("*/", i + 2);
    return e < 0 || e + 2 > to ? to : e + 2;
}

function skipString(text, i, to) {
    const q = text[i];
    for (let j = i + 1; j < to; j++) {
        if (text[j] === "\\") j++;
        else if (text[j] === q || text[j] === "\n") return j + 1;
    }
    return to;
}

function matchBrace(text, i, to) {
    let depth = 0;
    for (let j = i; j < to; j++) {
        const c = text[j];
        if (c === "/" && text[j + 1] === "*") { j = skipComment(text, j, to) - 1; continue; }
        if (c === '"' || c === "'") { j = skipString(text, j, to) - 1; continue; }
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) return j;
    }
    return to - 1;
}

function scanRules(text, from, to, at, out) {
    let i = from, start = -1;
    while (i < to) {
        const c = text[i];
        if (c === "/" && text[i + 1] === "*") { i = skipComment(text, i, to); continue; }
        if (c === '"' || c === "'") { if (start < 0) start = i; i = skipString(text, i, to); continue; }
        if (c === ";" || c === "}") { start = -1; i++; continue; }
        if (c === "{") {
            const close = matchBrace(text, i, to);
            const prelude = start < 0 ? "" : text.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim();
            if (/^@(?:media|supports|layer|container|scope|document)\b/i.test(prelude)) scanRules(text, i + 1, close, at.concat(prelude), out);
            else if (prelude && prelude[0] !== "@") out.push({ prelude, start, end: close, at });
            i = close + 1; start = -1;
            continue;
        }
        if (start < 0 && !/\s/.test(c)) start = i;
        i++;
    }
}

// Every rule whose selector names `token` (#receipt-container, .part ...), in page order, each in the
// at-rules it sits in. Synthetic lines (the gaps, the @media wrappers) have no number.
function cssRegion(page, token) {
    const re = new RegExp(escapeRe(token) + "(?![\\w-])"), out = [];
    for (const r of page.css) {
        if (!re.test(r.prelude)) continue;
        if (out.length) out.push({ no: null, text: "" });
        for (const a of r.at) out.push({ no: null, text: a + " {" });
        out.push(...span(page.lines, page.lineOf(r.start), page.lineOf(r.end)));
        for (let k = 0; k < r.at.length; k++) out.push({ no: null, text: "}" });
    }
    return out.length ? out : null;
}

// The larger profile picture (the 3.0.0 betas): OLD_AVATAR_PX and GAP_ROOM with their paragraph,
// shareCuts, clearGaps and tightenGaps, to tightenGaps' end.
function largerPictureRegion(L) {
    const i = findLine(L, /\bconst OLD_AVATAR_PX\b/);
    if (i < 0) return null;
    const t = fnStart(L, "tightenGaps", i), e = t >= 0 ? blockEnd(L, t) : -1;
    return e < 0 ? null : span(L, paragraphStart(L, i), e);
}

// A handler in the page's HANDLERS table ("async NAME(d, opts) {" to its "}," at that indent).
function handlerRegion(L, name) {
    const i = findLine(L, new RegExp("^\\s*(?:async\\s+)?" + escapeRe(name) + "\\s*\\("));
    if (i < 0) return null;
    const e = blockEnd(L, i);
    return e < 0 ? null : span(L, paragraphStart(L, i), e);
}

// The lines of the page's `const internals = {...}` that name shareCuts or gapRooms (3.0).
function internalsGapsRegion(L) {
    const i = findLine(L, /^\s*const internals = \{/);
    const e = i < 0 ? -1 : blockEnd(L, i);
    const r = e < 0 ? [] : span(L, i, e).filter((l) => /\b(?:shareCuts|gapRooms)\b/.test(l.text));
    return r.length ? r : null;
}

// The page's notes on render(): from "PrinterBot.render(" to the line before "PrinterBot.setTheme(".
function apiNotesRegion(L) {
    const i = findLine(L, /^\s*\/\/\s*PrinterBot\.render\(/);
    if (i < 0) return null;
    const j = findLine(L, /^\s*\/\/\s*PrinterBot\.setTheme\(/, i);
    return j > i ? span(L, i, j - 1) : null;
}

const REGIONS = [
    { id: "safety", label: "safety section (MAX_PLAIN_CHARS to sanitizeRich)", get: (p) => safetyRegion(p.lines) },
    { id: "css-container", label: "CSS #receipt-container", get: (p) => cssRegion(p, "#receipt-container") },
    { id: "css-content", label: "CSS #receipt-content", get: (p) => cssRegion(p, "#receipt-content") },
    { id: "css-part", label: "CSS .part", get: (p) => cssRegion(p, ".part") },
    { id: "isHighRoller", label: "isHighRoller()", get: (p) => fnRegion(p.lines, "isHighRoller") },
    { id: "highRollerMaxHeight", label: "highRollerMaxHeight() (from isHighRoller's end)", get: (p) => limitRegion(p.lines) },
    { id: "viewOf", label: "viewOf()", optional: true, get: (p) => fnRegion(p.lines, "viewOf") },
    { id: "show", label: "show()", get: (p) => fnRegion(p.lines, "show") },
    { id: "MAX_RECEIPT_HEIGHT", label: "MAX_RECEIPT_HEIGHT", get: (p) => receiptHeightRegion(p.lines) },
    { id: "css-avatar", label: "CSS #receipt-avatar", get: (p) => cssRegion(p, "#receipt-avatar") },
    { id: "larger-picture", label: "the larger picture (OLD_AVATAR_PX to tightenGaps)", optional: true, get: (p) => largerPictureRegion(p.lines) },
    { id: "TwitchCheer", label: "the TwitchCheer handler", get: (p) => handlerRegion(p.lines, "TwitchCheer") },
    { id: "present", label: "present()", optional: true, get: (p) => fnRegion(p.lines, "present") },
    { id: "api-notes", label: "render()'s API notes", get: (p) => apiNotesRegion(p.lines) },
    { id: "internals-gaps", label: "internals.shareCuts / gapRooms", optional: true, get: (p) => internalsGapsRegion(p.lines) },
];

// identical | changed | new (only upstream has it) | gone (only the vendored copy has it) |
// missing (neither has it: this tool's markers need a look) | absent (an optional region in neither).
function compareRegions(pinBuf, upBuf) {
    const A = readPage(pinBuf), B = readPage(upBuf);
    return REGIONS.map((r) => {
        const a = r.get(A), b = r.get(B);
        let status;
        if (!a && !b) status = r.optional ? "absent" : "missing";
        else if (!a) status = "new";
        else if (!b) status = "gone";
        else status = a.length === b.length && a.every((l, i) => l.text === b[i].text) ? "identical" : "changed";
        return { id: r.id, label: r.label, status, a, b, sha256: b ? sha256(b.map((l) => l.text).join("\n")) : null };
    });
}

function lineSpan(region) {
    const nos = (region || []).map((l) => l.no).filter((n) => n != null);
    return nos.length ? nos[0] + "-" + nos[nos.length - 1] : "-";
}

// ---- a unified diff of two regions -------------------------------------------------------------------
// Three lines of context; the hunk headers carry the files' own line numbers.
function unifiedDiff(a, b, ctx = 3) {
    const n = a.length, m = b.length;
    let pre = 0;
    while (pre < n && pre < m && a[pre].text === b[pre].text) pre++;
    let suf = 0;
    while (suf < n - pre && suf < m - pre && a[n - 1 - suf].text === b[m - 1 - suf].text) suf++;
    const A = a.slice(pre, n - suf), B = b.slice(pre, m - suf), N = A.length, M = B.length;
    const ops = [];
    for (let k = 0; k < pre; k++) ops.push([" ", a[k], b[k]]);
    if (N * M > 4e6) {
        for (const x of A) ops.push(["-", x, null]);
        for (const y of B) ops.push(["+", null, y]);
    } else {
        const W = M + 1, t = new Uint32Array((N + 1) * W);       // t[i][j]: the longest common run of A[i..] and B[j..]
        for (let i = N - 1; i >= 0; i--) {
            for (let j = M - 1; j >= 0; j--) {
                t[i * W + j] = A[i].text === B[j].text ? t[(i + 1) * W + j + 1] + 1 : Math.max(t[(i + 1) * W + j], t[i * W + j + 1]);
            }
        }
        let i = 0, j = 0;
        while (i < N || j < M) {
            if (i < N && j < M && A[i].text === B[j].text) ops.push([" ", A[i++], B[j++]]);
            else if (i < N && (j === M || t[(i + 1) * W + j] >= t[i * W + j + 1])) ops.push(["-", A[i++], null]);
            else ops.push(["+", null, B[j++]]);
        }
    }
    for (let k = 0; k < suf; k++) ops.push([" ", a[n - suf + k], b[m - suf + k]]);

    const side = (s) => (o) => o[s];
    const startNo = (h, s, at) => {            // the first numbered line of a side in the hunk, else the one before it
        for (const o of h) if (o[s] && o[s].no != null) return o[s].no;
        for (let q = at - 1; q >= 0; q--) if (ops[q][s] && ops[q][s].no != null) return ops[q][s].no;
        return 0;
    };
    const out = [];
    let k = 0;
    while (k < ops.length) {
        if (ops[k][0] === " ") { k++; continue; }
        let last = k, q = k + 1;
        while (q < ops.length && q - last <= 2 * ctx + 1) { if (ops[q][0] !== " ") last = q; q++; }
        const s = Math.max(0, k - ctx), e = Math.min(ops.length, last + ctx + 1), h = ops.slice(s, e);
        const oldN = h.filter((o) => o[0] !== "+").length, newN = h.filter((o) => o[0] !== "-").length;
        out.push("@@ -" + startNo(h, 1, s) + "," + oldN + " +" + startNo(h, 2, s) + "," + newN + " @@");
        for (const o of h) out.push(o[0] + (o[0] === "+" ? side(2)(o).text : side(1)(o).text));
        k = e;
    }
    return out;
}

// ---- the pinned copy ---------------------------------------------------------------------------------
async function pinnedCopy(pin, have) {
    if (have && sha256(have) === pin.sha256) return have;
    const f = await rawAt(pin.commit, pin.path);
    if (sha256(f.buf) !== pin.sha256) {
        throw new Exit(2, pin.path + " @ " + short(pin.commit) + " has sha256 " + sha256(f.buf) + ", not the " + pin.sha256 + " the vendored block records (" + rel(f.file) + ")");
    }
    return f.buf;
}

// ---- the report --------------------------------------------------------------------------------------
const STATUS_WORD = { identical: "identical", changed: "CHANGED", new: "NEW", gone: "GONE", missing: "NOT FOUND", absent: "absent" };

// The verdict of every region of one renderer (`name` says which), then the diffs of those that differ.
function regionLines(name, regions, { diff, older }) {
    const out = ["Regions of " + name + ", against the vendored renderer:"];
    for (const r of regions) {
        if (r.status === "absent") continue;
        let where = "vendored lines " + lineSpan(r.a) + ", upstream " + lineSpan(r.b);
        if (r.status === "new") where = "upstream lines " + lineSpan(r.b) + "; not in the vendored renderer";
        if (r.status === "gone") where = "vendored lines " + lineSpan(r.a) + "; its markers are not upstream";
        if (r.status === "missing") where = "in neither copy: this tool's markers need a look";
        out.push("  " + STATUS_WORD[r.status].padEnd(10) + "  " + r.label.padEnd(48) + "  " + where);
    }
    if (!diff || older) {
        if (older && regions.some((r) => ATTENTION.has(r.status))) out.push("  (no diffs for a renderer older than the vendored one)");
        return out;
    }
    for (const r of regions) {
        if (r.status !== "changed" && r.status !== "new" && r.status !== "gone") continue;
        out.push("");
        out.push("--- vendored: " + r.label + (r.a ? ", lines " + lineSpan(r.a) : " (not there)"));
        out.push("+++ " + name + ": " + r.label + (r.b ? ", lines " + lineSpan(r.b) : " (not there)"));
        const d = unifiedDiff(r.a || [], r.b || []);
        // A region whose markers are gone would print as the whole vendored text: its start is enough.
        if (r.status === "gone" && d.length > 13) d.splice(13, d.length - 13, "  (" + (d.length - 13) + " more lines of the vendored region)");
        out.push(...d);
    }
    return out;
}

function sinceLast(prev, cur) {
    if (!prev) return ["No previous run: this one is the baseline (" + rel(join(OUT_DIR, "last.json")) + ")."];
    const out = [];
    const v0 = prev.vendored || {}, v1 = cur.vendored;
    if (v0.sha256 !== v1.sha256) out.push("the vendored renderer: " + (v0.path || "?") + " @ " + short(v0.commit) + " -> " + v1.path + " @ " + short(v1.commit));
    const b0 = prev.branches || {}, b1 = cur.branches;
    for (const name of new Set([...Object.keys(b0), ...Object.keys(b1)])) {
        if (!b0[name]) out.push("new branch " + clean(name, 60) + " @ " + short(b1[name]));
        else if (!b1[name]) out.push("branch " + clean(name, 60) + " is gone (was " + short(b0[name]) + ")");
        else if (b0[name] !== b1[name]) out.push(clean(name, 60) + " moved " + short(b0[name]) + " -> " + short(b1[name]));
    }
    const t0 = prev.tags || {}, t1 = cur.tags;
    const added = Object.keys(t1).filter((n) => !t0[n]), removed = Object.keys(t0).filter((n) => !t1[n]);
    const moved = Object.keys(t1).filter((n) => t0[n] && t0[n] !== t1[n]);
    if (added.length) out.push("new tags: " + added.map((n) => clean(n, 60)).join(", "));
    if (removed.length) out.push("tags gone: " + removed.map((n) => clean(n, 60)).join(", "));
    if (moved.length) out.push("tags moved: " + moved.map((n) => clean(n, 60) + " " + short(t0[n]) + " -> " + short(t1[n])).join(", "));
    const r0 = new Map((prev.releases || []).map((r) => [r.tag, r]));
    for (const r of cur.releases) {
        const was = r0.get(r.tag);
        r0.delete(r.tag);
        if (!was) out.push("new release " + clean(r.name, 80) + (r.prerelease ? " (prerelease)" : "") + ", tag " + clean(r.tag, 60));
        else if (was.prerelease !== r.prerelease) out.push("release " + clean(r.name, 80) + " is " + (r.prerelease ? "a prerelease now" : "no longer a prerelease"));
    }
    for (const r of r0.values()) out.push("release " + clean(r.name, 80) + " (tag " + clean(r.tag, 60) + ") is gone");
    for (const br of [STABLE, BETA]) {
        const x = ((prev.versions_json || {})[br] || {}).data || null, y = (cur.versions_json[br] || {}).data || null;
        if (JSON.stringify(x) === JSON.stringify(y)) continue;
        const parts = [];
        for (const [k, f] of [["latest", (d) => d && d.latest], ["core.latest", (d) => d && d.core && d.core.latest], ["core.prerelease", (d) => d && d.core && d.core.prerelease]]) {
            if (f(x) !== f(y)) parts.push(k + " " + clean(f(x) ?? "none", 30) + " -> " + clean(f(y) ?? "none", 30));
        }
        out.push("versions.json on " + br + " changed" + (parts.length ? ": " + parts.join(", ") : " (other fields)"));
    }
    const c0 = new Map((prev.renderers || []).map((c) => [c.label, c]));
    for (const c of cur.renderers) {
        const was = c0.get(c.label);
        c0.delete(c.label);
        if (!was) { out.push(c.label + ": first seen, " + c.path + " @ " + short(c.commit) + " (" + c.status + ")"); continue; }
        if (was.sha256 !== c.sha256 || was.path !== c.path) out.push(c.label + ": " + (was.path || "?") + " (VERSION " + (was.version || "?") + ") -> " + c.path + " (VERSION " + (c.version || "?") + ")");
        else if (was.status !== c.status) out.push(c.label + ": " + was.status + " -> " + c.status);
        const g0 = was.regions || {};
        for (const [id, r] of Object.entries(c.regions || {})) {
            if (g0[id] && g0[id].status !== r.status) out.push(c.label + " " + id + ": " + g0[id].status + " -> " + r.status);
        }
    }
    for (const [label] of c0) out.push(label + ": no longer found");
    if (prev.exit !== cur.exit) out.push("exit status " + prev.exit + " -> " + cur.exit);
    if (!out.length) return ["Nothing changed upstream since the last run (" + prev.checked_at + ")."];
    return ["Since the last run (" + prev.checked_at + "):", ...out.map((s) => "  " + s)];
}

// ---- --renderer: one local file against the vendored renderer ----------------------------------------
async function compareLocal(o, pin) {
    const buf = readFileSync(o.renderer);
    const out = ["Vendored: " + pin.path + " @ " + short(pin.commit) + ", VERSION " + pin.version];
    const version = rendererVersion(buf);
    out.push("Compared: " + o.renderer + ", VERSION " + (version || "(none found)") + ", sha256 " + sha256(buf));
    if (sha256(buf) === pin.sha256) {
        out.push("", "It is the vendored renderer, byte for byte.");
        process.stdout.write(out.join("\n") + "\n");
        return 0;
    }
    const regions = compareRegions(await pinnedCopy(pin, null), buf);
    out.push("", ...regionLines(o.renderer, regions, { diff: o.diff, older: false }));
    const code = regions.some((r) => ATTENTION.has(r.status)) ? 20 : 10;
    out.push("", code === 20 ? "Exit 20: a region Receipt Wrecker depends on differs." : "Exit 10: it differs, but every region Receipt Wrecker depends on is identical.");
    process.stdout.write(out.join("\n") + "\n");
    return code;
}

// ---- the watch ---------------------------------------------------------------------------------------
async function main() {
    const o = parseArgs(process.argv);
    const pin = readPin(o.file);
    if (o.renderer) return compareLocal(o, pin);

    // What GitHub says: every branch's head, the tags, the releases.
    const branches = {};
    for (const b of await api("/branches?per_page=100", 5)) {
        const sha = b && b.commit && b.commit.sha;
        if (b && typeof b.name === "string" && SHA_RE.test(sha || "")) branches[b.name] = sha;
    }
    const tags = {};
    for (const t of await api("/tags?per_page=100", 5)) {
        const sha = t && t.commit && t.commit.sha;
        if (t && typeof t.name === "string" && SHA_RE.test(sha || "")) tags[t.name] = sha;
    }
    const releases = (await api("/releases?per_page=100", 5)).filter((r) => r && typeof r.tag_name === "string" && !r.draft)
        .map((r) => ({ tag: r.tag_name, name: clean(r.name || r.tag_name, 80), prerelease: !!r.prerelease, published_at: typeof r.published_at === "string" ? r.published_at : null }));

    // versions.json at the heads of master and beta.
    const versions = {};
    for (const br of [STABLE, BETA]) {
        if (!branches[br]) { versions[br] = null; continue; }
        const f = await rawAt(branches[br], "versions.json", { optional: true });
        versions[br] = { commit: branches[br], sha256: f ? sha256(f.buf) : null, data: f ? readJson(f.buf) : null };
    }

    // The renderers to look at.
    const cands = [];
    const add = (label, br, path, why) => {
        const commit = branches[br];
        if (!commit) return;
        const same = cands.find((c) => c.commit === commit && c.path === path);
        if (same) { same.why.push(why); return; }
        cands.push({ label, branch: br, commit, path, why: [why] });
    };
    const vm = versions[STABLE] && versions[STABLE].data, vb = versions[BETA] && versions[BETA].data;
    const latest = versionName(vm && vm.latest);
    add("master stable", STABLE, latest ? "v/" + latest + "/renderer.html" : pin.path,
        latest ? "versions.json latest " + latest : "the vendored path (master's versions.json names no latest)");
    const masterPre = versionName(vm && vm.core && vm.core.prerelease);
    if (masterPre) add("master prerelease", STABLE, "v/" + masterPre + "/renderer.html", "versions.json core.prerelease " + masterPre);
    let tree = null, treeRenderers = [];
    if (branches[BETA]) {
        tree = await treeAt(branches[BETA]);
        treeRenderers = tree.tree.map((e) => ({ path: e.path, blob: e.sha, version: (TREE_RENDERER_RE.exec(e.path) || [])[1] }))
            .filter((e) => versionName(e.version))
            .sort((x, y) => compareVersions(parseVersion(x.version), parseVersion(y.version)));
        const newest = treeRenderers[treeRenderers.length - 1];
        if (newest) add("beta newest", BETA, newest.path, "the newest v/*/renderer.html in beta's tree");
        const betaPre = versionName(vb && vb.core && vb.core.prerelease);
        if (betaPre) add("beta prerelease", BETA, "v/" + betaPre + "/renderer.html", "versions.json core.prerelease " + betaPre);
    }

    // Read each one (and the version.json beside it), and sort it: the vendored one, older, or new.
    for (const c of cands) {
        const listed = c.branch === BETA && tree ? tree.tree.find((e) => e.path === c.path) : null;
        const f = await rawAt(c.commit, c.path, { optional: true, blob: listed ? listed.sha : null });
        if (!f) { c.status = "missing"; continue; }
        c.buf = f.buf; c.file = f.file; c.sha256 = sha256(f.buf); c.blob = gitBlob(f.buf); c.version = rendererVersion(f.buf);
        const vj = await rawAt(c.commit, c.path.replace(/renderer\.html$/, "version.json"), { optional: true });
        const vd = vj ? readJson(vj.buf) : null;
        c.versionJson = vd ? { version: vd.version ?? null, built: vd.built ?? null } : null;
        const order = versionOrder(c.version, pin.version);
        c.status = c.sha256 === pin.sha256 ? "vendored" : order === -1 ? "older" : "newer";
    }

    // Compare the regions of every renderer that is not the vendored one (once per distinct file).
    const differing = cands.filter((c) => c.status === "newer" || c.status === "older");
    const vendoredHere = cands.find((c) => c.sha256 === pin.sha256);
    let pinBuf = vendoredHere ? vendoredHere.buf : null;
    if (differing.length) {
        pinBuf = await pinnedCopy(pin, pinBuf);
        const done = new Map();
        for (const c of differing) {
            if (!done.has(c.sha256)) done.set(c.sha256, compareRegions(pinBuf, c.buf));
            c.regions = done.get(c.sha256);
        }
    }
    const pinBlob = pinBuf ? gitBlob(pinBuf) : null;       // marks the vendored file in beta's tree listing

    // The exit status.
    const newer = cands.filter((c) => c.status === "newer");
    const attention = !branches[STABLE] || cands.some((c) => c.status === "missing") || newer.some((c) => c.regions.some((r) => ATTENTION.has(r.status)));
    const code = attention ? 20 : newer.length ? 10 : 0;

    // The baseline, and what changed since the previous one.
    const baseline = {
        format: 1,
        tool: "tools/upstream-watch.mjs",
        checked_at: new Date().toISOString(),
        repo: OWNER_REPO,
        vendored: { commit: pin.commit, path: pin.path, version: pin.version, sha256: pin.sha256 },
        branches, tags, releases,
        versions_json: Object.fromEntries([STABLE, BETA].map((br) => [br, versions[br]])),
        beta_tree_renderers: treeRenderers.map((t) => ({ path: t.path, blob: t.blob })),
        renderers: cands.map((c) => ({
            label: c.label, branch: c.branch, commit: c.commit, path: c.path, why: c.why, status: c.status,
            sha256: c.sha256 || null, version: c.version || null, version_json: c.versionJson || null, cached: c.file ? rel(c.file) : null,
            regions: c.regions ? Object.fromEntries(c.regions.filter((r) => r.status !== "absent").map((r) => [r.id, { status: r.status, sha256: r.sha256 }])) : null,
        })),
        exit: code,
    };
    let prev = null;
    try { prev = JSON.parse(readFileSync(join(OUT_DIR, "last.json"), "utf8")); } catch { /* the first run */ }
    if (prev && prev.format !== 1) prev = null;

    // The report.
    const out = [];
    const tagsAt = (sha) => Object.keys(tags).filter((n) => tags[n] === sha).map((n) => clean(n, 40));
    const pinTags = tagsAt(pin.commit);
    out.push("Upstream watch: " + OWNER_REPO + ", " + baseline.checked_at + " (" + apiReads + " anonymous API reads)");
    out.push("Vendored here: " + pin.path + " @ " + short(pin.commit) + (pinTags.length ? " (" + pinTags.join(", ") + ")" : "") + ", VERSION " + pin.version);
    out.push("");
    out.push("Upstream");
    for (const br of [STABLE, BETA, ...Object.keys(branches).filter((n) => n !== STABLE && n !== BETA).sort()]) {
        const sha = branches[br];
        if (!sha) { out.push("  " + br.padEnd(8) + "  (no such branch)"); continue; }
        const t = tagsAt(sha);
        out.push("  " + clean(br, 30).padEnd(8) + "  " + short(sha) + (t.length ? "  " + t.join(", ") : "") + (sha === pin.commit ? "  (the vendored commit)" : ""));
        const v = versions[br] && versions[br].data;
        if (versions[br]) {
            out.push("            versions.json: " + (v ? "latest " + clean(v.latest ?? "none", 30) + ", core " + clean((v.core && v.core.latest) ?? "none", 30) +
                (v.core && v.core.prerelease ? ", prerelease " + clean(v.core.prerelease, 30) : "") : "none or not JSON"));
        }
    }
    // Tags and releases after the vendored commit's own tag, by version.
    const byVersion = (x, y) => compareVersions(parseVersion(x), parseVersion(y));
    const pinTag = pinTags.filter(parseVersion).sort(byVersion).pop() || null;
    if (pinTag) {
        const after = (name) => !!parseVersion(name) && byVersion(name, pinTag) > 0;
        const newerTags = Object.keys(tags).filter(after).sort(byVersion);
        out.push("  tags after " + pinTag + ": " + (newerTags.length ? newerTags.map((n) => clean(n, 40)).join(", ") : "none"));
        const newerRel = releases.filter((r) => after(r.tag)).map((r) => {
            const notes = [r.prerelease ? "prerelease" : "", r.published_at ? r.published_at.slice(0, 10) : ""].filter(Boolean);
            return r.name + (notes.length ? " (" + notes.join(", ") + ")" : "");
        });
        out.push("  releases after " + pinTag + ": " + (newerRel.length ? newerRel.join("; ") : "none"));
    } else {
        const newest = Object.keys(tags).filter(parseVersion).sort(byVersion).reverse().slice(0, 3);
        out.push("  no version tag names the vendored commit; the newest tags: " + (newest.map((n) => clean(n, 40)).join(", ") || "none"));
    }
    if (treeRenderers.length) {
        out.push("  renderers in beta's tree: " + treeRenderers.map((t) => t.version + (pinBlob && t.blob === pinBlob ? " (= vendored)" : "")).join(", ") + (tree && tree.truncated ? " (GitHub cut the listing short)" : ""));
    }
    out.push("");
    out.push("Renderers");
    for (const c of cands) {
        const head = "  " + c.label.padEnd(17) + "  " + c.path + " @ " + short(c.commit);
        if (c.status === "missing") { out.push(head + "  MISSING upstream (" + c.why.join("; ") + ")"); continue; }
        const word = c.status === "vendored" ? "the vendored renderer"
            : c.status === "older" ? "older than the vendored one (not new)"
            : versionOrder(c.version, pin.version) === 1 ? "NEW: built after the vendored one" : "NEW: differs from the vendored one";
        out.push(head + "  VERSION " + (c.version || "?") + "  " + word);
        out.push("                       " + c.why.join("; ") + (c.versionJson ? "; version.json " + clean(c.versionJson.version, 20) + ", built " + clean(c.versionJson.built, 30) : ""));
        if (c.versionJson && c.version && String(c.versionJson.version) !== c.version) out.push("                       (version.json and the page's VERSION disagree)");
        if (c.status !== "vendored") out.push("                       cached: " + rel(c.file));
    }
    if (!branches[STABLE]) out.push("  master is gone: the stable renderer can't be checked");
    const first = new Map();                   // sha256 -> the first renderer with that file
    for (const c of differing) {
        out.push("");
        if (first.has(c.sha256)) { out.push(c.label + " is the same file as " + first.get(c.sha256).label + "."); continue; }
        first.set(c.sha256, c);
        out.push(...regionLines(c.label + " (" + c.path + " @ " + short(c.commit) + ")", c.regions, { diff: o.diff, older: c.status === "older" }));
    }
    out.push("");
    out.push(...sinceLast(prev, baseline));
    out.push("");
    out.push(code === 20 ? "Exit 20: something Receipt Wrecker depends on changed upstream. Read the diffs; CLAUDE.md, \"SassyTP shipped a new version\", says what to do."
        : code === 10 ? "Exit 10: a new renderer upstream, and every region Receipt Wrecker depends on is identical."
        : "Exit 0: nothing new upstream.");

    mkdirSync(OUT_DIR, { recursive: true });
    const tmp = join(OUT_DIR, "last.json.tmp");
    writeFileSync(tmp, JSON.stringify(baseline, null, 2) + "\n");
    renameSync(tmp, join(OUT_DIR, "last.json"));
    writeFileSync(join(OUT_DIR, "last-report.txt"), out.join("\n") + "\n");
    process.stdout.write(out.join("\n") + "\n");
    return code;
}

main().then((code) => process.exit(code), (e) => {
    process.stderr.write((e instanceof Exit ? "" : "error: ") + String(e && e.message || e) + "\n");
    process.exit(e instanceof Exit ? e.code : 2);
});
