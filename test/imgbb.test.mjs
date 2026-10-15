// 1.8.0, by the owner's decision: POST /imgbb uploads a Real picture card's picked file to ImgBB
// (i.ibb.co), whose direct link Printer Bot 3.0 prints as the picture, set to delete itself after a
// day. It replaced 1.7.0's /catbox the night Catbox went down. The upload uses the owner's ImgBB API
// key, kept as a Worker secret (IMGBB_KEY) so no page or viewer ever sees it, and the Worker hands
// back only a checked link. These tests drive the Worker with a FAKE ImgBB (a stubbed fetch) and a
// fake KV: nothing here ever reaches the real ImgBB.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/worker.js";

const ORIGIN = "https://receipt.uwutoowo.com";
const KEY = "test-imgbb-key";
const LINK = "https://i.ibb.co/AbC1234/p.jpg";
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
// ImgBB's answer for an upload, as its API documents it (data.url is the direct link).
const answer = (url) => new Response(JSON.stringify(
  { data: { id: "AbC1234", url, image: { url, filename: "p.jpg", mime: "image/jpeg" }, expiration: "86400" }, success: true, status: 200 }),
  { status: 200, headers: { "content-type": "application/json" } });
// ImgBB turning an upload down, the way it does: a bad key is its error code 100 (seen from the real
// API with a made-up key and no picture, 2026-10-14).
const refusal = (status, code, message) => new Response(JSON.stringify(
  { status_code: status, error: { message, code }, status_txt: "Bad Request" }),
  { status, headers: { "content-type": "application/json" } });
// The fake ImgBB: records every call and answers with `reply` (a Response, cloned for each call).
function fakeImgbb(reply) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return reply.clone();
  };
  return { calls, fn };
}
const envOf = (o) => ({ RW_IMG: fakeKv(), IMGBB_KEY: KEY, ASSETS: { fetch: () => new Response("asset") }, ...o });
async function call({ method = "POST", origin = ORIGIN, type = "image/jpeg", body = JPEG, ip = "203.0.113.7", env, imgbb } = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  if (type) headers.set("content-type", type);
  if (ip) headers.set("cf-connecting-ip", ip);
  const req = new Request(ORIGIN + "/imgbb", { method, headers, body: method === "GET" ? undefined : body });
  const saved = globalThis.fetch;
  globalThis.fetch = (imgbb || fakeImgbb(answer(LINK))).fn;
  try {
    const res = await worker.fetch(req, env || envOf());
    return { res, json: await res.json().catch(() => null) };
  } finally { globalThis.fetch = saved; }
}

test("/imgbb uploads the picture to ImgBB with the owner's key, set to delete itself after a day, and hands back the i.ibb.co link", async () => {
  const ib = fakeImgbb(answer(LINK));
  const { res, json } = await call({ imgbb: ib });
  assert.equal(res.status, 200);
  assert.deepEqual(json, { url: LINK });
  assert.equal(ib.calls.length, 1);
  const { url, init } = ib.calls[0];
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://api.imgbb.com/1/upload");
  assert.equal(u.searchParams.get("key"), KEY);
  assert.equal(u.searchParams.get("expiration"), "86400");
  assert.equal(init.method, "POST");
  const f = init.body.get("image");
  assert.equal(f.size, JPEG.byteLength);
  assert.equal(f.name, "p.jpg");
  assert.equal(f.type, "image/jpeg");
  assert.equal(init.body.get("name"), "p", "a one-letter name keeps the link short");
  // The key never comes back to the page.
  assert.ok(!JSON.stringify(json).includes(KEY));
});

test("/imgbb answers only this site's own page, and no other site's page can see the answer", async () => {
  for (const origin of [null, "https://evil.example", "http://receipt.uwutoowo.com"]) {
    const ib = fakeImgbb(answer(LINK));
    const { res } = await call({ origin, imgbb: ib });
    assert.equal(res.status, 403, String(origin));
    assert.equal(ib.calls.length, 0, "nothing went to ImgBB for " + origin);
  }
  const { res } = await call({});
  assert.equal(res.headers.get("access-control-allow-origin"), null, "no CORS header on /imgbb");
});

test("/imgbb takes POSTed pictures only, not empty, 5 MB at most", async () => {
  const ib = fakeImgbb(answer(LINK));
  assert.equal((await call({ method: "GET", imgbb: ib })).res.status, 405);
  for (const type of ["text/html", "image/svg+xml", "application/octet-stream", "image/bmp", null]) {
    assert.equal((await call({ type, imgbb: ib })).res.status, 415, String(type));
  }
  assert.equal((await call({ body: new Uint8Array(0), imgbb: ib })).res.status, 400);
  assert.equal((await call({ body: new Uint8Array(5 * 1024 * 1024 + 1), imgbb: ib })).res.status, 413);
  assert.equal(ib.calls.length, 0);
});

test("/imgbb takes a real JPEG only (the page always sends one): the bytes are checked, not the label", async () => {
  const ib = fakeImgbb(answer(LINK));
  for (const type of ["image/png", "image/gif", "image/webp"]) assert.equal((await call({ type, imgbb: ib })).res.status, 415, type);
  const html = new TextEncoder().encode("<html><body>not a picture</body></html>");
  const noEnd = JPEG.slice(0, JPEG.length - 2);
  const trailing = jpeg({ after: [0x50, 0x4b, 0x03, 0x04] });                  // a zip glued after the picture
  for (const [what, body] of [["html", html], ["no end marker", noEnd], ["data after the end", trailing]]) {
    assert.equal((await call({ body, imgbb: ib })).res.status, 415, what);
  }
  assert.equal(ib.calls.length, 0, "nothing but a JPEG reached ImgBB");
});

test("/imgbb walks the JPEG the way a decoder does: no comments, no unknown segments, little extra data, nothing after the end", async () => {
  const ib = fakeImgbb(answer(LINK));
  const bigApp = new Array(40000).fill(0x41);
  const refused = [
    ["start and end markers only", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ["a comment segment", jpeg({ before: seg(0xfe, [...new TextEncoder().encode("<script>alert(1)</script>")]) })],
    ["an unknown segment", jpeg({ before: seg(0xf7, [1, 2, 3]) })],
    ["over 64 KB of APPn data", jpeg({ before: [...seg(0xe1, bigApp), ...seg(0xe1, bigApp)] })],
    ["a segment longer than the file", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 1, 2, 0xff, 0xd9])],
    ["a scan before any frame", new Uint8Array([0xff, 0xd8, ...seg(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0xff, 0xd9])],
  ];
  for (const [what, body] of refused) assert.equal((await call({ body, imgbb: ib })).res.status, 415, what);
  assert.equal(ib.calls.length, 0);
  // A real encoder's picture, colour profile and all, goes through; and so does one with a little APPn data.
  assert.equal((await call({ body: CANVAS_JPEG, imgbb: ib })).res.status, 200, "Chromium's canvas JPEG");
  assert.equal((await call({ body: jpeg({ before: seg(0xe2, new Array(3000).fill(7)) }), imgbb: ib })).res.status, 200);
});

test("/imgbb passes on only an i.ibb.co picture link: anything else ImgBB says is an error, and its own words never reach the page", async () => {
  const bad = ["", "https://i.ibb.co/AbC1234/p.html", "https://i.ibb.co/AbC1234/p.jpg<script>", "https://evil.example/AbC1234/p.jpg",
               "http://i.ibb.co/AbC1234/p.jpg", "https://ibb.co/AbC1234", "https://i.ibb.co/p.jpg"];
  for (const url of bad) {
    const { res, json } = await call({ imgbb: fakeImgbb(answer(url)) });
    assert.equal(res.status, 502, JSON.stringify(url));
    assert.ok(json.error && !json.url, JSON.stringify(json));
  }
  for (const body of ["not json", JSON.stringify({ success: false }), JSON.stringify({ data: {} })]) {
    assert.equal((await call({ imgbb: fakeImgbb(new Response(body)) })).res.status, 502, body);
  }
  // ImgBB refusing, or not answering at all.
  const refused = await call({ imgbb: fakeImgbb(refusal(400, 999, "Something about the upload.")) });
  assert.equal(refused.res.status, 502);
  assert.match(refused.json.error, /^ImgBB refused it \(400\)$/);
  // A bad key (the secret pasted wrong, say) is named, so the owner knows what to fix; still in the
  // site's own words, never ImgBB's.
  const badKey = await call({ imgbb: fakeImgbb(refusal(400, 100, "Invalid API v1 key.")) });
  assert.equal(badKey.res.status, 502);
  assert.match(badKey.json.error, /^ImgBB refused this site's key \(400\): the site's owner needs to check it$/);
  const down = { calls: [], fn: async () => { throw new Error("network"); } };
  const { res, json } = await call({ imgbb: down });
  assert.equal(res.status, 502);
  assert.match(json.error, /ImgBB/);
});

test("/imgbb refuses outright without its key or its counter store, and nothing goes to ImgBB", async () => {
  const ib = fakeImgbb(answer(LINK));
  for (const env of [envOf({ IMGBB_KEY: undefined }), envOf({ IMGBB_KEY: "" }), envOf({ RW_IMG: undefined })]) {
    const { res, json } = await call({ env, imgbb: ib });
    assert.equal(res.status, 503);
    assert.match(json.error, /uploads are off right now/);
  }
  assert.equal(ib.calls.length, 0);
});

test("/imgbb allows 20 uploads an hour from one viewer, counted under a hash of the address, never the address", async () => {
  const env = envOf(), kv = env.RW_IMG;
  const ib = fakeImgbb(answer(LINK));
  for (let i = 0; i < 20; i++) assert.equal((await call({ env, imgbb: ib })).res.status, 200, "upload " + (i + 1));
  const { res, json } = await call({ env, imgbb: ib });
  assert.equal(res.status, 429);
  assert.match(json.error, /20 uploads an hour/);
  assert.equal(ib.calls.length, 20, "the 21st never reached ImgBB");
  // Another viewer is not held up.
  assert.equal((await call({ env, ip: "198.51.100.9", imgbb: ib })).res.status, 200);
  // The counters expire by themselves, and no key or value holds the viewer's address.
  for (const [k, v] of kv.m) {
    assert.ok(!k.includes("203.0.113.7") && !v.value.includes("203.0.113.7"), k);
    assert.ok(v.opts.expirationTtl >= 3600, "a counter outlives its hour: " + JSON.stringify(v.opts));
    assert.match(k, /^upload-rate\//);
  }
});

test("/imgbb counts only uploads ImgBB took: a failure uses up nobody's hour", async () => {
  const env = envOf(), kv = env.RW_IMG;
  // Every way an upload can fail: refused, no answer at all, an answer with no proper link.
  const failing = [fakeImgbb(new Response("nope", { status: 500 })),
                   { calls: [], fn: async () => { throw new Error("network"); } },
                   fakeImgbb(answer("https://evil.example/AbC1234/p.jpg"))];
  for (let i = 0; i < 30; i++) assert.equal((await call({ env, imgbb: failing[i % 3] })).res.status, 502, "failure " + (i + 1));
  const ib = fakeImgbb(answer(LINK));
  for (let i = 0; i < 20; i++) assert.equal((await call({ env, imgbb: ib })).res.status, 200, "upload " + (i + 1));
  assert.equal((await call({ env, imgbb: ib })).res.status, 429);
  assert.deepEqual([...kv.m].map(([, v]) => v.value), ["20"], "the viewer's count is the 20 uploads ImgBB took, not the 30 failures");
});

test("/imgbb hands back only a failed upload's own count: uploads made while it was on its way still count", async () => {
  const env = envOf();
  let release, n = 0;
  const gate = new Promise((r) => { release = r; });
  const saved = globalThis.fetch;
  globalThis.fetch = async () => {
    n++;
    if (n === 1) { await gate; return new Response("nope", { status: 500 }); }
    return answer(LINK);
  };
  const req = () => new Request(ORIGIN + "/imgbb", { method: "POST", body: JPEG,
    headers: { origin: ORIGIN, "content-type": "image/jpeg", "cf-connecting-ip": "203.0.113.7" } });
  try {
    const slow = worker.fetch(req(), env);                     // counted, on its way, will fail
    for (let t = 0; n < 1 && t < 2000; t++) await new Promise((r) => setTimeout(r, 1));
    assert.equal(n, 1, "the first upload never reached ImgBB");
    for (let i = 0; i < 19; i++) assert.equal((await worker.fetch(req(), env)).status, 200, "upload " + (i + 1));
    release();
    assert.equal((await slow).status, 502);
    assert.equal((await worker.fetch(req(), env)).status, 200, "the 20th upload");
    assert.equal((await worker.fetch(req(), env)).status, 429, "and no more: the failure didn't wipe out the 19");
  } finally { globalThis.fetch = saved; }
});

test("/imgbb counts an IPv6 viewer by their network (the first 64 bits), not by each address", async () => {
  const env = envOf();
  const ib = fakeImgbb(answer(LINK));
  for (let i = 1; i <= 20; i++) assert.equal((await call({ env, ip: "2001:db8:1:2::" + i.toString(16), imgbb: ib })).res.status, 200);
  assert.equal((await call({ env, ip: "2001:0db8:0001:0002:ffff:ffff:ffff:fffe", imgbb: ib })).res.status, 429);
  assert.equal((await call({ env, ip: "2001:db8:1:3::1", imgbb: ib })).res.status, 200, "the next network is not held up");
});

test("/imgbb has no site-wide limit (the owner's call)", async () => {
  const env = envOf(), kv = env.RW_IMG;
  const ib = fakeImgbb(answer(LINK));
  for (let i = 1; i <= 150; i++) assert.equal((await call({ env, ip: "198.51." + (i >> 8) + "." + (i & 255), imgbb: ib })).res.status, 200, "upload " + i);
  assert.equal(ib.calls.length, 150);
  assert.ok(![...kv.m.keys()].some((k) => /\/all\//.test(k)), "no site-wide counter is kept");
});

test("the old /catbox route is gone, the counters can never be served as a picture, and the other routes are unchanged", async () => {
  const env = envOf();
  const res = await worker.fetch(new Request(ORIGIN + "/catbox", { method: "POST", headers: { origin: ORIGIN } }), env);
  assert.equal(await res.text(), "asset", "/catbox falls through to the static site");
  // No route reads KV (1.8.1: the old picture routes are gone), so a counter's key as a path is the static site's.
  assert.equal(await (await worker.fetch(new Request(ORIGIN + "/upload-rate/0123456789abcdef/123"), env)).text(), "asset");
  assert.equal(await (await worker.fetch(new Request(ORIGIN + "/robots.txt"), env)).text(), "asset");
});
