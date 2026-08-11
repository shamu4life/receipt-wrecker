// THE TAKEOVER AS AN ORDERED LIST OF ITEMS.
//
// buildTakeover({items:[...]}) lays out text and pictures in any order and any number.
// The legacy lines/picture entry point is tested in takeover.test.mjs and must keep
// passing untouched — these are the rules the new path adds.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
const C = loadCore();

const F = (w, i) => C.lineFmt(null, w, i);
const PIC = "https://x.test/p.png";
const W = 263;

// Parse a built overlay back into geometry. Every assertion below is about what lands
// on paper, not about the shape of the string — same discipline as takeoverReport.
//
// THERE ARE TWO PICTURE FORMS AND BOTH HAVE TO BE READ HERE. One picture rides in its
// own <foreignObject>, which states its box. Two or more share ONE frame and are
// positioned inside it, because a second frame is an SVG sibling and the first frame
// eats it — see takeoverPictures. The shared form states no per-picture HEIGHT (nothing
// clips there, so there is nothing to state), so `h` comes back NaN: an assertion that
// needs a height then fails loudly instead of quietly comparing against a zero.
function geom(html) {
  const texts = [...html.matchAll(/<text x="(-?\d+)" y="(-?\d+)" font-size="(\d+)"([^>]*)>([^<]*)</g)]
    .map((m) => ({
      x: Number(m[1]), y: Number(m[2]), size: Number(m[3]),
      anchor: (m[4].match(/text-anchor="(\w+)"/) || [, ""])[1],
      text: m[5], at: m.index,
    }));
  const pics = [...html.matchAll(/<foreignObject x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), at: m.index }));
  for (const m of html.matchAll(/<div style="position:absolute;left:(-?\d+)px;top:(-?\d+)px">(.*?)<\/div>/g)) {
    pics.push({ x: Number(m[1]), y: Number(m[2]),
                w: Number((m[3].match(/width[=:]"?(\d+)/) || [, NaN])[1]), h: NaN, at: m.index });
  }
  return { texts, pics };
}
// How many <foreignObject> frames the markup carries. ONE is the only correct answer
// when there is any picture at all: a frame is an HTML integration point that swallows
// every SVG sibling after it, so a second frame means every picture but the first is
// dead on paper while the preview draws them all.
const frames = (html) => (html.match(/<foreignObject/g) || []).length;

// The fake cheer's arrangement, as items: a picture then three lines.
const CHEER_ITEMS = [
  { kind: "pic", url: PIC, width: 120 },
  { kind: "text", text: "-100000 BITS", size: 24, fmt: F(900, false) },
  { kind: "text", text: "IRS", size: 19, fmt: F(700, false) },
  { kind: "text", text: "tax lien", size: 13, fmt: F(400, true) },
];
const L3 = [
  { kind: "text", text: "ONE", size: 20 },
  { kind: "text", text: "TWO", size: 20 },
  { kind: "text", text: "THREE", size: 20 },
];

// ── THE SHAPE OF THE THING ──────────────────────────────────────────────────

test("an item stack is still one opaque, lifted overlay", () => {
  const html = C.buildTakeover({ items: L3, pullPt: 220, w: W });
  assert.ok(/^<svg /.test(html), "must be a bare svg: " + html.slice(0, 40));
  assert.ok(/style="margin-top:-220pt"/.test(html), "must be lifted over the header");
  assert.ok(/<rect width="263" height="333" fill="#fff"\/>/.test(html), "needs the opaque cover");
  assert.ok(html.indexOf("<rect") < html.indexOf("<text"), "rect must precede the content");
  assert.ok(!/[\r\n]/.test(html), "payload stays newline-free");
  // No items at all is still a valid cover — it just erases the header.
  const bare = C.buildTakeover({ items: [], pullPt: 220, w: W });
  assert.ok(/<rect /.test(bare) && !/<text/.test(bare) && !/<g /.test(bare), bare);
});

test("the item path and the legacy path are the same entry point, items winning", () => {
  // Stage 2 migrates the callers; until then both shapes have to work, and a caller
  // that passes both must get the new one rather than a silent half-render.
  const legacy = C.buildTakeover({ lines: [{ text: "ONE", size: 20 }], pullPt: 220, w: W });
  assert.ok(legacy.indexOf(">ONE<") >= 0, "the legacy lines path must still build: " + legacy);
  const both = C.buildTakeover({ items: [{ kind: "text", text: "ITEM", size: 20 }],
                                 lines: [{ text: "LINE", size: 20 }], pullPt: 220, w: W });
  assert.ok(both.indexOf(">ITEM<") >= 0 && both.indexOf(">LINE<") < 0,
    "items must win outright, not merge with lines: " + both);
});

// ── STACKING ────────────────────────────────────────────────────────────────

test("items stack top to bottom in the order given", () => {
  const g = geom(C.buildTakeover({ items: L3, pullPt: 220, w: W }));
  assert.equal(g.texts.length, 3);
  eq(g.texts.map((t) => t.text), ["ONE", "TWO", "THREE"], "item order scrambled");
  assert.ok(g.texts[0].y < g.texts[1].y && g.texts[1].y < g.texts[2].y,
    "stack order must read top-to-bottom: " + g.texts.map((t) => t.y));
});

test("text leading is the SHARED rule — max(prev, next) * 1.35, not a second copy", () => {
  // takeoverOffsets is the one implementation. If a run were stepped line-by-line here
  // instead, a leading change could silently reintroduce the picture-over-text bug.
  for (const sizes of [[20, 20, 20], [24, 19, 13], [48, 8, 40], [12, 40, 24]]) {
    const items = sizes.map((size, i) => ({ kind: "text", text: "L" + i, size }));
    const g = geom(C.buildTakeover({ items, anchor: "top", pullPt: 400, w: W }));
    assert.equal(g.texts.length, 3, "sizes " + sizes + " should all fit at pull 400");
    for (let i = 0; i + 1 < 3; i++) {
      assert.equal(g.texts[i + 1].y - g.texts[i].y, Math.round(Math.max(sizes[i], sizes[i + 1]) * 1.35),
        "leading drifted at " + sizes + ": " + g.texts.map((t) => t.y));
    }
  }
});

test("a picture contributes its drawn height plus the existing gap", () => {
  // Picture, then text: the first baseline sits gap + cap-height under the picture's
  // bottom edge. This is the number that keeps a picture off the text it paints over.
  const g = geom(C.buildTakeover({ items: CHEER_ITEMS, anchor: "top", carrier: "embed",
                                   pullPt: 220, w: W }));
  assert.equal(g.texts[0].y, g.pics[0].y + g.pics[0].h + C.CHEER_GAP_PX + g.texts[0].size);
  // And text, then a picture: the picture's top clears the last descender by the gap.
  const g2 = geom(C.buildTakeover({ items: [L3[0], { kind: "pic", url: PIC, width: 120 }],
                                    anchor: "top", carrier: "embed", pullPt: 400, w: W }));
  const bottom = g2.texts[0].y + Math.round(g2.texts[0].size * 0.3);
  assert.equal(g2.pics[0].y, bottom + C.CHEER_GAP_PX, "text -> picture gap drifted");
});

test("a picture between two text runs pushes the second run down past it", () => {
  const items = [L3[0], { kind: "pic", url: PIC, width: 120 }, L3[1]];
  const g = geom(C.buildTakeover({ items, anchor: "top", carrier: "embed", pullPt: 400, w: W }));
  assert.equal(g.texts.length, 2);
  assert.equal(g.pics.length, 1);
  const picBottom = g.pics[0].y + g.pics[0].h;
  assert.ok(g.texts[0].y + Math.round(g.texts[0].size * 0.3) <= g.pics[0].y,
    "the first line should sit above the picture: " + JSON.stringify(g));
  assert.ok(g.texts[1].y - g.texts[1].size >= picBottom,
    "the second line should sit below the picture: " + JSON.stringify(g));
});

test("two pictures stack, both DRAWN — one frame, never two", () => {
  // THE THING THAT PRINTS, NOT THE THING THAT PARSES. An earlier version of this test
  // counted <foreignObject> elements and passed on markup that laid down ONE picture:
  // measured on the real engine at 203dpi/1-bit, two frames emitted as siblings printed
  // 31,792 ink pixels, the first picture's own count to the pixel, while the second
  // one's image XObject sat unused in the PDF. Chromium draws both, so the preview and
  // the drop note agreed with each other and with nothing on the tape.
  //
  // So the assertion is the frame count. One frame is the whole fix — every picture
  // positioned inside it — and two frames is the bug, whatever the picture count says.
  const items = [{ kind: "pic", url: PIC, width: 120 }, { kind: "pic", url: PIC, width: 120 }];
  const html = C.buildTakeover({ items, anchor: "top", carrier: "embed", pullPt: 400, w: W });
  assert.equal(frames(html), 1, "a second <foreignObject> is a sibling and never prints: " + html);
  const g = geom(html);
  assert.equal(g.pics.length, 2, "two pictures is the arrangement the old model couldn't do");
  // Both carriers are really in the string — the same URL twice must not collapse to one.
  assert.equal((html.match(/<embed /g) || []).length, 2, "a picture lost its carrier tag");
  // 120px square, so the second sits a gap below the first.
  assert.equal(g.pics[1].y, g.pics[0].y + 120 + C.CHEER_GAP_PX);
  eq(g.pics.map((p) => p.w), [120, 120]);
});

test("no arrangement of pictures ever emits a second <foreignObject>", () => {
  // The guard, swept rather than spot-checked: any count, any order against text, any
  // alignment, any anchor. One frame or none — a second one silently kills every picture
  // after it, and nothing downstream of the markup can see that happen.
  const pic = (o) => ({ kind: "pic", url: PIC, width: 120, ...o });
  const sets = [
    [pic()],
    [pic(), pic()],
    [pic(), pic(), pic()],
    [pic({ align: "left" }), pic({ align: "right", nudge: -152 }), pic()],
    [L3[0], pic(), L3[1], pic(), L3[2]],
    [pic(), L3[0], pic({ align: "left" })],
    [pic(), pic({ carrier: "input" }), pic({ carrier: "img" })],
  ];
  for (const anchor of ["top", "centre", "bottom"]) {
    for (const items of sets) {
      for (const pullPt of [220, 240, 400]) {
        const html = C.buildTakeover({ items, anchor, carrier: "embed", pullPt, w: W });
        assert.ok(frames(html) <= 1,
          "two frames at " + anchor + "/" + pullPt + ": " + html);
        // And every picture that survived placement really is in the string.
        assert.equal(geom(html).pics.length,
          (html.match(/<embed |<input |<img /g) || []).length,
          "a placed picture lost its box or a box lost its picture: " + html);
      }
    }
  }
});

test("ONE picture keeps the exact frame the budget was measured against", () => {
  // 479 body / 491 with the cheer token, and the migration's byte-identity tests, all
  // rest on this string. The multi-picture form must not leak into the single-picture
  // case to make the code tidier.
  const html = C.buildTakeover({ items: [{ kind: "pic", url: PIC, width: 120 }],
                                 anchor: "top", carrier: "embed", pullPt: 240, w: W });
  assert.ok(html.includes('<foreignObject x="72" y="6" width="120" height="120">'
                          + '<embed src="' + PIC + '" width="120"></foreignObject>'), html);
  assert.ok(!html.includes("position:"), "the single picture must not grow a wrapper: " + html);
});

// ── ANCHOR ──────────────────────────────────────────────────────────────────

const blockTop = (g) => Math.min(...[...g.pics.map((p) => p.y),
                                     ...g.texts.map((t) => t.y - t.size)]);
const blockBottom = (g) => Math.max(...[...g.pics.map((p) => p.y + p.h),
                                        ...g.texts.map((t) => t.y + Math.round(t.size * 0.3))]);

test("anchor top reproduces today's fake cheer BYTE FOR BYTE", () => {
  // The strongest statement available that the item engine's geometry is the one that
  // was measured on the real rig: a picture item plus three text items at anchor top
  // must produce the exact string buildFakeCheer produces. If this ever fails, stage 2's
  // migration is no longer byte-equivalent and every saved takeover has moved.
  const items = C.buildTakeover({ items: CHEER_ITEMS, anchor: "top", carrier: "embed",
                                  pullPt: 220, w: W });
  const cheer = C.buildFakeCheer({ bits: "-100000 BITS", name: "IRS", note: "tax lien",
                                   avatar: PIC, carrier: "embed", pullPt: 220, w: W });
  assert.equal(items, cheer);
  // And that string is still the reference layout: 182 / 214 / 240.
  eq(geom(items).texts.map((t) => t.y), [182, 214, 240]);
});

test("anchor top KEEPS the lift cap, or an over-pull rides off the roll", () => {
  // The paper above the message is only ever as tall as the rig's real header, so a
  // top-anchored block climbs 1:1 with the pull slider until it is off the tape.
  // Measured: at pullPt 300 the picture had vanished, at 380+ the print was a blank slab.
  const DEF = C.TAKEOVER_PULL_PT;
  const CEILING = C.takeoverBox(DEF).pullPx;                   // = CHEER_MAX_LIFT_PX
  assert.equal(C.CHEER_MAX_LIFT_PX, CEILING, "the cap must stay derived from the default");
  const lift = (pullPt) => {
    const g = geom(C.buildTakeover({ items: CHEER_ITEMS, anchor: "top", carrier: "embed", pullPt }));
    return C.takeoverBox(pullPt).pullPx - blockTop(g);
  };
  assert.equal(lift(DEF), CEILING - C.CHEER_TOP_PX, "the default calibration must be untouched");
  for (const pullPt of [DEF, DEF + 10, DEF + 60, DEF + 100, 400]) {
    assert.ok(lift(pullPt) <= CEILING,
      "pull " + pullPt + " lifts the block " + lift(pullPt) + "px, past the " + CEILING + "px ceiling");
  }
  assert.equal(lift(400), CEILING, "the cap should be binding at pull 400");
  // Above the default the block sits in the SAME page position rather than climbing.
  const rigHeader = 290;                                       // from the reference print
  const pageTop = (pullPt) => rigHeader - C.takeoverBox(pullPt).pullPx
    + blockTop(geom(C.buildTakeover({ items: CHEER_ITEMS, anchor: "top", carrier: "embed", pullPt })));
  assert.equal(new Set([260, 320, 400].map(pageTop)).size, 1, "the cap should pin it above the default");
});

test("an over-tall top-anchored stack drops its tail rather than sliding off the roll", () => {
  // Sliding the stack UP to make it fit the white box is the obvious clamp and it is
  // wrong here: it lifts the block past CHEER_MAX_LIFT_PX, which is the exact failure
  // the cap exists to prevent — measured as a blank white slab on the tape. The floor
  // for a top-anchored stack is the cap's own start, and the overflow rule takes the
  // rest.
  const tall = [48, 48, 48, 48, 48, 48].map((size, i) => ({ kind: "text", text: "L" + i, size }));
  const pullPt = 400, box = C.takeoverBox(pullPt);
  const g = geom(C.buildTakeover({ items: tall, anchor: "top", pullPt, w: W }));
  assert.equal(blockTop(g), box.pullPx - C.CHEER_MAX_LIFT_PX, "the stack slid off the cap");
  assert.ok(box.pullPx - blockTop(g) <= C.CHEER_MAX_LIFT_PX, "lifted past the ceiling");
  assert.ok(g.texts.length < tall.length, "the tail should be dropped, not squeezed in");
  assert.ok(g.texts.length >= 1, "and what fits must still be drawn");
});

test("anchor bottom sits the stack just above the message, as today", () => {
  const g = geom(C.buildTakeover({ items: L3, anchor: "bottom", pullPt: 220, w: W }));
  assert.equal(blockBottom(g), C.takeoverBox(220).pullPx - C.TAKEOVER_BOTTOM_PX);
  // It is also the default, so an item stack with no anchor behaves like today's plain
  // takeover rather than jumping to the top of the cover.
  assert.equal(C.buildTakeover({ items: L3, pullPt: 220, w: W }),
               C.buildTakeover({ items: L3, anchor: "bottom", pullPt: 220, w: W }));
  assert.equal(C.buildTakeover({ items: L3, anchor: "sideways", pullPt: 220, w: W }),
               C.buildTakeover({ items: L3, anchor: "bottom", pullPt: 220, w: W }),
               "a junk anchor must fall back, not throw or emit something new");
  // A 13px final line lands on the legacy blank path's own last baseline, pullPx - 24.
  const g13 = geom(C.buildTakeover({ items: [{ kind: "text", text: "x", size: 13 }],
                                     anchor: "bottom", pullPt: 220, w: W }));
  assert.equal(g13.texts[0].y, C.takeoverBox(220).pullPx - 24);
});

test("anchor centre puts the stack mid-cover", () => {
  const g = geom(C.buildTakeover({ items: L3, anchor: "centre", pullPt: 220, w: W }));
  const box = C.takeoverBox(220);
  const above = blockTop(g), below = box.pullPx - blockBottom(g);
  assert.ok(Math.abs(above - below) <= 1, "centre should split the cover: " + above + " / " + below);
  // The three anchors are genuinely three positions, not the same one three times.
  const tops = ["top", "centre", "bottom"].map((anchor) =>
    blockTop(geom(C.buildTakeover({ items: L3, anchor, pullPt: 220, w: W }))));
  assert.equal(new Set(tops).size, 3, "the anchors collapsed onto each other: " + tops);
  assert.ok(tops[0] < tops[1] && tops[1] < tops[2], "anchors out of order: " + tops);
});

// ── ALIGN ───────────────────────────────────────────────────────────────────

test("align maps text to a text-anchor with x at 4, W/2 and W-4", () => {
  const items = [{ kind: "text", text: "L", size: 20, align: "left" },
                 { kind: "text", text: "C", size: 20, align: "centre" },
                 { kind: "text", text: "R", size: 20, align: "right" }];
  const g = geom(C.buildTakeover({ items, pullPt: 220, w: W }));
  eq(g.texts.map((t) => [t.text, t.x, t.anchor]),
     [["L", 4, "start"], ["C", Math.round(W / 2), "middle"], ["R", W - 4, "end"]]);
  // An unknown align is centre, not a broken anchor attribute in the payload.
  const junk = geom(C.buildTakeover({ items: [{ kind: "text", text: "J", size: 20, align: "middle" }],
                                      pullPt: 220, w: W }));
  assert.equal(junk.texts[0].x, Math.round(W / 2));
  assert.ok(["", "middle"].indexOf(junk.texts[0].anchor) >= 0, "junk align leaked: " + junk.texts[0].anchor);
});

test("align maps a picture to 4, centred, or W-width-4", () => {
  const at = (align) => geom(C.buildTakeover({ items: [{ kind: "pic", url: PIC, width: 120, align }],
                                               anchor: "top", carrier: "embed", pullPt: 220, w: W })).pics[0];
  assert.equal(at("left").x, 4);
  assert.equal(at("centre").x, Math.round((W - 120) / 2));
  assert.equal(at("right").x, W - 120 - 4);
  // Never off the paper on either edge.
  for (const align of ["left", "centre", "right"]) {
    const p = at(align);
    assert.ok(p.x >= 0 && p.x + p.w <= W, align + " ran off the paper: " + JSON.stringify(p));
  }
});

test("centring is stated once when it pays for itself, and never when it doesn't", () => {
  // The <g text-anchor="middle"> wrapper is 31 characters of a 500-character budget. It
  // is worth it from the second centred item on and pure waste with none — a takeover
  // runs within single digits of the cap, so this is a cheer's worth of difference.
  const mk = (aligns) => C.buildTakeover({ pullPt: 220, w: W, anchor: "top",
    items: aligns.map((align, i) => ({ kind: "text", text: "L" + i, size: 20, align })) });
  assert.ok(/<g text-anchor="middle">/.test(mk(["centre", "centre"])), "two centred items should group");
  assert.ok(!/<g /.test(mk(["left", "left", "left"])), "an all-left stack must not pay for a centre");
  assert.ok(!/<g /.test(mk(["centre", "left"])), "one centred item is cheaper spelled out");
  // Whichever form is chosen, the geometry is identical — this is a payload choice only.
  for (const aligns of [["centre", "centre"], ["left", "left"], ["centre", "left"]]) {
    const g = geom(mk(aligns));
    eq(g.texts.map((t) => t.x),
       aligns.map((a) => (a === "left" ? 4 : a === "right" ? W - 4 : Math.round(W / 2))));
  }
  // And the cheaper form really is cheaper.
  assert.ok(C.payloadLength(mk(["left", "left", "left"]))
    < C.payloadLength(mk(["centre", "centre", "centre"])) + 31 + 1, "the saving evaporated");
});

// ── NUDGE ───────────────────────────────────────────────────────────────────

test("a nudge moves ONE item and does not re-flow the ones after it", () => {
  // That is the whole point of having it. Re-flowing would make nudge a second layout
  // rule competing with the leading rule.
  const base = geom(C.buildTakeover({ items: L3, anchor: "top", pullPt: 400, w: W }));
  const items = L3.map((it, i) => (i === 0 ? { ...it, nudge: 40 } : it));
  const g = geom(C.buildTakeover({ items, anchor: "top", pullPt: 400, w: W }));
  assert.equal(g.texts[0].y, base.texts[0].y + 40, "the nudged item should move by exactly its nudge");
  assert.equal(g.texts[1].y, base.texts[1].y, "the next item must NOT re-flow");
  assert.equal(g.texts[2].y, base.texts[2].y, "nor the one after that");
  // Negative too, and on a picture.
  const up = geom(C.buildTakeover({ items: L3.map((it, i) => (i === 2 ? { ...it, nudge: -10 } : it)),
                                    anchor: "top", pullPt: 400, w: W }));
  assert.equal(up.texts[2].y, base.texts[2].y - 10);
  const bp = geom(C.buildTakeover({ items: CHEER_ITEMS, anchor: "top", carrier: "embed", pullPt: 400 }));
  const np = geom(C.buildTakeover({ items: CHEER_ITEMS.map((it, i) => (i === 0 ? { ...it, nudge: 12 } : it)),
                                    anchor: "top", carrier: "embed", pullPt: 400 }));
  assert.equal(np.pics[0].y, bp.pics[0].y + 12, "a picture nudges too");
  eq(np.texts.map((t) => t.y), bp.texts.map((t) => t.y), "nudging the picture must not move the text");
});

test("a junk nudge is zero, never a junk coordinate", () => {
  const base = C.buildTakeover({ items: L3, anchor: "top", pullPt: 400, w: W });
  for (const nudge of [undefined, null, NaN, "x", Infinity, -Infinity]) {
    const h = C.buildTakeover({ items: L3.map((it, i) => (i === 0 ? { ...it, nudge } : it)),
                                anchor: "top", pullPt: 400, w: W });
    assert.ok(!/Infinity|NaN/.test(h), "nudge " + nudge + " reached the markup: " + h.slice(0, 160));
    assert.equal(h, base, "nudge " + nudge + " should be a no-op");
  }
});

// ── OVERFLOW ────────────────────────────────────────────────────────────────

test("an item that does not fit the covered area is DROPPED, not emitted invisibly", () => {
  // Past the bottom the SVG viewport clips it, so it never prints AND is still paid for
  // in characters. Above the top it prints on the header the block exists to cover.
  const big = [48, 48, 48].map((size, i) => ({ kind: "text", text: "L" + i, size }));
  const g = geom(C.buildTakeover({ items: big, anchor: "top", pullPt: 60, w: W }));
  assert.ok(g.texts.length < 3, "a 192px stack cannot fit a 120px box: " + JSON.stringify(g.texts));
  assert.ok(g.texts.length >= 1, "and what does fit must still be drawn");
  // A nudge can push a single item out on its own, without taking its neighbours.
  const out = geom(C.buildTakeover({ items: L3.map((it, i) => (i === 1 ? { ...it, nudge: -9000 } : it)),
                                     anchor: "top", pullPt: 400, w: W }));
  eq(out.texts.map((t) => t.text), ["ONE", "THREE"], "only the nudged-out item should go");
  // Same for a picture nudged off the bottom.
  const noPic = geom(C.buildTakeover({ items: CHEER_ITEMS.map((it, i) => (i === 0 ? { ...it, nudge: 9000 } : it)),
                                       anchor: "top", carrier: "embed", pullPt: 220 }));
  assert.equal(noPic.pics.length, 0, "a picture off the bottom must be dropped, not clipped");
  assert.equal(noPic.texts.length, 3, "the text must survive the picture being dropped");
});

test("nothing is ever drawn outside the painted cover, at any reachable setting", () => {
  for (const pullPt of [60, 90, 120, 220, 300, 400]) {
    for (const anchor of ["top", "centre", "bottom"]) {
      for (const width of [120, 200]) {
        for (const sizes of [[24, 19, 13], [48, 48, 48], [8, 48, 8]]) {
          const items = [{ kind: "pic", url: PIC, width }].concat(
            sizes.map((size, i) => ({ kind: "text", text: "L" + i, size })));
          const box = C.takeoverBox(pullPt);
          const g = geom(C.buildTakeover({ items, anchor, carrier: "embed", pullPt, w: W }));
          const where = pullPt + "/" + anchor + "/" + width + "/" + sizes;
          for (const p of g.pics) {
            assert.ok(p.y >= 0 && p.y + p.h <= box.h, where + ": picture outside the cover " + JSON.stringify(p));
            assert.ok(p.x >= 0 && p.x + p.w <= W, where + ": picture off the paper " + JSON.stringify(p));
          }
          for (const t of g.texts) {
            assert.ok(t.y - t.size >= 0, where + ": baseline " + t.y + " starts above the cover");
            assert.ok(t.y + Math.round(t.size * 0.3) <= box.h,
              where + ": baseline " + t.y + " past the cover " + box.h);
          }
        }
      }
    }
  }
});

// ── ROOM FIRST ──────────────────────────────────────────────────────────────

test("the text's room is reserved FIRST — the picture shrinks or goes, the lines stay", () => {
  // The rule 0.4.2's buildFakeCheer had and the item engine arrived without. MEASURED
  // before the fix, same content at 120px: pull 160 and up byte-identical, 140 printed
  // 2 of 3 lines, 120 printed 1 of 3, 100 printed none of them and just the avatar, and
  // 60 — the slider's minimum — printed a blank 105-character slab. 0.4.2 printed all
  // three lines at every one of those pulls.
  for (const width of [120, 160, 240]) {
    const items = [{ ...CHEER_ITEMS[0], width }, ...CHEER_ITEMS.slice(1)];
    for (const pullPt of [60, 80, 100, 120, 140, 150, 160, 200, 240, 300, 400]) {
      const g = geom(C.buildTakeover({ items, anchor: "top", carrier: "embed", pullPt, w: W }));
      assert.equal(g.texts.length, 3,
        "a line was dropped to keep the picture at pull " + pullPt + " width " + width);
    }
  }
});

test("a shrunk picture is EXACTLY the size 0.4.2 shrank it to", () => {
  // buildFakeCheer reserved `box.h - top - textNeed` and clamped the avatar into it, and
  // that sum is what takeoverRoom has to land on. Asked of the frozen 0.4.2 renderer
  // rather than restated here — the same discipline the migration uses, and the only
  // check that can catch the two drifting apart.
  //
  // THE SIZE, NOT THE WHOLE STRING, and the difference is worth knowing. Where the fit
  // bites, 0.4.2 also pulled its TEXT up 6px (buildTakeover's `maxStart` keeps the last
  // descender 6px inside the box), which squeezed its own CHEER_GAP_PX to 26. The item
  // engine keeps the tuned gap and lets the stack end at the bottom of the cover — the
  // overflow rule already guarantees nothing lands outside it. Same avatar, same lines,
  // 6px lower. That difference predates this test at width 240 / pull 300+, where no
  // shrinking happens at all.
  const picW = (html) => Number((html.match(/foreignObject[^>]*width="(\d+)"/) || [, NaN])[1]);
  let shrunk = 0;
  for (const pullPt of [160, 180, 200, 220, 240, 300, 400]) {
    for (const width of [120, 160, 200, 240]) {
      const items = [{ ...CHEER_ITEMS[0], width }, ...CHEER_ITEMS.slice(1)];
      const mine = C.buildTakeover({ items, anchor: "top", carrier: "embed", pullPt, w: W });
      const old = C.buildFakeCheer({ bits: "-100000 BITS", name: "IRS", note: "tax lien",
                                     avatar: PIC, avatarW: width, carrier: "embed", pullPt, w: W });
      const where = " at pull " + pullPt + " width " + width;
      assert.equal(picW(mine), picW(old), "the shrink disagrees with 0.4.2" + where);
      assert.equal(geom(mine).texts.length, 3, "a line was dropped" + where);
      if (picW(mine) < width) shrunk++;
    }
  }
  assert.ok(shrunk >= 8, "the grid stopped reaching the shrink cases: " + shrunk);
  // The headline: 240px at the default pull comes out at 236 with all three lines, where
  // before this it stayed 240 and cost the note line.
  const g = geom(C.buildTakeover({ items: [{ ...CHEER_ITEMS[0], width: 240 }, ...CHEER_ITEMS.slice(1)],
                                   anchor: "top", carrier: "embed", pullPt: 240, w: W }));
  assert.equal(g.pics[0].w, 236);
  assert.equal(g.texts.length, 3);
  // And where nothing needs shrinking the bytes are still 0.4.2's, exactly.
  for (const pullPt of [160, 200, 240, 300, 400]) {
    assert.equal(
      C.buildTakeover({ items: CHEER_ITEMS, anchor: "top", carrier: "embed", pullPt, w: W }),
      C.buildFakeCheer({ bits: "-100000 BITS", name: "IRS", note: "tax lien", avatar: PIC,
                         carrier: "embed", pullPt, w: W }),
      "the untouched case moved at pull " + pullPt);
  }
});

test("a picture that cannot clear the printable floor is dropped, never smeared", () => {
  // Under ~120 drawn px a picture does not render inside a lifted takeover at all (see
  // CHEER_MIN_PIC_PX) — shrinking past that buys blank paper for ~90 characters. Swept:
  // nothing in the reachable space ever emits a box under the floor.
  for (const pullPt of [60, 100, 120, 140, 155, 160, 220, 240, 400]) {
    for (const anchor of ["top", "centre", "bottom"]) {
      for (const width of [120, 160, 240]) {
        const items = [{ ...CHEER_ITEMS[0], width }, ...CHEER_ITEMS.slice(1)];
        const g = geom(C.buildTakeover({ items, anchor, carrier: "embed", pullPt, w: W }));
        for (const p of g.pics) {
          assert.ok(p.w >= C.CHEER_MIN_PIC_PX,
            "emitted a " + p.w + "px picture at " + pullPt + "/" + anchor + " — it prints nothing");
        }
      }
    }
  }
});

test("when several pictures cannot fit, the LAST one goes first", () => {
  // The arrangement is usually built around the first picture — an avatar at the top of
  // a header — so it is the last to give way, and the fit runs again after each drop
  // rather than shrinking everything into the floor.
  const pic = { kind: "pic", url: PIC, width: 120 };
  const line = { kind: "text", text: "ONE", size: 20 };
  const at = (pullPt, anchor) => geom(C.buildTakeover({ items: [pic, pic, pic, line], anchor,
                                                        carrier: "embed", pullPt, w: W })).pics.length;
  // Anchor CENTRE for the roomy end: at anchor top the lift cap holds the usable room at
  // CHEER_MAX_LIFT_PX however far the slider goes, so three pictures and a line never fit
  // there — which is the cap doing its job, not the fit.
  assert.equal(at(400, "centre"), 3, "all three should fit a 573px cover");
  assert.ok(at(240, "top") < 3, "three 120px pictures cannot fit a 360px cover");
  assert.ok(at(240, "top") >= 1, "and the first one should survive");
  // Monotone: less room never means more pictures.
  const counts = [400, 300, 240, 160, 100, 60].map((p) => at(p, "top"));
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] <= counts[i - 1], "picture count went UP as the cover shrank: " + counts);
  }
  assert.equal(counts[counts.length - 1], 0, "at the slider's minimum every picture should go");
  // The line survives all of it — that is the whole point of reserving its room.
  for (const pullPt of [400, 300, 240, 160, 100, 60]) {
    assert.equal(geom(C.buildTakeover({ items: [pic, pic, pic, line], anchor: "top",
                                        carrier: "embed", pullPt, w: W })).texts.length, 1,
      "the line was dropped at pull " + pullPt);
  }
});

test("a layout somebody has PINNED is never re-fitted", () => {
  // A nudge means "this one thing sits here", which is exactly the promise re-flowing
  // would break — and every migrated 0.4.2 blank takeover carries nudges holding it on
  // the pixels it was tuned on. takeoverPinToInk computes those against the un-fitted
  // stack, so the fit has to stay out of any list that has one.
  const items = [{ kind: "pic", url: PIC, width: 240, nudge: 1 }, ...CHEER_ITEMS.slice(1)];
  const g = geom(C.buildTakeover({ items, anchor: "top", carrier: "embed", pullPt: 240, w: W }));
  assert.equal(g.pics[0].w, 240, "a pinned picture must keep the size it was pinned at");
  // The nudge is on the picture, and it exempts the whole list — one item's pin is a
  // statement about the stack it sits in.
  const onText = [{ kind: "pic", url: PIC, width: 240 },
                  { ...CHEER_ITEMS[1], nudge: 1 }, CHEER_ITEMS[2], CHEER_ITEMS[3]];
  assert.equal(geom(C.buildTakeover({ items: onText, anchor: "top", carrier: "embed",
                                      pullPt: 240, w: W })).pics[0].w, 240);
});

test("a takeover that would draw NOTHING is empty, not a blank slab", () => {
  // What the composer's content check asks (blockHasContent runs exactly this): having
  // an item is not having ink. At a short pull the cover is smaller than the stack and
  // everything in it can be dropped between the item list and the markup — which used to
  // ship a 105-character white slab that erased the header and put nothing in its place.
  const placed = (items, pullPt, anchor) =>
    C.takeoverPlace(C.takeoverItems(items, "embed"), C.takeoverBox(pullPt), anchor, W).length;
  assert.equal(placed([{ kind: "pic", url: PIC, width: 120 }], 60, "top"), 0,
    "a picture too small to print at pull 60 leaves nothing behind");
  assert.equal(placed([], 240, "top"), 0);
  // And the ordinary case is still content.
  assert.ok(placed(CHEER_ITEMS, 240, "top") > 0);
  assert.ok(placed([{ kind: "pic", url: PIC, width: 120 }], 240, "top") > 0);
});

// ── EMISSION ORDER ──────────────────────────────────────────────────────────

test("every <text> is emitted before every <foreignObject>, whatever the stack order", () => {
  // <foreignObject> is an HTML integration point: the parser switches to HTML inside it
  // and never cleanly returns, so any SVG sibling that FOLLOWS it is silently never
  // drawn. Measured on the real engine — with the picture first, the text printed as
  // zero ink. Layout is computed separately from emission precisely so a picture can be
  // third in the stack and last in the markup.
  const orders = [
    [{ kind: "pic", url: PIC, width: 120 }, L3[0], L3[1]],                       // pic first
    [L3[0], { kind: "pic", url: PIC, width: 120 }, L3[1]],                       // pic in the middle
    [L3[0], L3[1], { kind: "pic", url: PIC, width: 120 }],                       // pic last
    [{ kind: "pic", url: PIC, width: 120 }, L3[0], { kind: "pic", url: PIC, width: 120 }],
  ];
  for (const items of orders) {
    const html = C.buildTakeover({ items, anchor: "top", carrier: "embed", pullPt: 400, w: W });
    const g = geom(html);
    assert.ok(g.texts.length && g.pics.length, "expected both: " + html);
    assert.ok(Math.max(...g.texts.map((t) => t.at)) < Math.min(...g.pics.map((p) => p.at)),
      "a picture was emitted before text — the text will not print: " + html);
    // And the closing </g> is before the first picture too, not wrapped around it.
    assert.ok(html.indexOf("</g>") < 0 || html.indexOf("</g>") < html.indexOf("<foreignObject"));
  }
});

test("a picture third in the stack is still third in the stack", () => {
  // Emission reorders; layout must not. The picture sits between the two lines on paper
  // even though it is the last thing in the string.
  const items = [L3[0], L3[1], { kind: "pic", url: PIC, width: 120 }];
  const g = geom(C.buildTakeover({ items, anchor: "top", carrier: "embed", pullPt: 400, w: W }));
  assert.ok(g.pics[0].y > g.texts[1].y, "the picture should be BELOW both lines on paper");
  assert.ok(g.pics[0].at > g.texts[1].at, "and AFTER them in the markup");
});

// ── NORMALISATION, ESCAPING, CARRIERS ───────────────────────────────────────

test("an item that would draw nothing costs nothing", () => {
  // A blank line still buys a real <text> element (63 chars of a 500-char budget) plus
  // a layout slot; an empty picture buys a ~90-char frame.
  const html = C.buildTakeover({ carrier: "embed", pullPt: 220, w: W, items: [
    { kind: "text", text: "" }, { kind: "text", text: "   " }, { kind: "text", text: "\t" },
    { kind: "text", text: null }, { kind: "pic", url: "" }, { kind: "pic" }, null,
    { kind: "text", text: "ONLY", size: 20 }] });
  assert.equal((html.match(/<text/g) || []).length, 1, "one drawable item in, one out: " + html);
  assert.ok(!/foreignObject/.test(html), "an empty picture must not buy a frame: " + html);
  // A dropped blank must not take a layout slot either — the survivor sits where it
  // would if it were alone.
  assert.equal(html, C.buildTakeover({ carrier: "embed", pullPt: 220, w: W,
    items: [{ kind: "text", text: "ONLY", size: 20 }] }));
});

test("item text is escaped and newline-free — it lands inside SVG markup", () => {
  const html = C.buildTakeover({ pullPt: 220, w: W, items: [
    { kind: "text", text: '</text><script>x</script>&"', size: 20 },
    { kind: "text", text: "a\nb", size: 20 }] });
  assert.ok(html.indexOf("<script") < 0, "passed a raw tag through: " + html);
  assert.ok(html.indexOf("&lt;/text&gt;") >= 0, "should escape the closing tag: " + html);
  assert.ok(/&amp;/.test(html), "should escape the ampersand");
  assert.ok(!/[\r\n]/.test(html), "a newline reached the payload");
  assert.ok(html.indexOf(">a b<") >= 0, "a newline should collapse to a space: " + html);
  // A crafted URL cannot break out of the attribute either.
  const u = C.buildTakeover({ carrier: "embed", anchor: "top", pullPt: 220, w: W,
    items: [{ kind: "pic", url: 'https://x.test/p.png" onload="x', width: 120 }] });
  assert.ok(u.indexOf('onload="x') < 0, "a quote escaped the attribute: " + u);
});

test("sizes are clamped the same way lines are", () => {
  for (const [size, want] of [[0, 20], [NaN, 20], [undefined, 20], [-40, 8], [999, 48]]) {
    const html = C.buildTakeover({ items: [{ kind: "text", text: "X", size }], pullPt: 400, w: W });
    assert.equal(Number((html.match(/font-size="(\d+)"/) || [])[1]), want, "size " + size);
  }
});

test("a picture rides the carrier table, per item, and never a blocked tag", () => {
  for (const id of C.EMBEDS.filter((e) => !e.blocked).map((e) => e.id)) {
    const h = C.buildTakeover({ items: CHEER_ITEMS, anchor: "top", carrier: id, pullPt: 220, w: W });
    assert.ok(h.indexOf("<image") < 0 && h.indexOf("<img") < 0, id + " leaked a blocked tag: " + h);
  }
  // An item may override the block's pick — two pictures, two carriers.
  const mixed = C.buildTakeover({ carrier: "embed", anchor: "top", pullPt: 400, w: W, items: [
    { kind: "pic", url: PIC, width: 120 },
    { kind: "pic", url: PIC, width: 120, carrier: "input" }] });
  assert.ok(mixed.indexOf("<embed") >= 0 && mixed.indexOf("<input") >= 0,
    "a per-item carrier should override the block default: " + mixed);
  // The framed saving still applies inside the item path's foreignObject.
  assert.ok(!/max-width:100%/.test(mixed), "the framed picture should not clamp");
});

test("a picture's drawn height is its width unless the caller probed a real aspect", () => {
  const sq = geom(C.buildTakeover({ items: [{ kind: "pic", url: PIC, width: 140 }],
                                    anchor: "top", carrier: "embed", pullPt: 400, w: W })).pics[0];
  assert.equal(sq.h, 140, "square is the default — a profile picture is square");
  const tall = geom(C.buildTakeover({ items: [{ kind: "pic", url: PIC, width: 100, height: 175 }],
                                      anchor: "top", carrier: "embed", pullPt: 400, w: W })).pics[0];
  assert.equal(tall.h, 175, "a probed aspect must win");
  // And it is the DRAWN height that drives the stack, not the width.
  const g = geom(C.buildTakeover({ anchor: "top", carrier: "embed", pullPt: 400, w: W,
    items: [{ kind: "pic", url: PIC, width: 100, height: 175 }, L3[0]] }));
  assert.equal(g.texts[0].y, g.pics[0].y + 175 + C.CHEER_GAP_PX + g.texts[0].size);
  assert.equal(g.pics[0].h, 175, "the 100px width must not be what the stack advances by");
});

test("an absurd dimension can't emit Infinity into the markup", () => {
  for (const width of [Infinity, 1e308, NaN, -5]) {
    const h = C.buildTakeover({ items: [{ kind: "pic", url: PIC, width }], anchor: "top",
                                carrier: "embed", pullPt: 220, w: W });
    assert.ok(!/Infinity|NaN/.test(h), "width " + width + " emitted junk: " + h.slice(0, 160));
  }
  for (const w of [Infinity, 1e308]) {
    const h = C.buildTakeover({ items: L3, w, pullPt: 220 });
    assert.ok(!/Infinity|NaN/.test(h), "paper width " + w + " emitted junk: " + h.slice(0, 160));
  }
});

// ── REPORTING ───────────────────────────────────────────────────────────────

test("takeoverReport still reads the markup, and now counts pictures", () => {
  // Deliberately parses the output instead of re-deriving the layout: a second copy of
  // the geometry is the drift that put the picture on top of the text in the first place.
  const two = [{ kind: "pic", url: PIC, width: 120 }, L3[0],
               { kind: "pic", url: PIC, width: 120 }];
  const html = C.buildTakeover({ items: two, anchor: "top", carrier: "embed", pullPt: 400, w: W });
  let r = C.takeoverReport(html, 1, 2);
  assert.equal(r.linesDrawn, 1);
  assert.equal(r.picturesDrawn, 2);
  assert.equal(r.picturesWanted, 2);
  assert.equal(r.pictureDrawn, true);
  assert.equal(r.pictureWanted, true);
  // The old boolean shape still works — the existing card reads it.
  r = C.takeoverReport(html, 1, true);
  assert.equal(r.picturesWanted, 1);
  assert.equal(r.pictureWanted, true);
  r = C.takeoverReport("<rect/>", 3, false);
  assert.equal(r.picturesDrawn, 0);
  assert.equal(r.pictureDrawn, false);
  assert.equal(r.pictureWanted, false);
  // A dropped item shows up as drawn < wanted, which is what the UI has to explain.
  const squeezed = C.buildTakeover({ anchor: "top", carrier: "embed", pullPt: 60, w: W,
    items: [48, 48, 48].map((size, i) => ({ kind: "text", text: "L" + i, size })) });
  assert.ok(C.takeoverReport(squeezed, 3, 0).linesDrawn < 3, "expected lines to be dropped");
});

test("takeoverWants counts what was asked for, off the item list", () => {
  eq(C.takeoverWants(CHEER_ITEMS), { lines: 3, pictures: 1 });
  eq(C.takeoverWants([{ kind: "text", text: " " }, { kind: "pic", url: "" }]), { lines: 0, pictures: 0 },
    "an item that would draw nothing was never wanted");
  eq(C.takeoverWants([]), { lines: 0, pictures: 0 });
  eq(C.takeoverWants(undefined), { lines: 0, pictures: 0 });
});

// ── BUDGET ──────────────────────────────────────────────────────────────────

test("an item stack still fits one cheer", () => {
  // Emitted markup is money: Twitch REJECTS an over-length message rather than
  // truncating it, and a takeover is one SVG that cannot be split.
  const uploaded = "https://receipt.uwutoowo.com/a1b2c3d4e5f6.png";
  const html = C.buildTakeover({ anchor: "top", carrier: "embed", pullPt: 220, w: W,
    items: [{ kind: "pic", url: uploaded, width: 120 },
            { kind: "text", text: "-100000 BITS", size: 24, fmt: F(900, false) },
            { kind: "text", text: "IRS", size: 19, fmt: F(700, false) },
            { kind: "text", text: "tax lien", size: 13, fmt: F(400, true) }] });
  assert.ok(C.payloadLength(html) + 12 <= C.MAX_CHARS,
    "the seeded arrangement no longer fits one cheer (" + (C.payloadLength(html) + 12) + ")");
  // And it costs exactly what the fake cheer costs — the item path adds no overhead.
  assert.equal(C.payloadLength(html),
    C.payloadLength(C.buildFakeCheer({ bits: "-100000 BITS", name: "IRS", note: "tax lien",
      avatar: uploaded, carrier: "embed", pullPt: 220, w: W })));
});

// ── THE SEED ────────────────────────────────────────────────────────────────

test("the seeded fake donation draws exactly what 0.4.2's fake cheer drew", () => {
  // `Seed fake donation` is what replaced the Blank / Fake-cheer selector, so the thing it
  // has to be is the fake cheer — not approximately, in bytes. It carries NO nudges, which
  // is only correct because the fake cheer's arrangement IS the item engine's leading rule;
  // the day that stops being true this fails here rather than on the owner's roll.
  //
  // Swept across the pulls the default has ever been plus one above it, because the top
  // anchor's lift cap only engages above the default and that is where a layout claim is
  // easiest to get wrong.
  const seed = C.takeoverSeed();
  assert.equal(seed.anchor, "top", "the bot's own header sits at the top, and so must this");
  for (const pullPt of [220, 240, 300]) {
    const items = seed.items.map((it) => (it.kind === "pic" ? { ...it, url: PIC } : it));
    assert.ok(items.every((it) => it.nudge === undefined), "a seeded item must not need a nudge");
    assert.equal(
      C.buildTakeover({ items, anchor: seed.anchor, carrier: "embed", pullPt, w: W }),
      C.buildFakeCheer({ bits: "-100000 BITS", name: "IRS", note: "tax lien",
        avatar: PIC, avatarW: 120, sizes: { bits: 24, name: 19, note: 13 },
        carrier: "embed", pullPt, w: W }),
      "the seed stopped being byte-identical to the fake cheer at pullPt " + pullPt);
  }
});

test("a seeded picture with no url costs nothing until it is filled in", () => {
  // The picture row is seeded EMPTY on purpose — it shows where the avatar goes. An empty
  // one must be dropped rather than emitted as a ~90-character frame around nothing, and it
  // must not be counted as a picture the layout failed to fit (which is what the card's
  // drop note reads).
  const seed = C.takeoverSeed();
  const html = C.buildTakeover({ items: seed.items, anchor: seed.anchor,
                                 carrier: "embed", pullPt: 240, w: W });
  assert.equal(html.indexOf("foreignObject"), -1, "an empty picture must not reach the markup");
  eq(C.takeoverWants(seed.items), { lines: 3, pictures: 0 });
});

// ── takeoverPlace, DIRECTLY ─────────────────────────────────────────────────

test("takeoverPlace answers geometry only, in stack order", () => {
  // Stage 2 and 3 read this to price and explain a stack without re-deriving anything.
  const items = C.takeoverItems(CHEER_ITEMS, "embed");
  const placed = C.takeoverPlace(items, C.takeoverBox(220), "top", W);
  eq(placed.map((p) => [p.kind, p.y]), [["pic", 6], ["text", 182], ["text", 214], ["text", 240]],
    "placements must come back in STACK order, picture first");
});
