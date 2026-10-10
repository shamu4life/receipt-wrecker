// The vendored receipt page (AMENDMENT A1, A5).
//
// public/index.html carries SassyTP printer-bot's receipt page, v/2.5.0/renderer.html, as an
// inert <script type="text/plain" id="sassytp-renderer"> block after the app's own script; the
// preview loads it into one sandboxed frame per part. tools/vendor-renderer.mjs writes the block
// (and `--check`s it against the pinned upstream file, which needs the network or its cache, so
// it is not run here). These tests pin what the block must be without the upstream file at hand,
// and that the null-DOM harness runs the APP, not the renderer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { loadCore, appScript } from "./_harness.mjs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const BLOCK_RE = /<script type="text\/plain" id="sassytp-renderer"([^>]*)>([\s\S]*?)<\/script>/g;
const blocks = [...html.matchAll(BLOCK_RE)];
const block = blocks[0];
// What the app reads back: the element's text, with the backslash taken out of every closing
// script tag (RW-EDIT 3) and the newline after the opening tag dropped.
const page = block ? block[2].replace(/^\n/, "").replace(/<\\(\/script)/gi, "<$1") : "";
const attr = (name) => ((block && block[1].match(new RegExp(name + '="([^"]*)"'))) || [])[1];
const NO_NETWORK = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";

test("the harness runs the app's own script, never the vendored renderer (A5)", () => {
  const src = appScript();
  // The hazard is real: the vendored page has a <script> of its own, so "the first <script>"
  // (the harness's old match) would find the renderer, not the app.
  const naive = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(naive && /window\.PrinterBot = \(function/.test(naive[1]), "fixture: the vendored page should hold a bare <script>");
  // The harness takes the one script with the app's id, and that is the app.
  assert.ok(src.includes("module.exports = {") && src.includes("BROWSER GLUE"), "the harness's script is not the app's");
  assert.ok(!/window\.PrinterBot\s*=|const ICONS|sanitizeRich/.test(src), "the harness's script holds the renderer");
  assert.ok(html.indexOf('<script id="rw-app">') < html.indexOf('id="sassytp-renderer"'), "the vendored block must come after the app's script");
  // What it runs exports the app's core and none of the renderer's API.
  const C = loadCore();
  for (const k of ["packStackBodies", "buildBigBodies", "stackContext", "forkDither"]) assert.equal(typeof C[k], "function", k);
  for (const k of ["setTheme", "loadAvatarCache", "clearAvatarCache", "internals", "eventTypes"]) assert.equal(C[k], undefined, "the core exports the renderer's " + k);
});

test("the vendored renderer is inert text: one block, after the app, closed only by its own end tag", () => {
  assert.equal(blocks.length, 1, "expected exactly one vendored block");
  // A raw-text element ends at the first closing script tag, so the page's own must be escaped.
  assert.ok(!/<\/script/i.test(block[2]), "an unescaped closing script tag inside the block would end it early");
  assert.equal((block[2].match(/<\\\/script>/g) || []).length, 1, "the renderer's one closing script tag, escaped");
  // The HTML tokenizer's script-data states: an unclosed <!-- followed by a <script would
  // make the block's real end tag not end it (tools/vendor-renderer.mjs refuses to write that).
  let open = 0;
  for (const m of block[2].matchAll(/<!--|-->/g)) open = m[0] === "<!--" ? 1 : 0;
  assert.equal(open, 0, "the block ends inside an HTML comment");
  assert.ok(/window\.PrinterBot = \(function \(\) \{/.test(page) && /PrinterBot\.render\(eventData, options\)/.test(page), "not SassyTP's renderer");
  assert.ok(/^<!DOCTYPE html>\n<html lang="en">/.test(page) && /<\/script>\n<\/body>\n<\/html>\n$/.test(page), "the page is not whole");
  assert.equal(attr("data-version"), (page.match(/<meta name="printer-bot-renderer" content="(\d+)">/) || [])[1]);
  assert.match(attr("data-commit") || "", /^[0-9a-f]{40}$/);
});

test("exactly the three edits: no logos, a no-network policy, the escape (A1)", () => {
  for (const n of [1, 2, 3]) assert.equal((page.match(new RegExp("RW-EDIT " + n + " \\(Receipt Wrecker\\)", "g")) || []).length, 1, "RW-EDIT " + n);
  // (2) one policy, and it is ours: nothing loads from the network.
  const csp = [...page.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)];
  assert.equal(csp.length, 1);
  assert.equal(csp[0][1], NO_NETWORK);
  assert.ok(!/https?:\/\//.test(csp[0][1]));
  // (1) the logos are one plain grey PNG the size of the Twitch logo, and no other picture is left.
  const icons = JSON.parse(page.match(/^\s*const ICONS = (\{.*\});$/m)[1]);
  assert.deepEqual(Object.keys(icons).sort(), ["kick", "twitch", "youtube"]);
  const urls = new Set(Object.values(icons));
  assert.equal(urls.size, 1, "the three logos should be one placeholder");
  const [png] = urls;
  assert.equal((page.match(/data:image\/png;base64,/g) || []).length, 3, "a picture other than the placeholder is in the block");
  const buf = Buffer.from(png.split(",")[1], "base64");
  assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20), buf[24], buf[25]], [336, 112, 8, 0], "336 x 112, 8-bit grey");
  let off = 8; const idat = [];
  while (off < buf.length) { const n = buf.readUInt32BE(off); if (buf.toString("latin1", off + 4, off + 8) === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + n)); off += 12 + n; }
  const raw = inflateSync(Buffer.concat(idat)), row = new Uint8Array(336), seen = new Set();
  for (let y = 0; y < 112; y++) for (let x = 0; x < 336; x++) {
    const f = raw[y * 337], v = raw[y * 337 + 1 + x];
    row[x] = f === 0 ? v : f === 2 ? (row[x] + v) & 255 : -1;
    seen.add(row[x]);
  }
  assert.deepEqual([...seen], [0xcc], "the placeholder is one plain grey");
});

test("the notice above the block: SassyTP's copyright, the whole MIT notice, the source, credit only", () => {
  const at = html.indexOf('<script type="text/plain" id="sassytp-renderer"');
  const head = html.slice(html.lastIndexOf("<!-- BEGIN vendored SassyTP printer-bot renderer", at), at);
  assert.ok(head.length > 0, "no notice above the block");
  for (const s of ["Copyright (c) 2026 SassyTP", "Permission is hereby granted, free of charge", "The above copyright notice and this permission notice shall be included in all",
                   'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND', "https://github.com/SassyTP/printer-bot",
                   "path " + attr("data-path"), "commit " + attr("data-commit"), "drawn by SassyTP's printer-bot renderer (MIT)", "Three edits"]) {
    assert.ok(head.includes(s), "the notice lacks: " + s);
  }
  // The app is Receipt Wrecker; SassyTP's name is credited, never used as the product's name.
  assert.match(html, /<title>Receipt Wrecker<\/title>/);
  assert.ok(!/<title>[^<]*SassyTP/i.test(html.slice(0, at)));
});
