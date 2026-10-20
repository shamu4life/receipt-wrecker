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

// ── /resolve (album & page image links) ──
// A Real picture link that is an Imgur/Catbox/ImgBB ALBUM or PAGE (not a direct picture link) has no
// picture in the URL itself, so Printer Bot's action looks the album's first picture up at print time
// and hands the renderer opts.imgurAlbums / catboxAlbums / imgbbAlbums / imgbbPages. This route is a
// faithful port of that action's logic (PbImgur / PbCatbox / PbImgbb / PbLookups in the bot's compiled
// core, Printer Bot 3.2.0-beta.7), so the app's preview can resolve the same first picture and show
// what will print. The app classifies the link itself and asks for ONE site + id (+ kind/sort for
// ImgBB); this route builds the fixed upstream URL from a tightly-validated id, so there is no
// user-controlled host and no SSRF. Read-only, no key, no state (the app caches); every upstream GET
// is capped in bytes and shares the bot's 3-second budget, follows no redirect, and counts only a
// 200. It returns one of:
//   { picture: "<value>" }  the first picture, in the shape the renderer's lookup tables use
//                           ("<hash>.<ext>" imgur, "<name>.<ext>" catbox, "<id>/<name>.<ext>" imgbb);
//                           the app builds the direct link (i.imgur.com / files.catbox.moe / i.ibb.co).
//   { picture: "" }         looked up, no picture: the renderer prints "[image]".
//   { stay: true }          the first item is a video (imgur/catbox): the link stays as text, no entry.
// The app sends only a validated id, but this re-validates every id as a second line of defence.
const RESOLVE_BUDGET_MS = 3000;
const RESOLVE_UA = "receipt-wrecker (+https://receipt.uwutoowo.com) image-link resolver";
const IMGUR_LIST_BYTES = 65536, PAGE_BYTES = 524288;

// Fetch like the bot's PbLookups.Get: no redirect, status 200 only, byte-capped, inside the budget.
async function lookGet(target, maxBytes, deadline) {
  const left = deadline - Date.now();
  if (left < 250) return null;                                  // the bot leaves at least 250 ms a lookup
  let res;
  try {
    res = await fetch(target, {
      redirect: "manual",
      headers: { "user-agent": RESOLVE_UA, accept: "text/html,application/json,*/*" },
      signal: AbortSignal.timeout(left),
    });
  } catch (e) { return null; }
  if (res.status !== 200) return null;
  if (+(res.headers.get("content-length") || 0) > maxBytes) return null;
  const buf = await res.arrayBuffer();                          // content-length can lie or be absent
  if (buf.byteLength > maxBytes) return null;
  return new TextDecoder("utf-8").decode(buf);
}

const META_CONTENT = /\bcontent\s*=\s*["']([^"']*)["']/i;
function metaContent(html, tagRe) {                             // PbLookups.MetaContent: first tag's content
  tagRe.lastIndex = 0;
  let m;
  while ((m = tagRe.exec(html))) { const c = META_CONTENT.exec(m[0]); if (c) return c[1]; }
  return null;
}

// Imgur (PbImgur): the album's list of pictures (hit.json), else the album's preview picture (og).
const IMGUR_HASH = /^[A-Za-z0-9]{5,10}$/, IMGUR_EXTDOT = /^\.[a-z0-9]{2,5}$/;
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp"];
const IMGUR_OG_TAG = /<meta\b[^>]*\bproperty\s*=\s*["']og:(image|video)["'][^>]*>/ig;
const IMGUR_OG_PIC = /^https:\/\/i\.imgur\.com\/([A-Za-z0-9]{5,10})\.(jpg|jpeg|png|gif|webp)(?:\?[A-Za-z0-9=&]*)?$/i;
async function resolveImgur(id, deadline) {
  const list = await lookGet("https://imgur.com/ajaxalbums/getimages/" + id + "/hit.json", IMGUR_LIST_BYTES, deadline);
  if (list != null) {
    let j = null; try { j = JSON.parse(list); } catch (e) { j = null; }
    const arr = j && j.data && Array.isArray(j.data.images) ? j.data.images : null;
    if (arr && arr.length) {
      const first = arr[0] || {};
      const hash = typeof first.hash === "string" ? first.hash : null;
      const ext = typeof first.ext === "string" ? first.ext.toLowerCase() : null;
      if (hash && IMGUR_HASH.test(hash) && ext && IMGUR_EXTDOT.test(ext)) {
        if (IMAGE_EXTS.indexOf(ext.slice(1)) < 0) return { stay: true };    // a video: the link stays text
        return { picture: hash + ext };
      }
    }
  }
  const page = await lookGet("https://imgur.com/a/" + id, PAGE_BYTES, deadline);
  if (page != null) {
    IMGUR_OG_TAG.lastIndex = 0;
    let m, pic = null;
    while ((m = IMGUR_OG_TAG.exec(page))) {
      if (m[1].toLowerCase() === "video") return { stay: true };
      const c = META_CONTENT.exec(m[0]), hit = c ? IMGUR_OG_PIC.exec(c[1]) : null;
      if (pic == null && hit) pic = hit[1] + "." + hit[2].toLowerCase();
    }
    if (pic) return { picture: pic };
  }
  return { picture: "" };                                        // could not look it up: [image]
}

// Catbox (PbCatbox): the first file of the collection page.
const CATBOX_LISTSTART = /<div\b[^>]*\bclass\s*=\s*["']imagelist["']/i;
const CATBOX_BOXSTART = /<div\b[^>]*\bclass\s*=\s*["']imagecontainer["']/i;
const CATBOX_FIRSTLINK = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/i;
const CATBOX_FIRSTSHOWN = /<(?:a|video|audio|source|img)\b[^>]*?\b(?:href|src)\s*=\s*["']([^"']*)["']/i;
const CATBOX_FILEURL = /^https:\/\/files\.catbox\.moe\/([^"'/?#\s<>]+)$/i;
const CATBOX_NAME = /^[A-Za-z0-9_-]{3,40}$/;
function catboxAfter(html, startRe, pickRe) {
  const s = startRe.exec(html);
  if (!s) return null;
  const p = pickRe.exec(html.slice(s.index));
  if (!p) return null;
  const f = CATBOX_FILEURL.exec(p[1]);
  return f ? f[1] : null;
}
async function resolveCatbox(id, deadline) {
  const html = await lookGet("https://catbox.moe/c/" + id, PAGE_BYTES, deadline);
  let file = html == null ? null : catboxAfter(html, CATBOX_LISTSTART, CATBOX_FIRSTLINK);
  if (file == null && html != null) file = catboxAfter(html, CATBOX_BOXSTART, CATBOX_FIRSTSHOWN);
  if (file == null) return { picture: "" };                      // no file on the page: [image]
  const dot = file.lastIndexOf("."), ext = dot < 0 ? "" : file.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTS.indexOf(ext) < 0) return { stay: true };        // not a picture: the link stays text
  if (!CATBOX_NAME.test(file.slice(0, dot))) return { picture: "" };   // not of the expected shape: [image]
  return { picture: file };
}

// ImgBB (PbImgbb): the first picture of an album, or an ImgBB page's own picture.
const IMGBB_PICTURE_URL = /^https:\/\/i\.ibb\.co\/([A-Za-z0-9]{3,16})\/([^/?#]+)\.(png|jpe?g|gif|webp)$/i;
const IMGBB_NAME = /^(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2}){1,120}$/;
const IMGBB_LISTITEM = /<div\b[^>]*\bclass\s*=\s*"list-item\b[^"]*"[^>]*>/ig;
const IMGBB_IMAGETYPE = /\bdata-type\s*=\s*"image"/i;
const IMGBB_DATAOBJECT = /\bdata-object\s*=\s*'([^']*)'/i;
const IMGBB_OGIMAGE = /<meta\b[^>]*\bproperty\s*=\s*["']og:image["'][^>]*>/ig;
const IMGBB_IMAGESRC = /<link\b[^>]*\brel\s*=\s*["']image_src["'][^>]*>/i;
const IMGBB_HREF = /\bhref\s*=\s*["']([^"']*)["']/i;
function imgbbPictureOf(url) {                                   // PbImgbb.PictureOf
  const m = IMGBB_PICTURE_URL.exec(url || "");
  if (!m) return null;
  const name = IMGBB_NAME.test(m[2]) ? m[2] : "image";
  return m[1] + "/" + name + "." + m[3];
}
function imgbbOriginalOf(encoded) {                             // PbImgbb.OriginalOf: data-object JSON .image.url
  try {
    const obj = JSON.parse(decodeURIComponent(encoded));
    const u = obj && obj.image && typeof obj.image.url === "string" ? obj.image.url : null;
    return u ? imgbbPictureOf(u) : null;
  } catch (e) { return null; }
}
async function resolveImgbbAlbum(id, sort, deadline) {
  const html = await lookGet("https://ibb.co/album/" + id + (sort ? "?sort=" + sort : ""), PAGE_BYTES, deadline);
  if (html == null) return { picture: "" };
  IMGBB_LISTITEM.lastIndex = 0;
  let m;
  while ((m = IMGBB_LISTITEM.exec(html))) {
    if (IMGBB_IMAGETYPE.test(m[0])) {
      const d = IMGBB_DATAOBJECT.exec(m[0]), pic = d ? imgbbOriginalOf(d[1]) : null;
      return { picture: pic || "" };                             // first image item decides (matches the bot's break)
    }
  }
  const og = metaContent(html, IMGBB_OGIMAGE), pic = og ? imgbbPictureOf(og) : null;
  return { picture: pic || "" };
}
async function resolveImgbbPage(id, deadline) {
  const html = await lookGet("https://ibb.co/" + id, PAGE_BYTES, deadline);
  if (html == null) return { picture: "" };
  const og = metaContent(html, IMGBB_OGIMAGE);
  let pic = og ? imgbbPictureOf(og) : null;
  if (pic == null) {
    const link = IMGBB_IMAGESRC.exec(html), href = link ? IMGBB_HREF.exec(link[0]) : null;
    if (href) pic = imgbbPictureOf(href[1]);
  }
  return { picture: pic || "" };
}

// The id shapes the app may send (and the bot accepts): re-validated here so a malformed id never
// reaches an upstream fetch.
const RESOLVE_ID = {
  imgur: /^[A-Za-z0-9]{5,7}$/, catbox: /^[a-z0-9]{6}$/,
  imgbbAlbum: /^[A-Za-z0-9]{3,16}$/, imgbbPage: /^[A-Za-z0-9]{5,10}$/,
};
const RESOLVE_SORT = /^[a-z]{1,12}_(?:asc|desc)$/;
const HAS_ALNUM_CAP = (s) => /[A-Z0-9]/.test(s);                 // an id has a capital or a digit (imgur/imgbb page)

async function handleResolve(url) {
  const site = url.searchParams.get("site") || "";
  const id = url.searchParams.get("id") || "";
  const kind = url.searchParams.get("kind") || "";
  const deadline = Date.now() + RESOLVE_BUDGET_MS;
  let out = null;
  if (site === "imgur") {
    if (!RESOLVE_ID.imgur.test(id) || !HAS_ALNUM_CAP(id)) return json({ error: "bad id" }, 400);
    out = await resolveImgur(id, deadline);
  } else if (site === "catbox") {
    if (!RESOLVE_ID.catbox.test(id)) return json({ error: "bad id" }, 400);
    out = await resolveCatbox(id, deadline);
  } else if (site === "imgbb" && kind === "album") {
    if (!RESOLVE_ID.imgbbAlbum.test(id)) return json({ error: "bad id" }, 400);
    let sort = url.searchParams.get("sort") || "";
    if (sort && (!RESOLVE_SORT.test(sort) || sort === "date_desc")) sort = "";
    out = await resolveImgbbAlbum(id, sort, deadline);
  } else if (site === "imgbb" && kind === "page") {
    if (!RESOLVE_ID.imgbbPage.test(id) || !HAS_ALNUM_CAP(id)) return json({ error: "bad id" }, 400);
    out = await resolveImgbbPage(id, deadline);
  } else {
    return json({ error: "bad site or kind" }, 400);
  }
  return json(out);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/imgbb") return handleImgbb(request, env, url);
    if (url.pathname === "/resolve") return handleResolve(url);
    if (url.pathname === "/px") return handleProxy(url);
    return env.ASSETS.fetch(request);   // the static site (index.html, etc.)
  },
};
