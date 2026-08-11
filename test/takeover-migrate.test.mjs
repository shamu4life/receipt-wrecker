// THE TWO STYLES BECOME ONE ITEM LIST.
//
// A takeover is calibrated against a physical printer: the owner tuned the pull on the
// rig, and every baseline hangs off that number. So the bar for this migration is not
// "it looks about the same", it is THE SAME BYTES — anything else is a re-tune nobody
// asked for, discovered on paper, mid-stream.
//
// TWO REFERENCES HERE, AND THEY DO DIFFERENT JOBS. READ THIS BEFORE TRUSTING A GREEN RUN.
//
// `legacy()` below is 0.4.2's renderBlockBodies transcribed, and it drives the matrices:
// it is what makes "every reachable setting, both styles, every pull stop" affordable.
// It is NOT an independent oracle. It calls buildFakeCheer / buildTakeover out of the
// build under test — the same two functions the migration's own oracle (takeoverLegacyHtml)
// calls — so moving a legacy baseline moves both sides together and every matrix in this
// file stays green. Measured, not assumed: `pullPx - 24` -> `- 27` in buildTakeover (the
// bottom baseline every migrated blank block hangs off) and `pullPx * 0.5` -> `* 0.4` in
// buildFakeCheer (the placement of every avatar-less fake cheer) each left the whole suite
// passing while this file claimed to be catching exactly that.
//
// So the real bar is GOLD_042: strings captured from the 0.4.2 tag and pasted in as
// literals. Nothing in this build produced them, so nothing in this build can move them —
// they are the only thing here that can catch the migration and the thing it is migrating
// from agreeing with each other and both being wrong. Both sides are asserted against
// them, the oracle as well as the migration.
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

// ── THE BAR: THE BYTES 0.4.2 ACTUALLY DREW ──────────────────────────────────

// Captured by running the 0.4.2 tag's own renderBlockBodies (`git show 247bb4a:public/
// index.html`) over the four blocks named here — one blank with a picture, one blank
// text-only, one fake cheer with an avatar, one without. They cover the two places the
// matrices below cannot see past their shared helpers: the blank style's bottom baseline
// (`pullPx - 24`) and the avatar-less fake cheer's mid-cover placement (`pullPx * 0.5`).
//
// PASTED LITERALS ON PURPOSE. Regenerating them from this build would defeat the whole
// point. Regenerate them ONLY from the tag, and only alongside a deliberate divergence —
// which belongs next to the three pinned exceptions below, with its own test, not here.
const GOLD_042 = [
  ["blank, picture + three lines, pull 220",
   blank({ picture: PIC, pictureW: 120 }),
   '<svg width="263" height="333" style="margin-top:-220pt"><rect width="263" height="333" fill="#fff"/><g text-anchor="middle"><text x="132" y="225" font-size="24" font-weight="900">TAX LIEN</text><text x="132" y="251" font-size="19" font-weight="700">ASSESSED</text><text x="132" y="269" font-size="13" font-style="italic">please remit</text></g><foreignObject x="72" y="6" width="120" height="168"><embed src="https://x.test/p.png" width="120"></foreignObject></svg>'],
  ["blank, three lines, no picture, pull 240",
   blank({ pullPt: 240 }),
   '<svg width="263" height="360" style="margin-top:-240pt"><rect width="263" height="360" fill="#fff"/><g text-anchor="middle"><text x="132" y="252" font-size="24" font-weight="900">TAX LIEN</text><text x="132" y="278" font-size="19" font-weight="700">ASSESSED</text><text x="132" y="296" font-size="13" font-style="italic">please remit</text></g></svg>'],
  ["fake cheer with an avatar, pull 240",
   cheer({ pullPt: 240, avatar: PIC }),
   '<svg width="263" height="360" style="margin-top:-240pt"><rect width="263" height="360" fill="#fff"/><g text-anchor="middle"><text x="132" y="182" font-size="24" font-weight="900">-100000 BITS</text><text x="132" y="214" font-size="19" font-weight="700">IRS</text><text x="132" y="240" font-size="13" font-style="italic">tax lien</text></g><foreignObject x="72" y="6" width="120" height="120"><embed src="https://x.test/p.png" width="120"></foreignObject></svg>'],
  ["fake cheer with no avatar, pull 240",
   cheer({ pullPt: 240 }),
   '<svg width="263" height="360" style="margin-top:-240pt"><rect width="263" height="360" fill="#fff"/><g text-anchor="middle"><text x="132" y="160" font-size="24" font-weight="900">-100000 BITS</text><text x="132" y="192" font-size="19" font-weight="700">IRS</text><text x="132" y="218" font-size="13" font-style="italic">tax lien</text></g></svg>'],
];

test("byte-for-byte against markup captured from the 0.4.2 tag", () => {
  for (const [what, b, gold] of GOLD_042) {
    // Both sides, because either one drifting is the failure. asShipped() is this file's
    // in-build reference and after() is the migration; a change that moves them together
    // is invisible to every other test here and visible to this one.
    assert.equal(asShipped(b), gold, "the in-build reference drifted from 0.4.2: " + what);
    assert.equal(after(b), gold, "the migration drifted from 0.4.2: " + what);
  }
  assert.equal(GOLD_042.length, 4);
});

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
  // Each fixture states the category it is expected to be in, rather than being counted
  // and waved through: four of these are single-line cases, which is a pinned exception
  // with its own test below, and `checked >= 5` sat exactly on the five that were left.
  // Named this way, a fixture that silently changes category fails here instead.
  const sets = [
    [blank({ l1: "ONLY", l2: "", l3: "" }), "one centred line"],
    [blank({ l1: "", l2: "MID", l3: "" }), "one centred line"],
    [blank({ l1: "A", l2: "", l3: "C" }), ""],
    [blank({ l1: "", l2: "", l3: "" }), ""],
    [blank({ l1: "", l2: "", l3: "", picture: PIC, pictureW: 120 }), ""],
    [cheer({ cBits: "42", cName: "", cNote: "" }), "one centred line"],
    [cheer({ cBits: "", cName: "IRS", cNote: "" }), "one centred line"],
    [cheer({ cBits: "", cName: "", cNote: "" }), ""],
    [cheer({ cBits: "", cName: "", cNote: "", avatar: PIC }), ""],
  ];
  let checked = 0;
  for (const [b, why] of sets) {
    assert.equal(exceptional(b), why, "this fixture changed category: " + JSON.stringify(b));
    if (why) continue;
    checked++;
    assert.equal(after(b), asShipped(b), "moved: " + JSON.stringify(b));
  }
  assert.equal(checked, 5, "the byte-compared fixtures here changed count");
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

// ── WHAT THE MIGRATION LEAVES BEHIND: NUDGES ────────────────────────────────

const nudgeOf = (i) => (Object.prototype.hasOwnProperty.call(i, "nudge") ? i.nudge : 0);
const nudged = (i) => Object.prototype.hasOwnProperty.call(i, "nudge");

test("a fake cheer that drew its avatar is the one style that needs NO nudges", () => {
  // THE CANARY. That layout IS the item engine's — same leading rule, same gap, same
  // top — so a correct migration has nothing to correct, and every nudge computes to 0
  // and is deleted. Asserted as absent keys, which pins the zero-deletion rule too: a
  // stored `nudge: 0` reads like tuning that isn't, and stage 3's nudge control will
  // show it. If this test starts failing, the two layouts have drifted apart.
  const m = migrate(cheer({ pullPt: 240, avatar: PIC }));
  eq(m.items.map((i) => i.kind), ["pic", "text", "text", "text"]);
  for (const it of m.items) assert.ok(!nudged(it), "unexpected nudge: " + JSON.stringify(it));
  let pulls = 0;
  for (const pullPt of [160, 200, 220, 240, 260, 300, 400]) {
    const items = C.takeoverItemsForBlock(cheer({ pullPt, avatar: PIC })).items;
    assert.equal(items[0].kind, "pic", "the avatar should draw at pull " + pullPt);
    for (const it of items) assert.ok(!nudged(it), "nudge at pull " + pullPt + ": " + JSON.stringify(it));
    pulls++;
  }
  assert.equal(pulls, 7, "the pull stops this canary covers changed");
});

test("a fake cheer with NO avatar carries a large uniform nudge the owner never set", () => {
  // Not a defect, but not the canary either, and the report of this stage said the fake
  // cheer carried none at all. It does: with no picture to hang from, buildFakeCheer
  // parks the bare run mid-cover (max(top + first, pullPx * 0.5)) and the item engine has
  // no equivalent, so all three lines come across carrying the same offset. Migrated blank blocks
  // carry small per-line ones. Both are invisible to the owner and neither re-flows, so
  // the item card owes them a word when it grows a nudge control.
  eq(migrate(cheer({ pullPt: 240 })).items.map(nudgeOf), [130, 130, 130]);
  eq(migrate(blank({ pullPt: 240 })).items.map(nudgeOf), [14, 8, 0]);
  eq(migrate(blank({ pullPt: 240 })).items.map(nudged), [true, true, false]);
});

test("across the fake cheer's whole space the run stays rigid and no zero is stored", () => {
  // The shape of what migration leaves behind, swept rather than asserted on one block:
  // a text run always moves as a unit (one offset for all of it, which is what keeps a
  // nudge from becoming a second leading rule), the picture is never nudged at all, and
  // nothing is ever stored as 0. It also counts how many blocks come out clean, so the
  // canary above cannot quietly stop being the exception.
  let drawn = 0, clean = 0, noPic = 0;
  for (const pullPt of [60, 100, 150, 160, 200, 220, 240, 260, 300, 400]) {
    for (const avatarW of [120, 160, 200]) {
      for (const [s1, s2, s3] of [[24, 19, 13], [20, 20, 20], [48, 48, 48], [8, 12, 10]]) {
        for (const avatar of ["", PIC]) {
          const b = cheer({ pullPt, avatarW, avatar, s1, s2, s3 });
          const items = C.takeoverItemsForBlock(b).items;
          const texts = items.filter((i) => i.kind === "text");
          const pics = items.filter((i) => i.kind === "pic");
          const why = " at pull " + pullPt + " avatar " + avatarW + " sizes " + [s1, s2, s3];
          if (!texts.length) continue;
          for (const it of items) assert.ok(!nudged(it) || it.nudge !== 0, "stored a zero" + why);
          for (const t of texts) assert.equal(nudgeOf(t), nudgeOf(texts[0]), "the run split" + why);
          if (pics.length) {
            drawn++;
            assert.equal(nudgeOf(pics[0]), 0, "the picture was nudged" + why);
            if (!nudgeOf(texts[0])) clean++;
          } else {
            noPic++;
            assert.notEqual(nudgeOf(texts[0]), 0, "an avatar-less cheer with no nudge" + why);
          }
        }
      }
    }
  }
  assert.equal(drawn, 81, "the avatar-drawn population changed");
  assert.equal(clean, 61, "how many fake cheers migrate clean changed");
  assert.equal(noPic, 159, "the avatar-less population changed");
});

// ── takeoverPinToInk, DIRECTLY ──────────────────────────────────────────────
// It is reached through takeoverItemsForBlock in the app, and everything above tests it
// that way. These three go at it directly, because each pins a rule the PRINTED MARKUP
// cannot show — two are only visible in the item data, and one only bites a caller that
// does not exist yet.

const placeAt = (items, pullPt) =>
  C.takeoverPlace(C.takeoverItems(items, "embed"), C.takeoverBox(pullPt), "bottom", W);

test("takeoverPinToInk keeps a real offset and deletes a zero", () => {
  const items = [{ kind: "text", text: "A", size: 24 }, { kind: "text", text: "B", size: 19 }];
  const at = placeAt(items, 240);
  // Ask for exactly where the engine already puts the first line, 7px lower for the second.
  const pinned = C.takeoverPinToInk(items, "bottom", 240, "embed",
                                    { texts: [{ y: at[0].y }, { y: at[1].y + 7 }], pic: null });
  assert.ok(!nudged(pinned[0]), "a zero must not be stored: " + JSON.stringify(pinned[0]));
  assert.equal(pinned[1].nudge, 7);
  // And it is a pin, not an approximation.
  eq(geom(C.buildTakeover({ items: pinned, anchor: "bottom", carrier: "embed", pullPt: 240, w: W }))
       .texts.map((t) => t.y), [at[0].y, at[1].y + 7]);
});

test("takeoverPinToInk pins the item that DREW, not the one at the same index", () => {
  // takeoverItems throws out anything that would draw nothing, so a list with a blank in
  // it is shorter by the time it is placed. Walking the source list by placement index
  // would hang line 2's pin on the blank and leave line 2 where the engine put it.
  // takeoverItemsForBlock never builds such a list — this is for whoever reuses this.
  const items = [{ kind: "text", text: "   ", size: 24 }, { kind: "text", text: "B", size: 19 }];
  const at = placeAt(items, 240);
  assert.equal(at.length, 1, "the blank should never have been placed");
  const pinned = C.takeoverPinToInk(items, "bottom", 240, "embed",
                                    { texts: [{ y: at[0].y + 5 }], pic: null });
  assert.ok(!nudged(pinned[0]), "the blank collected the pin");
  assert.equal(pinned[1].nudge, 5, "the item that drew went unpinned");
});

test("takeoverPinToInk hands a line with no ink to copy its neighbour's nudge", () => {
  // DEFENSIVE, and invisible in the markup: swept the reachable space and using 0 instead
  // of the neighbour's offset changes not one printed byte, because the only item this
  // fires for is one the overflow rule then drops. It is still visible in the item data —
  // the rigidity sweep above catches it too — and pinned here against the function, so the
  // stated rationale (the run stays rigid) is a fact rather than a comment.
  const items = [{ kind: "text", text: "A", size: 24 }, { kind: "text", text: "B", size: 19 },
                 { kind: "text", text: "C", size: 13 }];
  const at = placeAt(items, 240);
  const pinned = C.takeoverPinToInk(items, "bottom", 240, "embed",
                                    { texts: [{ y: at[0].y - 11 }, { y: at[1].y - 11 }], pic: null });
  eq(pinned.map(nudgeOf), [-11, -11, -11]);
});

// ── TWO CHANGES OF BEHAVIOUR, STATED ────────────────────────────────────────

test("a block that is already stamped still gets a LATER pull migration", () => {
  // seedBlocks maps both migrations, and this one returning early on tkV alone would skip
  // the pull migration for every block that had already been converted — so the "pull
  // first, always" guarantee would hold only for blocks that arrive unconverted, which is
  // exactly the population that stops existing after the first load.
  const b = migrate(blank({ picture: PIC, pictureW: 120 }));
  const stale = { ...b, pullV: 2, pullPt: 220 };        // what the next pull bump looks like
  const m = C.migrateTakeoverItems(stale);
  assert.equal(m.pullPt, C.TAKEOVER_PULL_PT, "a stamped block never saw the pull migration");
  assert.equal(m.pullV, C.TAKEOVER_PULL_V);
  eq(m.items, JSON.parse(JSON.stringify(b.items)), "the items must not be rebuilt");
  // AND THE PART A FUTURE PULL BUMP HAS TO DEAL WITH, as a measurement rather than a
  // worry: the nudges are still the ones measured at 220, so the picture-to-text gap
  // moves. A fresh migration at 240 puts the picture back at 6 and the text 13px lower.
  // See the warning in migrateTakeoverItems — re-pin or clear, don't just bump.
  eq(geom(draw(m)).pics.map((p) => p.y), [20]);
  eq(geom(draw(m)).texts.map((t) => t.y), [239, 265, 283]);
  const fresh = migrate(blank({ picture: PIC, pictureW: 120, pullPt: 240 }));
  eq(geom(draw(fresh)).pics.map((p) => p.y), [6]);
  eq(geom(draw(fresh)).texts.map((t) => t.y), [252, 278, 296]);
});

test("at the pull slider's minimum an avatar-only fake cheer now counts as EMPTY", () => {
  // blockHasContent counts items; 0.4.2 tested b.avatar directly. At pullPt 60 — the
  // "Reach up" slider's minimum — the avatar is clamped under CHEER_MIN_PIC_PX and the
  // old renderer never drew it, so no pic item is created and the block is not sent,
  // where 0.4.2 sent a blank white slab. Narrower on purpose, and not silent: the card's
  // drop note reads the typed fields and still says the picture didn't fit.
  const bare = { cBits: "", cName: "", cNote: "" };
  const b = cheer({ ...bare, pullPt: 60, avatar: PIC });
  assert.ok(!/foreignObject/.test(asShipped(b)), "0.4.2 didn't draw it either — just the slab");
  assert.equal(C.takeoverItems(migrate(b).items).length, 0, "blockHasContent counts this");
  // Nothing is lost: the URL is still on the block, and pull enough and it is back.
  assert.equal(migrate(b).avatar, PIC);
  assert.equal(C.takeoverItems(migrate(cheer({ ...bare, pullPt: 100, avatar: PIC })).items).length, 1);
});

// The card's picture-width slider, as a rule rather than a widget: set `width`, drop any
// `height` the migration stamped. takeoverCard can't be constructed in a null DOM, so the
// two lines are restated here — what is pinned is not "the widget calls these", it is that
// these two lines are the ones that keep the invariant.
const widen = (b, nw) => {
  const pic = b.items.filter((it) => it.kind === "pic")[0];
  pic.width = nw;
  delete pic.height;
  return b;
};

test("widening a MIGRATED fake cheer's avatar still draws 0.4.2's bytes", () => {
  // THE REGRESSION THIS EXISTS FOR: the migration stamps an explicit height (square for a
  // cheer, 1.4x for a blank) so the block arrives byte-identical AT ITS SAVED WIDTH, and
  // takeoverItems lets an explicit height win. Leave that height in place and the slider
  // resizes only what the carrier draws — a fake cheer dragged 120 -> 240 kept a 120-tall
  // slot with its baselines unmoved, and the avatar landed on top of all three lines: the
  // exact failure the foreignObject and reserve-the-text-first notes were written about.
  //
  // 0.4.2 recomputed the reserved height from the width on every render (`pictureH: aw`),
  // so the bar is the migration's own bar — the same bytes as 0.4.2 — at a width the owner
  // picked, not only at the one they saved.
  for (const pullPt of [220, 240, 300]) {
    for (const avatarW of [120, 140, 160, 180, 200]) {
      const saved = cheer({ avatar: PIC, avatarW: C.CHEER_AVATAR_W, pullPt });
      const got = draw(widen(migrate(saved), avatarW));
      assert.equal(got, asShipped(cheer({ avatar: PIC, avatarW, pullPt })),
                   "pull " + pullPt + ", width " + avatarW);
    }
  }
});

test("after a width edit the reserved slot is square, whichever style it came from", () => {
  // The honest invariant underneath the test above, and the one that also covers a
  // migrated BLANK picture: the carriers state a width only, so the drawn height is the
  // source's own aspect and a square is what the layout must reserve. The blank style's
  // 1.4x slab is 0.4.2's reserved slot, kept only so the migration lands on the old bytes;
  // the first drag of the slider hands the slot back to the item engine's default.
  for (const saved of [cheer({ avatar: PIC, avatarW: C.CHEER_AVATAR_W, pullPt: 300 }),
                       blank({ picture: PIC, pictureW: 120, pullPt: 300 })]) {
    for (const nw of [140, 160]) {
      const pics = geom(draw(widen(migrate(saved), nw))).pics;
      assert.equal(pics.length, 1, saved.tkStyle + " at " + nw + " still draws its picture");
      assert.deepEqual([pics[0].w, pics[0].h], [nw, nw], saved.tkStyle + " at " + nw);
    }
  }
});

test("a widened blank picture is DROPPED once its stale nudge lifts it out of the cover", () => {
  // The price of the line above, measured rather than discovered on paper. A migrated
  // blank block's picture carries a nudge pinning it to the y the old renderer used (-8 at
  // the default pull), and a nudge deliberately does not re-flow — so a taller reserved
  // slot walks the picture up until its top is above the covered area, where takeoverPlace
  // drops it rather than printing over the header this block exists to cover.
  //
  // NOT SILENT, and that is what makes it acceptable: takeoverReport counts one wanted and
  // none drawn, which is the card's drop note. Zeroing the nudge — what the card's ↺ is
  // for, and what its hint already tells a migrated block's owner to do — puts it back.
  const wide = draw(widen(migrate(blank({ picture: PIC, pictureW: 120, pullPt: 240 })), 180));
  eq(geom(wide).pics, []);
  assert.equal(C.takeoverReport(wide, { wantLines: 3, wantPicture: 1 }).picturesDrawn, 0);
  const m = widen(migrate(blank({ picture: PIC, pictureW: 120, pullPt: 240 })), 180);
  delete m.items.filter((it) => it.kind === "pic")[0].nudge;
  eq(geom(draw(m)).pics.map((p) => [p.w, p.h]), [[180, 180]]);
});
