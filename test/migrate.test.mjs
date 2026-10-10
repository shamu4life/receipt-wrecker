// migrateBlocks: saved stacks and presets from the nutty.gg builds, brought to blocks that
// still exist. Pure, idempotent and shape-based: it runs on every load (seedBlocks) and on
// every preset load (applyPreset), so a stack from any older build arrives the same way.
//
// The takeover (and its Fake-cheer style) was an SVG lifted over printer-bot's header.
// SassyTP's bot prints neither, so a saved one is converted, never just deleted: its lines
// become Text blocks and its pictures Glyph-art Image blocks, each with a FRESH id.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const clone = (x) => JSON.parse(JSON.stringify(x));
// What a Text block made from a takeover line looks like (the fields a new Giant block has,
// in "lines as typed" layout); `id` and `fmt` are checked separately.
const TEXT_SHAPE = { type: "text", render: "giant", giantLayout: "lines", giantSize: "fit1",
                     orient: 0, size: 90, rotateLen: 800, cols: 15 };
const GLYPH_SHAPE = { type: "image", imgKind: "glyph", width: 70, rotate: 0, adjBright: 0, adjContrast: 0,
                      tier: "cjk", cols: 40, dither: true, contrast: 128, invert: false };
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
  eq(C.migrateBlocks([...empties, { id: 5, type: "text", text: "kept" }]), [{ id: 5, type: "text", text: "kept" }]);
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
  assert.equal(C.migrationRewrites([{ id: 1, type: "text", text: "x" }, { id: 2, type: "takeover", items: [] }]), true,
    "an empty takeover is still rewritten (dropped)");
  assert.equal(C.migrationRewrites([{ id: 1, type: "text", text: "x" }, { id: 2, type: "image", url: "u" }]), false);
  assert.equal(C.migrationRewrites([]), false);
  assert.equal(C.migrationRewrites(null), false);
  assert.equal(C.migrationRewrites([null, 3]), false);
});

test("junk in, a clean list out: not an array, null entries, ids that aren't numbers", () => {
  eq(C.migrateBlocks(null), []);
  eq(C.migrateBlocks({ blocks: [] }), []);
  eq(C.migrateBlocks([null, 7, "x", { id: 1, type: "text", text: "ok" }]), [{ id: 1, type: "text", text: "ok" }]);
  // No usable id anywhere: the new blocks still get distinct ones, from 1.
  const out = C.migrateBlocks([{ type: "takeover", items: [{ kind: "text", text: "a" }, { kind: "text", text: "b" }] },
                               { id: "7", type: "text", text: "c" }]);
  eq(out.map((b) => b.id), [1, 2, "7"]);
});

test("a migrated line prints: it is a working Giant type block today", () => {
  const tb = C.migrateBlocks([ITEMS_TK]).find((b) => b.text === "IRS");
  assert.equal(C.blockRender(tb), "giant");
  eq(C.giantOpts(tb), { layout: "lines", size: "fit1" });
  const bodies = C.buildGiantBodies(tb.text, C.giantOpts(tb));
  assert.ok(bodies.length >= 1 && bodies[0].html.includes(">IRS<"), JSON.stringify(bodies.map((b) => b.html)));
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
