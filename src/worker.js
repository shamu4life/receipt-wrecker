// Receipt Wrecker Worker.
//
// The app itself (public/index.html) is 100% client-side and needs no server.
// This Worker exists for two optional features; everything else — every request
// that isn't /upload, /i/… or /px — is served straight from the static assets.
//
//   /upload + /i/<key>  "upload my own image, get a 5-minute link": stashes an
//     uploaded image in Cloudflare KV with a native 5-minute TTL and serves it
//     back at a short URL, so the URL can go in an <object data="…"> payload
//     (the printer fetches the real picture).
//
//   /px?u=<url>  image proxy, used ONLY by the Thermal preview. Re-serves a
//     remote picture from our own origin so the client can read its bytes and
//     inline it as a data: URI — see inlineImages() in index.html for why that
//     is the only way to get a photo into the dithered raster.
//
// Privacy note: "upload for a link" sends an image to this Worker, and turning
// on Thermal preview with a pasted URL sends that URL through /px. Big Text,
// glyph-art, and a plain (non-thermal) URL preview all stay fully local.

const TTL_SECONDS = 300;               // 5 minutes, enforced natively by KV
const MAX_BYTES = 5 * 1024 * 1024;     // 5 MB cap (KV values allow up to 25 MB; this is an abuse guard)
const OK_TYPE = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;
const PROXY_TIMEOUT_MS = 8000;
const PROXY_MAX_HOPS = 3;              // follow redirects by hand so every hop is re-validated

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

// Guard for /px. Without this the endpoint is an open relay: anyone could point
// it at anything and have our Worker fetch it. Allow only public http(s) — no
// other scheme, no loopback/private/link-local host (169.254.169.254 is the
// classic cloud-metadata target). Returns the parsed URL, or null to reject.
// Exported for the tests.
export function isPublicHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch (e) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");   // unwrap [::1]
  if (!host) return null;
  if (host === "localhost" || /\.(localhost|local|internal|home\.arpa)$/.test(host)) return null;

  // IPv6 literal — reject loopback (::1), unique-local (fc00::/7), link-local
  // (fe80::/10). Gated on "is a v6 literal" so a hostname like fcbarcelona.com
  // can't trip the fc/fd prefix test.
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return null;
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return null;
    return u;
  }

  // IPv4 literal — reject this-network/loopback/private/link-local/reserved.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (m.slice(1).some((o) => +o > 255)) return null;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
  }
  return u;
}

// Re-serve a remote image from our origin so the client can read its bytes.
// Redirects are followed by hand (redirect: "manual") so a public URL can't
// bounce us into a private one on hop two.
async function handleProxy(url) {
  let target = isPublicHttpUrl(url.searchParams.get("u") || "");
  if (!target) return json({ error: "bad or disallowed url" }, 400);

  let res;
  for (let hop = 0; ; hop++) {
    try {
      res = await fetch(target.toString(), {
        redirect: "manual",
        headers: { accept: "image/*", "user-agent": "receipt-wrecker (+thermal-preview image proxy)" },
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        cf: { cacheEverything: true, cacheTtl: TTL_SECONDS },
      });
    } catch (e) { return json({ error: "could not fetch that image" }, 502); }

    if (res.status < 300 || res.status > 399) break;
    if (hop >= PROXY_MAX_HOPS) return json({ error: "too many redirects" }, 502);
    const next = isPublicHttpUrl(new URL(res.headers.get("location") || "", target).toString());
    if (!next) return json({ error: "redirect to a disallowed url" }, 400);
    target = next;
  }

  if (!res.ok) return json({ error: "upstream said " + res.status }, 502);
  const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (!OK_TYPE.test(ct)) return json({ error: "that url is not an image" }, 415);
  if (+(res.headers.get("content-length") || 0) > MAX_BYTES) return json({ error: "too big — 5 MB max" }, 413);

  const buf = await res.arrayBuffer();                                  // content-length can lie / be absent
  if (buf.byteLength > MAX_BYTES) return json({ error: "too big — 5 MB max" }, 413);

  return new Response(buf, {
    headers: {
      "content-type": ct,
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
    if (url.pathname === "/px") return handleProxy(url);
    return env.ASSETS.fetch(request);   // the static site (index.html, etc.)
  },
};
