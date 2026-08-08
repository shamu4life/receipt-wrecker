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

// ── FAKE CHEER ──────────────────────────────────────────────────────────────
// The takeover in the header's own shape. It composes buildTakeover rather than
// emitting its own markup, so most of the hard-won rules above are inherited — the
// tests here are for what the composition itself has to get right.

const CHEER = { bits: "-100000", name: "IRS", note: "tax lien",
                avatar: "https://x.test/p.png", carrier: "embed", pullPt: 220 };

test("the bits figure gets the suffix, and an empty one draws no line at all", () => {
  const html = C.buildFakeCheer(CHEER);
  assert.ok(html.indexOf(">-100000 BITS<") >= 0, "expected the suffixed figure: " + html);
  // No figure means no line — never a stray " BITS" with nothing in front of it.
  for (const bits of ["", "   ", null, undefined]) {
    const h = C.buildFakeCheer({ ...CHEER, bits });
    assert.ok(h.indexOf("BITS") < 0, JSON.stringify(bits) + " emitted a bare suffix: " + h);
    assert.equal((h.match(/<text/g) || []).length, 2, "the other two lines should survive");
  }
  // Surrounding whitespace is trimmed, not baked into the line.
  assert.ok(C.buildFakeCheer({ ...CHEER, bits: "  42  " }).indexOf(">42 BITS<") >= 0);
});

test("the figure is free text — the jokes people actually want aren't numbers", () => {
  // A negative amount is the whole gag in the payload this was built from, and it
  // must not be coerced, clamped or NaN'd into nothing.
  for (const bits of ["-100000", "∞", "0.5", "ONE MILLION"]) {
    const h = C.buildFakeCheer({ ...CHEER, bits });
    assert.ok(h.indexOf(">" + bits + " BITS<") >= 0, bits + " didn't survive: " + h);
  }
});

test("a fake cheer reproduces the reference layout it was measured from", () => {
  // The hand-built payload that printed correctly on the real rig: an 80px-wide
  // picture at the top, baselines at 150/178/208, sizes 24/900, 19/700, 13/italic.
  const html = C.buildFakeCheer(CHEER);
  const ys = [...html.matchAll(/<text x="(\d+)" y="(\d+)"/g)].map(m => Number(m[2]));
  assert.equal(ys.length, 3);
  // 142/174/200, not the reference's own 150/182/208: the reference drew its picture
  // through SVG's <image height=113>, which STRETCHES an 80px-wide source to 1.4. The
  // carrier tags state only a width, so the drawn height is the source's own aspect —
  // and a profile picture is square. Reserving 1.4 left a measured 32px slab of white
  // between a square avatar and the text, so the reservation is square and everything
  // below it moves up by that 8px. Same arrangement, no gap.
  // 182/214/240. The reference's own 150/182/208 came from an 80px-wide picture drawn
  // through SVG's <image height=113>, which STRETCHES the source. Two measured facts
  // moved it: the carriers state only a width so a square avatar draws square (no 1.4
  // stretch, and no slab of white under it), and a picture drawn under ~120px tall does
  // not render AT ALL under the negative margin — so 120 is the floor, not 80.
  assert.deepEqual(ys, [182, 214, 240], "drifted off the reference baselines: " + ys);
  assert.ok(/font-size="24" font-weight="900"/.test(html), "bits line lost its weight");
  assert.ok(/font-size="19" font-weight="700"/.test(html), "name line lost its weight");
  assert.ok(/font-size="13" font-style="italic"/.test(html), "note line lost its italic");
  // Centered on the paper, like the header it replaces. (263 is odd, so the true
  // centre is 131.5 — assert the property, not whichever side it rounds to.)
  const xs = [...html.matchAll(/<text x="(\d+)"/g)].map(m => Number(m[1]));
  assert.ok(xs.every(x => x === xs[0]), "lines must share one centre: " + xs);
  assert.ok(Math.abs(xs[0] - 263 / 2) <= 0.5, "off-centre on 263px paper: " + xs[0]);
});

test("the text hangs off the picture, and stays inside the covered area", () => {
  // A header reads top-down from its picture. With one, the block anchors under it;
  // without one it can't, so it sits mid-way up instead of drifting to the top.
  const withPic = C.buildFakeCheer(CHEER);
  const noPic = C.buildFakeCheer({ ...CHEER, avatar: "" });
  const firstY = h => Number(h.match(/<text x="\d+" y="(\d+)"/)[1]);
  const box = C.takeoverBox(220);
  assert.ok(firstY(withPic) > 6 + Math.round(C.CHEER_AVATAR_W * 1.4),
    "the first line must clear the picture, not sit on top of it");
  assert.ok(firstY(noPic) > 0 && firstY(noPic) < box.pullPx, "must stay inside the cover");
  // A wider picture pushes the text further down; it can't be a fixed baseline.
  assert.ok(firstY(C.buildFakeCheer({ ...CHEER, avatarW: 160 })) > firstY(withPic),
    "a taller picture must push the lines down or it will overlap them");
  // Every line lands inside the painted box, whatever the pull.
  for (const pullPt of [60, 120, 220, 400]) {
    const h = C.buildFakeCheer({ ...CHEER, pullPt });
    const b = C.takeoverBox(pullPt);
    for (const m of h.matchAll(/<text x="\d+" y="(\d+)"/g)) {
      assert.ok(Number(m[1]) <= b.h, "pull " + pullPt + ": baseline " + m[1] + " past the cover " + b.h);
    }
  }
});

test("a fake cheer inherits the takeover's rules — escaping, carriers, picture last", () => {
  const nasty = { ...CHEER, name: '</text><script>x</script>&"', bits: '"><b>' };
  const html = C.buildFakeCheer(nasty);
  assert.ok(html.indexOf("<script") < 0, "passed a raw tag through: " + html);
  assert.ok(html.indexOf("&lt;/text&gt;") >= 0, "should escape the closing tag");
  // The foreignObject-last rule is the one that silently kills the print.
  assert.ok(html.lastIndexOf("<text") < html.indexOf("<foreignObject"),
    "every line must precede the picture, else the engine drops the text");
  // The picture rides the carrier table, never SVG's blocked image tag.
  for (const id of C.EMBEDS.filter(e => !e.blocked).map(e => e.id)) {
    const h = C.buildFakeCheer({ ...CHEER, carrier: id });
    assert.ok(h.indexOf("<image") < 0 && h.indexOf("<img") < 0, id + " leaked a blocked tag: " + h);
  }
  // Same opaque, lifted overlay as any other takeover.
  assert.ok(/^<svg /.test(html) && /style="margin-top:-220pt"/.test(html));
  assert.ok(html.indexOf("<rect") < html.indexOf("<text"), "rect must paint first");
  assert.ok(!/[\r\n]/.test(html), "payload stays newline-free");
});

test("a fake cheer with an uploaded picture fits ONE cheer — 100 bits, not 200", () => {
  // This is the whole point of the link-shortening work, so it is a test and not a
  // note. The history, because the margin is thin enough to lose by accident:
  //   /i/<32 hex>.png on receipt.uwutoowo.com  (67-char link)  -> 540, two cheers
  //   /<12 hex>.png   on receipt.uwutoowo.com  (45-char link)  -> 495, ONE cheer
  //   /<12 hex>.png   on i.uwutoowo.com        (39-char link)  -> 489, ONE cheer
  // The other 23 chars came from dropping the body-width clamp inside the fixed
  // foreignObject, where it is a no-op — see the clamp guard test below, which is what
  // stops that from being "optimised" onto the path where it IS load-bearing.
  const bare = C.buildFakeCheer({ ...CHEER, avatar: "" });
  assert.ok(C.payloadLength(bare) + 12 <= C.MAX_CHARS, "a bare fake cheer must fit one cheer");

  const uploaded = "https://receipt.uwutoowo.com/" + "a1b2c3d4e5f6" + ".png";   // what /upload mints
  assert.equal(uploaded.length, 45, "the minted link shape changed — re-measure this test");
  const chars = C.payloadLength(C.buildFakeCheer({ ...CHEER, avatar: uploaded })) + 12;
  assert.ok(chars <= C.MAX_CHARS,
    "a fake cheer + an uploaded picture no longer fits one cheer (" + chars + ") — that doubles the bits");

  // A SHORT image host would buy 6 more. Asserted so the saving is a known quantity
  // rather than something to re-derive later.
  const short = "https://i.uwutoowo.com/" + "a1b2c3d4e5f6" + ".png";
  const shortChars = C.payloadLength(C.buildFakeCheer({ ...CHEER, avatar: short })) + 12;
  assert.equal(chars - shortChars, 6, "expected a short image host to save exactly 6 chars");

  // Honest about the limit: a pasted CDN link is far longer than anything we mint, and
  // it does NOT fit. The UI has to keep reporting that rather than implying it always
  // fits now. (Measured longest link that still fits: 50 chars.)
  const cdn = "https://cdn.discordapp.com/attachments/123456789012345678/123456789012345678/image.png";
  assert.ok(C.payloadLength(C.buildFakeCheer({ ...CHEER, avatar: cdn })) + 12 > C.MAX_CHARS,
    "a long pasted link unexpectedly fits — the card hint about pasted links needs revisiting");
});

test("the width clamp survives everywhere except inside a fixed frame", () => {
  // The clamp is field-verified: without it, real pictures printed off the right edge
  // of the paper, because the receipt body is ~240px on an 80mm roll and not PAPER_PX's
  // 263. It may only be dropped inside a foreignObject, where the containing block IS
  // the frame and the tag already states that width — a provable no-op. This guard is
  // what keeps the 23-char saving from migrating onto the path where it costs a bug.
  for (const e of C.EMBEDS) {
    const unframed = C.buildImageEmbed(e.id, { url: "https://x.test/p.png", w: 263, h: 197, mm: 70 });
    // The SVG carrier has never clamped (no viewBox — max-width would crop, not scale).
    if (e.id !== "svg") {
      assert.ok(/max-width:100%/.test(unframed), e.id + " lost its width clamp on the ordinary path");
    }
    const framed = C.buildImageEmbed(e.id, { url: "https://x.test/p.png", w: 80, h: 112, mm: 21, framed: true });
    assert.ok(!/max-width:100%/.test(framed), e.id + " still clamps inside a frame — the saving is gone");
    // Dropping the clamp must not damage the markup around it.
    assert.ok(framed.indexOf('style=""') < 0, e.id + " left an empty style attribute: " + framed);
    assert.ok(framed.indexOf(";;") < 0 && framed.indexOf('=";') < 0, e.id + " left a stray semicolon: " + framed);
    // Still emits its own token — the whole carrier table rests on each one being
    // distinct. (Not necessarily at index 0: the svg carrier's token is the <image
    // element nested inside it, not the wrapper.)
    assert.ok(framed.indexOf(e.token) >= 0, e.id + " lost its own token: " + framed);
  }
  // And the takeover's picture is the one that asks for it.
  const tk = C.buildTakeover({ lines: [], picture: "https://x.test/p.png", carrier: "embed" });
  assert.ok(!/max-width:100%/.test(tk), "the takeover's framed picture should not clamp");
});

// Parse a built overlay back into geometry, so the assertions below are about what
// actually lands on paper rather than about the shape of the string.
function geom(html) {
  const t = [...html.matchAll(/<text x="\d+" y="(\d+)" font-size="(\d+)"/g)]
    .map((m) => ({ y: Number(m[1]), size: Number(m[2]) }));
  const f = html.match(/<foreignObject x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/);
  return { lines: t, pic: f ? { x: +f[1], y: +f[2], w: +f[3], h: +f[4] } : null };
}

test("the picture and the text never overlap — the picture paints last and would erase it", () => {
  // THIS IS THE ONE THE SUITE WAS MISSING. The old tests asserted only that each piece
  // was inside the box, which was TRUE in every failing case: the picture was in the
  // box, the text was in the box, and the picture was drawn on top of the text. Measured
  // on the real engine at the default pull with the width slider at its maximum,
  // "-100000 BITS" rendered with ZERO visible ink while all 85 tests passed.
  //
  // The cause was ordering: buildFakeCheer sized the picture first and let
  // buildTakeover's clamp drag the text up into it. The room for the text is now
  // reserved first. These are the exact cells that failed, plus a sweep.
  for (const pullPt of [60, 65, 90, 95, 100, 120, 130, 220, 250, 300, 340, 400]) {
    for (const avatarW of [40, 80, 160, 175, 200]) {
      const g = geom(C.buildFakeCheer({ ...CHEER, pullPt, avatarW }));
      const where = "pull " + pullPt + " / picture " + avatarW;
      if (!g.pic || !g.lines.length) continue;          // a dropped picture can't overlap
      const picBottom = g.pic.y + g.pic.h;
      const firstTop = g.lines[0].y - g.lines[0].size;  // cap height above the baseline
      assert.ok(firstTop >= picBottom,
        where + ": the picture (to y" + picBottom + ") covers the first line (top y" + firstTop + ")");
    }
  }
});

test("nothing is ever drawn outside the painted cover", () => {
  // Anything hanging past the white rect prints on top of the header this block exists
  // to cover — which reads as the feature not working. Text past the bottom is worse
  // than useless: the SVG viewport clips it, so it never prints AND is still paid for
  // in characters. Those lines are dropped instead.
  for (const pullPt of [60, 90, 220, 400]) {
    for (const avatarW of [40, 80, 200]) {
      for (const sizes of [undefined, { bits: 48, name: 48, note: 48 }, { bits: 48, name: 8, note: 48 }]) {
        const g = geom(C.buildFakeCheer({ ...CHEER, pullPt, avatarW, sizes }));
        const box = C.takeoverBox(pullPt);
        const where = "pull " + pullPt + " / picture " + avatarW + " / sizes " + JSON.stringify(sizes);
        if (g.pic) {
          assert.ok(g.pic.y + g.pic.h <= box.h, where + ": picture overruns the cover");
          assert.ok(g.pic.x + g.pic.w <= 263, where + ": picture overruns the paper");
          assert.ok(g.pic.x >= 0 && g.pic.y >= 0, where + ": picture starts outside the cover");
        }
        for (const l of g.lines) {
          assert.ok(l.y + Math.round(l.size * 0.3) <= box.h,
            where + ": baseline " + l.y + " past the cover " + box.h);
          assert.ok(l.y - l.size >= 0, where + ": baseline " + l.y + " starts above the cover");
        }
      }
    }
  }
});

test("the block can't ride off the top of the paper at a big pull", () => {
  // The blank takeover anchors to the BOTTOM of the cover, so over-pulling only adds
  // white. The fake cheer anchors to the top, which climbed 1:1 with the slider until
  // the tape printed a blank white slab — measured: at pullPt 300 the picture was gone,
  // at 380+ nothing printed at all. The lift is now capped, so past the default
  // calibration the block follows the message down instead of sailing off the roll.
  const lift = (pullPt) => {
    const g = geom(C.buildFakeCheer({ ...CHEER, pullPt }));
    const top = g.pic ? g.pic.y : g.lines[0].y - g.lines[0].size;
    return C.takeoverBox(pullPt).pullPx - top;      // px between the block top and the message
  };
  // The invariant is a hard ceiling on the lift, not a comparison against the default:
  // at the default the block starts 6px down, so it lifts 287 and the ceiling is 293.
  const CEILING = 293;                       // CHEER_MAX_LIFT_PX = takeoverBox(220).pullPx
  assert.equal(lift(220), CEILING - 6, "the default calibration should be untouched by the cap");
  for (const pullPt of [220, 250, 300, 340, 380, 400]) {
    assert.ok(lift(pullPt) <= CEILING,
      "pull " + pullPt + " lifts the block " + lift(pullPt) + "px, past the " + CEILING + "px ceiling");
  }
  // Without the cap this grows without bound — confirm it really is being applied and
  // the numbers aren't just coincidentally small.
  assert.ok(lift(400) === CEILING, "the cap should be binding at pull 400, got " + lift(400));
  // And the default itself is untouched by the cap — the reference layout still stands.
  assert.equal(geom(C.buildFakeCheer({ ...CHEER, pullPt: 220 })).pic.y, 6);
});

test("a picture too small to print is dropped rather than shipped as blank paper", () => {
  // MEASURED on the engine: inside the lifted foreignObject, a picture drawn under
  // ~120px tall produces no image XObject at all — the tape prints blank where it
  // should be. So below that floor the markup is ~90 characters of a 500-char budget
  // buying literally nothing, and it is better not to send it.
  const tiny = C.buildFakeCheer({ ...CHEER, pullPt: 60, avatarW: 200 });
  assert.ok(!/foreignObject/.test(tiny), "expected the picture to be dropped at pull 60: " + tiny);
  assert.ok(/-100000 BITS/.test(tiny), "the text must survive when the picture is dropped");

  // Anything that IS emitted must clear the floor, at every reachable setting.
  for (const pullPt of [60, 90, 120, 220, 300, 400]) {
    for (const avatarW of [40, 120, 160, 200]) {
      const g = geom(C.buildFakeCheer({ ...CHEER, pullPt, avatarW }));
      if (!g.pic) continue;
      assert.ok(g.pic.h >= 120,
        "pull " + pullPt + " / " + avatarW + ": emitted a " + g.pic.h + "px picture that cannot print");
    }
  }
  // A block saved before the floor existed is raised to a printable size, not dropped.
  assert.ok(/foreignObject/.test(C.buildFakeCheer({ ...CHEER, pullPt: 220, avatarW: 40 })),
    "a small saved size should clamp up to the floor while there's room for it");
});

test("a carrier that breaks inside the frame is flagged in the table", () => {
  // Measured: an <iframe> inside the takeover's <foreignObject> swallows the content
  // following the whole SVG, so everything stacked BELOW a takeover vanishes from the
  // print. The table records that so the UI can warn; the pick is still honoured,
  // because silently overriding an explicit choice is its own bug.
  const iframe = C.EMBEDS.filter((e) => e.id === "iframe")[0];
  assert.equal(iframe.framedOk, false, "iframe must be marked unsafe inside a frame");
  // Everything else is either fine framed or explicitly flagged — no silent unknowns.
  for (const e of C.EMBEDS) {
    assert.ok(e.framedOk === undefined || e.framedOk === false,
      e.id + ": framedOk should be absent (fine) or false (flagged), got " + e.framedOk);
  }
});

test("a takeover's picture rides the same carrier table, so it must migrate too", () => {
  // Regression guard for the block-schema side of the carrier story. A takeover stores a
  // renderAs exactly like an image block does, so when a tag gets blocked and the default
  // moves, a SAVED takeover has to be moved off it as well — otherwise its picture
  // silently never prints again. The migration lives in the browser glue (not exported),
  // so what's asserted here is the invariant it exists to uphold: every carrier the app
  // can migrate TO is one that still sends.
  assert.ok(!C.getEmbed(C.EMBED_DEFAULT).blocked, "the default carrier must not be blocked");
  // And a blocked id must resolve to that default rather than to itself.
  const blocked = C.EMBEDS.filter(e => e.blocked).map(e => e.id);
  assert.ok(blocked.length, "expected the table to still record the blocked tags for A/B");
  for (const id of blocked) {
    assert.equal(C.getEmbed(id).id, id, "an explicit re-pick of a blocked tag should be honoured");
  }
  // A takeover built with the default carrier never emits a blocked token.
  const html = C.buildFakeCheer({ ...CHEER, carrier: C.EMBED_DEFAULT });
  assert.ok(html.indexOf("<image") < 0 && html.indexOf("<img") < 0, "default carrier leaked a blocked tag");
});
