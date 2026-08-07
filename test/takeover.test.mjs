import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

const LINES = [{ text: "TAX LIEN", size: 24, weight: 900 },
               { text: "ASSESSED", size: 19, weight: 700 },
               { text: "please remit", size: 13, italic: true }];

test("takeoverBox derives everything from the one calibration number", () => {
  // pt -> px at 96dpi (the engine runs --disable-smart-shrinking, so 1px = 1/96in).
  const b = C.takeoverBox(220);
  assert.equal(b.pullPt, 220);
  assert.equal(b.pullPx, 293);            // 220 * 4/3
  assert.equal(b.h, 333);                 // covered area + tail
  // Junk falls back rather than emitting a broken box.
  for (const bad of [0, -5, NaN, undefined, null, "x"]) {
    const g = C.takeoverBox(bad);
    assert.equal(g.pullPt, C.TAKEOVER_PULL_PT, "bad pull " + bad + " should fall back");
    assert.ok(g.h > g.pullPx, "box must always overrun the covered area");
  }
});

test("the overlay is opaque and lifted, or it doesn't cover anything", () => {
  const html = C.buildTakeover({ lines: LINES, pullPt: 220, w: 263 });
  assert.ok(/^<svg /.test(html), "must be a bare svg: " + html.slice(0, 40));
  assert.ok(/style="margin-top:-220pt"/.test(html), "must be lifted over the header");
  assert.ok(/<rect width="263" height="333" fill="#fff"\/>/.test(html), "needs the opaque cover");
  // The rect has to come first or it paints over the content it's meant to sit behind.
  assert.ok(html.indexOf("<rect") < html.indexOf("<text"), "rect must precede the text");
  assert.ok(!/[\r\n]/.test(html), "payload stays newline-free");
});

test("blank lines are dropped rather than emitted as empty text nodes", () => {
  const html = C.buildTakeover({ lines: [{ text: "" }, { text: "ONLY", size: 20 }, { text: null }] });
  assert.equal((html.match(/<text/g) || []).length, 1, "one line in, one line out: " + html);
  assert.ok(html.indexOf(">ONLY<") >= 0);
  // No lines at all is still a valid cover (a blank takeover is a legitimate thing
  // to want — it just erases the header).
  const bare = C.buildTakeover({ lines: [] });
  assert.ok(/<rect /.test(bare) && !/<text/.test(bare), bare);
  assert.ok(!/<g /.test(bare), "no empty <g> when there's nothing to group: " + bare);
});

test("lines stack upward from the bottom of the covered area, in order", () => {
  const html = C.buildTakeover({ lines: LINES, pullPt: 220 });
  const ys = [...html.matchAll(/<text x="\d+" y="(\d+)"/g)].map(m => Number(m[1]));
  assert.equal(ys.length, 3);
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2], "document order must read top-to-bottom: " + ys);
  assert.ok(ys[2] <= C.takeoverBox(220).pullPx, "text must sit inside the covered area");
  // Order is preserved: the first line given is the first line drawn.
  const first = html.indexOf("TAX LIEN"), second = html.indexOf("ASSESSED");
  assert.ok(first > 0 && first < second, "line order scrambled");
});

test("a picture rides through the carrier table, never SVG's blocked image tag", () => {
  const html = C.buildTakeover({ lines: [], picture: "https://x.test/p.png", carrier: "embed",
                                 pictureW: 120, pictureH: 168 });
  assert.ok(/<foreignObject /.test(html), "picture should ride in a foreignObject");
  assert.ok(html.indexOf("<embed") >= 0, "should use the chosen carrier");
  // The whole point: no blocked token anywhere, for any carrier choice.
  for (const id of C.EMBEDS.filter(e => !e.blocked).map(e => e.id)) {
    const h = C.buildTakeover({ lines: LINES, picture: "https://x.test/p.png", carrier: id });
    assert.ok(h.indexOf("<image") < 0, id + " leaked the blocked <image tag: " + h);
    assert.ok(h.indexOf("<img") < 0, id + " leaked the blocked <img tag: " + h);
  }
  // No picture, no foreignObject — don't pay chars for an empty frame.
  assert.ok(!/foreignObject/.test(C.buildTakeover({ lines: LINES })));
});

test("the picture is emitted AFTER the text, or the text silently disappears", () => {
  // Measured on the real engine: <foreignObject> is an HTML integration point and the
  // parser doesn't return to SVG context afterwards, so any SVG sibling following it
  // is parsed as HTML and never drawn. With the picture first, the text rendered as
  // zero ink on the print while looking perfectly fine in the markup. This is the
  // regression guard for that — it is not a style preference.
  const html = C.buildTakeover({ lines: LINES, picture: "https://x.test/p.png", carrier: "embed" });
  const fo = html.indexOf("<foreignObject");
  const lastText = html.lastIndexOf("<text");
  assert.ok(fo > 0 && lastText > 0, "expected both a picture and text: " + html);
  assert.ok(lastText < fo, "every <text> must precede the <foreignObject>, else it won't print");
});

test("user text is escaped — it lands inside SVG markup", () => {
  const html = C.buildTakeover({ lines: [{ text: '</text><script>x</script>&"', size: 20 }] });
  assert.ok(html.indexOf("<script") < 0, "passed a raw tag through: " + html);
  assert.ok(html.indexOf("&lt;/text&gt;") >= 0, "should escape the closing tag: " + html);
  assert.ok(/&amp;/.test(html), "should escape the ampersand");
});

test("font sizes are clamped, so a junk value can't produce a broken or giant line", () => {
  // 0 and NaN mean "unset" and take the default; a real but out-of-range number is
  // clamped to the ends. (0 deliberately does NOT clamp to the 8px floor — a
  // zero-height line is never what someone meant, so it falls back like a blank.)
  for (const [size, want] of [[0, 20], [NaN, 20], [undefined, 20], [-40, 8], [999, 48]]) {
    const html = C.buildTakeover({ lines: [{ text: "X", size }] });
    const got = Number((html.match(/font-size="(\d+)"/) || [])[1]);
    assert.equal(got, want, "size " + size + " should give " + want + ", got " + got);
  }
});

test("a takeover fits a cheer with room for a caption beside it", () => {
  // It's an overlay, not the whole payload — normally something rides with it.
  const html = C.buildTakeover({ lines: LINES, pullPt: 220 });
  const chars = C.payloadLength(html) + 12;      // + "Cheer100 nn "
  assert.ok(chars <= C.MAX_CHARS, "over the Twitch cap at " + chars);
  assert.ok(chars < 400, "at " + chars + " chars even a short caption won't fit");
  // Measured: a three-line takeover (350) plus a full real-picture payload (96 on an
  // /i/<hex>.png link) plus the cheer wrapper is 458 — one cheer, 100 bits, not two.
  // Locked down because it's the difference between the gag costing 100 or 200 bits,
  // and it would silently regress if either payload grew.
  const pic = C.buildImageEmbed("embed", { url: "https://receipt.uwutoowo.com/i/a1b2c3d4e5f6.png",
                                           w: 263, h: 197, mm: 70 });
  const together = C.payloadLength(html) + C.payloadLength(pic) + 12;
  assert.ok(together <= C.MAX_CHARS,
    "takeover + a picture no longer share one cheer (" + together + " chars) — that doubles the bits");
});
