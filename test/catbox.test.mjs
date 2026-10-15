// 1.7.0, by the owner's decision: POST /catbox uploads a Real picture card's picked file to Catbox
// (files.catbox.moe), whose direct link Printer Bot 3.0 prints as the picture. Catbox sends no CORS
// headers, so the page can't see its answer itself; the Worker makes the upload and hands back only
// a checked link. These tests drive the Worker with a FAKE Catbox (a stubbed fetch) and a fake KV:
// nothing here ever reaches the real Catbox, where an upload is public and can't be deleted.
import test from "node:test";
import assert from "node:assert/strict";
import worker, { imageKeyFor } from "../src/worker.js";

const ORIGIN = "https://receipt.uwutoowo.com";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

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

test("/catbox takes POSTed pictures only: png, jpeg, gif or webp, not empty, 5 MB at most", async () => {
  const cb = fakeCatbox(new Response("https://files.catbox.moe/abc123.jpg"));
  assert.equal((await call({ method: "GET", catbox: cb })).res.status, 405);
  for (const type of ["text/html", "image/svg+xml", "application/octet-stream", "image/bmp", null]) {
    assert.equal((await call({ type, catbox: cb })).res.status, 415, String(type));
  }
  assert.equal((await call({ body: new Uint8Array(0), catbox: cb })).res.status, 400);
  assert.equal((await call({ body: new Uint8Array(5 * 1024 * 1024 + 1), catbox: cb })).res.status, 413);
  assert.equal(cb.calls.length, 0);
  for (const [type, ext] of [["image/png", "png"], ["image/gif", "gif"], ["image/webp", "webp"]]) {
    const ok = fakeCatbox(new Response("https://files.catbox.moe/abc123." + ext));
    const { res, json } = await call({ type, catbox: ok });
    assert.equal(res.status, 200, type);
    assert.equal(ok.calls[0].init.body.get("fileToUpload").name, "picture." + ext);
    assert.equal(json.url, "https://files.catbox.moe/abc123." + ext);
  }
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
