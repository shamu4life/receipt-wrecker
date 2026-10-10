// migrateBlocks: saved stacks and presets from the builds before 1.0.0, brought to blocks that
// still exist. Pure, idempotent and shape-based: it runs on every load (seedBlocks) and on
// every preset load (applyPreset), so a stack from any older build arrives the same way.
//
// The takeover (and its Fake-cheer style) was an SVG lifted over the old bot's header.
// SassyTP's bot prints neither, so a saved one is converted, never just deleted: its lines
// become Text blocks and its pictures Glyph-art Image blocks, each with a FRESH id.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const clone = (x) => JSON.parse(JSON.stringify(x));
// What a Text block made from a takeover line looks like: Big text, lines as typed, the
// biggest size that fits one cheer; `id` and `fmt` are checked separately.
const TEXT_SHAPE = { type: "text", render: "big", bigLayout: "lines", bigSize: "fit1" };
const GLYPH_SHAPE = { type: "image", imgKind: "glyph", width: 70, rotate: 0, adjBright: 0, adjContrast: 0,
                      tier: "cjk", cols: 20, dither: true, contrast: 128, invert: false };
function shape(b) { const o = { ...b }; delete o.id; delete o.text; delete o.url; delete o.fmt; return o; }

// The item-list takeover every 0.5+ build saved (picture, then lines, with per-item
// size/align/nudge the new blocks have no place for).
const ITEMS_TK = {
  id: 2, type: "takeover", anchor: "top", tkV: 1, pullPt: 240, pullV: 3, renderAs: "imgemote", embedV: 4,
  items: [
    { kind: "pic", url: "https://i.uwutoowo.com/0123456789ab.png", width: 120, align: "left", nudge: -4 },
    { kind: "text", text: "-100000 BITS", size: 24, fmt: { weight: 900 } },
    { kind: "text", text: "   ", size: 19 },                                 // blank: never drawn
    { kind: "pic", url: "" },                                                  // empty: never drawn
    { kind: "text", text: "IRS", size: 19, fmt: { weight: 700, font: "impact" }, nudge: 12 },
    { kind: "text", text: "tax\r\nlien", size: 13, fmt: { italic: true } },
  ],
};

test("an item-list takeover becomes Text and Glyph-art blocks, in order, blanks dropped", () => {
  const out = C.migrateBlocks([{ id: 1, type: "text", render: "hanzi", text: "HI" }, ITEMS_TK]);
  assert.equal(out.length, 5, JSON.stringify(out));
  eq(out[0], { id: 1, type: "text", render: "hanzi", text: "HI" }, "a block that isn't a takeover is kept as it was");
  eq(shape(out[1]), GLYPH_SHAPE);
  assert.equal(out[1].url, "https://i.uwutoowo.com/0123456789ab.png");
  eq(out.slice(2).map((b) => [b.text, b.fmt]), [
    ["-100000 BITS", { weight: 900 }],
    ["IRS", { weight: 700, font: "impact" }],
    ["tax lien", { italic: true }],                       // one line: CR/LF collapse to a space
  ]);
  for (const b of out.slice(2)) eq(shape(b), TEXT_SHAPE);
  // Size, alignment and nudges have nowhere to go; nothing takeover-shaped survives.
  for (const b of out) {
    for (const k of ["items", "anchor", "tkV", "pullPt", "pullV", "nudge", "align"]) assert.ok(!(k in b), k + " survived on " + JSON.stringify(b));
  }
});

test("every block made from a takeover gets a FRESH id, unique across the whole stack", () => {
  // removeBlock filters by id, so two blocks sharing one are deleted together, and the
  // cards find their parts by id. The takeover's own id must not be reused either.
  const stack = [ITEMS_TK, { id: 9, type: "text", text: "A" }, { ...clone(ITEMS_TK), id: 4 },
                 { id: 3, type: "image", imgKind: "glyph", url: "u" }];
  const out = C.migrateBlocks(stack);
  const ids = out.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids: " + ids.join(","));
  const made = out.filter((b) => b.id !== 9 && b.id !== 3).map((b) => b.id);
  assert.equal(made.length, 8);
  for (const id of made) assert.ok(id > 9, "a new block's id " + id + " is not above every existing id (max 9)");
  assert.ok(!ids.includes(2) && !ids.includes(4), "a takeover's own id was handed to a new block");
  // The blocks that were already there keep their ids and their places.
  assert.deepEqual(ids.indexOf(9) < ids.indexOf(3), true);
  assert.equal(out.find((b) => b.id === 9).text, "A");
});

test("a Blank-style takeover saved before the item list: picture first, then each line", () => {
  const blank = { id: 5, type: "takeover", tkStyle: "blank", l1: "WRECKED", l2: "", l3: "by chat",
                  s1: 30, f1: { weight: 900 }, f3: { italic: true }, picture: "https://x.test/p.png", pictureW: 140, pullPt: 220 };
  const out = C.migrateBlocks([blank]);
  eq(out.map((b) => [b.type, b.url || b.text]), [["image", "https://x.test/p.png"], ["text", "WRECKED"], ["text", "by chat"]]);
  eq(out[1].fmt, { weight: 900 });
  eq(out[2].fmt, { italic: true });
  // An unset slot fmt stays unset rather than becoming a materialised default.
  assert.ok(!("fmt" in C.migrateBlocks([{ id: 1, type: "takeover", l1: "X" }])[0]));
});

test("a Fake-cheer-style takeover saved before the item list: avatar, amount + BITS, name, note", () => {
  const cheer = { id: 7, type: "takeover", tkStyle: "cheer", cBits: "50000", cName: "IRS", cNote: "tax lien",
                  avatar: "https://x.test/a.png", avatarW: 120, f2: { weight: 700 } };
  const out = C.migrateBlocks([cheer]);
  eq(out.map((b) => b.url || b.text), ["https://x.test/a.png", "50000 BITS", "IRS", "tax lien"]);
  assert.equal(out[0].imgKind, "glyph");
  eq(out[2].fmt, { weight: 700 });
  // No amount typed: no " BITS" line made out of nothing.
  eq(C.migrateBlocks([{ ...cheer, cBits: "  ", avatar: "" }]).map((b) => b.text), ["IRS", "tax lien"]);
});

test("a takeover that carried nothing of the user's is dropped", () => {
  const empties = [
    { id: 1, type: "takeover", items: [] },
    { id: 2, type: "takeover", items: [{ kind: "text", text: " " }, { kind: "pic", url: "  " }, null] },
    { id: 3, type: "takeover", tkStyle: "cheer" },
    { id: 4, type: "takeover" },
  ];
  eq(C.migrateBlocks(empties), []);
  eq(C.migrateBlocks([...empties, { id: 5, type: "text", render: "big", text: "kept" }]),
     [{ id: 5, type: "text", render: "big", text: "kept" }]);
});

test("an image block loses only the carrier pick (renderAs, embedV), and that asks for no backup", () => {
  // There is no carrier any more: SassyTP's bot loads pictures from emote servers alone and
  // this channel's chat filter blocks the picture tag. Everything else stays, upload included.
  const real = { id: 1, type: "image", imgKind: "real", url: "https://i.uwutoowo.com/0123456789ab.png",
                 outUrl: "https://i.uwutoowo.com/ba9876543210.png", width: 50, rotate: 90, adjBright: 10,
                 adjContrast: -5, aspect: 0.75, renderAs: "embed", embedV: 3, tier: "cjk", cols: 40,
                 dither: true, contrast: 128, invert: false };
  const glyph = { id: 2, type: "image", imgKind: "glyph", url: "u", renderAs: "imgemote", embedV: 4, tier: "ascii" };
  const out = C.migrateBlocks([real, glyph]);
  const { renderAs: _r, embedV: _e, ...realKept } = real;
  const { renderAs: _r2, embedV: _e2, ...glyphKept } = glyph;
  eq(out, [realKept, glyphKept]);
  assert.equal(C.migrationRewrites([real, glyph]), false, "a field clean-up must not add a backup preset");
});

test("pure: the input is never mutated, and no output block IS an input block", () => {
  const stack = [clone(ITEMS_TK), { id: 6, type: "image", imgKind: "real", url: "u", fmt: { a: 1 } }];
  const before = clone(stack);
  const out = C.migrateBlocks(stack);
  assert.deepEqual(stack, before, "migrateBlocks changed its input");
  for (const b of out) assert.ok(!stack.includes(b), "an output block aliases an input block");
  // A carried fmt is a copy: editing the new block cannot reach the takeover it came from.
  out.find((b) => b.text === "IRS").fmt.weight = 100;
  assert.equal(stack[0].items[4].fmt.weight, 700);
});

test("idempotent: a second run changes nothing, and asks for no second backup", () => {
  const stacks = [
    [ITEMS_TK, { id: 9, type: "text", text: "A" }],
    [{ id: 1, type: "takeover", tkStyle: "cheer", cBits: "5", cName: "n", avatar: "https://x.test/a.png" }],
    [{ id: 1, type: "text", render: "giant", text: "HELLO", giantLayout: "auto", giantSize: "fit1" },
     { id: 2, type: "image", imgKind: "real", url: "https://i.uwutoowo.com/0123456789ab.png", renderAs: "imgemote", embedV: 4 }],
    [],
  ];
  for (const s of stacks) {
    const once = C.migrateBlocks(s);
    eq(C.migrateBlocks(once), clone(once), "second run differs for " + JSON.stringify(s));
    assert.equal(C.migrationRewrites(once), false);
  }
});

test("migrationRewrites: true exactly when the stack holds a block the migration converts", () => {
  assert.equal(C.migrationRewrites([ITEMS_TK]), true);
  assert.equal(C.migrationRewrites([{ id: 1, type: "text", render: "big", text: "x" }, { id: 2, type: "takeover", items: [] }]), true,
    "an empty takeover is still rewritten (dropped)");
  assert.equal(C.migrationRewrites([{ id: 1, type: "text", render: "hanzi", text: "x", orient: 0 },
                                    { id: 2, type: "image", url: "u" }]), false);
  // An old text block takes a new render, which an older build can't read: that is a rewrite.
  for (const render of ["giant", "type", undefined, "junk"]) {
    assert.equal(C.migrationRewrites([{ id: 1, type: "text", render, text: "x" }]), true, String(render));
  }
  for (const render of ["big", "sideways", "hanzi"]) {
    assert.equal(C.migrationRewrites([{ id: 1, type: "text", render, text: "x" }]), false, render);
  }
  assert.equal(C.migrationRewrites([]), false);
  assert.equal(C.migrationRewrites(null), false);
  assert.equal(C.migrationRewrites([null, 3]), false);
});

test("junk in, a clean list out: not an array, null entries, ids that aren't numbers", () => {
  eq(C.migrateBlocks(null), []);
  eq(C.migrateBlocks({ blocks: [] }), []);
  eq(C.migrateBlocks([null, 7, "x", { id: 1, type: "text", render: "hanzi", text: "ok" }]),
     [{ id: 1, type: "text", render: "hanzi", text: "ok" }]);
  // No usable id anywhere: the new blocks still get distinct ones, from 1.
  const out = C.migrateBlocks([{ type: "takeover", items: [{ kind: "text", text: "a" }, { kind: "text", text: "b" }] },
                               { id: "7", type: "text", render: "big", text: "c" }]);
  eq(out.map((b) => b.id), [1, 2, "7"]);
});

test("a migrated line prints: it is a working Big text block", () => {
  const tb = C.migrateBlocks([ITEMS_TK]).find((b) => b.text === "IRS");
  assert.equal(C.blockRender(tb), "big");
  eq(C.bigOpts(tb), { layout: "lines", size: "fit1", flip: false });
  const bodies = C.buildBigBodies(tb.text, C.bigOpts(tb));
  assert.ok(bodies.length >= 1 && bodies[0].html.includes(">IRS<"), JSON.stringify(bodies.map((b) => b.html)));
});

// ── Text blocks from before 1.0.0: Giant type and the SVG Type render ──

const GIANT = { id: 1, type: "text", render: "giant", giantLayout: "auto", giantSize: "fit1", orient: 0,
                text: "HELLO", size: 90, rotateLen: 800, cols: 15 };
const TYPE = { id: 1, type: "text", render: "type", orient: 0, text: "OK", size: 90, rotateLen: 800, cols: 15,
               fmt: { font: "impact", weight: 900 } };

test("Giant type becomes Big text: layout kept (emote -> lines), sizes carried over, old fields gone", () => {
  const one = (o) => C.migrateBlocks([{ ...GIANT, ...o }])[0];
  for (const l of ["auto", "lines", "stack"]) assert.equal(one({ giantLayout: l }).bigLayout, l);
  // The Emote layout's names print as text on this bot (the picture tag is blocked).
  assert.equal(one({ giantLayout: "emote" }).bigLayout, "lines");
  for (const junk of [undefined, null, "", "constructor", 3]) assert.equal(one({ giantLayout: junk }).bigLayout, "auto", String(junk));
  assert.equal(one({ giantSize: "fit1" }).bigSize, "fit1");
  assert.equal(one({ giantSize: "width" }).bigSize, "width");
  const b = one({});
  eq(Object.keys(b).sort(), ["bigLayout", "bigSize", "cols", "id", "render", "size", "text", "type"]);
  assert.equal(b.render, "big");
  assert.equal(b.text, "HELLO");
  assert.ok(!("bigFlip" in b));
});

test("a Giant level n becomes round(16 x 1.2^n) px, from a number or a select's string, clamped", () => {
  const px = (size) => C.migrateBlocks([{ ...GIANT, giantSize: size }])[0].bigSize;
  // Written out: 16 x 1.2^n, rounded.
  const want = { 2: 23, 5: 40, 8: 69, 10: 99, 12: 143, 14: 205, 15: 247, 16: 296, 17: 355 };
  for (const [n, p] of Object.entries(want)) {
    assert.equal(px(Number(n)), p, "level " + n);
    assert.equal(px(n), p, "level '" + n + "' (a string)");
  }
  // Level 1 is 19.2px, under big text's 20px floor; 18 is 426px, over its 400px top.
  assert.equal(px(1), 20);
  assert.equal(px(18), 400);
  // Out of Giant type's range is clamped to it first, then to big text's.
  assert.equal(px(0), 20);
  assert.equal(px(-4), 20);
  assert.equal(px(1e6), 400);
  assert.equal(px("1e9"), 20, "parseInt('1e9') is 1");
  for (const junk of [undefined, null, "", "abc", NaN, {}]) assert.equal(px(junk), "fit1", String(junk));
  assert.equal(C.giantLevelPx(15), 247);
});

test("Type becomes Big text or Sideways by its orientation; no render at all is Type", () => {
  const one = (o) => C.migrateBlocks([{ ...TYPE, ...o }])[0];
  const kept = (b) => { const o = { ...b }; delete o.id; delete o.text; return o; };
  eq(kept(one({ orient: 0 })), { type: "text", render: "big", bigLayout: "lines", bigSize: "fit1", size: 90, cols: 15,
                                 fmt: { font: "impact", weight: 900 } });
  eq(kept(one({ orient: 180 })), { type: "text", render: "big", bigLayout: "lines", bigSize: "fit1", bigFlip: true,
                                   size: 90, cols: 15, fmt: { font: "impact", weight: 900 } });
  eq(kept(one({ orient: 90 })), { type: "text", render: "sideways", sideDir: "down", sideSize: "fit1", size: 90, cols: 15,
                                  fmt: { font: "impact", weight: 900 } });
  eq(kept(one({ orient: 270 })), { type: "text", render: "sideways", sideDir: "up", sideSize: "fit1", size: 90, cols: 15,
                                   fmt: { font: "impact", weight: 900 } });
  assert.equal(one({ orient: "90" }).sideDir, "down", "an orientation saved as a string");
  // The oldest blocks have no render (the builders fell through to Type), and junk renders
  // and junk types were drawn as Type too.
  eq(C.migrateBlocks([{ id: 1, type: "text", text: "keep me" }]),
     [{ id: 1, type: "text", text: "keep me", render: "big", bigLayout: "lines", bigSize: "fit1" }]);
  eq(C.migrateBlocks([{ id: 2, type: "text", render: "zzz", orient: 270, text: "x" }])[0].render, "sideways");
  eq(C.migrateBlocks([{ id: 3, text: "untyped" }])[0], { id: 3, text: "untyped", render: "big", bigLayout: "lines", bigSize: "fit1", type: "text" });
  for (const b of C.migrateBlocks([{ ...TYPE, orient: 90 }, { ...TYPE, orient: 180 }])) {
    for (const k of ["orient", "rotateLen", "giantLayout", "giantSize"]) assert.ok(!(k in b), k + " survived");
  }
});

test("Han tiling keeps its render and its fields; only the old renders' fields go from it", () => {
  const hz = { id: 4, type: "text", render: "hanzi", orient: 0, text: "HI", size: 90, rotateLen: 800, cols: 15, hanziWeight: 400 };
  eq(C.migrateBlocks([hz]), [{ id: 4, type: "text", render: "hanzi", text: "HI", size: 90, cols: 15, hanziWeight: 400 }]);
  assert.equal(C.migrationRewrites([hz]), false, "a Han tiling block's clean-up asks for no backup");
});

test("idempotent across every old text shape, and the result needs no second backup", () => {
  const stack = [GIANT, { ...GIANT, id: 2, giantLayout: "emote", giantSize: "12" }, { ...TYPE, id: 3 },
                 { ...TYPE, id: 4, orient: 90 }, { ...TYPE, id: 5, orient: 180 }, { ...TYPE, id: 6, orient: 270 },
                 { id: 7, type: "text", text: "bare" }, { id: 8, type: "text", render: "hanzi", text: "H", orient: 0 },
                 ITEMS_TK];
  const once = C.migrateBlocks(stack);
  eq(C.migrateBlocks(once), clone(once));
  assert.equal(C.migrationRewrites(stack), true);
  assert.equal(C.migrationRewrites(once), false);
  for (const b of once) {
    if (b.type === "text") assert.ok(C.TEXT_RENDERS.includes(b.render), JSON.stringify(b));
  }
  const ids = once.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every converted text block builds, at 80 and 58 mm", () => {
  const stack = C.migrateBlocks([GIANT, { ...GIANT, giantSize: 15 }, { ...TYPE, orient: 90 }, { ...TYPE, orient: 270 },
                                 { ...TYPE, orient: 180, text: "UPSIDE" }]);
  for (const paperMm of [80, 58]) {
    const ctx = C.stackContext({ cheer: true, bits: 100, noNonce: true, hrThreshold: 25, paperMm });
    for (const b of stack) {
      const r = C.blockRender(b);
      const bodies = r === "sideways"
        ? C.buildSideBodies(b.text, { ...C.sideOpts(b), budget: ctx.budget, heightPx: ctx.room, contentW: ctx.contentW })
        : C.buildBigBodies(b.text, { ...C.bigOpts(b), budget: ctx.budget, heightPx: ctx.room, contentW: ctx.contentW });
      const ink = bodies.map((x) => x.html.replace(/<[^>]*>/g, "")).join("").replace(/\s/g, "");
      assert.equal(ink, b.text.replace(/\s/g, ""), JSON.stringify(bodies.map((x) => x.html)));
      for (const p of C.packStackBodies(bodies, ctx)) assert.ok(p.chars <= C.MAX_CHARS);
    }
  }
});

test("migrationNote says what changed and names the backup", () => {
  const n = (blocks) => C.migrationNote(blocks, "Before 1.0.0");
  assert.match(n([ITEMS_TK]), /^Your saved stack had a Takeover.*saved as the preset "Before 1\.0\.0"\. Loading it converts it again/);
  assert.ok(!/text blocks were made/.test(n([ITEMS_TK])));
  assert.match(n([GIANT]), /^Your saved stack's text blocks were made for the old printer-bot and now print as Big text or Sideways text\. The stack as it was is saved as the preset "Before 1\.0\.0"\. Loading it converts it again; Export JSON keeps it as it was\.$/);
  assert.match(n([ITEMS_TK, TYPE]), /Takeover.* Its text blocks were made for the old printer-bot/);
  assert.match(C.migrationNote([GIANT], "Before 1.0.0 (2)"), /"Before 1\.0\.0 \(2\)"\. Loading it converts it again; Export JSON keeps it as it was\.$/);
  // What the conversion could not carry over is said too: emotes, fonts and italics.
  assert.match(n([{ ...GIANT, giantLayout: "emote" }]), /Emote names in them now print as words/);
  assert.ok(!/Emote/.test(n([GIANT])));
  assert.match(n([TYPE]), /always bold Arial, so their fonts and italics are gone/);
  assert.match(n([{ ...TYPE, fmt: { italic: true } }]), /fonts and italics are gone/);
  assert.match(n([ITEMS_TK]), /fonts and italics are gone/, "its lines had a font and italics");
  assert.ok(!/fonts and italics/.test(n([GIANT])), "Giant type had no fonts");
});

test("freePresetName never hands back a name the user already has", () => {
  const ps = (...names) => names.map((name) => ({ name, blocks: [] }));
  assert.equal(C.freePresetName([], C.MIGRATION_BACKUP_NAME), "Before 1.0.0");
  assert.equal(C.freePresetName(null, "x"), "x");
  assert.equal(C.freePresetName(ps("Before 1.0.0"), "Before 1.0.0"), "Before 1.0.0 (2)");
  assert.equal(C.freePresetName(ps("Before 1.0.0", "Before 1.0.0 (2)", "other"), "Before 1.0.0"), "Before 1.0.0 (3)");
  // And upsertPreset under that name therefore ADDS, never replaces.
  const list = ps("Before 1.0.0");
  const merged = C.upsertPreset(list, C.makePreset(C.freePresetName(list, "Before 1.0.0"), [], 1));
  assert.equal(merged.length, 2);
});
