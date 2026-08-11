// Presets — spec §8. Save the whole block stack under a name, move it between browsers
// as JSON, and never let an expired upload link print blank paper in silence.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq } from "./_harness.mjs";

const C = loadCore();
const {
  makePreset, cleanBlocks, serializePresets, parsePresets, upsertPreset,
  isMintedImageUrl, presetImageUrls, PRESET_V,
} = C;

const STACK = [
  { id: 1, type: "text", text: "HELLO", size: 90 },
  { id: 2, type: "image", url: "https://i.uwutoowo.com/0123456789ab.png", width: 70 },
  { id: 3, type: "takeover", anchor: "top", pullPt: 240, items: [
    { kind: "pic", url: "https://i.uwutoowo.com/ffeeddccbbaa.png", width: 120 },
    { kind: "text", text: "50000 BITS", size: 24 },
  ] },
];

test("a preset strips runtime-only fields and deep-copies the stack", () => {
  const live = [{ id: 1, type: "image", url: "u", _img: { fake: true }, _decoding: true,
                  items: [{ kind: "pic", url: "v" }] }];
  const p = makePreset("nightly", live, 1000);

  assert.equal(p.v, PRESET_V);
  assert.equal(p.name, "nightly");
  assert.equal(p.savedAt, 1000);
  assert.ok(!("_img" in p.blocks[0]), "a decoded <img> must never be persisted");
  assert.ok(!("_decoding" in p.blocks[0]), "an in-flight flag must never be persisted");
  assert.equal(p.blocks[0].url, "u", "the real fields have to survive the strip");

  // Deep copy, not a reference: editing the live stack after saving must not rewrite
  // the preset underneath the user.
  live[0].url = "changed";
  live[0].items[0].url = "changed too";
  assert.equal(p.blocks[0].url, "u", "the preset aliased the live block");
  assert.equal(p.blocks[0].items[0].url, "v", "the preset aliased a nested item");
});

test("a name is trimmed and length-capped so the list stays readable", () => {
  assert.equal(makePreset("   spaced   ", []).name, "spaced");
  assert.equal(makePreset("x".repeat(200), []).name.length, 60);
  assert.equal(makePreset(null, []).name, "");
});

test("export then import round-trips a stack byte for byte", () => {
  const saved = [makePreset("a", STACK, 5), makePreset("b", [], 6)];
  const back = parsePresets(serializePresets(saved));
  assert.ok(back.ok, back.error);
  // Both sides come out of the vm realm, and eq() only normalizes its first argument —
  // so the expected side is normalized here too, or this compares prototypes.
  eq(back.presets, JSON.parse(JSON.stringify(saved)),
    "a setup exported from one browser must arrive in the next one unchanged");
});

test("import validates instead of half-loading a stack", () => {
  assert.equal(parsePresets("not json").ok, false);
  assert.match(parsePresets("not json").error, /valid JSON/);

  assert.equal(parsePresets('{"nope":1}').ok, false);
  assert.match(parsePresets('{"nope":1}').error, /presets/);

  // Shaped like presets but carrying nothing loadable — must be refused, not accepted
  // as an empty list that silently wipes what the user already had.
  assert.equal(parsePresets('{"presets":[{"name":"x"}]}').ok, false);
  assert.match(parsePresets('{"presets":[{"name":"x"}]}').error, /block list/);

  // A bare array is accepted: it is what someone hand-editing the export would write.
  const bare = parsePresets(JSON.stringify([{ name: "z", blocks: [] }]));
  assert.ok(bare.ok, bare.error);
  assert.equal(bare.presets[0].name, "z");

  // An unnamed entry still loads, under a generated name, rather than being dropped.
  const unnamed = parsePresets(JSON.stringify([{ blocks: [] }]));
  assert.ok(unnamed.ok, unnamed.error);
  assert.ok(unnamed.presets[0].name.length > 0, "an unnamed preset must get a usable label");
});

test("saving over a name replaces that setup instead of duplicating the label", () => {
  let list = [];
  list = upsertPreset(list, makePreset("show", [{ id: 1, type: "text", text: "one" }], 1));
  list = upsertPreset(list, makePreset("other", [], 2));
  list = upsertPreset(list, makePreset("show", [{ id: 1, type: "text", text: "two" }], 3));

  assert.equal(list.length, 2, "two entries with the same label are indistinguishable in the list");
  assert.equal(list[0].name, "show");
  assert.equal(list[0].blocks[0].text, "two", "the replacement did not take");
  assert.equal(list[1].name, "other", "replacing must not reorder the rest");
});

test("only OUR minted links are treated as expirable", () => {
  // These have a 15-minute KV clock on them — all three link generations.
  assert.ok(isMintedImageUrl("https://i.uwutoowo.com/0123456789ab.png"), "current 39-char link");
  assert.ok(isMintedImageUrl("https://receipt.uwutoowo.com/0123456789ab.png"), "app-host link");
  assert.ok(isMintedImageUrl("https://i.uwutoowo.com/" + "a".repeat(32) + ".png"), "128-bit generation");
  assert.ok(isMintedImageUrl("https://receipt.uwutoowo.com/i/0123456789ab"), "legacy /i/ path");

  // These do not, and flagging them would train the user to ignore the flag.
  assert.equal(isMintedImageUrl("https://i.imgur.com/abc.png"), false, "third-party host");
  assert.equal(isMintedImageUrl("https://receipt.uwutoowo.com/index.html"), false, "a static asset");
  assert.equal(isMintedImageUrl("https://receipt.uwutoowo.com/px?u=x"), false, "the proxy route");
  assert.equal(isMintedImageUrl(""), false);
  assert.equal(isMintedImageUrl(null), false);
  // Host must match exactly — a lookalike domain is somebody else's.
  assert.equal(isMintedImageUrl("https://i.uwutoowo.com.evil.test/0123456789ab.png"), false,
    "a suffixed lookalike host must not be taken for ours");
});

test("the URL walker finds pictures in BOTH surfaces that can hold one", () => {
  // If a picture surface is missed here it escapes the expiry check entirely and prints
  // blank paper with no warning — the exact failure the flag exists to prevent.
  const urls = presetImageUrls(STACK);
  eq(urls, [
    "https://i.uwutoowo.com/0123456789ab.png",
    "https://i.uwutoowo.com/ffeeddccbbaa.png",
  ], "an image block's url and a takeover item's url must both be found, in stack order");

  eq(presetImageUrls([]), []);
  eq(presetImageUrls(null), []);
  eq(presetImageUrls([{ type: "text", text: "no pictures here" }]), []);
  // A text item with a url-ish field is not a picture.
  eq(presetImageUrls([{ type: "takeover", items: [{ kind: "text", text: "x", url: "u" }] }]), []);
});

test("cleanBlocks is the single definition of what a saved block is", () => {
  // saveBlocks and makePreset both go through it, so a block persisted to localStorage
  // and one written into a preset can never disagree about which fields survive.
  const b = [{ keep: 1, _drop: 2 }];
  eq(cleanBlocks(b), [{ keep: 1 }]);
  eq(cleanBlocks(null), []);
  assert.notEqual(cleanBlocks(b)[0], b[0], "cleanBlocks must copy, not alias");
});
