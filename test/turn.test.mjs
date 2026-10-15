// 1.8.0, by the owner's decisions: a Real picture's Rotate, Brightness and Contrast change what
// prints. A turn alone is done in the message, around the original link (the bot keeps the styling
// around a picture link on a roll, and its allow-list keeps rotate); Brightness or Contrast, which
// no CSS the bot keeps can do, and Letter, where the bot moves or shrinks pictures, print from a
// turned and adjusted copy the page uploads to ImgBB.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, scanTags } from "./_harness.mjs";

const C = loadCore();
const J = (x) => JSON.parse(JSON.stringify(x));
const IMGUR = "https://i.imgur.com/AbC1234.png", COPY = "https://i.ibb.co/Xy12345/p.jpg";

test("realTurn reads the card's settings through a sanitizer, and turnWay says how they print", () => {
  assert.deepEqual(J(C.realTurn({})), { deg: 0, br: 0, ct: 0 });
  assert.deepEqual(J(C.realTurn({ rotate: "90", adjBright: "25", adjContrast: -40 })), { deg: 90, br: 25, ct: -40 });
  assert.deepEqual(J(C.realTurn({ rotate: 45, adjBright: 500, adjContrast: "x" })), { deg: 0, br: 100, ct: 0 }, "junk and out of range");
  assert.equal(C.turnWay(C.realTurn({}), false), "none");
  assert.equal(C.turnWay(C.realTurn({ rotate: 90 }), false), "css", "a turn alone, on a roll");
  assert.equal(C.turnWay(C.realTurn({ rotate: 180 }), false), "css");
  assert.equal(C.turnWay(C.realTurn({ rotate: 90 }), true), "copy", "Letter moves or shrinks pictures");
  assert.equal(C.turnWay(C.realTurn({ adjBright: 10 }), false), "copy", "no CSS the bot keeps adjusts a picture");
  assert.equal(C.turnWay(C.realTurn({ rotate: 270, adjContrast: 5 }), false), "copy");
});

test("a copy is the one for this link and these settings, and young enough", () => {
  const b = { url: IMGUR, rotate: 90, adjBright: 20, adjContrast: 0 };
  const t = C.realTurn(b), key = C.turnKey(IMGUR, t), now = 1e12;
  assert.equal(C.turnedCopyUrl({ ...b, turned: { key, url: COPY, at: now - 1000 } }, now), COPY);
  assert.equal(C.turnedCopyUrl({ ...b, turned: { key, url: COPY, at: now - C.TURN_FRESH_MS } }, now), "", "ImgBB deletes it after a day: made again first");
  assert.equal(C.turnedCopyUrl({ ...b, turned: { key, url: COPY, at: now + 5 } }, now), "", "a clock gone backwards");
  assert.equal(C.turnedCopyUrl({ ...b, rotate: 180, turned: { key, url: COPY, at: now } }, now), "", "other settings");
  assert.equal(C.turnedCopyUrl({ ...b, url: "https://i.imgur.com/Other12.png", turned: { key, url: COPY, at: now } }, now), "", "another link");
  assert.equal(C.turnedCopyUrl({ ...b, turned: { key, url: "https://evil.example/p.jpg", at: now } }, now), "", "only an ImgBB link");
  assert.equal(C.turnedCopyUrl({ ...b, turned: "junk" }, now), "");
  assert.equal(C.turnedCopyUrl({ url: IMGUR, turned: { key: C.turnKey(IMGUR, C.realTurn({})), url: COPY, at: now } }, now), "", "nothing to copy");
  assert.ok(C.TURN_FRESH_MS < 24 * 3600 * 1000);
});

test("the copy's size: at most UPLOAD_MAX_SIDE on its longer side, turned", () => {
  assert.equal(C.UPLOAD_MAX_SIDE, 1600);
  assert.deepEqual(J(C.turnedSize(400, 200, 0)), { w: 400, h: 200 });
  assert.deepEqual(J(C.turnedSize(400, 200, 90)), { w: 200, h: 400 });
  assert.deepEqual(J(C.turnedSize(4000, 1000, 270)), { w: 400, h: 1600 });
  assert.deepEqual(J(C.turnedSize(4000, 1000, 180)), { w: 1600, h: 400 });
});

test("a turn alone prints the original link, turned in the message", () => {
  const link = { url: IMGUR, site: "imgur" }, o = { contentW: 244, heightPx: 1600, pxPerInch: 96 };
  // 180: the link's div turned in place, as tall as the picture is.
  const [flat] = C.buildPictureBodies(link, 400, 200, o), [flip] = C.buildPictureBodies(link, 400, 200, { ...o, deg: 180 });
  assert.equal(flip.html, '<div style="rotate:180deg">' + IMGUR + "</div>");
  assert.equal(flip.heightPx, flat.heightPx);
  assert.equal(flip.picture.turned, 180);
  // 90: a 300 x 400 picture turned is 400 x 300, printed 244 x 183 on 80 mm (the paper's width,
  // then its shape): a box 183 + 2 margins long, holding the link's div 183px wide (the picture's
  // width before the turn) turned about its middle, which sits at the box's middle.
  const [side] = C.buildPictureBodies(link, 300, 400, { ...o, deg: 90 });
  const m = 0.4 * 16, w = 244, h = 244 * 300 / 400, r = (v) => Math.round(v * 100) / 100;
  assert.equal(side.html, '<div style="position:relative;height:' + r(h + 2 * m) + 'px"><div style="position:absolute;left:' + r(122 - h / 2)
    + "px;top:" + r(m + h / 2 - (w + 2 * m) / 2) + "px;width:" + r(h) + 'px;rotate:90deg">' + IMGUR + "</div></div>");
  assert.ok(Math.abs(side.heightPx - (h + 2 * m)) < 1e-9);
  assert.deepEqual([side.marginTop, side.marginBottom], [0, 0], "its margins are inside its box: nothing to share with a neighbour");
  assert.deepEqual([side.picture.w, side.picture.h, side.picture.turned], [w, h, 90]);
  // The bot never enlarges a picture: 400 x 200 turned is 200 wide, so 400 long, then held to 4 inches.
  const [nat] = C.buildPictureBodies(link, 400, 200, { ...o, deg: 90 });
  assert.deepEqual([nat.picture.w, nat.picture.h], [192, 384]);
  // A tall turned picture is held to 4 inches, as the bot holds every picture.
  const [long] = C.buildPictureBodies(link, 1200, 200, { ...o, deg: 270 });
  assert.equal(long.picture.h, 384);
  assert.ok(Math.abs(long.picture.w - 384 * 200 / 1200) < 1e-9);
  assert.match(long.html, /;width:384px;rotate:270deg">/);
  assert.match(long.html, /left:-70px;/, "wider than the paper before the turn: it starts left of it, and turns into it");
  // Only div and style, and the link as text.
  for (const b of [flip, side, nat, long]) {
    const tags = scanTags(b.html);
    assert.deepEqual(Array.from(new Set(tags.map((t) => t.tag))), ["div"]);
    assert.ok(tags.every((t) => t.closing || t.attrs.every((a) => a.name === "style")), "only style");
    assert.ok(!/^</.test("Cheer100 " + b.html.slice(0, 1)));
  }
});

test("realPictureForm: a turn prints the link where its site is on; a copy needs ImgBB, and its link once made", () => {
  const raw = (o) => C.realPictureForm({ url: IMGUR, mode: "raw", imageSites: ["imgur"], ...o });
  assert.equal(raw({}).form, "picture");
  assert.equal(raw({ turn: C.realTurn({ rotate: 90 }) }).way, "css");
  assert.equal(raw({ turn: C.realTurn({ rotate: 90 }) }).link.url, IMGUR);
  const off = raw({ turn: C.realTurn({ adjBright: 10 }) });
  assert.deepEqual([off.form, off.why, off.site, off.copy], ["none", "site-off", "imgbb", true], "the copy prints from ImgBB");
  const wait = raw({ turn: C.realTurn({ adjBright: 10 }), imageSites: ["imgur", "imgbb"] });
  assert.deepEqual([wait.form, wait.way, wait.link], ["picture", "copy", null], "made yet: no link");
  const made = raw({ turn: C.realTurn({ adjBright: 10 }), imageSites: ["imgbb"], turnedUrl: COPY });
  assert.deepEqual([made.form, made.way, made.link.url, made.source.url], ["picture", "copy", COPY, IMGUR], "the source's own site needn't be on");
  assert.equal(raw({ turn: C.realTurn({ rotate: 90 }), letter: true, imageSites: ["imgbb"] }).way, "copy", "on Letter a turn is a copy too");
  assert.equal(C.realPictureForm({ url: IMGUR, mode: "plain", turn: C.realTurn({ adjBright: 10 }) }).form, "grid", "below the threshold, the grid");
  assert.equal(raw({ url: "https://imgur.com/AbC1234", turn: C.realTurn({ adjBright: 10 }), imageSites: ["imgbb"] }).why, "page", "the source must still be a picture link");
});
