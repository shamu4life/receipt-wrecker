// 1.8.1, by the owner's decision: the old upload route is gone. Since 1.8.0 the app never calls
// /upload (a Real picture's copy that prints goes to ImgBB, and its card's picture is drawn on the
// device), and /upload took a picture from anyone, with no hourly limit, for a 15-minute link on
// i.uwutoowo.com, writing to the KV namespace /imgbb keeps its hourly counts in. Its picture routes
// (/<hex>.png and the older /i/<hex>) went with it: every link it made expired 15 minutes after it
// was made. Those paths are now the static site's, like any other, and nothing reads KV for them.
import test from "node:test";
import assert from "node:assert/strict";
import worker, * as mod from "../src/worker.js";

const ORIGIN = "https://receipt.uwutoowo.com";
const envOf = () => {
  const seen = [], kv = [];
  return {
    seen, kv,
    RW_IMG: { put: async (k) => { kv.push("put " + k); }, get: async (k) => { kv.push("get " + k); return null; },
              getWithMetadata: async (k) => { kv.push("getWithMetadata " + k); return null; } },
    ASSETS: { fetch: (req) => { seen.push(new URL(req.url).pathname); return new Response("asset", { status: 404 }); } },
  };
};

test("/upload is gone: a picture sent there reaches the static site, and nothing is stored", async () => {
  const env = envOf();
  const res = await worker.fetch(new Request(ORIGIN + "/upload", {
    method: "POST", headers: { "content-type": "image/png", origin: ORIGIN }, body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) }), env);
  assert.equal(await res.text(), "asset");
  assert.deepEqual(env.seen, ["/upload"]);
  assert.deepEqual(env.kv, [], "KV is not touched");
});

test("the old picture links are the static site's: /<hex>.png, /<hex> and /i/<hex>.png, on either host", async () => {
  for (const host of [ORIGIN, "https://i.uwutoowo.com"]) {
    for (const p of ["/0123456789ab.png", "/0123456789ab", "/i/0123456789abcdef0123456789abcdef.png"]) {
      const env = envOf();
      const res = await worker.fetch(new Request(host + p), env);
      assert.equal(await res.text(), "asset", host + p);
      assert.deepEqual([env.seen, env.kv], [[p], []], host + p);
    }
  }
});

test("the Worker keeps nothing of the old route: no picture-key matcher", () => {
  assert.equal(mod.imageKeyFor, undefined);
});
