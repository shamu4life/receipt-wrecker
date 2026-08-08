// Receipt Wrecker Worker.
//
// The app itself (public/index.html) is 100% client-side and needs no server.
// This Worker exists for two optional features; everything else — every request
// that isn't /upload, /i/… or /px — is served straight from the static assets.
//
//   /upload + /i/<key>  "upload my own image, get a 15-minute link": stashes an
//     uploaded image in Cloudflare KV with a native 15-minute TTL and serves it
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

const TTL_SECONDS = 900;               // 15 minutes, enforced natively by KV
const MAX_BYTES = 5 * 1024 * 1024;     // 5 MB cap (KV values allow up to 25 MB; this is an abuse guard)

// EVERY CHARACTER OF THE LINK IS PAYLOAD. The URL is pasted into a Twitch message
// with a hard 500-char cap, alongside markup that is already most of the budget, so
// the link length is a product constraint and not a detail. Measured: the old form,
// https://receipt.uwutoowo.com/i/<32 hex>.png, was 67 chars. The current form is 39.
//
// KEY_BYTES = 6 gives 12 hex chars = 48 bits. The security model is "unguessable
// link, alive for 15 minutes": 2.8e14 keys against a 900-second window means a
// guessing attack needs ~3e11 requests/second to expect a single hit, which is not a
// thing that happens through Cloudflare. The previous 16 bytes (128 bits) was 20
// characters of payload spent on margin that was never load-bearing.
const KEY_BYTES = 6;
const KEY_RE = /^[0-9a-f]{8,64}$/;     // accept longer keys forever: links minted at 32 hex still resolve

// Where minted links point. Defaults to whatever origin served /upload, so preview
// deployments and local dev keep working with no config. Set the RW_IMG_HOST var to a
// shorter host to shave the difference off every picture payload — but ONLY once that
// host actually routes to this Worker, because a link to a host that doesn't resolve
// is worse than a long one: on the printer's engine a failed subresource whose
// extension IS in the media list is a soft error, but the picture is simply missing.
function imgOrigin(env, url) {
  const h = env && env.RW_IMG_HOST;
  if (!h) return url.origin;
  const s = String(h).trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(s) ? s : "https://" + s;
}
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

  // Random hex key; KV auto-expires the value after TTL_SECONDS. See KEY_BYTES.
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  var key = "";
  for (var i = 0; i < bytes.length; i++) key += (bytes[i] + 0x100).toString(16).slice(1);

  await env.RW_IMG.put(key, buf, { expirationTtl: TTL_SECONDS, metadata: { ct: ct } });
  // The returned link ENDS IN AN EXTENSION, and that is load-bearing twice over on
  // the printer's engine (wkhtmltopdf 0.12.6 / Qt-WebKit — both measured):
  //
  //  1. <embed>/<object> pick the image renderer from the URL's extension. Given a
  //     bare /i/<hex> they draw nothing at all — which is what the old "renders at
  //     native size, ignores the width" folklore actually was.
  //  2. Worse: wkhtmltopdf only treats a FAILED subresource as a soft "media" error
  //     if its extension is in a hardcoded list (css/js/svg/png/jpg/jpeg/gif).
  //     Anything else is escalated to a fatal page error — exit code 1, whole print
  //     job dead, not just a missing picture. `--load-error-handling ignore` (which
  //     printer-bot does pass) does NOT suppress it. These links expire after 15
  //     minutes, so cheering a stale one is the ordinary case, not the edge case.
  //
  // The extension is honest: /upload only ever stores what the client re-encodes to
  // PNG. handleServe strips any suffix, so links minted before this still resolve.
  //
  // Served from the ROOT, not /i/ — those two characters are two characters of Twitch
  // budget. /i/<key> still resolves so links minted before this keep working.
  return json({ url: imgOrigin(env, url) + "/" + key + ".png", expiresIn: TTL_SECONDS });
}

// The key for a request path, or null if this path isn't an image request at all.
// Two shapes: /<hex>.png (current, shortest) and /i/<hex>.png (legacy). The suffix is
// stripped rather than required, so both pre-extension and pre-root links resolve.
// Deliberately strict on the root form — it shares a namespace with the static site,
// so it must match ONLY a hex key and never shadow /robots.txt, /llms.txt or similar.
export function imageKeyFor(pathname) {
  const p = String(pathname || "");
  const raw = p.startsWith("/i/") ? p.slice(3) : p.slice(1);
  if (raw.indexOf("/") >= 0) return null;
  const key = raw.replace(/\.(png|jpe?g|gif|webp|bmp|avif)$/i, "").toLowerCase();
  return KEY_RE.test(key) ? key : null;
}

async function handleServe(key, env) {
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

// True for an IPv4 (as [a,b,c,d]) that must never be proxied: this-network,
// loopback, private, link-local (incl. 169.254.169.254 cloud metadata), and
// multicast/reserved (>=224).
function isPrivateIPv4(o) {
  const a = o[0], b = o[1];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

// If an IPv6 host embeds an IPv4 address, return those four octets, else null.
// Three forms embed v4: v4-mapped (::ffff:x), deprecated v4-compatible (::x),
// and NAT64 (64:ff9b::x). The WHATWG URL parser serialises the tail to HEX
// (::ffff:169.254.169.254 -> ::ffff:a9fe:a9fe), so we recover the octets from
// the last two hextets. Without this, ::ffff:127.0.0.1 & friends would dodge
// every private-range check below and reach loopback / metadata. `host` is
// already lowercased and bracket-stripped.
function embeddedIPv4(host) {
  if (!/^::ffff:/.test(host) && !/^64:ff9b::/.test(host) && !/^::/.test(host)) return null;
  const groups = host.split(":").filter(function (g) { return g.length > 0; });
  if (groups.length < 2) return null;                       // bare prefix, no embedded v4
  var hi = parseInt(groups[groups.length - 2], 16);
  var lo = parseInt(groups[groups.length - 1], 16);
  if (isNaN(hi) || isNaN(lo)) return null;                  // a real ::-compressed v6, not embedded v4
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
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
    // v4-mapped / v4-compatible / NAT64: check the embedded IPv4 too.
    const v4 = embeddedIPv4(host);
    if (v4 && isPrivateIPv4(v4)) return null;
    return u;
  }

  // IPv4 literal — reject this-network/loopback/private/link-local/reserved.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1).map(Number);
    if (o.some((x) => x > 255)) return null;
    if (isPrivateIPv4(o)) return null;
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
    if (url.pathname === "/px") return handleProxy(url);
    // Image keys are matched by SHAPE, not by host, so the same Worker serves them on
    // receipt.uwutoowo.com and on a short image host alike with no host-sniffing. The
    // pattern is narrow enough that it cannot swallow a real static asset — those all
    // have non-hex names or a longer path — and the static fetch below still runs for
    // anything that isn't a key.
    const key = imageKeyFor(url.pathname);
    if (key) return handleServe(key, env);
    return env.ASSETS.fetch(request);   // the static site (index.html, etc.)
  },
};
