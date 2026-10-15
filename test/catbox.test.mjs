// 1.7.0, by the owner's decision: POST /catbox uploads a Real picture card's picked file to Catbox
// (files.catbox.moe), whose direct link Printer Bot 3.0 prints as the picture. Catbox sends no CORS
// headers, so the page can't see its answer itself; the Worker makes the upload and hands back only
// a checked link. These tests drive the Worker with a FAKE Catbox (a stubbed fetch) and a fake KV:
// nothing here ever reaches the real Catbox, where an upload is public and can't be deleted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { imageKeyFor } from "../src/worker.js";

const ORIGIN = "https://receipt.uwutoowo.com";
// A JPEG a decoder walks cleanly, the smallest there is: SOI, a JFIF APP0, a quantisation table, a
// one-pixel baseline frame, a Huffman table, one scan with stuffed entropy data, EOI. `seg` makes a
// marker segment of `data` bytes; `jpeg` puts the pieces together, `before` going in front of the scan.
const seg = (m, data) => [0xff, m, (data.length + 2) >> 8, (data.length + 2) & 255, ...data];
const jpeg = ({ before = [], after = [] } = {}) => new Uint8Array([
  0xff, 0xd8,
  ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  ...seg(0xdb, [0, ...new Array(64).fill(1)]),
  ...seg(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
  ...seg(0xc4, [0, 1, ...new Array(15).fill(0), 0]),
  ...before,
  ...seg(0xda, [1, 1, 0, 0, 63, 0]),
  0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78,
  0xff, 0xd9, ...after]);
const JPEG = jpeg();
// What the page really sends: a picture from Chromium's canvas encoder (with its colour profile).
const CANVAS_JPEG = new Uint8Array(readFileSync(new URL("./fixtures/chromium-canvas.jpg", import.meta.url)));

function fakeKv() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k).value : null; },
    async put(k, v, o) { m.set(k, { value: String(v), opts: o || {} }); },
  };
}
// The fake Catbox: records every call and answers with `reply` (a Response, cloned for each call).
function fakeCatbox(reply) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return reply.clone();
  };
  return { calls, fn };
}
async function call({ method = "POST", origin = ORIGIN, type = "image/jpeg", body = JPEG, ip = "203.0.113.7", env, catbox } = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  if (type) headers.set("content-type", type);
  if (ip) headers.set("cf-connecting-ip", ip);
  const req = new Request(ORIGIN + "/catbox", { method, headers, body: method === "GET" ? undefined : body });
  const saved = globalThis.fetch;
  globalThis.fetch = (catbox || fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"))).fn;
  try {
    const res = await worker.fetch(req, env || { RW_IMG: fakeKv(), ASSETS: { fetch: () => new Response("asset") } });
    return { res, json: await res.json().catch(() => null) };
  } finally { globalThis.fetch = saved; }
}

test("/catbox uploads the picture to Catbox's API and hands back the files.catbox.moe link", async () => {
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg\n"));
  const { res, json } = await call({ catbox: cb });
  assert.equal(res.status, 200);
  assert.deepEqual(json, { url: "https://files.catbox.moe/abc123.jpg" });
  assert.equal(cb.calls.length, 1);
  const { url, init } = cb.calls[0];
  assert.equal(url, "https://catbox.moe/user/api.php");
  assert.equal(init.method, "POST");
  // Catbox's file upload: reqtype fileupload and the file, anonymous (no userhash).
  assert.equal(init.body.get("reqtype"), "fileupload");
  assert.equal(init.body.get("userhash"), null);
  const f = init.body.get("fileToUpload");
  assert.equal(f.size, JPEG.byteLength);
  assert.equal(f.name, "picture.jpg");
  assert.equal(f.type, "image/jpeg");
});

test("/catbox answers only this site's own page, and no other site's page can see the answer", async () => {
  for (const origin of [null, "https://evil.example", "http://receipt.uwutoowo.com"]) {
    const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
    const { res } = await call({ origin, catbox: cb });
    assert.equal(res.status, 403, String(origin));
    assert.equal(cb.calls.length, 0, "nothing went to Catbox for " + origin);
  }
  const { res } = await call({});
  assert.equal(res.headers.get("access-control-allow-origin"), null, "no CORS header on /catbox");
});

test("/catbox takes POSTed pictures only, not empty, 5 MB at most", async () => {
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
  assert.equal((await call({ method: "GET", catbox: cb })).res.status, 405);
  for (const type of ["text/html", "image/svg+xml", "application/octet-stream", "image/bmp", null]) {
    assert.equal((await call({ type, catbox: cb })).res.status, 415, String(type));
  }
  assert.equal((await call({ body: new Uint8Array(0), catbox: cb })).res.status, 400);
  assert.equal((await call({ body: new Uint8Array(5 * 1024 * 1024 + 1), catbox: cb })).res.status, 413);
  assert.equal(cb.calls.length, 0);
});

test("/catbox takes a real JPEG only (the page always sends one): the bytes are checked, not the label", async () => {
  // Security review of 1.7.0: the declared type was trusted, so any bytes labelled a picture went
  // to Catbox. The page redraws every picture as a JPEG, so the route takes nothing else.
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
  for (const type of ["image/png", "image/gif", "image/webp"]) assert.equal((await call({ type, catbox: cb })).res.status, 415, type);
  const html = new TextEncoder().encode("<html><body>not a picture</body></html>");
  const noEnd = JPEG.slice(0, JPEG.length - 2);
  const trailing = jpeg({ after: [0x50, 0x4b, 0x03, 0x04] });                  // a zip glued after the picture
  for (const [what, body] of [["html", html], ["no end marker", noEnd], ["data after the end", trailing]]) {
    assert.equal((await call({ body, catbox: cb })).res.status, 415, what);
  }
  assert.equal(cb.calls.length, 0, "nothing but a JPEG reached Catbox");
});

test("/catbox walks the JPEG the way a decoder does: no comments, no unknown segments, little extra data, nothing after the end", async () => {
  // Security review of the hardening: a start and an end marker alone let a file carry anything in
  // between (a comment holding a page, say). The structure is walked segment by segment now.
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
  const bigApp = new Array(40000).fill(0x41);
  const refused = [
    ["start and end markers only", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ["a comment segment", jpeg({ before: seg(0xfe, [...new TextEncoder().encode("<script>alert(1)</script>")]) })],
    ["an unknown segment", jpeg({ before: seg(0xf7, [1, 2, 3]) })],
    ["over 64 KB of APPn data", jpeg({ before: [...seg(0xe1, bigApp), ...seg(0xe1, bigApp)] })],
    ["a segment longer than the file", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 1, 2, 0xff, 0xd9])],
    ["a scan before any frame", new Uint8Array([0xff, 0xd8, ...seg(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0xff, 0xd9])],
  ];
  for (const [what, body] of refused) assert.equal((await call({ body, catbox: cb })).res.status, 415, what);
  assert.equal(cb.calls.length, 0);
  // A real encoder's picture, colour profile and all, goes through; and so does one with a little APPn data.
  assert.equal((await call({ body: CANVAS_JPEG, catbox: cb })).res.status, 200, "Chromium's canvas JPEG");
  assert.equal((await call({ body: jpeg({ before: seg(0xe2, new Array(3000).fill(7)) }), catbox: cb })).res.status, 200);
});

test("/catbox counts only uploads Catbox took: a failure uses up nobody's hour", async () => {
  // Security review of the hardening: counted before the upload, failures (Catbox down, or junk it
  // refused) used up a viewer's hour and the site's, so anyone could lock everyone out cheaply.
  const kv = fakeKv(), env = { RW_IMG: kv, ASSETS: { fetch: () => new Response("asset") } };
  const down = fakeCatbox(new Response("nope", { status: 500 }));
  for (let i = 0; i < 30; i++) assert.equal((await call({ env, catbox: down })).res.status, 502, "failure " + (i + 1));
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
  for (let i = 0; i < 20; i++) assert.equal((await call({ env, catbox: cb })).res.status, 200, "upload " + (i + 1));
  assert.equal((await call({ env, catbox: cb })).res.status, 429);
  const mine = [...kv.m].filter(([k]) => /^catbox-rate\//.test(k));
  assert.deepEqual(mine.map(([, v]) => v.value), ["20"], "the viewer's count is the 20 uploads Catbox took, not the 30 failures");
});

test("/catbox hands back only a failed upload's own count: uploads made while it was on its way still count", async () => {
  // Security review of the second round: the hand-back restored the count as it stood when the
  // upload began, wiping out every upload made meanwhile, so a slow failure reset a viewer's hour.
  const kv = fakeKv(), env = { RW_IMG: kv, ASSETS: { fetch: () => new Response("asset") } };
  let release, n = 0;
  const gate = new Promise((r) => { release = r; });
  const saved = globalThis.fetch;
  globalThis.fetch = async () => {
    n++;
    if (n === 1) { await gate; return new Response("nope", { status: 500 }); }
    return new Response("https://files.catbox.moe/abc123.jpg");
  };
  const req = () => new Request(ORIGIN + "/catbox", { method: "POST", body: JPEG,
    headers: { origin: ORIGIN, "content-type": "image/jpeg", "cf-connecting-ip": "203.0.113.7" } });
  try {
    const slow = worker.fetch(req(), env);                     // counted, on its way, will fail
    while (n < 1) await new Promise((r) => setTimeout(r, 1));
    for (let i = 0; i < 19; i++) assert.equal((await worker.fetch(req(), env)).status, 200, "upload " + (i + 1));
    release();
    assert.equal((await slow).status, 502);
    assert.equal((await worker.fetch(req(), env)).status, 200, "the 20th upload");
    assert.equal((await worker.fetch(req(), env)).status, 429, "and no more: the failure didn't wipe out the 19");
  } finally { globalThis.fetch = saved; }
});

test("/catbox counts an IPv6 viewer by their network (the first 64 bits), not by each address", async () => {
  // Security review of 1.7.0: one IPv6 network holds billions of addresses, so counting each one
  // let a single viewer pass the hourly limit by changing address.
  const env = { RW_IMG: fakeKv(), ASSETS: { fetch: () => new Response("asset") } };
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
  for (let i = 1; i <= 20; i++) assert.equal((await call({ env, ip: "2001:db8:1:2::" + i.toString(16), catbox: cb })).res.status, 200);
  assert.equal((await call({ env, ip: "2001:0db8:0001:0002:ffff:ffff:ffff:fffe", catbox: cb })).res.status, 429);
  assert.equal((await call({ env, ip: "2001:db8:1:3::1", catbox: cb })).res.status, 200, "the next network is not held up");
});

test("/catbox has no site-wide limit (the owner's call), and refuses outright with no counter store", async () => {
  // A site-wide cap would let someone spread over several networks lock everyone out for an hour;
  // the owner chose no cap, accepting that uploads spread over many networks have no overall limit.
  // Each viewer is still held to their own 20.
  const kv = fakeKv(), env = { RW_IMG: kv, ASSETS: { fetch: () => new Response("asset") } };
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
  for (let i = 1; i <= 150; i++) assert.equal((await call({ env, ip: "198.51." + (i >> 8) + "." + (i & 255), catbox: cb })).res.status, 200, "upload " + i);
  assert.equal(cb.calls.length, 150);
  assert.ok(![...kv.m.keys()].some((k) => /\/all\//.test(k)), "no site-wide counter is kept");
  // No counter store (a misconfigured deploy): refuse, never upload without the per-viewer limit.
  const none = await call({ env: { ASSETS: { fetch: () => new Response("asset") } }, catbox: cb });
  assert.equal(none.res.status, 503);
  assert.equal(cb.calls.length, 150);
});

test("/catbox passes on only a files.catbox.moe picture link: anything else Catbox says is an error", async () => {
  for (const said of ["", "No files given.", "Something went wrong", "https://files.catbox.moe/abc123.html",
                      "https://files.catbox.moe/abc123.png<script>", "https://evil.example/abc123.png",
                      "https://files.catbox.moe/ABC123.png extra", "http://files.catbox.moe/abc123.png"]) {
    const { res, json } = await call({ catbox: fakeCatbox(new Response(said)) });
    assert.equal(res.status, 502, JSON.stringify(said));
    assert.ok(json.error && !json.url, JSON.stringify(json));
    assert.ok(said === "" || !String(json.error).includes(said), "Catbox's own text is never passed on: " + json.error);
  }
  // Catbox refusing, or not answering at all.
  assert.equal((await call({ catbox: fakeCatbox(new Response("nope", { status: 412 })) })).res.status, 502);
  const down = { calls: [], fn: async () => { throw new Error("network"); } };
  const { res, json } = await call({ catbox: down });
  assert.equal(res.status, 502);
  assert.match(json.error, /Catbox/);
});

test("/catbox allows 20 uploads an hour from one viewer, counted under a hash of the address, never the address", async () => {
  const kv = fakeKv(), env = { RW_IMG: kv, ASSETS: { fetch: () => new Response("asset") } };
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
  for (let i = 0; i < 20; i++) assert.equal((await call({ env, catbox: cb })).res.status, 200, "upload " + (i + 1));
  const { res, json } = await call({ env, catbox: cb });
  assert.equal(res.status, 429);
  assert.match(json.error, /20 uploads an hour/);
  assert.equal(cb.calls.length, 20, "the 21st never reached Catbox");
  // Another viewer is not held up.
  assert.equal((await call({ env, ip: "198.51.100.9", catbox: cb })).res.status, 200);
  // The counters expire by themselves, and no key or value holds the viewer's address.
  for (const [k, v] of kv.m) {
    assert.ok(!k.includes("203.0.113.7") && !v.value.includes("203.0.113.7"), k);
    assert.ok(v.opts.expirationTtl >= 3600, "a counter outlives its hour: " + JSON.stringify(v.opts));
    assert.match(k, /^catbox-rate\//);
  }
});

test("the counters can never be served as an uploaded picture, and the other routes are unchanged", async () => {
  // Image keys are matched by shape (hex only); a counter key is not one.
  assert.equal(imageKeyFor("/catbox-rate/0123456789abcdef/123"), null);
  assert.equal(imageKeyFor("/catbox"), null);
  const env = { RW_IMG: fakeKv(), ASSETS: { fetch: () => new Response("asset") } };
  const res = await worker.fetch(new Request(ORIGIN + "/robots.txt"), env);
  assert.equal(await res.text(), "asset");
});
