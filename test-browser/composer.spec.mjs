// BROWSER SMOKE TESTS — the half of the app the null-DOM harness cannot reach.
//
// Every case here is a bug that actually shipped, or a promise the unit tests cannot see,
// because nothing automated exercised the UI and hand-checking is the thing you skip when a
// change looks small:
//
//   * add/remove/reorder a block never called saveBlocks(), so a rebuilt stack was gone
//     on reload. Shipped to production.
//   * the card, the block fields and the packer disagreeing about what Copy sends: the glue
//     (card -> block fields -> settings -> stackContext -> builder -> packer -> lead) is the
//     half the unit tests can't see, so Copy is compared byte for byte with the pure core,
//     for every mode, on both paper widths, above and below the High Roller threshold.
//
// These are node:test + playwright, kept OUT of `npm test` on purpose: that command is
// documented as needing zero installs, and it should stay true. Run `npm run
// test:browser`, which needs `npx playwright install chromium` once.
//
// Anything needing the Worker (/px, /upload) is NOT faked here — see _serve.mjs. Pictures
// are data: URLs, which the app decodes without a request.
//
// The preview is an interim one until the bot's own renderer draws it, so the assertions on
// it are kept light.
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serve } from "./_serve.mjs";
// The app's own pure core, from the same file the page loads. Expected payloads come from
// HERE rather than being written down in this file, so a test can't keep passing against
// numbers the app no longer produces.
import { loadCore } from "../test/_harness.mjs";

const C = loadCore();
let server, browser, PIC;

test.before(async () => {
  server = await serve();
  browser = await chromium.launch();
  // A small test picture as a data: URL (a black disc with a white square in it over a grey
  // ramp), drawn once on a real canvas. data: keeps the decode local: no request leaves.
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  PIC = await p.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 36;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, 48, 36);
    const g = x.createLinearGradient(0, 0, 48, 0);
    g.addColorStop(0, "#000"); g.addColorStop(1, "#fff");
    x.fillStyle = g; x.fillRect(0, 27, 48, 9);
    x.fillStyle = "#000"; x.beginPath(); x.arc(24, 13, 11, 0, 7); x.fill();
    x.fillStyle = "#fff"; x.fillRect(20, 9, 8, 8);
    return c.toDataURL("image/png");
  });
  await ctx.close();
});
test.after(async () => {
  await browser?.close();
  await server?.close();
});

// Copy is the only way a payload leaves the app, and it goes to the CLIPBOARD, not the
// DOM, so nothing on the page shows what is actually sent. Stubbing writeText captures the
// exact string the user would paste. (Headless Chromium has no clipboard permission
// anyway; unstubbed, Copy silently drops to the execCommand fallback.)
function installClipboardStub() {
  window.__copied = [];
  const clip = { writeText: (t) => { window.__copied.push(String(t)); return Promise.resolve(); } };
  Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => clip });
}

// The settings every test runs with unless it says otherwise: PINNED, so a changed default
// fails the one test that checks the defaults rather than quietly changing what the others
// test. (This is SassyTP's own defaults: threshold 25, no length limits, 80 mm.)
const SETTINGS = { cheer: true, bits: 100, hrThreshold: 25, bitsPerInch: 0, maxInches: 0, paperMm: 80,
                   nonce: false, thermalView: false, thermalDither: "floyd" };
// `blocks`, `presets` and `controls` seed rw_blocks_v1, rw_presets_v1 and rw_controls_v1
// before the app's first load, the way a returning user's saved state is there before the
// page runs; `controls` defaults to SETTINGS, and `controls: null` seeds nothing (a first
// visit). Only when the key is ABSENT: the app writes it back, so a reload sees the app's
// own copy. `core: true` lets the page hand its pure core (and the two canvas-backed grid
// functions) to the test through module.exports, which is how an expected payload that
// needs a canvas is computed.
async function freshPage({ blocks, presets, controls = SETTINGS, viewport, core } = {}) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  await ctx.addInitScript(installClipboardStub);
  if (core) await ctx.addInitScript(() => { window.module = { exports: {} }; });
  for (const [key, value] of [["rw_blocks_v1", blocks], ["rw_presets_v1", presets], ["rw_controls_v1", controls]]) {
    if (!value) continue;
    await ctx.addInitScript(([k, json]) => {
      try { if (!localStorage.getItem(k)) localStorage.setItem(k, json); } catch (e) {}
    }, [key, JSON.stringify(value)]);
  }
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(server.url);
  await page.waitForSelector("#blockList");
  return { page, ctx, errors, requests };
}

const cardCount = (page) => page.locator("#blockList > *").count();
const cards = (page) => page.locator("#blockList > *");
const stored = async (page, k) => JSON.parse(await page.evaluate((key) => localStorage.getItem(key), k));

// Wait until every part can be copied: a picture decodes asynchronously, and until it has,
// its part is a placeholder with no Copy button.
async function settled(page) {
  await page.waitForFunction(() => {
    const parts = Array.from(document.querySelectorAll("#parts .part"));
    return parts.length > 0 && parts.every((p) => p.querySelector("button"));
  }, null, { timeout: 8000 });
}
// Click part i's Copy and return exactly what went to the clipboard.
async function copyPayload(page, i = 0) {
  const before = await page.evaluate(() => window.__copied.length);
  await page.locator("#parts .part").nth(i).locator("button").click();
  await page.waitForFunction((n) => window.__copied.length > n, before);
  return page.evaluate(() => window.__copied[window.__copied.length - 1]);
}
async function copyAll(page) {
  const out = [], n = await page.locator("#parts .part").count();
  for (let i = 0; i < n; i++) out.push(await copyPayload(page, i));
  return out;
}
const len = (s) => Array.from(s).length;     // payloadLength's rule: code points

// stackContext's options for a settings object (normalizeControls' fields).
const stackOptsOf = (s) => ({ cheer: s.cheer, bits: s.bits, noNonce: !s.nonce, hrThreshold: s.hrThreshold,
                              bitsPerInch: s.bitsPerInch, maxInches: s.maxInches, paperMm: s.paperMm });
// What a stack of big and sideways blocks sends, per the core, computed here in Node.
function nodeBodies(block, ctx) {
  if (C.blockRender(block) === "sideways") {
    const o = C.sideOpts(block);
    return Array.from(C.buildSideBodies(block.text, { dir: o.dir, size: o.size, budget: ctx.budget, heightPx: ctx.room, contentW: ctx.contentW }));
  }
  const o = C.bigOpts(block);
  return Array.from(C.buildBigBodies(block.text, { layout: o.layout, size: o.size, flip: o.flip, budget: ctx.budget,
                                                   heightPx: ctx.room, contentW: ctx.contentW }));
}
function expectNode(blocks, s = SETTINGS) {
  const ctx = C.stackContext(stackOptsOf(s));
  return Array.from(C.packStackBodies(blocks.flatMap((b) => nodeBodies(b, ctx)), ctx), (p) => p.payload);
}
// What ANY stack sends, per the core, computed in the page (Han tiling and glyph-art need a
// real canvas). The decisions are written out here on purpose, from the spec rather than from
// renderBlockBodies: below the threshold every block prints its plain form; a Real picture
// sends nothing; otherwise the block's render or tier. `digits`: the repeat digits each part
// carried, when the repeat number is on.
async function expectPage(page, blocks, s = SETTINGS, digits = null) {
  return page.evaluate(async ([blocks, so, digits]) => {
    const K = window.module.exports, ctx = K.stackContext(so), all = [];
    const plainOpts = (mode) => ({ mode, paperMm: ctx.paperMm, cheer: ctx.cheer, bits: ctx.bits, noNonce: ctx.noNonce, limitPx: ctx.limit.px });
    for (const b of blocks) {
      let bodies;
      if (b.type === "image") {
        if (b.imgKind !== "glyph") continue;
        const img = new Image();
        img.src = b.url;
        await img.decode();
        const grid = K.glyphGrid(b, img, ctx);
        bodies = ctx.mode === "plain" ? K.buildDesignTPicture(grid, plainOpts("plain"))
          : K.buildGlyphBodies(K.glyphOpts(b).tier, grid, { budget: ctx.budget, heightPx: ctx.room, paperMm: ctx.paperMm });
      } else if (K.blockRender(b) === "hanzi" || ctx.mode === "plain") {
        bodies = K.buildDesignT(K.designTTextGrid(K.bigClean(b.text).text, ctx.paperMm, K.hanziWeightOf(b.hanziWeight)), plainOpts(ctx.mode));
      } else if (K.blockRender(b) === "sideways") {
        const o = K.sideOpts(b);
        bodies = K.buildSideBodies(b.text, { dir: o.dir, size: o.size, budget: ctx.budget, heightPx: ctx.room, contentW: ctx.contentW });
      } else {
        const o = K.bigOpts(b);
        bodies = K.buildBigBodies(b.text, { layout: o.layout, size: o.size, flip: o.flip, budget: ctx.budget, heightPx: ctx.room, contentW: ctx.contentW });
      }
      for (const x of bodies) all.push(x);
    }
    const po = Object.assign({}, ctx, digits ? { nonceFn: (i) => digits[i] } : {});
    return K.packStackBodies(all, po).map((p) => p.payload);
  }, [blocks, stackOptsOf(s), digits]);
}
// AMENDMENT B1, on what Copy really hands over: only the tags the app uses, only the style
// attribute, never a picture-ish tag in any letter case, never a leading "<".
function assertTags(payload) {
  assert.ok(!/<\s*\/?\s*(img|object|image|embed|iframe|svg|input)\b/i.test(payload), "a forbidden tag in: " + payload);
  for (const m of payload.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    assert.ok(["div", "pre", "br"].includes(m[2]), "tag <" + m[2] + "> in: " + payload);
    const attrs = m[3].trim();
    assert.ok(attrs === "" || /^style=/.test(attrs), "attribute other than style: " + m[0]);
  }
  assert.ok(!payload.startsWith("<"), "a payload starts with '<': " + payload.slice(0, 40));
}

const BIG = (o) => ({ type: "text", render: "big", bigLayout: "auto", bigSize: "fit1", text: "HELLO", ...o });

test("the app boots with the defaults, one Big text block, and Copy sends exactly what the core builds", async () => {
  // A first visit: nothing seeded, no core hook. The defaults are SassyTP's own.
  const { page, ctx, errors } = await freshPage({ controls: null });
  assert.equal(await cardCount(page), 1, "a default stack should have exactly one block");
  const card = cards(page).first();
  assert.equal(await card.locator(".sel-render").inputValue(), "big");
  assert.equal(await card.locator(".sel-layout").inputValue(), "auto");
  assert.equal(await card.locator(".sel-size").inputValue(), "fit1");
  assert.equal(await card.locator("textarea").inputValue(), "HELLO");
  const vals = await page.evaluate(() => ({
    cheer: document.getElementById("cheer").checked, bits: document.getElementById("bitsAmount").value,
    hr: document.getElementById("hrThreshold").value, bpi: document.getElementById("bitsPerInch").value,
    max: document.getElementById("maxInches").value, paper: document.getElementById("paperMm").value,
    nonce: document.getElementById("cheerNonce").checked, thermal: document.getElementById("thermalView").checked,
    dither: document.getElementById("thermalDither").value }));
  assert.deepEqual(vals, { cheer: true, bits: "100", hr: "25", bpi: "0", max: "0", paper: "80", nonce: false, thermal: false, dither: "floyd" });
  // The settings are saved as exactly the 1.0.0 fields.
  assert.deepEqual(await stored(page, "rw_controls_v1"), SETTINGS);
  // Removed controls are gone.
  for (const id of ["receiptLen", "cheerTuck", "stackCovers", "censusBtn", "rulerBtn"]) {
    assert.equal(await page.locator("#" + id).count(), 0, "#" + id + " is still on the page");
  }
  assert.deepEqual([await copyPayload(page)], expectNode([BIG({ id: 1 })]));
  // The Layout and Size options say what they print, and no Type/Hanzi-only control shows.
  assert.match(await card.locator('.sel-size option[value="fit1"]').textContent(), /capitals \d+\.\d cm · 1 cheer$/);
  assert.match(await card.locator('.sel-size option[value="64"]').textContent(), /^64 px · capitals 1\.2 cm · 1 cheer$/);
  assert.equal(await card.locator(".fmt-row, input[type=range]:visible, input[type=number]:visible").count(), 0);
  assert.equal(await page.locator("#modeNote").count(), 0, "a High Roller stack needs no notice");
  assert.deepEqual(errors, [], "the page threw while loading");
  await ctx.close();
});

test("a rebuilt stack survives a reload — add, reorder and delete all persist", async () => {
  // The exact bug that shipped: addBlock/removeBlock/moveBlock mutated the array and
  // re-rendered without saving, so everything was there until you refreshed.
  const { page, ctx } = await freshPage();
  await page.click("#addTextBtn");
  await page.click("#addImageBtn");
  assert.equal(await cardCount(page), 3);
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await cardCount(page), 3, "the added blocks did not survive a reload");
  await cards(page).last().getByRole("button", { name: "×" }).click();
  assert.equal(await cardCount(page), 2);
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await cardCount(page), 2, "the deletion did not survive a reload");
  // A new block is Big text, auto, fit one cheer; a new image is Glyph-art.
  const saved = await stored(page, "rw_blocks_v1");
  assert.deepEqual([saved[1].render, saved[1].bigLayout, saved[1].bigSize], ["big", "auto", "fit1"]);
  await ctx.close();
});

test("presets round-trip through a reload", async () => {
  const { page, ctx } = await freshPage();
  await page.click("#addTextBtn");
  await page.fill("#presetName", "smoke setup");
  await page.click("#presetSave");
  assert.match(await page.textContent("#presetNote"), /Saved "smoke setup" with \d+ blocks?\./);
  await page.reload();
  await page.waitForSelector("#presetList");
  assert.deepEqual(await page.locator("#presetList option").allTextContents(), ["smoke setup"],
    "a saved preset should still be listed after a reload");
  const saved = await cardCount(page);
  await page.click("#addImageBtn");
  assert.equal(await cardCount(page), saved + 1);
  await page.click("#presetLoad");
  await page.waitForFunction((n) => document.querySelectorAll("#blockList > *").length === n, saved);
  assert.equal(await cardCount(page), saved, "loading the preset did not restore the stack");
  await ctx.close();
});

test("exported preset JSON is importable into a browser that has never seen it", async () => {
  const { page, ctx } = await freshPage();
  await page.click("#addTextBtn");
  await page.fill("#presetName", "portable");
  await page.click("#presetSave");
  await page.click("#presetExport");
  const json = await page.inputValue("#presetJson");
  assert.ok(json.includes("portable"), "the export does not contain the preset");
  await ctx.close();

  const second = await browser.newContext();          // a clean profile: no localStorage
  const p2 = await second.newPage();
  await p2.goto(server.url);
  await p2.waitForSelector("#presetList");
  assert.deepEqual(await p2.locator("#presetList option").allTextContents(), ["(nothing saved yet)"]);
  // The real two-step flow: the first Import press reveals the box, the second imports.
  await p2.click("#presetImport");
  await p2.fill("#presetJson", json);
  await p2.click("#presetImport");
  assert.deepEqual(await p2.locator("#presetList option").allTextContents(), ["portable"]);
  await second.close();
});

test("bad JSON is refused with a reason instead of half-loading", async () => {
  const { page, ctx } = await freshPage();
  await page.click("#presetImport");                  // first press reveals the box
  await page.fill("#presetJson", "{ not json");
  await page.click("#presetImport");
  assert.match(await page.textContent("#presetNote"), /isn't valid JSON/);
  await ctx.close();
});

test("a saved 0.12 stack holding takeovers loads as Text and Glyph-art cards, backed up once as a preset", async () => {
  // The takeover is gone (SassyTP's bot prints no SVG and nothing outside the message box).
  // A returning user's stack must still load with no page errors, show its words as Text
  // cards (pictures as Glyph-art), keep their own presets, and get the stack as it was
  // saved ONCE as a preset, written after the real preset list loaded, never over it.
  const old = [
    { id: 1, type: "text", render: "giant", giantLayout: "auto", giantSize: "fit1", orient: 0, text: "HELLO", size: 90, rotateLen: 800, cols: 15 },
    { id: 2, type: "takeover", anchor: "top", tkV: 1, pullPt: 240, pullV: 3, renderAs: "imgemote", embedV: 4, items: [
      { kind: "pic", url: "https://example.invalid/avatar.png", width: 120 },
      { kind: "text", text: "-100000 BITS", size: 24, fmt: { weight: 900 } },
      { kind: "text", text: "IRS", size: 19 } ] },
    { id: 3, type: "takeover", tkStyle: "cheer", cBits: "5", cName: "chat", cNote: "", avatar: "", pullPt: 220 },
  ];
  const mine = { v: 1, presets: [{ v: 1, name: "mine", savedAt: 1, blocks: [{ id: 1, type: "text", text: "keep me" }] }] };
  const { page, ctx, errors } = await freshPage({ blocks: old, presets: mine });
  const types = async () => cards(page).locator(".bc-type").allTextContents();

  assert.deepEqual((await types()).map((t) => t.toLowerCase()), ["text", "image", "text", "text", "text", "text"]);
  const texts = await cards(page).locator("textarea").evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(texts, ["HELLO", "-100000 BITS", "IRS", "5 BITS", "chat"]);
  const saved = await stored(page, "rw_blocks_v1");
  assert.ok(saved.every((b) => b.type !== "takeover"), "a takeover was saved back");
  assert.equal(new Set(saved.map((b) => b.id)).size, saved.length, "two blocks share an id");
  assert.deepEqual(saved.filter((b) => b.type === "text").map((b) => b.render), ["big", "big", "big", "big", "big"]);
  assert.equal(saved[1].imgKind, "glyph");
  assert.equal(saved[1].url, "https://example.invalid/avatar.png");

  // The user's preset is untouched, and the backup holds the stack exactly as it was.
  let ps = (await stored(page, "rw_presets_v1")).presets;
  assert.deepEqual(ps.map((p) => p.name), ["mine", "Before 1.0.0"]);
  assert.deepEqual(ps[0], mine.presets[0], "the user's own preset changed");
  assert.deepEqual(ps[1].blocks, old, "the backup is not the stack as it was saved");
  const note = await page.textContent("#presetNote");
  assert.match(note, /had a Takeover/);
  assert.match(note, /text blocks were made for the old printer-bot/);
  assert.match(note, /saved as the preset "Before 1\.0\.0"/);

  // Once: a reload converts nothing more and writes no second backup.
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await cardCount(page), 6);
  ps = (await stored(page, "rw_presets_v1")).presets;
  assert.deepEqual(ps.map((p) => p.name), ["mine", "Before 1.0.0"]);

  // Loading the backup converts it again (the stored preset keeps its takeovers).
  await page.selectOption("#presetList", "Before 1.0.0");
  await page.click("#presetLoad");
  await page.waitForFunction(() => document.querySelectorAll("#blockList > *").length === 6);
  assert.ok((await stored(page, "rw_presets_v1")).presets[1].blocks.some((b) => b.type === "takeover"),
    "loading the backup rewrote it");
  const ids = (await stored(page, "rw_blocks_v1")).map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "a loaded preset's blocks share an id");
  // Each converted card is its own block: removing one removes only that one.
  await cards(page).nth(2).getByRole("button", { name: "×" }).click();
  assert.equal(await cardCount(page), 5);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("old saved blocks and settings migrate, and print what the core builds for them", async () => {
  // Giant type (a level as a number and as a select's string, the Emote layout), Type at
  // every orientation, a block with no render at all, and a settings blob with every field
  // 1.0.0 dropped (tuck, covers, receiptLen and the hidden single-mode UI's).
  const old = [
    { id: 1, type: "text", render: "giant", giantLayout: "stack", giantSize: 12, orient: 0, text: "GG", size: 90, rotateLen: 800, cols: 15 },
    { id: 2, type: "text", render: "giant", giantLayout: "emote", giantSize: "7", orient: 0, text: "Kappa", size: 90, rotateLen: 800, cols: 15 },
    { id: 3, type: "text", render: "type", orient: 0, text: "UP", size: 90, rotateLen: 800, cols: 15, fmt: { font: "impact" } },
    { id: 4, type: "text", render: "type", orient: 180, text: "FLIP", size: 90, rotateLen: 800, cols: 15 },
    { id: 5, type: "text", render: "type", orient: 90, text: "DOWN", size: 90, rotateLen: 1200, cols: 15 },
    { id: 6, type: "text", render: "type", orient: 270, text: "RISE", size: 90, rotateLen: 800, cols: 15 },
    { id: 7, type: "text", text: "BARE" },
  ];
  const oldControls = { mode: "text", tier: "ascii", cols: 40, text: "HI", textSize: 90, rotateLen: 800, imgUrl: "",
                        covers: true, tuck: true, receiptLen: "500", cheer: true, bits: "100", thermalView: false };
  const { page, ctx, errors } = await freshPage({ blocks: old, controls: oldControls });
  const saved = await stored(page, "rw_blocks_v1");
  assert.deepEqual(saved.map((b) => [b.render, b.bigLayout || b.sideDir, b.bigSize || b.sideSize, !!b.bigFlip]), [
    ["big", "stack", 143, false], ["big", "lines", 57, false], ["big", "lines", "fit1", false], ["big", "lines", "fit1", true],
    ["sideways", "down", "fit1", false], ["sideways", "up", "fit1", false], ["big", "lines", "fit1", false]]);
  for (const b of saved) for (const k of ["giantLayout", "giantSize", "orient", "rotateLen"]) assert.ok(!(k in b), k + " survived");
  // The cards show the converted renders; a migrated px that isn't a step is an option of its own.
  const renders = await cards(page).locator(".sel-render").evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(renders, ["big", "big", "big", "big", "sideways", "sideways", "big"]);
  assert.equal(await cards(page).nth(1).locator(".sel-size").inputValue(), "57");
  assert.equal(await cards(page).nth(3).locator(".chk-flip").isChecked(), true);
  assert.equal(await cards(page).nth(5).locator(".sel-dir").inputValue(), "up");
  // Settings: exactly the 1.0.0 fields, the old ones gone, absent ones at their defaults.
  assert.deepEqual(await stored(page, "rw_controls_v1"), SETTINGS);
  // A backup of the stack as it was, and it prints: byte for byte the core's answer.
  assert.deepEqual((await stored(page, "rw_presets_v1")).presets.map((p) => p.name), ["Before 1.0.0"]);
  const payloads = await copyAll(page);
  assert.deepEqual(payloads, expectNode(saved));
  for (const p of payloads) { assertTags(p); assert.ok(len(p) <= C.MAX_CHARS); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a Real picture sends nothing, says so plainly, and switches to Glyph-art in one click", async () => {
  // SassyTP's bot draws a picture only from an emote server, and this channel's chat filter
  // blocks the picture tag, so a Real picture can never arrive as one. A stack whose only
  // block is one must not offer a cheer at all (it would be the lead and nothing else).
  const real = { id: 1, type: "image", imgKind: "real", url: "https://example.invalid/p.png", width: 70,
                 rotate: 0, adjBright: 0, adjContrast: 0, tier: "cjk", cols: 20, dither: true, contrast: 128, invert: false };
  const { page, ctx, errors } = await freshPage({ blocks: [real] });
  const card = cards(page).first();
  assert.equal(await page.locator("#parts .part button").count(), 0, "a Real-picture-only stack offered a Copy");
  assert.match(await page.textContent("#parts"), /a Real picture can't print on SassyTP's bot/);
  const note = card.locator(".over-note");
  assert.match(await note.textContent(),
    /SassyTP's bot only prints pictures from emote servers, and this channel's chat filter blocks the picture tag, so an upload can't print as a picture\. Switch to Glyph-art to print it as characters\./);
  // The picture is still shown, on the card, from the block's own link.
  assert.equal(await card.locator("img.img-thumb").getAttribute("src"), real.url);
  assert.equal(await card.locator(".sel-kind").inputValue(), "real");

  // Next to text it adds nothing to the payload: no tag of any kind for a picture.
  await page.click("#addTextBtn");
  await cards(page).last().locator("textarea").fill("HI");
  const payloads = await copyAll(page);
  assert.equal(payloads.length, 1);
  for (const p of payloads) assertTags(p);

  // One click: the block is Glyph-art, saved, and the note is gone.
  await card.getByRole("button", { name: "Switch to Glyph-art" }).click();
  assert.equal(await card.locator(".sel-kind").inputValue(), "glyph");
  assert.equal(await note.isVisible(), false);
  const saved = await stored(page, "rw_blocks_v1");
  assert.equal(saved[0].imgKind, "glyph");
  assert.ok(!("renderAs" in saved[0]) && !("embedV" in saved[0]));
  // And a NEW Image block starts as Glyph-art, the kind that prints.
  await page.click("#addImageBtn");
  assert.equal(await cards(page).last().locator(".sel-kind").inputValue(), "glyph");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Every mode in one stack, so the packer's sharing of parts between blocks is exercised too.
const EVERY_MODE = () => [
  BIG({ id: 1, text: "HELLO" }),
  BIG({ id: 2, text: "HAPPY\nBIRTHDAY", bigLayout: "lines", bigSize: "fit1" }),
  BIG({ id: 3, text: "GG WP", bigLayout: "stack", bigSize: 96 }),
  BIG({ id: 4, text: "HAPPY\nBIRTHDAY\nTO YOU", bigLayout: "each", bigSize: "fit1", bigFlip: true }),
  BIG({ id: 5, text: "Upside, down", bigLayout: "lines", bigSize: "width", bigFlip: true }),
  { id: 6, type: "text", render: "sideways", sideDir: "down", sideSize: "fit1", text: "HELLO\nWORLD" },
  { id: 7, type: "text", render: "sideways", sideDir: "up", sideSize: 64, text: "Rise, up" },
  { id: 8, type: "text", render: "hanzi", text: "HI", hanziWeight: 400 },
  ...["cjk", "ascii", "safe", "braille"].map((tier, i) => ({ id: 9 + i, type: "image", imgKind: "glyph", url: "PIC",
    width: 70, rotate: 0, adjBright: 0, adjContrast: 0, tier, cols: tier === "cjk" ? 14 : 20, dither: true, contrast: 128, invert: false })),
];
const withPic = (blocks) => blocks.map((b) => (b.url === "PIC" ? { ...b, url: PIC } : b));

test("Copy for every mode matches the pure core byte for byte, at 80 and 58 mm, above and below the threshold", async () => {
  const configs = [
    { ...SETTINGS },                                              // High Roller, 80 mm
    { ...SETTINGS, paperMm: 58 },                                 // High Roller, 58 mm
    { ...SETTINGS, bits: 300, bitsPerInch: 100, maxInches: 5 },   // the streamer's length limits
    { ...SETTINGS, bits: 24 },                                    // one under the threshold: plain
    { ...SETTINGS, bits: 24, paperMm: 58, nonce: true },          // plain on 58 mm, repeat digits on
    { ...SETTINGS, cheer: false },                                // a free test: High Roller forms after the nbsp
  ];
  for (const s of configs) {
    const label = JSON.stringify({ paper: s.paperMm, bits: s.bits, bpi: s.bitsPerInch, max: s.maxInches, cheer: s.cheer, nonce: s.nonce });
    const blocks = withPic(EVERY_MODE());
    const { page, ctx, errors } = await freshPage({ blocks, controls: s, core: true });
    await settled(page);
    const mode = C.printMode(stackOptsOf(s));
    if (s.cheer && mode === "plain") assert.match(await page.textContent("#modeNote"), /below the streamer's High Roller threshold/, label);
    const got = await copyAll(page);
    // Copy advances the copied part's digits, so the expected parts carry the digits each
    // copied part did (and are sized for a token 3 characters longer).
    const digits = s.nonce ? got.map((p) => p.match(/Cheer\d+ (\d\d)/)[1]) : null;
    const want = await expectPage(page, blocks, s, digits);
    assert.deepEqual(got, want, label);
    for (const p of got) {
      assertTags(p);
      assert.ok(len(p) <= C.MAX_CHARS, label + ": a part of " + len(p) + " characters");
      if (s.cheer && mode === "plain") assert.ok(!p.includes("<") && / Cheer\d+( \d\d)?$/.test(p), label + ": not a plain part: " + p.slice(0, 60));
    }
    if (!s.cheer) assert.ok(got.every((p) => p.startsWith(C.LEAD_GUARD) || !p.includes("<")), label);
    assert.deepEqual(errors, [], label);
    await ctx.close();
  }
});

test("the probes: High Roller test at the threshold, Plain test one under it, each one cheer with a how-to-read note", async () => {
  for (const paperMm of [80, 58]) {
    const s = { ...SETTINGS, paperMm, hrThreshold: 30 };
    const { page, ctx, errors } = await freshPage({ controls: s });
    await page.click("#hrProbeBtn");
    assert.equal(await page.locator("#parts .part").count(), 1);
    const hr = C.buildHighRollerProbe({ hrThreshold: 30, bits: 100, paperMm });
    const hrCtx = C.stackContext({ ...stackOptsOf(s), cheer: true, bits: hr.bits, mode: hr.mode });
    assert.equal(await copyPayload(page), C.packStackBodies(hr.bodies, hrCtx)[0].payload);
    assert.match(await page.textContent("#parts .parts-note"), /^One 30-bit cheer, exactly the threshold/);
    await page.click("#plainProbeBtn");
    const pl = C.buildPlainProbe({ hrThreshold: 30, paperMm, noNonce: true });
    const plCtx = C.stackContext({ ...stackOptsOf(s), cheer: true, bits: pl.bits, mode: pl.mode });
    const plain = await copyPayload(page);
    assert.equal(plain, C.packStackBodies(pl.bodies, plCtx)[0].payload);
    assert.ok(plain.endsWith(" Cheer29") && !plain.includes("<"), plain);
    assert.match(await page.textContent("#parts .parts-note"), /^One 29-bit cheer, one under the threshold/);
    // Any edit drops back to the stack.
    await cards(page).first().locator("textarea").fill("HI");
    assert.match(await copyPayload(page), /^Cheer100 <div/);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // A probe that can't show what it is for says why and offers no Copy.
  for (const [hrThreshold, btn] of [[0, "#hrProbeBtn"], [1, "#plainProbeBtn"]]) {
    const { page, ctx } = await freshPage({ controls: { ...SETTINGS, hrThreshold } });
    await page.click(btn);
    assert.equal(await page.locator("#parts .part button").count(), 0, btn + " at threshold " + hrThreshold + " offered a Copy");
    assert.ok((await page.textContent("#parts .parts-note")).length > 20);
    await ctx.close();
  }
});

test("the streamer's settings and the dither are fields of rw_controls_v1: they re-plan the stack and survive a reload", async () => {
  const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1 })] });
  const before = await copyPayload(page);
  await page.fill("#hrThreshold", "500");
  // 100 bits is now under the threshold: plain text, said above the parts.
  await page.waitForSelector("#modeNote");
  assert.match(await page.textContent("#modeNote"), /A 100-bit cheer is below the streamer's High Roller threshold \(500 bits\)/);
  assert.match(await page.textContent("#bitsHint"), /Below the streamer's High Roller threshold \(500 bits\)/);
  assert.ok(!(await copyPayload(page)).includes("<"));
  await page.fill("#hrThreshold", "25");
  await page.fill("#bitsPerInch", "100");
  await page.fill("#maxInches", "3");
  await page.selectOption("#paperMm", "58");
  await page.selectOption("#thermalDither", "threshold");
  const s = { ...SETTINGS, bitsPerInch: 100, maxInches: 3, paperMm: 58, thermalDither: "threshold" };
  const after = await copyPayload(page);
  assert.notEqual(after, before, "the settings did not change the payload");
  assert.deepEqual([after], expectNode([BIG({ id: 1 })], s));
  assert.deepEqual(await stored(page, "rw_controls_v1"), s);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("rw_")).sort());
  assert.deepEqual(keys, ["rw_blocks_v1", "rw_controls_v1"], "a new storage key: " + keys.join(","));
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await page.inputValue("#bitsPerInch"), "100");
  assert.equal(await page.inputValue("#maxInches"), "3");
  assert.equal(await page.inputValue("#paperMm"), "58");
  assert.equal(await page.inputValue("#thermalDither"), "threshold");
  assert.equal(await copyPayload(page), after, "the reload changed the payload");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("cheer counts, empty blocks and labels all match the parts Copy sends", async () => {
  {
    const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO WORLD", bigLayout: "stack", bigSize: 200 })] });
    const card = cards(page).first();
    const want = expectNode([BIG({ id: 1, text: "HELLO WORLD", bigLayout: "stack", bigSize: 200 })]);
    assert.ok(want.length >= 2, "fixture: 200px HELLO WORLD stacked needs more than one cheer");
    assert.equal(await page.locator("#parts .part").count(), want.length);
    assert.match(await card.locator('.sel-size option[value="200"]').textContent(), new RegExp(" · " + want.length + " cheers$"));
    assert.match(await card.locator(".text-note").innerText(), new RegExp("needs " + want.length + " cheers \\(" + 100 * want.length + " bits\\)"));
    assert.match(await page.locator("#parts .parts-note", { hasText: /Paste the parts/ }).innerText(),
      new RegExp(want.length + " × 100 = " + want.length * 100 + " bits total"));
    await card.locator(".sel-size").selectOption("fit1");
    assert.equal(await page.locator("#parts .part").count(), 1, "fit1 fits one cheer");
    assert.match(await card.locator('.sel-size option[value="fit1"]').textContent(), / · 1 cheer$/);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  {
    // A block of only invisible characters prints nothing: it never gets a part (a cheer
    // that would print only "Cheer100"), and its card says so.
    const zw = String.fromCharCode(0x200b, 0x200b, 0x2060);
    const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO" }), BIG({ id: 2, text: zw })] });
    const payloads = await copyAll(page);
    assert.equal(payloads.length, 1, "the empty block got a cheer of its own: " + JSON.stringify(payloads));
    const note = await cards(page).nth(1).locator(".text-note").innerText();
    assert.match(note, /Nothing else is left to print/);
    assert.ok(!/this block is in part|over 500/.test(note), note);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("the preview is one page of the paper wide, and no request leaves the origin (thermal preview on)", async () => {
  for (const [paperMm, contentW, dots] of [[80, 244, 576], [58, 153, 384]]) {
    for (const viewport of [undefined, { width: 390, height: 844 }]) {
      const blocks = withPic([BIG({ id: 1 }), { id: 2, type: "text", render: "sideways", sideDir: "up", text: "UP" },
        { id: 3, type: "image", imgKind: "glyph", url: "PIC", tier: "cjk", cols: 14, dither: true, contrast: 128 }]);
      const { page, ctx, errors, requests } = await freshPage({ blocks, viewport, controls: { ...SETTINGS, paperMm } });
      await settled(page);
      const label = paperMm + " mm at " + (viewport ? viewport.width + "px" : "the default viewport");
      const m = await page.evaluate(() => ({ cw: document.querySelector(".rcpt-body").clientWidth,
                                             sw: document.documentElement.scrollWidth, iw: innerWidth }));
      assert.ok(Math.abs(m.cw - contentW) <= 1, label + ": the message box is " + m.cw + "px, not " + contentW);
      assert.ok(m.sw <= m.iw, `horizontal scroll at ${label}: ${m.sw} > ${m.iw}`);
      await page.check("#thermalView");
      const c = page.locator("canvas.rcpt-thermal").first();
      await c.waitFor({ timeout: 8000 });
      assert.equal(await c.evaluate((cv) => cv.width), dots, label + ": thermal dots");
      const ink = await c.evaluate((cv) => {
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let black = 0, other = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i] === 0) black++; else if (d[i] !== 255) other++; }
        return { black, other };
      });
      assert.ok(ink.black > 1000 && ink.other === 0, label + ": not a 1-bit raster " + JSON.stringify(ink));
      const origin = new URL(server.url).origin;
      const away = requests.filter((u) => !/^(data|blob|about):/.test(u) && new URL(u).origin !== origin);
      assert.deepEqual(away, [], label + ": a request left the app's origin");
      assert.deepEqual(errors, [], label);
      await ctx.close();
    }
  }
});

test("the repeat number: off by default, two digits when on, kept across a reload, and a repeated part says so", async () => {
  // The two nonce digits after the cheer are opt-in. They print on the receipt, and all they
  // do is make repeat copies differ, because Twitch won't send the same message twice within
  // 30 seconds. Off, nothing makes two parts differ, so a stack that repeats itself sends
  // the SAME message twice and the second one is refused: the part must say so. Two
  // identical HELLO blocks: each fills its own cheer at fit1, so they can't share a part.
  const twin = BIG({ text: "HELLO" });
  const { page, ctx, errors } = await freshPage({ blocks: [{ ...twin, id: 1 }, { ...twin, id: 2 }] });
  const box = page.locator("#cheerNonce");
  const partNote = (i) => page.locator("#parts .part").nth(i).locator(".parts-note");
  assert.equal(await box.isChecked(), false, "the repeat number must be off");
  assert.equal(await box.isEnabled(), true);
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 2);

  // Off: no digits anywhere, byte for byte the core's answer, and part 2 warns.
  const off = await copyAll(page);
  assert.deepEqual(off, expectNode([{ ...twin, id: 1 }, { ...twin, id: 2 }]));
  for (const p of off) assert.match(p, /^Cheer100 <div/, "digits with the repeat number off: " + p);
  assert.equal(off[0], off[1], "fixture: the two parts are meant to be the same message");
  assert.equal(await partNote(0).count(), 0, "part 1 repeats nothing, so it needs no note");
  assert.match(await partNote(1).textContent(), /^Same message as part 1\..*30 seconds.*Add a repeat number/);

  // On: two digits after the cheer, different in each part, the note gone.
  await box.check();
  const on = await copyAll(page);
  for (const p of on) assert.match(p, /^Cheer100 \d\d <div/, "no digits with the repeat number on: " + p);
  assert.notEqual(on[0], on[1], "the two parts should differ by their digits");
  assert.deepEqual(on.map((p) => p.replace(/^Cheer100 \d\d /, "Cheer100 ")), off.map((p) => p),
    "the digits changed more than the lead (the bodies were sized for the bare lead and still fit)");
  assert.equal(await page.locator("#parts .part .parts-note").count(), 0, "the repeated-part note outlived the digits");
  assert.notEqual(await copyPayload(page, 0), on[0], "Copy did not advance the digits");

  // A field of rw_controls_v1 (no new storage key), so it survives a reload.
  assert.equal((await stored(page, "rw_controls_v1")).nonce, true);
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await box.isChecked(), true, "the repeat number did not survive a reload");

  // Without Cheer-ready there is nothing to put the digits after: disabled, NOT unchecked,
  // and the free messages are identical again, so the note comes back without the toggle.
  await page.locator("#cheer").uncheck();
  assert.equal(await box.isDisabled(), true);
  assert.equal(await box.isChecked(), true, "turning Cheer-ready off reset the repeat number");
  assert.match(await page.textContent("#cheerNonceHint"), /^Needs Cheer-ready/);
  assert.match(await page.textContent("#modeNote"), /^Free test/);
  assert.ok((await copyPayload(page, 0)).startsWith(C.LEAD_GUARD + "<div"), "a free message got a cheer lead");
  const freeNote = await partNote(1).textContent();
  assert.match(freeNote, /^Same message as part 1\./);
  assert.ok(!freeNote.includes("repeat number"), "offered a toggle that Cheer-ready has disabled: " + freeNote);
  await page.locator("#cheer").check();
  assert.equal(await box.isEnabled(), true);
  assert.equal(await box.isChecked(), true, "Cheer-ready did not bring the repeat number back");
  assert.deepEqual(errors, []);
  await ctx.close();

  // Settings saved before the toggle existed (no `nonce` field, digits always on back then)
  // read as OFF: dropping the digits for everyone was the point of the toggle.
  const { page: old, ctx: ctx2 } = await freshPage({ controls: { mode: "text", cheer: true, bits: "100", tuck: false } });
  assert.equal(await old.locator("#cheerNonce").isChecked(), false, "an old settings blob turned the digits on");
  assert.match(await copyPayload(old, 0), /^Cheer100 <div/);
  await ctx2.close();

  // Only the part right before counts: Twitch refuses the same message twice IN A ROW, so
  // HELLO, WORLD, HELLO sends all three, and flagging part 3 would be wrong advice.
  const { page: p3, ctx: ctx3, errors: errors3 } = await freshPage({ blocks: [
    { ...twin, id: 1 }, { ...twin, id: 2, text: "WORLD" }, { ...twin, id: 3 }] });
  await p3.waitForFunction(() => document.querySelectorAll("#parts .part").length === 3);
  const run = await copyAll(p3);
  assert.equal(run[0], run[2], "fixture: parts 1 and 3 are meant to be the same message");
  assert.notEqual(run[1], run[2], "fixture: part 2 is meant to differ");
  assert.equal(await p3.locator("#parts .part .parts-note").count(), 0, "a repeat with a different part between was flagged");
  assert.deepEqual(errors3, []);
  await ctx3.close();
});
