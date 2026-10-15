// Receipt Wrecker Worker.
//
// The app itself (public/index.html) is client-side. This Worker serves it as static assets, plus
// two routes; every other request is the static site's.
//
//   /px?u=<url>  image proxy: re-serves a remote picture from our own origin so the page can read
//     its bytes (a Glyph-art picture's characters, a Real picture's size, the picture on its card
//     and the copy of it that prints are all drawn on the device). Guarded by isPublicHttpUrl.
//
//   /imgbb  (1.8.0, by the owner's decision) a Real picture card's picked file, or the turned and
//     adjusted copy of its picture, uploaded to ImgBB with the owner's API key for an i.ibb.co link,
//     which Printer Bot 3.0 prints as the picture; ImgBB deletes it after a day. See handleImgbb.
//     (1.7.0 sent a picked file to Catbox through /catbox, until Catbox went down.)
//
// 1.8.1, by the owner's decision, removed /upload, which kept a picture in KV for 15 minutes behind a
// short link on i.uwutoowo.com, with the routes that served it: the app stopped using it in 1.8.0,
// and it took a picture from anyone, with no hourly limit, writing to the KV namespace /imgbb keeps
// its hourly counts in.
//
// Privacy note: a pasted picture link goes through /px. A file picked on a Real picture card, and a
// Real picture's adjusted copy, go through /imgbb to ImgBB, public to anyone with the link until
// ImgBB deletes it, a day later. Text, and a picture picked for Glyph-art, never leave the device.

const TTL_SECONDS = 900;               // 15 minutes: how long a picture /px fetched may be cached
const MAX_BYTES = 5 * 1024 * 1024;     // 5 MB cap on a picture through /px or /imgbb: an abuse guard

const OK_TYPE = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;
const PROXY_TIMEOUT_MS = 8000;
const PROXY_MAX_HOPS = 3;              // follow redirects by hand so every hop is re-validated

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
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
    if (url.pathname === "/imgbb") return handleImgbb(request, env, url);
    if (url.pathname === "/px") return handleProxy(url);
    return env.ASSETS.fetch(request);   // the static site (index.html, etc.)
  },
};
