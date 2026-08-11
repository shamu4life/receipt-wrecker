// THE TWO STYLES BECOME ONE ITEM LIST.
//
// A takeover is calibrated against a physical printer: the owner tuned the pull on the
// rig, and every baseline hangs off that number. So the bar for this migration is not
// "it looks about the same", it is THE SAME BYTES — anything else is a re-tune nobody
// asked for, discovered on paper, mid-stream.
//
// The old renderer is the reference throughout. `legacy()` below is 0.4.2's
// renderBlockBodies transcribed, deliberately not a call into any helper the migration
// also uses: this file has to be able to catch the migration and the thing it is
// migrating from agreeing with each other and both being wrong.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";
const C = loadCore();

const W = 263;                                  // PAPER_PX, what the composer passes
const PIC = "https://x.test/p.png";

// 0.4.2's renderBlockBodies, transcribed.
function legacy(b) {
  if (b.tkStyle === "cheer") {
    return C.buildFakeCheer({
      bits: b.cBits, name: b.cName, note: b.cNote, avatar: b.avatar, avatarW: b.avatarW,
      sizes: { bits: b.s1, name: b.s2, note: b.s3 },
      fmts: { bits: b.f1, name: b.f2, note: b.f3 },
      carrier: b.renderAs, pullPt: b.pullPt, w: W });
  }
  return C.buildTakeover({
    lines: [{ text: b.l1, size: b.s1, fmt: C.lineFmt(b.f1, 900, false) },
            { text: b.l2, size: b.s2, fmt: C.lineFmt(b.f2, 700, false) },
            { text: b.l3, size: b.s3, fmt: C.lineFmt(b.f3, 400, true) }],
    picture: b.picture, pictureW: b.pictureW,
    pictureH: Math.round((b.pictureW || 120) * 1.4),
    carrier: b.renderAs, pullPt: b.pullPt, w: W });
}
// 0.4.2 welded " BITS" onto the bare figure at render time. That is the one deliberate
// behaviour change here, and it is a change to WHERE the suffix comes from, not to what
// prints — so the reference is fed the baked string and must draw exactly what it drew.
const asShipped = (b) =>
  legacy(b.tkStyle === "cheer" ? { ...b, cBits: C.takeoverAmountText(b.cBits) } : b);

const migrate = (b) => C.migrateTakeoverItems({ ...b });
const draw = (b) => C.buildTakeover({ items: b.items, anchor: b.anchor,
                                      carrier: b.renderAs, pullPt: b.pullPt, w: W });
const after = (b) => draw(migrate(b));

function geom(html) {
  const texts = [...html.matchAll(/<text x="(-?\d+)" y="(-?\d+)" font-size="(\d+)"([^>]*)>([^<]*)</g)]
    .map((m) => ({ x: +m[1], y: +m[2], size: +m[3], text: m[5] }));
  const pics = [...html.matchAll(/<foreignObject x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
  return { texts, pics };
}

const BLOCK = { type: "takeover", renderAs: "embed", pullV: C.TAKEOVER_PULL_V,
                s1: 24, s2: 19, s3: 13 };
const blank = (o) => ({ ...BLOCK, tkStyle: "blank", l1: "TAX LIEN", l2: "ASSESSED",
                        l3: "please remit", pullPt: 220, ...o });
const cheer = (o) => ({ ...BLOCK, tkStyle: "cheer", cBits: "-100000", cName: "IRS",
                        cNote: "tax lien", avatarW: C.CHEER_AVATAR_W, pullPt: 220, ...o });

// Pulls that matter: the slider's ends, the two defaults this app has shipped, and
// ABOVE the default — where the fake cheer's lift cap starts binding and where a
// migration that re-derived the geometry instead of copying it would come apart.
const PULLS = [100, 150, 200, 220, 240, 260, 300, 400];

// EXACTLY THREE THINGS may legitimately change, each pinned by its own test further
// down. Everything else must be the same bytes. The byte matrices below assert this
// precondition instead of quietly skipping, so a fourth kind of difference cannot hide
// inside them by being mistaken for one of these.
function exceptional(b) {
  const g = geom(asShipped(b)), h = C.takeoverBox(b.pullPt).h;
  if (g.texts.some((t) => t.y - t.size < 0 || t.y + Math.round(t.size * 0.3) > h)
      || g.pics.some((p) => p.y < 0 || p.y + p.h > h)) return "drew outside the cover";
  if (g.texts.length === 1) return "one centred line";
  if (g.pics.some((p) => p.w % 2)) return "odd picture width";
  return "";
}

// ── THE BAR: SAME BYTES ─────────────────────────────────────────────────────

test("a migrated BLANK takeover emits byte-identical markup", () => {
  let checked = 0;
  for (const pullPt of PULLS) {
    for (const picture of ["", PIC]) {
      for (const pictureW of [120, 200, 240]) {
        for (const [s1, s2, s3] of [[24, 19, 13], [20, 20, 20], [13, 19, 24], [8, 12, 10]]) {
          const b = blank({ pullPt, picture, pictureW, s1, s2, s3 });
          if (exceptional(b)) continue;
          checked++;
          assert.equal(after(b), asShipped(b),
            "blank moved at pull " + pullPt + " sizes " + [s1, s2, s3] + (picture ? " +pic" : ""));
        }
      }
    }
  }
  assert.ok(checked > 100, "the blank matrix shrank to " + checked + " real comparisons");
});

test("a migrated FAKE CHEER emits byte-identical markup", () => {
  let checked = 0;
  for (const pullPt of PULLS) {
    for (const avatar of ["", PIC]) {
      for (const avatarW of [120, 160, 200]) {
        for (const [s1, s2, s3] of [[24, 19, 13], [20, 20, 20], [48, 48, 48]]) {
          const b = cheer({ pullPt, avatar, avatarW, s1, s2, s3 });
          if (exceptional(b)) continue;
          checked++;
          assert.equal(after(b), asShipped(b),
            "cheer moved at pull " + pullPt + " avatar " + avatarW + " sizes " + [s1, s2, s3]);
        }
      }
    }
  }
  assert.ok(checked > 80, "the cheer matrix shrank to " + checked + " real comparisons");
  // Above the default the lift cap is what holds the fake cheer in place, so make sure
  // those pulls really are in the matrix and really are producing a picture.
  const high = cheer({ pullPt: 400, avatar: PIC });
  assert.ok(/foreignObject/.test(after(high)) && after(high) === asShipped(high));
});

test("byte-identical with formatting on, which is where the payload budget lives", () => {
  const f = { font: "black", weight: 400, italic: true, underline: true, strike: true };
  for (const pullPt of [220, 240, 300]) {
    for (const style of ["blank", "cheer"]) {
      const b = style === "blank" ? blank({ pullPt, picture: PIC, pictureW: 120, f1: f, f3: { font: "mono" } })
                                  : cheer({ pullPt, avatar: PIC, f1: f, f3: { font: "mono" } });
      assert.equal(exceptional(b), "", style + " picked an exceptional case at pull " + pullPt);
      assert.equal(after(b), asShipped(b), style + " formatting moved at pull " + pullPt);
      assert.equal(C.payloadLength(after(b)), C.payloadLength(asShipped(b)));
    }
  }
});

test("byte-identical for the partly-filled blocks, including the empty one", () => {
  const sets = [
    blank({ l1: "ONLY", l2: "", l3: "" }), blank({ l1: "", l2: "MID", l3: "" }),
    blank({ l1: "A", l2: "", l3: "C" }), blank({ l1: "", l2: "", l3: "" }),
    blank({ l1: "", l2: "", l3: "", picture: PIC, pictureW: 120 }),
    cheer({ cBits: "42", cName: "", cNote: "" }), cheer({ cBits: "", cName: "IRS", cNote: "" }),
    cheer({ cBits: "", cName: "", cNote: "" }),
    cheer({ cBits: "", cName: "", cNote: "", avatar: PIC }),
  ];
  let checked = 0;
  for (const b of sets) {
    if (exceptional(b)) continue;
    checked++;
    assert.equal(after(b), asShipped(b), "moved: " + JSON.stringify(b));
  }
  assert.ok(checked >= 5, "only " + checked + " of these were real comparisons");
});

// ── THE WHOLE REACHABLE SPACE, AS GEOMETRY ──────────────────────────────────

test("across every reachable setting, no item ever lands anywhere new", () => {
  // The sweep the byte tests above can't be: both styles, every pull stop that matters,
  // every picture width including the odd ones, and the size combinations that break
  // the box. The claim is narrower than byte-identity and holds EVERYWHERE — every item
  // the migrated overlay draws sits on the same baseline, in the same order, at the same
  // drawn size as the one the old renderer drew; the only ones missing are the ones the
  // old renderer put outside the cover, which is the item model's stated rule.
  let cases = 0, dropped = 0, exceptions = 0;
  for (const pullPt of [60, 100, 150, 160, 220, 240, 300, 400]) {
    const boxH = C.takeoverBox(pullPt).h;
    const inT = (t) => t.y - t.size >= 0 && t.y + Math.round(t.size * 0.3) <= boxH;
    const inP = (p) => p.y >= 0 && p.y + p.h <= boxH;
    const blocks = [];
    for (const w of [120, 125, 200, 240]) {
      for (const [s1, s2, s3] of [[24, 19, 13], [20, 20, 20], [48, 48, 48], [8, 48, 8]]) {
        for (const l of [["A", "B", "C"], ["ONLY", "", ""], ["", "B", "C"]]) {
          blocks.push(blank({ pullPt, pictureW: w, picture: PIC, s1, s2, s3, l1: l[0], l2: l[1], l3: l[2] }));
          blocks.push(blank({ pullPt, picture: "", s1, s2, s3, l1: l[0], l2: l[1], l3: l[2] }));
          blocks.push(cheer({ pullPt, avatarW: w, avatar: PIC, s1, s2, s3,
                              cBits: l[0], cName: l[1], cNote: l[2] }));
          blocks.push(cheer({ pullPt, avatar: "", s1, s2, s3,
                              cBits: l[0], cName: l[1], cNote: l[2] }));
        }
      }
    }
    for (const b of blocks) {
      cases++;
      // AND NO FOURTH REASON. Bytes may only differ where one of the three pinned
      // exceptions applies — this is what stops a new divergence from being waved
      // through as "close enough" by the geometry checks below.
      if (after(b) !== asShipped(b)) {
        assert.notEqual(exceptional(b), "", "unexplained byte change: " + JSON.stringify(b)
          + "\n was " + asShipped(b) + "\n now " + after(b));
        exceptions++;
      }
      const was = geom(asShipped(b)), now = geom(after(b));
      const keptT = was.texts.filter(inT), keptP = was.pics.filter(inP);
      dropped += (was.texts.length - keptT.length) + (was.pics.length - keptP.length);
      const why = " at pull " + pullPt + " " + JSON.stringify(b);
      eq(now.texts.map((t) => [t.text, t.y, t.size]),
         keptT.map((t) => [t.text, t.y, t.size]), "text moved" + why);
      eq(now.texts.map((t) => t.x), keptT.map((t) => t.x), "text x moved" + why);
      eq(now.pics.map((p) => [p.y, p.w, p.h]),
         keptP.map((p) => [p.y, p.w, p.h]), "picture moved or resized" + why);
      // x within a pixel — the centring rounding, pinned exactly in its own test below.
      for (let i = 0; i < keptP.length; i++) {
        assert.ok(Math.abs(now.pics[i].x - keptP[i].x) <= 1, "picture x moved" + why);
      }
    }
  }
  assert.ok(cases > 1000, "the sweep shrank to " + cases + " cases");
  assert.ok(dropped > 0, "the sweep no longer reaches the overflow cases it exists to cover");
  // This matrix leans deliberately on the nasty end — 48px stacks in short covers, odd
  // widths, single lines — so a high exception count here is the point, not a warning.
  // What matters is that plenty of ordinary cases are still being compared byte for byte.
  assert.ok(exceptions > 0, "the sweep stopped reaching the three known exceptions");
  assert.ok(cases - exceptions > 500,
    "only " + (cases - exceptions) + " of " + cases + " cases came out byte-identical");
});

// ── THE THREE DELIBERATE DIVERGENCES, EACH PINNED ───────────────────────────

test("what the old renderer drew OUTSIDE the cover is dropped, not carried over", () => {
  // The blank style stacked upward from the bottom with no top clamp at all, so a tall
  // stack in a short cover printed straight over the header the block exists to paint
  // out. The item model's rule is the opposite and it is the right one: an item that
  // doesn't fit is dropped, because outside the box it either gets clipped by the
  // viewport (paid for, never printed) or lands on the header.
  const b = blank({ pullPt: 60, s1: 24, s2: 19, s3: 13 });
  const was = geom(asShipped(b)), now = geom(after(b));
  assert.equal(was.texts.length, 3);
  assert.ok(was.texts[0].y - was.texts[0].size < 0, "expected the old top line above the cover");
  assert.equal(now.texts.length, 2, "the two that fit must survive: " + after(b));
  eq(now.texts.map((t) => t.y), was.texts.slice(1).map((t) => t.y), "the survivors moved");
  assert.ok(C.payloadLength(after(b)) < C.payloadLength(asShipped(b)),
    "dropping ink that never printed should also stop charging for it");
});

test("one centred line stops paying for a <g>, and that is the only difference", () => {
  // takeoverEmit states `middle` once in a group from the SECOND centred item on, and
  // spells it out on the item when there is only one, because the group is 31 characters
  // and the attribute is 21. The old renderer always grouped. Same pixels, cheaper
  // payload — and a takeover runs within single digits of Twitch's 500.
  const b = blank({ l1: "ONLY", l2: "", l3: "" });
  const was = asShipped(b), now = after(b);
  assert.notEqual(now, was);
  eq(geom(now).texts, geom(was).texts.map((t) => ({ ...t })), "the line moved, which it must not");
  assert.equal(now, was.replace('<g text-anchor="middle">', "").replace("</g>", "")
                       .replace(/font-size="(\d+)"/, 'font-size="$1" text-anchor="middle"'),
    "the only change may be the group -> inline anchor swap");
  assert.ok(C.payloadLength(now) < C.payloadLength(was), "the swap must be a saving");
});

test("an ODD picture width lands one pixel left, because it is now actually centred", () => {
  // The old renderer centred on Math.round(W/2), which for a 263px tape is half a pixel
  // right of centre, so an odd-width picture came out asymmetric. The item engine uses
  // (W - w) / 2 and is symmetric. Bounded at one pixel, same number of digits and so the
  // same payload length, and it is the new engine that is correct — pinned here so it
  // stays a known rounding fix rather than becoming an unexplained drift.
  const b = blank({ picture: PIC, pictureW: 125, l1: "A", l2: "B", l3: "C" });
  const was = geom(asShipped(b)).pics[0], now = geom(after(b)).pics[0];
  assert.equal(now.y, was.y);
  assert.equal(now.w, was.w);
  assert.equal(now.x, was.x - 1);
  assert.equal(W - (now.x + now.w), now.x, "the new position must be truly centred");
  assert.equal(C.payloadLength(after(b)), C.payloadLength(asShipped(b)));
});

// ── " BITS" IS BAKED IN, ONCE ───────────────────────────────────────────────

test("the amount line becomes ordinary free text carrying its own suffix", () => {
  const items = C.takeoverItemsForBlock(cheer({ cBits: "-100000", avatar: PIC })).items;
  const amount = items.filter((i) => i.kind === "text")[0];
  assert.equal(amount.text, "-100000 BITS", "the suffix must be baked into the item");
  // And then nothing appends anything ever again: the migrated item is what prints.
  assert.ok(after(cheer({ cBits: "-100000" })).indexOf(">-100000 BITS<") >= 0);
  // Which is the point — the same printer-bot runs on YouTube and Kick.
  for (const amt of ["$50.00", "1,000 Kicks", "¥500"]) {
    const b = { ...cheer({ cBits: amt }), tkV: undefined };
    const migrated = C.migrateTakeoverItems({ ...b });
    assert.equal(migrated.items.filter((i) => i.kind === "text")[0].text, amt + " BITS");
    // ...and once it is an item, editing it to anything at all just works.
    migrated.items[0].text = amt;
    assert.ok(draw(migrated).indexOf(">" + amt + "<") >= 0, amt + " didn't survive as free text");
    assert.ok(draw(migrated).indexOf("BITS") < 0, "something is still appending a suffix");
  }
  assert.equal(C.takeoverAmountText(""), "", "an empty amount must not become a bare suffix");
  assert.equal(C.takeoverAmountText("  42  "), "42 BITS", "surrounding space is not part of it");
  assert.equal(C.CHEER_SUFFIX, undefined, "the constant should be gone, not just unused");
});

// ── THE MIGRATION ITSELF ────────────────────────────────────────────────────

test("blank anchors bottom, fake cheer anchors top", () => {
  assert.equal(migrate(blank({})).anchor, "bottom");
  assert.equal(migrate(cheer({})).anchor, "top");
  // The item order is the reading order either way: picture first, then the lines.
  eq(migrate(cheer({ avatar: PIC })).items.map((i) => i.kind), ["pic", "text", "text", "text"]);
  eq(migrate(blank({ picture: PIC })).items.map((i) => i.kind), ["pic", "text", "text", "text"]);
  eq(migrate(blank({ picture: PIC })).items.map((i) => i.text || i.url),
     [PIC, "TAX LIEN", "ASSESSED", "please remit"]);
  // Sizes and formatting come across materialised, exactly as the slots had them.
  eq(migrate(cheer({})).items.map((i) => [i.size, i.fmt.weight, i.fmt.italic]),
     [[24, 900, false], [19, 700, false], [13, 400, true]]);
});

test("it runs once, is stamped, and is idempotent", () => {
  const b = migrate(blank({ picture: PIC }));
  assert.equal(b.tkV, C.TAKEOVER_ITEMS_V, "unstamped migrations run on every load");
  const again = C.migrateTakeoverItems(JSON.parse(JSON.stringify(b)));
  eq(again.items, JSON.parse(JSON.stringify(b.items)), "a second pass changed the items");
  assert.equal(draw(again), draw(b));
  // Nudges in particular must not accumulate — they are the whole reason nothing moved.
  const twice = C.migrateTakeoverItems(C.migrateTakeoverItems({ ...blank({ picture: PIC }) }));
  assert.equal(draw(twice), asShipped(blank({ picture: PIC })));
});

test("a block that already carries items is stamped and otherwise left alone", () => {
  // Someone who has used the item card has data the old fields no longer describe;
  // rebuilding from them would silently delete it.
  const b = { type: "takeover", renderAs: "embed", pullPt: 220, pullV: C.TAKEOVER_PULL_V,
              anchor: "centre", items: [{ kind: "text", text: "MINE", size: 30 }],
              tkStyle: "blank", l1: "STALE", s1: 24 };
  const m = C.migrateTakeoverItems(b);
  eq(m.items, [{ kind: "text", text: "MINE", size: 30 }]);
  assert.equal(m.anchor, "centre", "an existing anchor must not be overwritten");
  assert.equal(m.tkV, C.TAKEOVER_ITEMS_V);
  assert.ok(draw(m).indexOf(">MINE<") >= 0 && draw(m).indexOf("STALE") < 0);
});

test("it leaves everything that isn't a takeover alone", () => {
  for (const b of [{ type: "text", text: "HI" }, { type: "image", url: PIC }]) {
    const m = C.migrateTakeoverItems({ ...b });
    eq(m, b, "a " + b.type + " block was touched");
  }
});

test("the pull migration and this one compose in EITHER order", () => {
  // migrateTakeoverPull moves a block that is still sitting on a shipped default onto
  // the current one, and these nudges are measured AT THE BLOCK'S PULL — a blank
  // takeover's picture sat at a fixed y while its text hung off the bottom of the cover,
  // so the gap between them is not the same at 220 as at 240. Run this one first without
  // the pull settled and that gap freezes at the wrong number.
  const saved = () => ({ ...blank({ picture: PIC, pictureW: 120 }), pullPt: 220, pullV: 2 });
  const a = C.migrateTakeoverItems(C.migrateTakeoverPull(saved()));
  const b = C.migrateTakeoverPull(C.migrateTakeoverItems(saved()));
  eq(b.items, JSON.parse(JSON.stringify(a.items)), "order changed the item list");
  assert.equal(a.pullPt, C.TAKEOVER_PULL_PT);
  assert.equal(b.pullPt, C.TAKEOVER_PULL_PT, "the items migration must settle the pull first");
  assert.equal(draw(a), draw(b));
  // ...and the result is byte-identical to what that block draws at the pull it has NOW,
  // which is the pull migration's own deliberate change and not this one's to undo.
  assert.equal(draw(a), asShipped({ ...saved(), pullPt: C.TAKEOVER_PULL_PT }));
  // The pull rule itself is untouched by any of this.
  assert.equal(C.TAKEOVER_PULL_V, 3);
});
