// Receipt Wrecker Worker.
//
// The app itself (public/index.html) is 100% client-side and needs no server.
// This Worker exists ONLY for the optional "upload my own image, get a 5-minute
// link" feature: it stashes an uploaded image in Cloudflare KV with a native
// 5-minute TTL and serves it back at a short URL, so the URL can go in an
// <object data="…"> payload (the printer fetches the real picture). Everything
// else — every request that isn't /upload or /i/… — is served straight from the
// static assets, unchanged.
//
// Privacy note: only the explicit "upload for a link" action sends an image to
// this Worker. Big Text, glyph-art, and paste-a-URL all stay fully local.

const TTL_SECONDS = 300;               // 5 minutes, enforced natively by KV
const MAX_BYTES = 5 * 1024 * 1024;     // 5 MB cap (KV values allow up to 25 MB; this is an abuse guard)
const OK_TYPE = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

async function handleUpload(request, env, url) {
  if (request.method !== "POST") return json({ error: "POST an image body" }, 405);
  const ct = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!OK_TYPE.test(ct)) return json({ error: "image/* only (png, jpeg, gif, webp, bmp, avif)" }, 415);
  var buf;
  try { buf = await request.arrayBuffer(); } catch (e) { return json({ error: "could not read body" }, 400); }
  if (!buf || buf.byteLength === 0) return json({ error: "empty upload" }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: "too big — 5 MB max" }, 413);

  // Random hex key; KV auto-expires the value after TTL_SECONDS.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  var key = "";
  for (var i = 0; i < bytes.length; i++) key += (bytes[i] + 0x100).toString(16).slice(1);

  await env.RW_IMG.put(key, buf, { expirationTtl: TTL_SECONDS, metadata: { ct: ct } });
  return json({ url: url.origin + "/i/" + key, expiresIn: TTL_SECONDS });
}

async function handleServe(url, env) {
  const key = url.pathname.slice(3).replace(/[^a-f0-9]/gi, "");   // /i/<hex>
  if (key.length < 8) return new Response("not found", { status: 404 });
  const got = await env.RW_IMG.getWithMetadata(key, { type: "arrayBuffer" });
  if (!got || !got.value) return new Response("expired or not found", { status: 404 });
  return new Response(got.value, {
    headers: {
      "content-type": (got.metadata && got.metadata.ct) || "application/octet-stream",
      // Cache no longer than the object can live, and let anything embed it.
      "cache-control": "public, max-age=" + TTL_SECONDS,
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/upload") return handleUpload(request, env, url);
    if (url.pathname.startsWith("/i/")) return handleServe(url, env);
    return env.ASSETS.fetch(request);   // the static site (index.html, etc.)
  },
};
