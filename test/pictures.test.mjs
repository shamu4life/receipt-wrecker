// 1.5.0: a Real picture prints on Printer Bot 3.0 from a direct Imgur, Catbox or ImgBB link in a
// High Roller cheer, when the streamer switched that site on in the dock (Advanced -> Images in
// messages) and the printer allows images. The link goes out as text in a <div>; the bot puts the
// picture in its place (pictureLinksInRich), never enlarged, at most the message's width and
// 4 inches tall, with 0.4em above and below. Below the threshold the block prints the plain Han
// grid, as a Glyph-art picture does.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const ROOM = 1600 - 21.6;
const pack = (bodies, o) => C.packStackBodies(bodies, { cheer: true, bits: 100, noNonce: true, heightPx: ROOM, ...o });
const r2 = (x) => Math.round(x * 100) / 100;

test("pictureLink: a direct picture link, by the bot's own rules (imageSiteLink, IMAGE_PATHS)", () => {
  const ok = (raw, url, site) => eq(C.pictureLink(raw), { url, site }, raw);
  ok("https://i.imgur.com/AbC1234.png", "https://i.imgur.com/AbC1234.png", "imgur");
  ok("  https://i.imgur.com/abc.JPEG  ", "https://i.imgur.com/abc.JPEG", "imgur");
  ok("https://i.imgur.com/abc.jpg", "https://i.imgur.com/abc.jpg", "imgur");
  // The address is parsed as a browser parses it, and rebuilt from the parts that were checked:
  // the host lowercased, the default port gone, a query and a fragment dropped.
  ok("HTTPS://I.IMGUR.COM/abc.gif", "https://i.imgur.com/abc.gif", "imgur");
  ok("https://i.imgur.com:443/abc.png", "https://i.imgur.com/abc.png", "imgur");
  ok("https://i.imgur.com/abc.webp?x=1#frag", "https://i.imgur.com/abc.webp", "imgur");
  ok("https://files.catbox.moe/a1_b-2.jpg", "https://files.catbox.moe/a1_b-2.jpg", "catbox");
  ok("https://i.ibb.co/AbC123/my-pic%20x.png", "https://i.ibb.co/AbC123/my-pic%20x.png", "imgbb");
  const no = (raw, why) => assert.equal(C.pictureLink(raw).why, why, JSON.stringify(raw));
  no("", "empty");
  no("   ", "empty");
  no(null, "empty");
  no("http://i.imgur.com/abc.png", "https");
  no("https:/i.imgur.com/abc.png", "https");
  no("i.imgur.com/abc.png", "https");
  // A page of the site is not the picture itself.
  no("https://imgur.com/abc1234", "page");
  no("https://imgur.com/a/abc1234", "page");
  no("https://ibb.co/AbC123", "page");
  no("https://catbox.moe/", "page");
  // The right host, but not the shape of a direct picture link (an album, a video, an SVG, too short).
  no("https://i.imgur.com/a/abc1234", "direct");
  no("https://i.imgur.com/abc.gifv", "direct");
  no("https://i.imgur.com/abc.svg", "direct");
  no("https://i.imgur.com/ab.png", "direct");
  no("https://i.ibb.co/abc.png", "direct");
  // No look-alike, no sub-domain, no other site.
  no("https://i.imgur.com.evil.example/abc.png", "site");
  no("https://evil.example/i.imgur.com/abc.png", "site");
  no("https://x.i.imgur.com/abc.png", "site");
  no("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0", "site");
  no("https://user@i.imgur.com/abc.png", "userport");
  no("https://a:b@i.imgur.com/abc.png", "userport");
  no("https://i.imgur.com:8443/abc.png", "userport");
  no("https://exa mple.com/x.png", "invalid");
  // This channel's chat filter holds the word "font", in any letter case, so such a link can't go out.
  no("https://i.imgur.com/Font123.png", "font");
  no("https://i.ibb.co/AbC123/my-FONT.png", "font");
});

test("pictureLink: the sites are the bot's three, with its hosts and path shapes", () => {
  eq(C.PICTURE_SITES.map((s) => [s.id, s.name, s.hosts]),
     [["imgur", "Imgur", ["i.imgur.com"]], ["catbox", "Catbox", ["files.catbox.moe"]], ["imgbb", "ImgBB", ["i.ibb.co"]]]);
  assert.equal(C.PICTURES_PER_CHEER, 3);
});

test("PICTURE_SITES is the vendored bot's own IMAGE_SITES and IMAGE_PATHS, host for host and rule for rule", () => {
  // Read off the vendored receipt page, so a new Printer Bot that changes a site or a path shape
  // fails here until the app's copy follows it.
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../public/index.html"), "utf8");
  const block = html.slice(html.indexOf('id="sassytp-renderer"'));
  const sites = JSON.parse(block.match(/const IMAGE_SITES = (\[.*?\]);/)[1]);
  const paths = block.match(/const IMAGE_PATHS = \{([\s\S]*?)\n\s*\};/)[1];
  const rule = (id) => paths.match(new RegExp("^\\s*" + id + ": (/.*?/i),", "m"))[1];
  eq(C.PICTURE_SITES.map((s) => ({ id: s.id, name: s.name, hosts: s.hosts })), sites);
  for (const s of C.PICTURE_SITES) assert.equal(String(s.path), rule(s.id), s.id);
});

test("picturePrint: never enlarged, scaled to the message's width and 4 inches, aspect kept, 0.4em above and below", () => {
  const p = (w, h, mm) => C.picturePrint(w, h, C.paperSpec(mm).contentW);
  const small = p(100, 100, 80);
  assert.equal(small.w, 100); assert.equal(small.h, 100); assert.equal(small.scale, 1);
  assert.equal(r2(small.heightPx), 112.8); assert.equal(small.tooBig, false);
  const wide = p(1000, 500, 80);
  assert.equal(wide.w, 244); assert.equal(wide.h, 122); assert.equal(r2(wide.heightPx), 134.8);
  const tall = p(500, 2000, 80);
  assert.equal(tall.h, 384); assert.equal(tall.w, 96); assert.equal(r2(tall.heightPx), 396.8);
  const narrow = p(1000, 500, 58);
  assert.equal(narrow.w, 153); assert.equal(narrow.h, 76.5);
  // More pixels than the bot takes (32 Mi): it takes the picture off the page ("[image]").
  assert.equal(p(8000, 5000, 80).tooBig, true);
  assert.equal(p(4000, 3000, 80).tooBig, false);
  assert.equal(p(0, 10, 80), null);
  assert.equal(p(NaN, 10, 80), null);
});

test("buildPictureBodies: one bare <div> holding the link, as tall as it prints, its margins declared", () => {
  const link = C.pictureLink("https://i.imgur.com/abc1234.png");
  const [b, ...rest] = C.buildPictureBodies(link, 1000, 500, { contentW: 244, heightPx: ROOM });
  assert.equal(rest.length, 0);
  assert.equal(b.html, "<div>https://i.imgur.com/abc1234.png</div>");
  assert.equal(b.chars, 42);
  assert.equal(r2(b.heightPx), 134.8);
  assert.equal(b.marginTop, 6.4); assert.equal(b.marginBottom, 6.4);
  eq(b.picture, { url: "https://i.imgur.com/abc1234.png", site: "imgur", natW: 1000, natH: 500, w: 244, h: 122, tall: false });
  // Taller than the box the cheer buys: the bot's box cuts it, and the body says so.
  const [t] = C.buildPictureBodies(link, 500, 2000, { contentW: 244, heightPx: 100 });
  assert.equal(t.picture.tall, true);
  // Too many pixels for the bot, no size or no link: nothing to send.
  eq(C.buildPictureBodies(link, 8000, 5000, { contentW: 244, heightPx: ROOM }), []);
  eq(C.buildPictureBodies(link, 0, 0, { contentW: 244, heightPx: ROOM }), []);
  eq(C.buildPictureBodies({ why: "empty" }, 100, 100, { contentW: 244, heightPx: ROOM }), []);
});

test("packStackBodies: pictures one after another share a margin, as CSS collapses them", () => {
  const pic = (n) => C.buildPictureBodies(C.pictureLink("https://i.imgur.com/abc" + n + "xyz.png"), 400, 200, { contentW: 244, heightPx: ROOM })[0];
  const two = pack([pic(1), pic(2)]);
  assert.equal(two.length, 1);
  assert.equal(r2(two[0].heightPx), r2(134.8 * 2 - 6.4));
  assert.equal(two[0].payload, "Cheer100 <div>https://i.imgur.com/abc1xyz.png</div><div>https://i.imgur.com/abc2xyz.png</div>");
  // After a body with no margins (big text), nothing is shared.
  const big = { html: "<div>x</div>", chars: 12, heightPx: 50 };
  assert.equal(r2(pack([big, pic(1)])[0].heightPx), r2(50 + 134.8));
  assert.equal(r2(pack([pic(1), big])[0].heightPx), r2(134.8 + 50));
  // Bodies without margins pack exactly as before.
  assert.equal(pack([big, big])[0].heightPx, 100);
});

test("packStackBodies: a cheer holds at most three pictures (the bot prints a fourth link as text)", () => {
  const pic = (n) => C.buildPictureBodies(C.pictureLink("https://i.imgur.com/abc" + n + "xyz.png"), 40, 20, { contentW: 244, heightPx: ROOM })[0];
  eq(pack([pic(1), pic(2), pic(3), pic(4), pic(5)]).map((p) => p.bodies.length), [3, 2]);
  const big = { html: "<div>x</div>", chars: 12, heightPx: 50 };
  eq(pack([pic(1), big, pic(2), pic(3), big, pic(4)]).map((p) => p.bodies.length), [5, 1]);
});

test("normalizeControls: imageSites, the sites the streamer switched on, in the dock's order, none by default", () => {
  eq(C.normalizeControls({}).imageSites, []);
  eq(C.normalizeControls({ imageSites: ["imgbb", "imgur", "imgur", "x", 3] }).imageSites, ["imgur", "imgbb"]);
  eq(C.normalizeControls({ imageSites: "imgur" }).imageSites, []);
  eq(C.normalizeControls({ imageSites: ["catbox"] }).imageSites, ["catbox"]);
});

test("realPictureForm: the picture in a High Roller cheer when its site is on, the plain Han grid below the threshold, else nothing and why", () => {
  const f = (url, mode, sites) => C.realPictureForm({ url, mode, imageSites: sites });
  const u = "https://i.imgur.com/abc1234.png";
  eq(f(u, "raw", ["imgur"]), { form: "picture", link: { url: u, site: "imgur" } });
  eq(f(u, "raw", ["catbox", "imgbb"]), { form: "none", why: "site-off", site: "imgur" });
  eq(f(u, "raw", []), { form: "none", why: "site-off", site: "imgur" });
  eq(f("https://imgur.com/abc1234", "raw", ["imgur"]), { form: "none", why: "page" });
  eq(f("", "raw", ["imgur"]), { form: "none", why: "empty" });
  // Below the threshold any readable picture prints as the plain grid, wherever it is.
  eq(f(u, "plain", []), { form: "grid" });
  eq(f("https://example.com/x.png", "plain", ["imgur"]), { form: "grid" });
});
