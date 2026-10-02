// Build the EXACT document printer-bot prints for a chat message, from printer-bot's own
// live files, and optionally render it on the real engine.
//
// Why this exists. printer-bot's sanitizer strips `style` but keeps `class`, and the page
// it hands to wkhtmltopdf is built by GetRenderedHTML, which inlines the text of EVERY
// stylesheet linked from its settings page: nutty's shared UI stylesheet global.css, then
// contents/style.css. So whatever classes those sheets define style our markup on paper,
// and giant type is nothing but `.title` nested. tools/rig.py's own page carries a
// hand-copied subset of that CSS, which is exactly the "number measured against something
// that is not the rig" trap this repo keeps falling into. This tool reads the real thing:
//
//   1. fetch nutty's live settings page (contents/) and take the stylesheet list, its
//      order and the receipt <template> FROM IT, rather than re-typing them here;
//   2. in headless Chromium, run printer-bot's REAL SanitizeHTML (nutty's helpers.js);
//   3. mirror the overlay's TwitchCheer handler: the emote pass (each Twitch emote name
//      replaced by an <img class="emote">) and the cheermote pass (the first Cheer<N>
//      replaced by the gem + <span class="bits">), both as string replaces on innerHTML;
//   4. fill the template (avatar, "<bits> BITS", the sender, the footer date) and emit
//      the GetRenderedHTML-equivalent document: inline <style> text, then every linked
//      stylesheet's text, in order, in one <style>.
//
// Checked 2026-10-02 on the field payload (the tuck span, 15 x <b class=title>, P</br>E…):
// the document this emits matched, byte for byte apart from image paths, the one
// printer-bot's own overlay script builds when it is run in a browser with Streamer.bot
// stubbed. On the real engine with Segoe UI it prints on 2 pages: "S" and the footer
// spill past the 500mm page, page 1's ink ending under the "I" (y 1541.7 css px).
//
// Chromium is used ONLY for those string passes (and for --check's CSS parse). It is not
// the rig's engine and its geometry is wrong in ways that matter here (position:fixed
// repeats on page 2, trailing spaces hang instead of centring, font-size is not rounded
// to whole px, a different line height without Segoe UI), so --png renders with the REAL
// wkhtmltopdf through tools/rig.py --document, and only when there is no engine at all
// falls back to a Chromium render labelled APPROXIMATE.
//
// Nothing of nutty's is vendored. Every fetched file is cached under the gitignored
// .render/printerbot/cache/ with its sha256 and fetch time, and every run reports that
// provenance as JSON on stderr. Do not copy those files, or any font, into the repo.
// That is not just tidiness: the source is public at github.com/nuttylmao/nutty.gg but
// carries NO licence, so it is all rights reserved. Fetching it to measure against is fine;
// committing a copy is not.
//
// Live or pinned. widgets.nutty.gg is GitHub Pages for that repo (its CNAME), so the live
// site IS main: checked 2026-10-02, all five files byte-identical to main @ be2972f. By
// default this tool reads the live site, because that is what a streamer's printer-bot
// loads today. --ref reads the same paths from the repo at a commit instead, resolved to a
// full sha and recorded, so a measurement can be re-run against exactly the CSS it was
// taken on. It replays commits from 121c351 (2026-08-27, where the sanitizer arrived)
// onward. EARLIER COMMITS ARE REFUSED (exit 2): the pipeline runs printer-bot's own
// SanitizeHTML, which they do not have, and before it printer-bot inserted the message as
// raw innerHTML, a path this tool does not implement. A --ref run never rewrites the
// printed.css cache tools/rig.py reads; that stays the last LIVE set.
// Images are localized (file:// in .render/) because a failed subresource with an
// extension outside wkhtmltopdf's media list is a FATAL whole-job error, and a Twitch
// emote URL ends in "3.0".
//
// Usage:
//   node tools/printerbot.mjs < message.txt                 # -> .render/printerbot/receipt.html
//   node tools/printerbot.mjs --message 'Cheer100 hi' --png .render/printerbot/hi.png
//   node tools/payload.mjs '{"kind":"giant",...}' | node tools/printerbot.mjs --out - \
//     | python3 tools/rig.py my-case --document -
//   npm run printerbot -- --check                           # release-checklist canary
//
// Options:
//   --message TEXT       the chat message (default: stdin; one trailing newline dropped)
//   --bits N             the header's "<N> BITS" (default: the message's Cheer<N> tokens)
//   --user NAME          the header's sender line (default "someviewer")
//   --avatar URL|PATH    header picture (default: a 300x300 stand-in, Twitch's size)
//   --cheer-img URL|PATH the cheer gem (default: a 112x112 stand-in, the gem's size)
//   --emote NAME=URL|PATH  a Twitch emote, repeatable. Applied only where Twitch itself
//                        would recognise it: as a whole whitespace-delimited word.
//   --date ISO           the footer timestamp (default: now)
//   --out FILE|-         where the document goes (default .render/printerbot/receipt.html)
//   --png FILE           also render it: real wkhtmltopdf via rig.py, else APPROXIMATE
//   --fonts DIR          passed to rig.py: YOUR copy of Segoe UI (never downloaded)
//   --paper MM           roll width in mm (default 80, the rig's); the page is MM-8
//   --offline            use the cache only; never touch the network
//   --ref SHA|BRANCH     read nutty's files from github.com/nuttylmao/nutty.gg at that
//                        commit instead of the live site (a branch or tag is resolved to
//                        its sha with git ls-remote and recorded in the provenance)
//   --check             exit 1 if any PB_CLASSES declaration (read from the app core) is
//                        missing from the live CSS, the real sanitizer drops one of the
//                        classes, a linked stylesheet answers 404 (printer-bot would inline
//                        it empty), or the printed CASCADE does not size nested .title, the
//                        shrink steps and the tuck the way the app assumes (an override of
//                        any selector or !important). Exit 2 if any of nutty's files could
//                        only come from the cache. The verdict is the LAST line of stderr.
//                        A release-checklist canary: NOT in CI, which stays offline, and no
//                        test may import this file.
//
// Exit status: 0 fine; 1 --check failed or the render failed; 2 usage or environment.
// The last line of stderr says which: the --check verdict, or the reason for an exit 2.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { isatty } from "node:tty";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const OUT = join(REPO, ".render", "printerbot");
const CACHE = join(OUT, "cache");
const MANIFEST = join(CACHE, "manifest.json");
// The overlay page printer-bot's Streamer.bot import loads. Everything else (stylesheets,
// helpers.js, the template) is derived from what this page links, so a move or a rename on
// nutty's side shows up as a different list in the provenance instead of a silent miss.
const CONTENTS_URL = "https://widgets.nutty.gg/printer-bot/contents/";
const ORIGIN = new URL(CONTENTS_URL).origin;
// The same site's source, for --ref. A path on ORIGIN maps to the same path in the repo.
const REPO_GIT = "https://github.com/nuttylmao/nutty.gg";
const REPO_RAW = "https://raw.githubusercontent.com/nuttylmao/nutty.gg/";
// Text markers of the overlay pipeline this tool MIRRORS rather than runs (contents/
// script.js). A miss is a WARNING under --check: the mirror in passes() may be stale.
const PIPELINE_MARKERS = ["GetRenderedHTML", 'link[rel="stylesheet"]', "SanitizeHTML(data.message)"];

const rel = (p) => { const r = relative(REPO, p); return !r ? "." : r.startsWith("..") ? p : r; };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const prov = { tool: "tools/printerbot.mjs", contents: CONTENTS_URL, fetched: [], warnings: [] };

function warn(msg) {
  prov.warnings.push(msg);
  console.error("[printerbot] WARNING: " + msg);
}
function note(msg) {
  console.error("[printerbot] " + msg);
}
// The provenance JSON first and the reason LAST, so the last line of stderr always says
// what happened (`2>&1 | tail -1`); see the verdict at the end of main for --check.
function fail(code, msg) {
  prov.error = msg;
  console.error(JSON.stringify(prov, null, 1));
  console.error("[printerbot] " + msg);
  process.exit(code);
}

// ---------------------------------------------------------------------------- arguments

function parseArgs(argv) {
  const o = { emotes: [], paper: 80, user: "someviewer" };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) fail(2, flag + " needs a value");
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-h": case "--help": o.help = true; break;
      case "--offline": o.offline = true; break;
      case "--check": o.check = true; break;
      case "--message": o.message = need(i, a); i++; break;
      case "--user": o.user = need(i, a); i++; break;
      case "--avatar": o.avatar = need(i, a); i++; break;
      case "--cheer-img": o.cheerImg = need(i, a); i++; break;
      case "--out": o.out = need(i, a); i++; break;
      case "--png": o.png = need(i, a); i++; break;
      case "--fonts": o.fonts = need(i, a); i++; break;
      case "--ref": {
        const v = need(i, a); i++;
        if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(v)) fail(2, "--ref needs a commit sha, branch or tag, got " + JSON.stringify(v));
        o.ref = v;
        break;
      }
      case "--date": {
        const d = new Date(need(i, a)); i++;
        if (isNaN(d)) fail(2, "--date needs a date, e.g. 2026-10-01T13:50:00");
        o.date = d;
        break;
      }
      case "--bits": {
        const v = need(i, a); i++;
        if (!/^[1-9]\d*$/.test(v)) fail(2, "--bits needs a whole number of bits, got " + JSON.stringify(v));
        o.bits = +v;
        break;
      }
      case "--paper": {
        const v = need(i, a); i++;
        if (!/^\d+$/.test(v)) fail(2, "--paper needs a whole number of mm, got " + JSON.stringify(v));
        if (+v <= 8) fail(2, "--paper must exceed 8mm; the page is roll-8mm");
        o.paper = +v;
        break;
      }
      case "--emote": {
        const v = need(i, a); i++;
        const at = v.indexOf("=");
        if (at < 1 || at === v.length - 1) fail(2, "--emote needs NAME=URL or NAME=PATH, got " + JSON.stringify(v));
        o.emotes.push({ name: v.slice(0, at), spec: v.slice(at + 1) });
        break;
      }
      default:
        fail(2, "unknown option " + JSON.stringify(a) + " (see --help)");
    }
  }
  return o;
}

// ------------------------------------------------------------------- fetch, with a cache

let manifest = {};
try { manifest = JSON.parse(readFileSync(MANIFEST, "utf8")); } catch { /* first run */ }
const memo = new Map();

// Where a URL's bytes live in the cache. Images get a real extension when their path has
// none an engine would recognise (a Twitch emote's path ends in "3.0").
function cachePath(url, contentType) {
  const u = new URL(url);
  let p = u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname;
  if (u.search) p += "__" + sha(u.search).slice(0, 10);
  const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp" }[
    String(contentType || "").split(";")[0].trim()];
  if (ext && !/\.(png|jpe?g|gif|webp|svg)$/i.test(p)) p += ext;
  return join(CACHE, u.host, ...p.split("/").filter((s) => s && s !== ".." && s !== "."));
}

function record(r) {
  if (prov.fetched.some((f) => f.url === r.url)) return;
  prov.fetched.push({ url: r.url, sha256: r.sha256, bytes: r.bytes, fetched_at: r.fetched_at, from: r.from });
}

function get(url) {
  if (!memo.has(url)) memo.set(url, fetchOne(url).then((r) => { record(r); return r; }));
  return memo.get(url);
}

// --ref: the commit every nutty URL is read at, as a full sha (resolved once in main).
let REF_SHA = null;

// A branch or tag -> its commit, with git ls-remote (no API token, no rate limit). Offline,
// only a full sha can be honoured: anything else names a commit we cannot pin.
// EXACT ref names only, never "the first line ls-remote prints". ls-remote matches each
// pattern against the TAIL of every ref name, so a bare `--ref head` matched 36
// refs/pull/N/head lines and resolved to a contributor's unmerged PR (f7ed56cb), recorded
// in the provenance as if it were a branch. And an annotated tag's own line is the tag
// OBJECT, which raw.githubusercontent.com answers 404 for; its peeled `^{}` line is the
// commit, so that is preferred over it. A full sha is accepted in either case.
function resolveRef(ref) {
  if (/^[0-9a-f]{40}$/i.test(ref)) return ref.toLowerCase();
  if (OPTS.offline) fail(2, "--ref " + ref + " needs the network to resolve; pass the full 40-character sha with --offline");
  const want = ["refs/heads/" + ref, "refs/tags/" + ref + "^{}", "refs/tags/" + ref].concat(ref === "HEAD" ? ["HEAD"] : []);
  const r = spawnSync("git", ["ls-remote", REPO_GIT].concat(want), { encoding: "utf8" });
  if (r.error) fail(2, "--ref needs git to resolve " + JSON.stringify(ref) + ": " + r.error.message);
  const shaOf = {};
  for (const l of (r.stdout || "").split("\n")) {
    const m = /^([0-9a-f]{40})\t(\S+)$/.exec(l);
    if (m) shaOf[m[2]] = m[1];
  }
  const name = want.find((n) => shaOf[n]);
  if (r.status !== 0 || !name) {
    // Not a branch or tag. An abbreviated sha cannot be expanded without cloning, and a
    // raw URL at a short sha does not resolve, so say exactly what is needed.
    fail(2, "--ref " + JSON.stringify(ref) + " is not a branch or tag of " + REPO_GIT
      + "; pass a branch, a tag, or a FULL 40-character commit sha");
  }
  return shaOf[name];
}

// Where a site URL's bytes actually come from: the live site, or the same path in the repo
// at REF_SHA. Only nutty's own origin maps; images and anything else are fetched as given.
function sourceFor(url) {
  if (!REF_SHA) return url;
  const u = new URL(url);
  if (u.origin !== ORIGIN) return url;
  let p = u.pathname.replace(/\/{2,}/g, "/");          // the overlay's "contents//icons" double slash
  if (p.endsWith("/")) p += "index.html";              // GitHub Pages serves a folder's index.html
  return REPO_RAW + REF_SHA + p;
}

// A 4xx is the SERVER'S ANSWER about that URL, and printer-bot gets the same answer:
// GetRenderedHTML throws on !res.ok and inlines "" for that sheet, so a global.css that is
// still linked but gone prints giant type at 16px. Falling back to the cache there (as
// this did for every failure) kept rendering the stale CSS, rewrote printed.css as a
// "complete" set, and turned --check's verdict into "could not be fetched, retry". Only a
// failure to get an answer (network, timeout, 5xx, or 408/429, which are about the
// request rather than the resource) may fall back to the cache.
const definitiveStatus = (status) => status >= 400 && status < 500 && status !== 408 && status !== 429;

async function fetchOne(url) {
  const src = sourceFor(url);
  if (!OPTS.offline) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(20000), redirect: "follow" });
      if (!res.ok) {
        const e = new Error("HTTP " + res.status);
        e.status = res.status;
        e.definitive = definitiveStatus(res.status);
        throw e;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // raw.githubusercontent.com labels .css/.js/.html text/plain with nosniff, and Chromium
      // then refuses the stylesheet and the script outright: printer-bot's page would load
      // with no SanitizeHTML and no CSS. So a pinned file is typed by its extension, the way
      // GitHub Pages types it for the live site.
      const contentType = src !== url
        ? SCRIPT_TYPES[extname(new URL(src).pathname)] || res.headers.get("content-type") || ""
        : res.headers.get("content-type") || "";
      const file = cachePath(src, contentType);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
      const entry = { url, file: rel(file), sha256: sha(buf), bytes: buf.length,
        fetched_at: new Date().toISOString(), content_type: contentType };
      if (src !== url) entry.source = src;
      manifest[src] = entry;
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
      return { ...entry, buf, from: src !== url ? "ref" : "live" };
    } catch (e) {
      if (e.definitive) {
        const err = new Error("could not fetch " + src + ": " + e.message + " (the server's answer, not a "
          + "network failure, so the cached copy is NOT used: printer-bot gets the same answer)");
        err.status = e.status;
        err.definitive = true;
        throw err;
      }
      const hint = process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY
        ? " (behind a proxy? Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1)" : "";
      if (!manifest[src]) throw new Error("could not fetch " + src + ": " + e.message + hint + ", and it is not cached");
      warn("could not fetch " + src + ": " + e.message + hint + "; using the copy cached "
        + manifest[src].fetched_at);
    }
  }
  const entry = manifest[src];
  if (!entry || !existsSync(join(REPO, entry.file))) {
    throw new Error(src + " is not cached under " + rel(CACHE) + "; run once without --offline");
  }
  const buf = readFileSync(join(REPO, entry.file));
  if (sha(buf) !== entry.sha256) warn("the cached copy of " + src + " no longer matches its recorded sha256");
  return { ...entry, sha256: sha(buf), buf, from: "cache" };
}

// ------------------------------------------------------------------------------ images

// A grey 8-bit PNG from shade(x, y) -> 0..255. Stand-ins are generated, never fetched: the
// default run needs nothing but nutty's page, and no third party's picture ends up on disk.
const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function greyPng(w, h, shade) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = shade(x, y);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const STANDINS = {
  // 300 px square, the size Twitch serves profile pictures at: the header's HEIGHT comes
  // from it (max-width 90% of the 240px body = 216px drawn), and everything below the
  // header moves with that. The diagonal wedge is rig.py's: asymmetric, so a flip shows.
  avatar: [300, 300, (x, y) => ((x + y) % 24 < 12 ? 0 : 255)],
  // 112 px, the size of a scale-4 cheer gem: a solid disc, so the tuck's corner ink shows.
  cheer: [112, 112, (x, y) => ((x - 55.5) ** 2 + (y - 55.5) ** 2 < 52 ** 2 ? 0 : 255)],
  // Only when nutty's platform icon cannot be fetched. Its CSS height (2em) fixes the
  // footer line whatever its width, so a 3:1 block measures the same height.
  icon: [96, 32, () => 0],
};
function standin(name) {
  const file = join(OUT, "standin", name + ".png");
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    const [w, h, f] = STANDINS[name];
    writeFileSync(file, greyPng(w, h, f));
  }
  return { src: pathToFileURL(file).href, from: "standin", file: rel(file) };
}

// URL -> fetched and cached; path -> as is. Either way a file:// URL the engine can read.
async function image(spec, fallback) {
  if (!spec) return standin(fallback);
  if (/^https?:\/\//i.test(spec)) {
    // An unreachable picture is a usage or environment problem (exit 2) like a missing
    // path below, never an uncaught throw: that exited 1 ("the check or the render
    // failed") with a stack trace and no provenance on stderr.
    let r;
    try {
      r = await get(spec);
    } catch (e) {
      fail(2, "could not load image " + spec + ": " + e.message);
    }
    return { src: pathToFileURL(join(REPO, r.file)).href, from: r.from, url: spec, sha256: r.sha256 };
  }
  const file = spec.startsWith("file:") ? fileURLToPath(spec) : resolve(spec);
  if (!existsSync(file)) fail(2, "no such image: " + spec);
  return { src: pathToFileURL(file).href, from: "path", file };
}

// ------------------------------------------------------------------ the message, Twitch side

// What Twitch would put in the event, from the RAW message. Twitch recognises an emote or
// a cheermote only as a whole whitespace-delimited word: `class=title>Kappa` is not the
// emote Kappa, so printer-bot prints the word instead (measured; fidelity critique #1).
function twitchSide(message) {
  const words = message.split(/\s+/).filter(Boolean);
  const cheers = [];
  for (const w of words) {
    const m = /^cheer([1-9]\d*)$/i.exec(w);
    if (m) cheers.push({ name: "Cheer", bits: +m[1] });
  }
  return { words, cheers };
}

// "Thursday, October 1st 2026 13:50:00": the overlay's luxon format, in English.
function receiptDate(d) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  const n = d.getDate();
  const ord = n >= 11 && n <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th";
  const p2 = (x) => String(x).padStart(2, "0");
  return days[d.getDay()] + ", " + months[d.getMonth()] + " " + n + ord + " " + d.getFullYear()
    + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds());
}

// ----------------------------------------------------------------------------- chromium

async function launch() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (e) {
    fail(2, "Playwright is not installed. It is a devDependency: run `npm install`, then "
      + "`npx playwright install chromium` once. (" + e.message.split("\n")[0] + ")");
  }
  try {
    return await chromium.launch();
  } catch (e) {
    fail(2, "Chromium would not start. Run `npx playwright install chromium` once. ("
      + e.message.split("\n")[0] + ")");
  }
}

const SCRIPT_TYPES = { ".css": "text/css", ".js": "application/javascript", ".html": "text/html" };

// The settings page, at its real URL, served from fetch-with-cache. nutty's shared
// helpers.js runs (that is where SanitizeHTML lives); the overlay's own script (anything
// .js under contents/) is fetched for provenance and --check's markers but served EMPTY:
// it would try to reach Streamer.bot, and its passes are mirrored in passes() instead.
// Every other origin (the luxon CDN) is refused.
async function openSettingsPage(browser) {
  const ctx = await browser.newContext();
  const ownScripts = [];
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.startsWith(ORIGIN + "/")) return route.abort();
    try {
      const r = await get(url);
      const own = url.startsWith(CONTENTS_URL) && /\.js$/i.test(new URL(url).pathname);
      if (own) ownScripts.push(r);
      const type = r.content_type || SCRIPT_TYPES[extname(new URL(url).pathname)] || "application/octet-stream";
      return route.fulfill({ status: 200, contentType: type, body: own ? "" : r.buf });
    } catch (e) {
      warn(e.message);
      return route.abort();
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(CONTENTS_URL, { waitUntil: "load" });
  } catch (e) {
    fail(2, "could not load printer-bot's settings page: " + e.message.split("\n")[0]);
  }
  const info = await page.evaluate(() => ({
    links: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href),
    inline: Array.from(document.querySelectorAll("style")).map((s) => s.textContent),
    template: (document.getElementById("receipt-template") || {}).outerHTML || null,
    sanitizer: typeof SanitizeHTML === "function",
  }));
  if (!info.template) fail(2, "printer-bot changed: the settings page has no #receipt-template");
  if (!info.sanitizer) {
    fail(2, "printer-bot changed: SanitizeHTML is not defined once the settings page has loaded"
      + (REF_SHA ? ". At a pinned commit this is expected before 121c351 (2026-08-27), where the"
        + " sanitizer arrived; before it, printer-bot inserted the message as raw innerHTML" : "")
      + (errors.length ? " (page errors: " + errors.join(" | ") + ")" : ""));
  }
  return { ctx, page, info, ownScripts };
}

// GetRenderedHTML's stylesheet: every inline <style>, then the TEXT of every linked
// stylesheet in document order, joined by newlines. A sheet that fails to load becomes
// "" there too, so it does here, loudly.
async function printedCss(info) {
  if (!info.links.length) {
    warn("the settings page links no stylesheets, so GetRenderedHTML inlines none: giant type would print at 16px");
  }
  const parts = [];
  const sources = [];
  for (const href of info.links) {
    try {
      const r = await get(href);
      const text = r.buf.toString("utf8");
      parts.push(text);
      sources.push({ url: href, name: basename(new URL(href).pathname), css: text, sha256: r.sha256,
        fetched_at: r.fetched_at, from: r.from });
    } catch (e) {
      warn("stylesheet " + href + " could not be loaded (" + e.message + "); GetRenderedHTML would inline \"\" for it");
      parts.push("");
      sources.push({ url: href, name: basename(new URL(href).pathname), css: "", failed: true,
        status: e.status || null, definitive: !!e.definitive });
    }
  }
  return { css: info.inline.join("\n") + "\n" + parts.join("\n"), sources };
}

// The overlay's TwitchCheer handler, mirrored in the page so the DOM work is a browser's:
// the template is cloned, the message is the real SanitizeHTML's output put through
// innerHTML, then string-replaced on innerHTML once per emote (word-boundary, global) and
// once per cheermote (first match, case-insensitive), exactly as the overlay does.
async function passes(page, a) {
  return page.evaluate((a) => {
    const inst = document.getElementById("receipt-template").content.cloneNode(true);
    const q = (s) => inst.querySelector(s);
    q("#receipt-avatar").src = a.avatar;
    q("#receipt-title").innerText = a.bits + " BITS";
    q("#receipt-subtitle").innerText = a.user;
    const msg = document.createElement("div");
    msg.innerHTML = SanitizeHTML(a.message);
    const sanitized = msg.innerHTML;
    for (const e of a.emotes) {
      const name = e.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = /^\w+$/.test(name) ? "\\b" + name + "\\b" : "(?<=^|[^\\w])" + name + "(?=$|[^\\w])";
      msg.innerHTML = msg.innerHTML.replace(new RegExp(re, "g"), '<img src="' + e.src + '" class="emote"/>');
    }
    for (const c of a.cheers) {
      msg.innerHTML = msg.innerHTML.replace(new RegExp("\\b" + c.name + c.bits + "\\b", "i"),
        '<img src="' + a.cheerImg + '" class="emote"/><span class="bits">' + c.bits + "</span>");
    }
    const final = msg.innerHTML;
    q("#receipt-content").appendChild(msg);
    q("#receipt-icon").src = a.icon;
    q("#receipt-date").textContent = a.date;
    const body = Array.from(inst.childNodes).filter((n) => n.nodeType !== Node.COMMENT_NODE)
      .map((n) => n.outerHTML || n.textContent).join("");
    return { body, sanitized, final };
  }, a);
}

// The document GetRenderedHTML returns, byte for byte in shape.
function documentFor(css, body) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>${css}</style>
</head>
<body>
  ${body}
</body>
</html>`.trim();
}

// -------------------------------------------------------------------------------- render

// The real engine, through rig.py --document. Exit 3 from rig.py means "no wkhtmltopdf
// here", the ONLY case that falls back: an engine that runs and fails is a finding.
function renderReal(docPath, pngPath) {
  const stem = "printerbot/" + basename(pngPath, extname(pngPath));
  const args = [join(HERE, "rig.py"), stem, "--document", docPath, "--paper", String(OPTS.paper)];
  if (OPTS.fonts) args.push("--fonts", OPTS.fonts);
  const r = spawnSync("python3", args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error && r.error.code === "ENOENT") return { unavailable: "python3 is not installed" };
  if (r.status === 3) return { unavailable: "tools/rig.py found no wkhtmltopdf (exit 3)" };
  for (const ln of (r.stderr || "").split("\n")) {
    if (!ln.trim()) continue;
    console.error("[rig.py] " + ln);
    if (ln.startsWith("WARNING: ")) prov.warnings.push("rig.py: " + ln.slice(9));
  }
  if (r.status !== 0) fail(1, "rig.py failed (exit " + r.status + "): " + (r.stdout || "").trim());
  const res = JSON.parse(r.stdout);
  mkdirSync(dirname(resolve(pngPath)), { recursive: true });
  copyFileSync(join(REPO, res.artifacts.png), pngPath);
  return { engine: "wkhtmltopdf", approximate: false, png: rel(resolve(pngPath)), rig: res };
}

async function renderApproximate(browser, docPath, pngPath, why) {
  warn("APPROXIMATE render: " + why + ". This PNG is CHROMIUM's layout, not the rig's "
    + "engine: line heights, font-size rounding, position:fixed and trailing-space centring "
    + "all differ. Eyeball it; never measure it. Install wkhtmltopdf 0.12.6 (see tools/rig.py).");
  const ctx = await browser.newContext();
  await ctx.route(/^https?:/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(docPath).href, { waitUntil: "load" });
  const base = join(OUT, basename(pngPath, extname(pngPath)) + ".approx");
  await page.pdf({ path: base + ".pdf", width: OPTS.paper - 8 + "mm", height: "500mm",
    margin: { top: "0", bottom: "0", left: "0", right: "0" }, printBackground: false });
  const out = { engine: "chromium", approximate: true, pdf: rel(base + ".pdf") };
  const info = spawnSync("pdfinfo", [base + ".pdf"], { encoding: "utf8" });
  const pages = /^Pages:\s+(\d+)/m.exec(info.stdout || "");
  if (pages) out.pages = +pages[1];
  const ppm = spawnSync("pdftoppm", ["-png", "-gray", "-r", "203", "-f", "1", "-l", "1", base + ".pdf", base],
    { encoding: "utf8" });
  mkdirSync(dirname(resolve(pngPath)), { recursive: true });
  if (!ppm.error && ppm.status === 0 && existsSync(base + "-1.png")) {
    copyFileSync(base + "-1.png", pngPath);
  } else {
    await page.setViewportSize({ width: Math.round(((OPTS.paper - 8) * 96) / 25.4), height: 800 });
    await page.screenshot({ path: pngPath, fullPage: true });
    out.screenshot = true;
  }
  out.png = rel(resolve(pngPath));
  await ctx.close();
  return out;
}

// --------------------------------------------------------------------------------- check

async function check(browser, settings, cssInfo) {
  let C;
  try {
    const { loadCore } = await import("../test/_harness.mjs");
    C = loadCore();
  } catch (e) {
    fail(2, "--check could not load the app core from public/index.html: " + e.message.split("\n")[0]);
  }
  if (!Array.isArray(C.PB_CLASSES) || !C.PB_CLASSES.length) {
    fail(2, "--check needs PB_CLASSES, the app's table of borrowed printer-bot classes, and "
      + "public/index.html does not export it (yet). Nothing was checked.");
  }
  const entries = C.PB_CLASSES.map((e) => ({ id: e.id, cls: e.cls, decl: e.decl, role: e.role, source: e.source }));
  // Fresh means fetched this run: from the live site, or from the repo at --ref's sha.
  const fresh = REF_SHA ? "ref" : "live";
  const ours = prov.fetched.filter((f) => new URL(f.url).origin === ORIGIN);
  if (!OPTS.offline) {
    // EVERY file of nutty's the check depends on, not only the stylesheets: the settings
    // page (template + stylesheet list), helpers.js (the SanitizeHTML step 2 probes) and
    // the overlay script (step 3's markers). Any of them silently served from the cache
    // after a network failure used to pass as "live": a sanitizer change made today was
    // checked against yesterday's sanitizer and reported live. A sheet that failed with no
    // cached copy to fall back on is the same environment problem.
    const stale = ours.filter((f) => f.from !== fresh).map((f) => f.url)
      .concat(cssInfo.sources.filter((s) => s.failed && !s.definitive).map((s) => s.url));
    if (stale.length) {
      fail(2, "--check is about " + (REF_SHA ? "nutty's files at " + REF_SHA.slice(0, 12) : "nutty's LIVE files")
        + ", and " + stale.join(", ")
        + " could not be fetched. Retry, or pass --offline to check the cached copies.");
    }
  }
  // A sheet that is still LINKED but that the server says is gone (404, 410...) is not an
  // environment problem to retry: it is exactly what printer-bot gets, and GetRenderedHTML
  // then inlines "" for it. That is a check FAILURE.
  const gone = cssInfo.sources.filter((s) => s.failed && s.definitive);
  for (const s of gone) {
    note("check stylesheet " + s.name + " FAILED: " + s.url + " answered HTTP " + s.status
      + ", so printer-bot would inline an empty " + s.name + " (giant type would print at 16px)");
  }

  // 1. Every declaration, against the stylesheet printer-bot really prints with, parsed by
  //    a browser so ".9em" and "0.9em" compare equal. Same-specificity rules: last wins.
  const page = await (await browser.newContext()).newPage();
  await page.route(/^https?:/, (route) => route.abort());
  const classes = await page.evaluate((a) => {
    const sheet = (css, media) => {
      const s = document.createElement("style");
      if (media) s.media = media;
      s.textContent = css;
      document.head.appendChild(s);
      return s.sheet;
    };
    const printed = sheet(a.css);
    const bySource = a.sources.map((s) => ({ name: s.name, sheet: sheet(s.css, "not all") }));
    // Compared as COMPUTED values on a block-level scratch element at 16px, so "0" and
    // "0em", ".9em" and "0.9em" agree. (Declared serializations do not: Chromium keeps
    // "0em" as written, and comparing those failed a rule that had not changed.)
    // display:block keeps width/height from resolving to "auto" and passing anything.
    const box = document.createElement("div");
    box.style.cssText = "font-size:16px;position:relative;width:480px;height:480px";
    const scratch = document.createElement("b");
    box.appendChild(scratch);
    document.body.appendChild(box);
    const computed = (prop, val) => {
      scratch.style.cssText = "display:block";
      scratch.style.setProperty(prop, val);
      return getComputedStyle(scratch).getPropertyValue(prop);
    };
    const rulesFor = (sh, cls) => Array.from(sh.cssRules).filter((r) => r.type === 1
      && r.selectorText.split(",").some((x) => x.trim() === "." + cls));
    return a.entries.map((e) => {
      const rules = rulesFor(printed, e.cls);
      const problems = [];
      for (const d of e.decl.split(";").map((x) => x.trim()).filter(Boolean)) {
        const at = d.indexOf(":");
        const prop = d.slice(0, at).trim();
        const want = d.slice(at + 1).trim();
        let got = "";
        for (const r of rules) if (r.style.getPropertyValue(prop)) got = r.style.getPropertyValue(prop);
        if (!got) problems.push({ prop, want, got: null });
        else if (computed(prop, got) !== computed(prop, want)) {
          problems.push({ prop, want, got, computed: [computed(prop, want), computed(prop, got)] });
        }
      }
      return { id: e.id, cls: e.cls, ok: !problems.length, problems,
        found_in: bySource.filter((s) => rulesFor(s.sheet, e.cls).length).map((s) => s.name) };
    });
  }, { css: cssInfo.css, sources: cssInfo.sources, entries });
  await page.context().close();

  // 2. The real sanitizer must still keep the class on the tags the app emits. Built from
  //    the app's own strings where it exports them, so a quoting change is caught too.
  const probes = [];
  for (const e of entries) {
    if (e.role === "grow" || e.role === "shrink") {
      const attr = typeof C.classAttr === "function" ? C.classAttr(e.cls) : 'class="' + e.cls + '"';
      probes.push({ id: e.id, tag: "b", html: "<b " + attr + ">x</b>", classes: [e.cls] });
    }
  }
  const tuck = entries.filter((e) => e.role === "tuck").map((e) => e.cls);
  if (tuck.length) {
    const open = typeof C.TUCK_OPEN === "string" ? C.TUCK_OPEN : '<span class="' + tuck.join(" ") + '">';
    probes.push({ id: "tuck", tag: "span", html: open + " x </span>", classes: tuck });
  }
  const sanitizer = await settings.page.evaluate((probes) => probes.map((p) => {
    const out = SanitizeHTML(p.html);
    const d = document.createElement("div");
    d.innerHTML = out;
    const el = d.querySelector(p.tag);
    const got = el ? Array.from(el.classList) : [];
    return { id: p.id, sent: p.html, kept: out, ok: !!el && p.classes.every((c) => got.includes(c)) };
  }), probes);

  // 3. The pipeline this tool mirrors rather than runs. Text markers: a miss may be a
  //    harmless refactor, so it warns instead of failing, and says where to look.
  const markers = [];
  for (const s of settings.ownScripts) {
    const text = s.buf.toString("utf8");
    for (const m of PIPELINE_MARKERS) {
      const found = text.includes(m);
      markers.push({ script: s.url, marker: m, found });
      if (!found) warn("the overlay script " + s.url + " no longer contains " + JSON.stringify(m)
        + ": printer-bot's pipeline may have changed, and passes() here mirrors the old one. Re-read it.");
    }
  }
  if (!settings.ownScripts.length) warn("the settings page loaded no overlay script under contents/; cannot check the pipeline markers");

  // 4. THE CASCADE, as computed. Step 1 only compares rules whose selector is exactly
  //    ".cls", so a higher-specificity or !important rule anywhere in the printed CSS that
  //    neutralises the borrowed classes was invisible to it: with
  //    `#receipt-content .title{font-size:1em}` or `b{font-size:inherit!important}`
  //    appended to global.css, --check said "passed" while the real engine printed the
  //    giant letters at body size. So this builds a real message (nested .title, each
  //    shrink step, the tuck span) from the app's own strings, puts it through the real
  //    sanitizer and the template the way printer-bot does, loads the document
  //    GetRenderedHTML would emit, and asks the browser what it computed. Whatever the
  //    selector or priority of an override, it shows up here. Text markers, not ids or
  //    attributes, find the elements, because the sanitizer strips everything but class.
  const base = typeof C.GIANT_BASE_PX === "number" ? C.GIANT_BASE_PX : 16;
  const tagFor = (cls) => "<b " + (typeof C.classAttr === "function" ? C.classAttr(cls) : 'class="' + cls + '"') + ">";
  const grow = entries.find((e) => e.role === "grow");
  const growFactor = (C.PB_CLASSES.find((e) => e.id === (grow || {}).id) || {}).factor;
  const DEPTH = 6;
  const cases = [];
  let probeMsg = "";
  if (grow && growFactor) {
    cases.push({ id: "." + grow.cls + " x" + DEPTH, marker: "RWPROBEA", want: base * Math.pow(growFactor, DEPTH) });
    probeMsg += "<br>" + tagFor(grow.cls).repeat(DEPTH) + "RWPROBEA" + "</b>".repeat(DEPTH);
    C.PB_CLASSES.filter((e) => e.role === "shrink").forEach((e, i) => {
      const marker = "RWPROBE" + String.fromCharCode(66 + i);
      cases.push({ id: "." + e.cls + " around ." + grow.cls + " x3", marker,
        want: base * Math.pow(growFactor, 3) * e.factor });
      probeMsg += "<br>" + tagFor(e.cls) + tagFor(grow.cls).repeat(3) + marker + "</b>".repeat(4);
    });
  }
  if (tuck.length) {
    const open = typeof C.TUCK_OPEN === "string" ? C.TUCK_OPEN : '<span class="' + tuck.join(" ") + '">';
    cases.push({ id: "tuck", marker: "RWPROBET", position: "fixed" });
    probeMsg = open + " RWPROBET </span>" + probeMsg;
  }
  let cascade = [];
  if (cases.length) {
    const filled = await passes(settings.page, { message: probeMsg, bits: 100, user: "probe",
      avatar: standin("avatar").src, cheerImg: standin("cheer").src, emotes: [], cheers: [],
      icon: standin("icon").src, date: "probe" });
    const cctx = await browser.newContext();
    await cctx.route(/^https?:/, (route) => route.abort());
    const cpage = await cctx.newPage();
    await cpage.setContent(documentFor(cssInfo.css, filled.body), { waitUntil: "load" });
    cascade = await cpage.evaluate((cases) => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const at = {};
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        for (const c of cases) if (!at[c.marker] && n.nodeValue.includes(c.marker)) at[c.marker] = n.parentElement;
      }
      return cases.map((c) => {
        const el = at[c.marker];
        if (!el) return Object.assign({}, c, { ok: false, got: "not in the printed document" });
        const cs = getComputedStyle(el);
        if (c.position) return Object.assign({}, c, { ok: cs.position === c.position, got: "position:" + cs.position });
        const px = parseFloat(cs.fontSize);
        return Object.assign({}, c, { ok: Math.abs(px - c.want) <= 0.5, got: px });
      });
    }, cases);
    await cctx.close();
  }

  const ok = classes.every((c) => c.ok) && sanitizer.every((s) => s.ok) && cascade.every((c) => c.ok) && !gone.length;
  for (const c of classes) {
    const src = (entries.find((e) => e.id === c.id) || {}).source;
    note("check ." + c.cls + (c.ok ? " ok" : " FAILED " + c.problems.map((p) =>
      p.prop + " want " + JSON.stringify(p.want) + " got " + JSON.stringify(p.got)).join("; "))
      + (c.found_in.length ? " (in " + c.found_in.join(", ") + ")" : ""));
    if (c.ok && src && !c.found_in.includes(src)) warn("." + c.cls + " is defined in " + c.found_in.join(", ") + ", not " + src + " as PB_CLASSES records");
  }
  for (const s of sanitizer) note("check sanitizer " + s.id + (s.ok ? " ok" : " FAILED: " + JSON.stringify(s.sent) + " came back " + JSON.stringify(s.kept)));
  for (const c of cascade) {
    note("check cascade " + c.id + (c.ok ? " ok" : " FAILED: computed " + JSON.stringify(c.got)
      + (c.position ? ", want position:" + c.position : ", want " + c.want.toFixed(2) + "px")
      + " (the printed CSS no longer sizes it the way the app assumes; the rules above say whether the class itself changed)"));
  }
  const verdict = ok ? "check passed" + (OPTS.offline ? " (against the CACHED stylesheets, --offline)" : "")
    : "check FAILED: printer-bot's CSS or sanitizer no longer matches PB_CLASSES. If nutty removed or scoped the stylesheet on purpose, that is the bot author saying no: fall back to Hanzi. Only an incidental rename justifies remapping PB_CLASSES, after a free probe.";
  note(verdict);
  // `live` from where the files really came from, not from the flags.
  const live = !REF_SHA && ours.length > 0 && ours.every((f) => f.from === "live");
  return { ok, verdict, live, ref: REF_SHA, classes, sanitizer, cascade, markers };
}

// ---------------------------------------------------------------------------------- main

const OPTS = parseArgs(process.argv.slice(2));
if (OPTS.help) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  console.log(src.slice(src.indexOf("// Usage:"), src.indexOf("\nimport ")).replace(/^\/\/ ?/gm, "").trimEnd());
  process.exit(0);
}

// stdin is read as a STREAM, and the TTY test asks the fd rather than process.stdin. Merely
// touching process.stdin.isTTY constructs the stdin stream, which puts fd 0 into
// non-blocking mode, and readFileSync(0) then throws EAGAIN the moment the pipe is empty
// because the writer is slower than this script's startup. Measured: the documented
// `payload.mjs ... | printerbot.mjs --out -` failed 3 runs of 3, and
// `(sleep 0.5; echo hi) | node tools/printerbot.mjs` 2 of 2; only `echo hi |` and `< file`
// worked, by winning the race. for-await waits for EOF however slow the writer is.
let message = OPTS.message;
if (!OPTS.check && message === undefined) {
  if (isatty(0)) fail(2, "pipe a chat message on stdin, or pass --message (see --help)");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  message = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

if (OPTS.ref) {
  REF_SHA = resolveRef(OPTS.ref);
  prov.source = { repo: REPO_GIT, ref: OPTS.ref, sha: REF_SHA };
  note("reading nutty's files from " + REPO_GIT + " @ " + REF_SHA.slice(0, 12) + " instead of the live site");
} else {
  prov.source = { live: ORIGIN };
}

const browser = await launch();
let exitCode = 0;
try {
  let page;
  try {
    await get(CONTENTS_URL);
  } catch (e) {
    fail(2, e.message);
  }
  const settings = await openSettingsPage(browser);
  page = settings.page;
  const cssInfo = await printedCss(settings.info);
  prov.stylesheets = cssInfo.sources.map((s) => s.url);
  prov.template = { sha256: sha(settings.info.template) };

  // The cache tools/rig.py reads for its own page (and to name a --document's CSS). Only
  // a COMPLETE set is written: a cache missing global.css would quietly measure 16px giants.
  // And only a LIVE one, every sheet fetched live this run. rig.py's template mode reads
  // this file by default as "the CSS printer-bot really prints with", so a --ref run used
  // to replace it with a pinned commit's CSS (and a network fallback with yesterday's),
  // and every later measurement silently ran against that.
  const fetchedAt = cssInfo.sources.map((s) => s.fetched_at).filter(Boolean).sort()[0] || null;
  prov.css = { sha256: sha(cssInfo.css), bytes: Buffer.byteLength(cssInfo.css), fetched_at: fetchedAt };
  const liveSet = !OPTS.offline && !REF_SHA && cssInfo.sources.length
    && cssInfo.sources.every((s) => !s.failed && s.from === "live");
  if (!liveSet) {
    prov.css.not_cached = REF_SHA ? "pinned with --ref" : OPTS.offline ? "--offline"
      : "not every stylesheet was fetched live this run";
    note("not rewriting " + rel(join(OUT, "printed.css")) + " (" + prov.css.not_cached
      + "): tools/rig.py keeps the last LIVE set");
  } else {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "printed.css"), cssInfo.css);
    writeFileSync(join(OUT, "printed.css.json"), JSON.stringify({
      sha256: prov.css.sha256, bytes: prov.css.bytes, fetched_at: fetchedAt, contents: CONTENTS_URL,
      source: prov.source,
      stylesheets: cssInfo.sources.map(({ url, sha256, fetched_at, from }) => ({ url, sha256, fetched_at, from })),
      written_at: new Date().toISOString(),
    }, null, 1));
    prov.css.file = rel(join(OUT, "printed.css"));
  }

  if (OPTS.check) {
    prov.check = await check(browser, settings, cssInfo);
    if (!prov.check.ok) exitCode = 1;
  } else {
    // The Twitch side: which emotes and cheermotes the event would carry.
    const tw = twitchSide(message);
    const chars = Array.from(message).length;
    if (/[\r\n]/.test(message)) warn("the message contains a newline; a Twitch chat message is one line");
    if (chars > 500) warn("the message is " + chars + " characters; Twitch rejects anything over 500");
    if (!tw.cheers.length) warn("no Cheer<N> word in the message: printer-bot only prints cheers, so this would never print (rendered anyway)");
    const cheerBits = tw.cheers.reduce((s, c) => s + c.bits, 0);
    const bits = OPTS.bits || cheerBits || 100;
    if (OPTS.bits && cheerBits && OPTS.bits !== cheerBits) {
      warn("--bits " + OPTS.bits + " but the message cheers " + cheerBits + "; Twitch would report " + cheerBits);
    }
    const emotes = [];
    prov.emotes = [];
    for (const e of OPTS.emotes) {
      const recognised = tw.words.includes(e.name);
      prov.emotes.push({ name: e.name, recognised });
      if (!recognised) {
        warn("Twitch would not recognise the emote " + JSON.stringify(e.name) + ": it is not a whole "
          + "whitespace-delimited word in the raw message, so printer-bot prints the name as text");
        continue;
      }
      const img = await image(e.spec);
      emotes.push({ name: e.name, src: img.src });
      Object.assign(prov.emotes[prov.emotes.length - 1], img);
    }
    const avatar = await image(OPTS.avatar, "avatar");
    const cheerImg = await image(OPTS.cheerImg, "cheer");
    // The overlay builds the icon URL from its own location plus "/icons/...", hence the
    // double slash; nutty's server answers it.
    let icon;
    try {
      const r = await get(CONTENTS_URL + "/icons/platforms/twitch.png");
      icon = { src: pathToFileURL(join(REPO, r.file)).href, from: r.from, sha256: r.sha256 };
    } catch (e) {
      warn("the platform icon could not be loaded (" + e.message + "); using a stand-in of the same height");
      icon = standin("icon");
    }
    prov.images = { avatar, cheer: cheerImg, icon };
    prov.cheermotes = tw.cheers;

    const date = receiptDate(OPTS.date || new Date());
    const r = await passes(page, { message, bits, user: OPTS.user, avatar: avatar.src,
      cheerImg: cheerImg.src, emotes, cheers: tw.cheers, icon: icon.src, date });
    const doc = documentFor(cssInfo.css, r.body);
    prov.message = { chars, sanitized: r.sanitized, printed: r.final, title: bits + " BITS", user: OPTS.user, date };

    const docPath = OPTS.out && OPTS.out !== "-" ? resolve(OPTS.out) : join(OUT, "receipt.html");
    mkdirSync(dirname(docPath), { recursive: true });
    writeFileSync(docPath, doc);
    prov.out = rel(docPath);
    if (OPTS.out === "-") process.stdout.write(doc);

    if (OPTS.png) {
      const real = renderReal(docPath, OPTS.png);
      prov.render = real.unavailable
        ? await renderApproximate(browser, docPath, OPTS.png, real.unavailable)
        : real;
    }
  }
} catch (e) {
  // Nothing escapes without the documented exit code and the provenance dump.
  fail(2, "unexpected error: " + (e && e.message ? e.message : String(e)));
} finally {
  await browser.close();
}
console.error(JSON.stringify(prov, null, 1));
// The verdict again, LAST: the provenance above runs to ~160 lines, and "the last line
// says check passed / check FAILED" is what the README tells people to look for.
if (prov.check) note(prov.check.verdict);
process.exit(exitCode);
