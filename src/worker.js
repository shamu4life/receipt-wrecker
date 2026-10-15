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
//   /imgbb  (1.8.0, by the owner's decision) a Real picture card's picked file,
//     uploaded to ImgBB with the owner's API key for an i.ibb.co link, which Printer
//     Bot 3.0 prints as the picture; ImgBB deletes it after a day. See handleImgbb.
//     (1.7.0 sent it to Catbox through /catbox, until Catbox went down.)
//
// Privacy note: "upload for a link" sends an image to this Worker, and turning
// on Thermal preview with a pasted URL sends that URL through /px. Big Text,
// glyph-art, and a plain (non-thermal) URL preview all stay fully local. A file
// picked on a Real picture card goes through /imgbb to ImgBB, public to anyone with
// its link until it is deleted, a day later.

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
//
// KNOWN RESIDUAL, ACCEPTED DELIBERATELY — read this before "hardening" it.
// This checks the ADDRESS LITERAL in the URL. A hostname whose DNS answer points at a
// private or link-local address (`evil.test A 169.254.169.254`, or a rebinding record
// that answers differently on the second lookup) is NOT caught, because the Workers
// runtime never hands the script the address it resolved — there is no post-resolution
// hook to check, and no way to pin the address between the check and the fetch.
//
// Two things bound it, and neither is a reason to be careless:
//   * The fetch originates from Cloudflare's edge, not from any network the operator
//     controls, so the RFC1918 ranges this blocks are not a route to the owner's LAN
//     the way they would be from a server inside it.
//   * The response is gated to image/* under 5 MB, so it is a poor oracle.
// A pre-flight DNS-over-HTTPS lookup would raise the bar but cannot close it: the
// answer can change between the lookup and the fetch, which is the whole point of
// rebinding. It would buy latency and a false sense of completeness.
//
// SELF-HOSTERS: this reasoning is about Cloudflare Workers. On a runtime that sits
// inside a network you care about, that first bullet does not hold and this guard is
// not sufficient on its own.
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
async function handleProxy(url, env) {
  let target = isPublicHttpUrl(url.searchParams.get("u") || "");
  if (!target) return json({ error: "bad or disallowed url" }, 400);

  // OUR OWN MINTED LINKS ARE SERVED FROM KV, NEVER FETCHED.
  // i.uwutoowo.com is a custom domain on THIS Worker, so `fetch()`-ing it asks
  // Cloudflare to route a request from the Worker back into the same Worker. That does
  // not loop politely — it times out, and the edge answers 522, which this handler
  // dutifully reports as `upstream said 522`. Measured on production against a live
  // 15-minute link that returned 200 to curl a second earlier.
  //
  // The visible cost was that the Thermal preview could never inline an uploaded
  // picture: it needs the bytes through our origin to raster them, got a 502, and drew
  // blank paper where a picture really prints. Glyph-art decoding of a pasted minted
  // link and the image-adjust bake go through the same door.
  //
  // Reading KV directly is also strictly better than a working fetch would have been:
  // one less hop, and the bytes are already ours.
  // GATED ON HOST, and that gate is load-bearing: imageKeyFor matches by path SHAPE
  // alone, so without it any third-party URL that happened to look like /<hex>.png —
  // a perfectly ordinary CDN filename — would be answered out of our KV and 404 as
  // "expired" instead of being proxied.
  const ownHosts = [String((env && env.RW_IMG_HOST) || ""), String(url.hostname || "")]
    .map((h) => h.toLowerCase()).filter(Boolean);
  if (env && env.RW_IMG && ownHosts.indexOf(target.hostname.toLowerCase()) >= 0) {
    const ownKey = imageKeyFor(target.pathname);
    if (ownKey) {
      const got = await env.RW_IMG.getWithMetadata(ownKey, { type: "arrayBuffer" });
      if (got && got.value) {
        return new Response(got.value, {
          headers: {
            "content-type": (got.metadata && got.metadata.ct) || "application/octet-stream",
            "cache-control": "public, max-age=" + TTL_SECONDS,
            "access-control-allow-origin": "*",
          },
        });
      }
      // A hex-shaped path we don't hold is an expired link, not something to go fetch:
      // the host is ours, so nobody else can answer for it.
      return json({ error: "that link has expired" }, 404);
    }
  }

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

// ── /imgbb (1.8.0) ──
// The owner's calls (2026-10-14): a Real picture card's picked file is uploaded for the viewer and
// its link comes back into the card's link field, in one step. 1.7.0 used Catbox (/catbox) and Catbox
// went down that night; the owner moved to ImgBB, each upload deleting itself after a day
// (IMGBB_EXPIRATION_S), with the owner's API key kept here, as the Worker secret IMGBB_KEY, so no
// page or viewer ever sees it (ImgBB would let a page upload directly, but anyone could then copy
// the key and upload anything to the owner's account). The uploads land in the owner's ImgBB
// account until they expire. Guards, so the route is not a free uploader into that account:
//   * only this site's own page: the request's Origin must be this origin (a browser always sends
//     one on a POST), and the answer carries no CORS header, so no other site's page can see it.
//     A script outside a browser can claim any Origin, so this stops other sites' pages, not
//     scripts: the limits below are what bound a script (security review of 1.7.0);
//   * a real JPEG only, its structure walked the way a decoder walks it (isCleanJpeg), 5 MB at
//     most. The page redraws every picture as a JPEG before it sends it, so nothing else is ever
//     needed (the review: the declared type alone was trusted);
//   * UPLOADS_PER_HOUR uploads an hour per viewer, an IPv6 viewer counted by network (the first 64
//     bits: one network holds billions of addresses), counted in KV under a hash of the network
//     (never the address), each counter expiring by itself. KV is eventually consistent, so a burst
//     can slip a few past: a brake, not a wall. With no KV, or no key, the route refuses rather than
//     upload without its limit. There is no site-wide limit, by the owner's decision (2026-10-14):
//     one would let someone spread over several networks lock every viewer out for an hour, and the
//     owner preferred that risk gone, accepting that uploads spread over many networks have no
//     overall limit;
//   * ImgBB's answer passed on only when its link is an i.ibb.co picture link of the shape Printer
//     Bot prints, and never ImgBB's own words.
const IMGBB_API = "https://api.imgbb.com/1/upload";
const IMGBB_LINK = /^https:\/\/i\.ibb\.co\/[A-Za-z0-9]{3,16}\/[A-Za-z0-9_.~-]{1,120}\.(?:png|jpe?g|gif|webp)$/;
const IMGBB_EXPIRATION_S = 86400;
const UPLOADS_PER_HOUR = 20;
const UPLOAD_TIMEOUT_MS = 30000;

// A JPEG whose structure a decoder walks cleanly, end to end: SOI first; then marker segments by
// their own lengths, only APPn (64 KB of them in all: a colour profile, the JFIF header), DQT,
// SOF0/1/2 (baseline, extended, progressive), DHT and DRI, never a comment or anything else; scans
// (SOS, after a frame) whose entropy-coded data holds only byte stuffing (FF 00) and restart markers,
// tables allowed between progressive scans; and EOI as the very last two bytes. A start and an end
// marker alone let a file carry anything in between (security review of the hardening).
const JPEG_APP_BUDGET = 65536;
function isCleanJpeg(buf) {
  const b = new Uint8Array(buf), n = b.length;
  if (n < 4 || b[0] !== 0xff || b[1] !== 0xd8) return false;
  let i = 2, app = 0, frame = false, scan = false;
  while (i < n) {
    if (b[i] !== 0xff) return false;
    while (i + 1 < n && b[i + 1] === 0xff) i++;                      // fill bytes before a marker
    if (i + 1 >= n) return false;
    const m = b[i + 1];
    if (m === 0xd9) return scan && i + 2 === n;                       // EOI, and nothing after it
    if (i + 3 >= n) return false;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > n) return false;
    if (m >= 0xe0 && m <= 0xef) {
      app += len;
      if (app > JPEG_APP_BUDGET) return false;
    } else if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      frame = true;
    } else if (m === 0xda) {
      if (!frame) return false;
      scan = true;
      i += 2 + len;
      while (i < n) {                                                 // the scan's entropy-coded data
        if (b[i] === 0xff) {
          const x = i + 1 < n ? b[i + 1] : -1;
          if (x === 0x00 || (x >= 0xd0 && x <= 0xd7)) { i += 2; continue; }
          break;
        }
        i++;
      }
      continue;
    } else if (m !== 0xdb && m !== 0xc4 && m !== 0xdd) {
      return false;                                                   // a comment, or anything else
    }
    i += 2 + len;
  }
  return false;
}

// The viewer's network: an IPv4 address as it is, an IPv6 one by its first 64 bits.
function networkOf(ip) {
  const s = String(ip || "").trim().toLowerCase();
  if (s.indexOf(":") < 0) return s;
  const halves = s.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const zeros = [];
  for (let i = head.length + tail.length; i < 8; i++) zeros.push("0");
  return head.concat(zeros, tail).slice(0, 4).map(function (g) { return (parseInt(g, 16) || 0).toString(16); }).join(":") + "::/64";
}

// JSON for /imgbb: like json(), but with no CORS header.
function sameSiteJson(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// The KV key counting this viewer's uploads this hour: a hash of their network, never the address.
async function viewerSlot(request) {
  const net = networkOf(request.headers.get("cf-connecting-ip") || "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("rw-upload:" + net));
  var hex = "";
  new Uint8Array(digest).slice(0, 16).forEach(function (b) { hex += (b + 0x100).toString(16).slice(1); });
  return "upload-rate/" + hex + "/" + Math.floor(Date.now() / 3600000);
}

async function handleImgbb(request, env, url) {
  if (request.method !== "POST") return sameSiteJson({ error: "POST a picture" }, 405);
  if (request.headers.get("origin") !== url.origin) return sameSiteJson({ error: "uploads only from this site's page" }, 403);
  const ct = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (ct !== "image/jpeg") return sameSiteJson({ error: "a JPEG picture only" }, 415);
  var buf;
  try { buf = await request.arrayBuffer(); } catch (e) { return sameSiteJson({ error: "could not take the picture" }, 400); }
  if (!buf || buf.byteLength === 0) return sameSiteJson({ error: "empty upload" }, 400);
  if (buf.byteLength > MAX_BYTES) return sameSiteJson({ error: "too big: 5 MB at most" }, 413);
  if (!isCleanJpeg(buf)) return sameSiteJson({ error: "that isn't a JPEG picture" }, 415);

  if (!env || !env.RW_IMG || !env.IMGBB_KEY) return sameSiteJson({ error: "uploads are off right now" }, 503);
  const slot = await viewerSlot(request);
  const mine = parseInt(await env.RW_IMG.get(slot), 10) || 0;
  if (mine >= UPLOADS_PER_HOUR) return sameSiteJson({ error: UPLOADS_PER_HOUR + " uploads an hour is the most: try again later" }, 429);
  // The upload is counted before it goes (so a burst can't all slip in while the first ones are on
  // their way) and handed back if ImgBB didn't take it: only uploads ImgBB took use up a viewer's
  // hour, so failures, and junk ImgBB refuses, lock nobody out (security review of the hardening).
  // The hand-back takes away this upload's own count from the count as it is now, never restoring
  // the count as it stood when the upload began: that wiped out every upload made meanwhile, and a
  // slow failure reset a viewer's hour (security review of the second round). KV's read-then-write
  // is not atomic, so requests in flight together can still overshoot the limit by their number:
  // a brake, not a wall.
  await env.RW_IMG.put(slot, String(mine + 1), { expirationTtl: 7200 });
  const refund = async function () {
    const now = parseInt(await env.RW_IMG.get(slot), 10) || 0;
    await env.RW_IMG.put(slot, String(Math.max(0, now - 1)), { expirationTtl: 7200 });
  };

  // A one-letter name keeps the link short (https://i.ibb.co/<id>/p.jpg, 30 characters): every
  // character of it is cheer payload. The key rides in the query string, as ImgBB's own example has
  // it (a key in the form body isn't documented, and nothing here can try one without a real key).
  // Workers Logs record only the request coming in, never this one; Workers tracing would record its
  // URL, key and all, so it stays off for this Worker (observability.traces is not set).
  const form = new FormData();
  form.append("image", new Blob([buf], { type: ct }), "p.jpg");
  form.append("name", "p");
  const api = IMGBB_API + "?expiration=" + IMGBB_EXPIRATION_S + "&key=" + encodeURIComponent(env.IMGBB_KEY);
  var res, said;
  try {
    res = await fetch(api, {
      method: "POST", body: form,
      headers: { "user-agent": "receipt-wrecker (+https://receipt.uwutoowo.com)" },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    said = await res.json().catch(function () { return null; });
  } catch (e) { await refund(); return sameSiteJson({ error: "ImgBB didn't answer: try again" }, 502); }
  if (!res.ok) {
    await refund();
    // ImgBB's error code 100 is a bad key (the secret pasted wrong, say): named, so the owner knows
    // what to fix on the first try. Its own message never goes to the page.
    const badKey = said && said.error && String(said.error.code) === "100";
    return sameSiteJson({ error: badKey ? "ImgBB refused this site's key (" + res.status + "): the site's owner needs to check it"
                                        : "ImgBB refused it (" + res.status + ")" }, 502);
  }
  const link = said && said.data && typeof said.data.url === "string" ? said.data.url : "";
  if (!IMGBB_LINK.test(link)) { await refund(); return sameSiteJson({ error: "ImgBB didn't send back a picture link" }, 502); }
  return sameSiteJson({ url: link });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/upload") return handleUpload(request, env, url);
    if (url.pathname === "/imgbb") return handleImgbb(request, env, url);
    if (url.pathname === "/px") return handleProxy(url, env);
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
