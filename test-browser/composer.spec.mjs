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
// The preview is SassyTP's own receipt page, vendored into index.html and loaded into one
// sandboxed frame per part (AMENDMENT A). The MANDATORY contract test drives every mode's Copy
// payload through it and holds the app to what the bot's renderer does with it: nothing taken
// out, cut only where the app said it would be, and as tall as the core predicted.
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
// `init`: one more init script, run after the clipboard stub (a test that needs the clipboard
// to refuse, say). `eager: true` sets the app's test hook that draws every part's preview, near
// the viewport or not (the app draws them lazily, one at a time, as they come near).
async function freshPage({ blocks, presets, controls = SETTINGS, viewport, core, init, eager } = {}) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  await ctx.addInitScript(installClipboardStub);
  if (init) await ctx.addInitScript(init);
  if (eager) await ctx.addInitScript(() => { if (window.parent === window) window.__rwPreviewAll = true; });
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

const cardCount = (page) => page.locator("#blockList > .block-card").count();
const cards = (page) => page.locator("#blockList > .block-card");
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
async function expectParts(page, blocks, s = SETTINGS, digits = null) {
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
    // Each part's predicted height (the packer's contentPx: the lead line plus the bodies, or a
    // plain part's whole grid), and whether the app itself says it will be cut: taller than the
    // bot's box (one body taller than the box gets a part of its own, and its card warns), or a
    // block in it too wide for the paper at its size (its card says it will wrap or be cut off).
    return K.packStackBodies(all, po).map((p) => ({ payload: p.payload, contentPx: p.contentPx,
      warned: p.contentPx > ctx.limit.px + 1
        || p.bodies.some((b) => !!b.tall || !!(b.big && !b.big.fits) || !!(b.side && !b.side.fits)) }));
  }, [blocks, stackOptsOf(s), digits]);
}
const expectPage = async (...a) => (await expectParts(...a)).map((p) => p.payload);

// Wait until part i's frame has drawn exactly `payload` (and the app has shown that answer),
// and return what the frame last drew plus the verdict under the preview.
async function drawnPart(page, i, payload) {
  const card = page.locator("#parts .part").nth(i);
  await card.scrollIntoViewIfNeeded();   // a part's frame is drawn once it is near the viewport
  await card.locator("iframe.rcpt-frame").waitFor({ timeout: 10000 });
  const frame = await (await card.locator("iframe.rcpt-frame").elementHandle()).contentFrame();
  await frame.waitForFunction((p) => !!(window.__rwPreview && window.__rwPreview.event.message === p), payload, { timeout: 10000 });
  await page.waitForFunction((i) => document.querySelectorAll("#parts .part")[i].getAttribute("data-render") === "done", i, { timeout: 10000 });
  return { frame, card, last: await frame.evaluate(() => window.__rwPreview), verdict: await card.locator(".rcpt-verdict").innerText() };
}
// The contract, checked INSIDE the vendored page after render(): parse what was SENT the way
// the bot's sanitizer parses it (an inert DOMParser document) and compare it with what the
// sanitizer KEPT in the receipt. Same elements in the same order, same text; every style
// declaration kept with its exact value after CSSOM normalisation (both sides are the
// browser's own longhands). The one thing the bot's allow-list leaves out is the implicit
// resets of the `font` shorthand (font-kerning, font-feature-settings, ...), and for each of
// those the check is that dropping it changes nothing: the printed element's computed value
// is exactly what was sent. Plain parts print as text: the text must be the payload itself.
function frameContract(frame, sent) {
  return frame.evaluate((sent) => {
    const part = document.querySelector("#receipt-content > .part");
    const out = { partClass: part ? part.className : "", problems: [], noOps: 0, violations: window.PrinterBot.violations() };
    if (!part) { out.problems.push("no part in the receipt"); return out; }
    if (!/\braw\b/.test(part.className)) {
      if (part.textContent !== sent) out.problems.push("plain text differs: " + JSON.stringify(part.textContent.slice(0, 80)));
      return out;
    }
    const allowed = new Set(window.PrinterBot.internals.allowedCss());
    const doc = new DOMParser().parseFromString("<!DOCTYPE html><body>" + sent, "text/html");
    if (doc.body.textContent !== part.textContent) out.problems.push("text differs");
    const a = Array.from(doc.body.querySelectorAll("*")), b = Array.from(part.querySelectorAll("*"));
    const tags = (l) => l.map((e) => e.localName).join(",");
    if (tags(a) !== tags(b)) { out.problems.push("tags: sent " + tags(a) + ", kept " + tags(b)); return out; }
    out.tags = tags(a);
    a.forEach((el, k) => {
      const got = b[k], cs = getComputedStyle(got);
      const attrs = (e) => Array.from(e.attributes, (x) => x.name).sort().join(",");
      if (attrs(el) !== attrs(got)) out.problems.push(el.localName + " attributes: sent " + attrs(el) + ", kept " + attrs(got));
      for (let i = 0; i < el.style.length; i++) {
        const p = el.style[i], v = el.style.getPropertyValue(p), pr = el.style.getPropertyPriority(p);
        if (allowed.has(p)) {
          if (got.style.getPropertyValue(p) !== v || got.style.getPropertyPriority(p) !== pr) {
            out.problems.push(el.localName + " " + p + ": sent " + JSON.stringify(v) + ", kept " + JSON.stringify(got.style.getPropertyValue(p)));
          }
        } else if (cs.getPropertyValue(p) !== v) {
          out.problems.push(el.localName + " " + p + ": " + JSON.stringify(v) + " was dropped, and the printed value is " + JSON.stringify(cs.getPropertyValue(p)));
        } else out.noOps++;
      }
      for (let i = 0; i < got.style.length; i++) if (!el.style.getPropertyValue(got.style[i])) out.problems.push(el.localName + " gained " + got.style[i]);
    });
    return out;
  }, sent);
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
  // The Layout and Size options say what they print, and no formatting row or slider shows.
  assert.match(await card.locator('.sel-size option[value="fit1"]').textContent(), /capitals \d+\.\d cm, \d+\.\d cm of message · 1 cheer$/);
  assert.match(await card.locator('.sel-size option[value="64"]').textContent(), /^64 px · capitals 1\.2 cm, \d+\.\d cm of message · 1 cheer$/);
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
  await cards(page).last().getByRole("button", { name: "Remove block" }).click();
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
  // The stack on screen is in no preset now, so Load asks before it replaces it.
  await page.click("#presetLoad");
  assert.equal(await page.textContent("#presetLoad"), "Replace stack?");
  assert.match(await page.textContent("#presetNote"), /^Loading "smoke setup" replaces the blocks you have now, which are not saved\. Press Replace stack\? to load it, or Save them first\.$/);
  assert.equal(await cardCount(page), saved + 1, "the first press replaced the stack");
  await page.click("#presetLoad");
  await page.waitForFunction((n) => document.querySelectorAll("#blockList > .block-card").length === n, saved);
  assert.equal(await page.textContent("#presetLoad"), "Load");
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
  // Said in a banner at the top of the blocks, where a returning user looks, until dismissed.
  const note = await page.textContent("#migrationNote");
  assert.match(note, /had a Takeover/);
  assert.match(note, /text blocks were made for the old printer-bot/);
  assert.match(note, /saved as the preset "Before 1\.0\.0"\. Loading it converts it again; Export JSON keeps it as it was\./);
  assert.ok(await page.evaluate(() => {
    const n = document.getElementById("migrationNote"), list = document.getElementById("blockList");
    return n.nextElementSibling === list;
  }), "the banner sits right above the blocks");
  await page.locator("#migrationNote").getByRole("button", { name: "Got it" }).click();
  assert.equal(await page.locator("#migrationNote").count(), 0);

  // Once: a reload converts nothing more and writes no second backup.
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await cardCount(page), 6);
  ps = (await stored(page, "rw_presets_v1")).presets;
  assert.deepEqual(ps.map((p) => p.name), ["mine", "Before 1.0.0"]);

  // Loading the backup converts it again (the stored preset keeps its takeovers).
  await page.selectOption("#presetList", "Before 1.0.0");
  await page.click("#presetLoad");
  await page.waitForFunction(() => document.querySelectorAll("#blockList > .block-card").length === 6);
  assert.ok((await stored(page, "rw_presets_v1")).presets[1].blocks.some((b) => b.type === "takeover"),
    "loading the backup rewrote it");
  const ids = (await stored(page, "rw_blocks_v1")).map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "a loaded preset's blocks share an id");
  // Each converted card is its own block: removing one removes only that one.
  await cards(page).nth(2).getByRole("button", { name: "Remove block" }).click();
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
    ["big", "stack", 143, false], ["big", "lines", "fit1", false], ["big", "lines", "fit1", false], ["big", "lines", "fit1", true],
    ["sideways", "down", "fit1", false], ["sideways", "up", "fit1", false], ["big", "lines", "fit1", false]]);
  for (const b of saved) for (const k of ["giantLayout", "giantSize", "orient", "rotateLen"]) assert.ok(!(k in b), k + " survived");
  // The cards show the converted renders; a migrated px that isn't a step is an option of its
  // own. The Emote layout's level sized an emote picture, so that block is Auto (fit1).
  const renders = await cards(page).locator(".sel-render").evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(renders, ["big", "big", "big", "big", "sideways", "sideways", "big"]);
  assert.equal(await cards(page).nth(0).locator(".sel-size").inputValue(), "143");
  assert.equal(await cards(page).nth(1).locator(".sel-size").inputValue(), "fit1");
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
  const { page, ctx, errors, requests } = await freshPage({ blocks: [real] });
  const card = cards(page).first();
  assert.equal(await page.locator("#parts .part button").count(), 0, "a Real-picture-only stack offered a Copy");
  assert.match(await page.textContent("#parts"), /a Real picture can't print on SassyTP's bot/);
  const note = card.locator(".over-note");
  assert.match(await note.textContent(),
    /SassyTP's bot only prints pictures from emote servers, and this channel's chat filter blocks the picture tag, so an upload can't print as a picture\. Switch to Glyph-art to print it as characters\./);
  // The picture is still shown, on the card, through our own Worker: a pasted third-party
  // link is never loaded from its own host (only a minted upload link loads as it is).
  assert.equal(await card.locator("img.img-thumb").getAttribute("src"), "/px?u=" + encodeURIComponent(real.url));
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
  const glyphCard = cards(page).last();
  assert.equal(await glyphCard.locator(".sel-kind").inputValue(), "glyph");
  // A link pasted into a Glyph-art card is read through /px and nothing else: the Real
  // card's hidden picture used to load it straight from its host, and retry it 4 times.
  await glyphCard.locator("input[type=url]").fill("https://example.org/pic.png");
  await page.waitForTimeout(1500);   // longer than one retry's 1.2s wait
  assert.equal(await glyphCard.locator("img.img-thumb").getAttribute("src"), null, "a Glyph-art card loaded its hidden picture");
  const offsite = requests.filter((u) => /example\.(org|invalid)/.test(new URL(u).host));
  assert.deepEqual(offsite, [], "the browser asked a pasted link's own host");
  assert.ok(requests.some((u) => u.includes("/px?u=" + encodeURIComponent("https://example.org/pic.png"))), "the Glyph-art link was not read through /px");
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
  // Round 3: Each with a spaced line too wide even at 20px, which wraps on the page and was
  // counted as one line. (Han, kana and emoji widths depend on the fonts this machine has, so
  // they are benched with tools/forkbench.mjs rather than held to a pixel tolerance here.)
  BIG({ id: 21, text: "ONE\n" + new Array(8).fill("WW").join(" "), bigLayout: "each", bigSize: "fit1" }),
  // Words wrapped to the paper, a block's own layout: mixed case, and capitals upside down.
  BIG({ id: 22, text: "Thanks for the raid everyone", bigLayout: "wrap", bigSize: "fit1" }),
  BIG({ id: 23, text: "WE ARE SO BACK", bigLayout: "wrap", bigSize: "fit1", bigFlip: true }),
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

test("a glyph-art picture keeps its shape on the paper in every form, Braille included", async () => {
  // The Copy test above compares the page with glyphGrid itself, so it cannot see glyphGrid
  // sampling for the wrong cell. Here the measure is the paper: a round 200 x 200 picture must
  // print about as tall as wide (rows x cell height against cols x cell width), within a row.
  // Braille sampled square printed 1.6 times too tall on 80 mm and took a second cheer.
  const { page, ctx, errors } = await freshPage({ core: true });
  const shapes = await page.evaluate(async () => {
    const K = window.module.exports;
    const c = document.createElement("canvas"); c.width = 200; c.height = 200;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 200, 200);
    x.fillStyle = "#000"; x.beginPath(); x.arc(100, 100, 90, 0, 7); x.fill();
    const img = new Image(); img.src = c.toDataURL(); await img.decode();
    const out = [];
    for (const paperMm of [80, 58]) {
      const ctx = K.stackContext({ cheer: true, bits: 100, noNonce: true, hrThreshold: 25, paperMm });
      for (const [tier, cols] of [["braille", 20], ["braille", 40], ["cjk", 20], ["ascii", 20]]) {
        const b = { type: "image", imgKind: "glyph", tier, cols, dither: false, contrast: 128, invert: false };
        const g = K.glyphGrid(b, img, ctx);
        const body = K.buildGlyphBodies(tier, g, { budget: ctx.budget, heightPx: ctx.room, paperMm })[0].glyph;
        const F = body.fontPx;
        const cw = tier === "braille" ? 0.733 * F : tier === "cjk" ? F : 0.6 * F;
        const ch = tier === "braille" ? F + 2 : tier === "cjk" ? F : 1.2 * F;
        out.push({ paperMm, tier, cols: g[0].length, rows: g.length, w: g[0].length * cw, h: g.length * ch, rowH: ch,
                   parts: K.packStackBodies(K.buildGlyphBodies(tier, g, { budget: ctx.budget, heightPx: ctx.room, paperMm }), ctx).length });
      }
    }
    return out;
  });
  for (const s of shapes) {
    const label = s.paperMm + " mm " + s.tier + " " + s.cols + " cols: " + s.rows + " rows, " + s.w.toFixed(1) + " x " + s.h.toFixed(1) + "px";
    assert.ok(Math.abs(s.h - s.w) <= s.rowH, label);
    if (s.tier === "braille" && s.cols === 20) assert.equal(s.parts, 1, label + ": a 20-column Braille disc fits one cheer");
  }
  assert.deepEqual(errors, []);
  await ctx.close();
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
  // The Dither menu only works while the Thermal view is on (it does nothing otherwise).
  assert.equal(await page.locator("#thermalDither").isDisabled(), true);
  await page.check("#thermalView");
  await page.selectOption("#thermalDither", "threshold");
  const s = { ...SETTINGS, bitsPerInch: 100, maxInches: 3, paperMm: 58, thermalView: true, thermalDither: "threshold" };
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
  assert.equal(await page.locator("#thermalDither").isDisabled(), false, "restored with the Thermal view on, yet disabled");
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

test("the preview is SassyTP's renderer in a sandboxed frame, one page of the paper wide; nothing leaves the origin; the thermal view is the printer's dots", async () => {
  for (const [paperMm, pageW, contentW, dots] of [[80, 272, 244, 576], [58, 181, 153, 384]]) {
    for (const viewport of [undefined, { width: 390, height: 844 }]) {
      const blocks = withPic([BIG({ id: 1 }), { id: 2, type: "text", render: "sideways", sideDir: "up", text: "UP" },
        { id: 3, type: "image", imgKind: "glyph", url: "PIC", tier: "cjk", cols: 14, dither: true, contrast: 128 }]);
      const { page, ctx, errors, requests } = await freshPage({ blocks, viewport, controls: { ...SETTINGS, paperMm }, eager: true });
      await settled(page);
      const label = paperMm + " mm at " + (viewport ? viewport.width + "px" : "the default viewport");
      const n = await page.locator("#parts .part").count();
      for (let i = 0; i < n; i++) {
        const payload = await copyPayload(page, i);
        const { frame, card, last } = await drawnPart(page, i, payload);
        const el = card.locator("iframe.rcpt-frame");
        // Sandboxed with scripts only: an opaque origin that cannot reach this page.
        assert.equal(await el.getAttribute("sandbox"), "allow-scripts", label);
        assert.ok((await el.evaluate((f) => f.srcdoc.length)) > 100000, label + ": the frame is not the vendored page");
        const inside = await frame.evaluate(() => {
          let reach;
          try { reach = window.parent.document ? "reached the app" : "?"; } catch (e) { reach = "blocked"; }
          return { reach, origin: window.origin, vw: document.documentElement.clientWidth,
                   box: document.getElementById("receipt-content").clientWidth, version: window.PrinterBot.version,
                   violations: window.PrinterBot.violations() };
        });
        assert.deepEqual(inside, { reach: "blocked", origin: "null", vw: pageW, box: contentW,
                                   version: await page.getAttribute("#sassytp-renderer", "data-version"), violations: 0 }, label);
        // As wide as the bot's page, as tall as render() says the receipt is.
        assert.equal(await el.evaluate((f) => f.clientWidth), pageW, label);
        assert.equal(await el.evaluate((f) => f.clientHeight), Math.ceil(last.result.height), label);
      }
      const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      assert.ok(sw.sw <= sw.iw, `horizontal scroll at ${label}: ${sw.sw} > ${sw.iw}`);
      // The thermal view: the frame's receipt at the printer's dot width, dithered to 1 bit.
      await page.check("#thermalView");
      await page.waitForFunction(() => Array.from(document.querySelectorAll("#parts .part")).every((c) => c.getAttribute("data-thermal") === "done"), null, { timeout: 10000 });
      const c = page.locator("canvas.rcpt-thermal").first();
      assert.equal(await c.evaluate((cv) => cv.width), dots, label + ": thermal dots");
      const ink = await c.evaluate((cv) => {
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let black = 0, other = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i] === 0) black++; else if (d[i] !== 255) other++; }
        return { black, other };
      });
      assert.ok(ink.black > 1000 && ink.other === 0, label + ": not a 1-bit raster " + JSON.stringify(ink));
      // Dithered the way the bot does it: the canvas is forkDither of the same raster, so
      // switching the dither changes the dots.
      await page.selectOption("#thermalDither", "threshold");
      await page.waitForFunction(() => Array.from(document.querySelectorAll("#parts .part")).every((c) => c.getAttribute("data-thermal") === "done"), null, { timeout: 10000 });
      const crisp = await page.locator("canvas.rcpt-thermal").first().evaluate((cv) => {
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let black = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 0) black++;
        return black;
      });
      assert.notEqual(crisp, ink.black, label + ": the dither select changed nothing");
      const origin = new URL(server.url).origin;
      const away = requests.filter((u) => !/^(data|blob|about):/.test(u) && new URL(u).origin !== origin);
      assert.deepEqual(away, [], label + ": a request left the app's origin");
      assert.deepEqual(errors, [], label);
      await ctx.close();
    }
  }
});

// The tolerance the core's height model is held to against the bot's renderer, per part (the
// whole message, measured in the frame with the box's limit lifted, against the packer's
// contentPx): never more than HEIGHT_OVER px taller than predicted (the packer's promise that a
// part fits the bot's box) and, for most modes, never more than HEIGHT_OVER px shorter either.
// A part with sideways text may come in up to HEIGHT_UNDER_SIDEWAYS px under: its length is
// predicted from a conservative width table and kerning shortens it. Measured when this was
// written: every other part within 0.4px, sideways 1 to 6.5px under (the bench saw up to 18px
// on long lines).
const HEIGHT_OVER = 1, HEIGHT_UNDER_SIDEWAYS = 20;

test("MANDATORY: every mode's Copy payload through the app's vendored PrinterBot.render: nothing taken out, cut only where warned, as tall as predicted", async () => {
  const configs = [
    { ...SETTINGS },                                              // High Roller, 80 mm
    { ...SETTINGS, paperMm: 58 },                                 // High Roller, 58 mm
    { ...SETTINGS, bits: 300, bitsPerInch: 100, maxInches: 5 },   // the streamer's length limits: render() trims
    { ...SETTINGS, bits: 24 },                                    // one under the threshold: plain
    { ...SETTINGS, bits: 24, paperMm: 58, nonce: true },          // plain on 58 mm, repeat digits on
    { ...SETTINGS, cheer: false },                                // a free test, drawn as a High Roller cheer
  ];
  const heights = [];
  let trimmedSeen = 0, rawSeen = 0, plainSeen = 0, noOps = 0;
  const check = async (page, i, payload, want, s, label) => {
    const { frame, last, verdict } = await drawnPart(page, i, payload);
    const pe = C.previewEvent({ payload, bits: want.bits ?? s.bits, cheer: want.cheer ?? s.cheer, hrThreshold: s.hrThreshold, bitsPerInch: s.bitsPerInch, maxInches: s.maxInches });
    assert.deepEqual(last.event, JSON.parse(JSON.stringify(pe.event)), label + ": the frame was not handed the part's exact payload");
    assert.deepEqual(last.options, JSON.parse(JSON.stringify(pe.options)), label);
    assert.ok(!("userName" in last.event), label);
    const r = last.result;
    assert.equal(r.ok, true, label + ": " + JSON.stringify(r));
    assert.deepEqual(r.security, [], label + ": the bot's sanitizer took something out");
    const k = await frameContract(frame, payload);
    assert.deepEqual(k.problems, [], label + ": " + payload.slice(0, 80));
    assert.equal(k.violations, 0, label + ": a securitypolicyviolation in the frame");
    noOps += k.noOps;
    // The renderer, not the app, decides raw or plain: it must agree with the app's mode.
    const raw = /\braw\b/.test(k.partClass);
    if (raw) rawSeen++; else plainSeen++;
    assert.equal(raw, want.raw, label + ": drawn as " + k.partClass);
    // Cut only where the app itself said it would be.
    const cut = !!r.trimmed || last.measure.fullPx > last.measure.contentPx + 1;
    if (cut) { trimmedSeen++; assert.ok(want.warned, label + ": the bot cuts a part the app expected to fit: " + JSON.stringify(r.trimmed)); }
    assert.ok(!/expected it to fit/.test(verdict), label + ": " + verdict);
    // As tall as the core predicted.
    if (want.contentPx != null) {
      const d = last.measure.fullPx - want.contentPx;
      heights.push({ label, d: Math.round(d * 100) / 100 });
      const under = /writing-mode:/.test(payload) ? HEIGHT_UNDER_SIDEWAYS : HEIGHT_OVER;
      assert.ok(d <= HEIGHT_OVER && d >= -under, label + ": the message is " + last.measure.fullPx + "px, the core predicted " + want.contentPx);
    }
  };
  for (const s of configs) {
    // Under the length limits, one letter set at 400px is taller than the bot's box (288px for
    // 300 bits at 100 bits per inch): the app warns about it, and the bot must cut that part.
    const blocks = withPic(s.bitsPerInch ? [...EVERY_MODE(), BIG({ id: 20, text: "I", bigLayout: "lines", bigSize: 400 })] : EVERY_MODE());
    const { page, ctx, errors, requests } = await freshPage({ blocks, controls: s, core: true, eager: true });
    await settled(page);
    const got = await copyAll(page);
    const digits = s.nonce ? got.map((p) => p.match(/Cheer\d+ (\d\d)/)[1]) : null;
    const want = await expectParts(page, blocks, s, digits);
    assert.deepEqual(got, want.map((w) => w.payload));
    // The bot prints a message raw (High Roller) at or above the threshold; a free test is drawn
    // as a High Roller cheer. A Han tiling part in a High Roller cheer is raw too: plain text.
    const raw = !s.cheer || C.printMode(stackOptsOf(s)) === "raw";
    for (let i = 0; i < got.length; i++) {
      const label = JSON.stringify({ paper: s.paperMm, bits: s.bits, bpi: s.bitsPerInch, cheer: s.cheer, part: i + 1 });
      await check(page, i, got[i], { ...want[i], raw }, s, label);
    }
    const origin = new URL(server.url).origin;
    assert.deepEqual(requests.filter((u) => !/^(data|blob|about):/.test(u) && new URL(u).origin !== origin), []);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // A run the page breaks INSIDE a word (Han, emoji) at a fixed size too wide for the paper,
  // then another block. Counted as one line, the run's part was planned about 550px short, the
  // packer put the next block beside it, and the bot's box cut that block off (polish review 2).
  for (const paperMm of [80, 58]) {
    const s = { ...SETTINGS, paperMm };
    const blocks = [BIG({ id: 1, text: "你好你好", bigLayout: "lines", bigSize: 160 }), BIG({ id: 2, text: "HELLO" }),
                    BIG({ id: 3, text: "😀😀😀😀", bigLayout: "lines", bigSize: 120 }), BIG({ id: 4, text: "THANKS" })];
    const { page, ctx, errors } = await freshPage({ blocks, controls: s, core: true, eager: true });
    await settled(page);
    const got = await copyAll(page), want = await expectParts(page, blocks, s);
    assert.deepEqual(got, want.map((w) => w.payload));
    for (let i = 0; i < got.length; i++) await check(page, i, got[i], { ...want[i], raw: true }, s, "wrapped run " + paperMm + " mm, part " + (i + 1));
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // Both probes, on both papers.
  for (const paperMm of [80, 58]) {
    const s = { ...SETTINGS, paperMm, hrThreshold: 30 };
    const { page, ctx, errors } = await freshPage({ controls: s });
    for (const [btn, probe, raw] of [["#hrProbeBtn", C.buildHighRollerProbe({ hrThreshold: 30, bits: 100, paperMm }), true],
                                     ["#plainProbeBtn", C.buildPlainProbe({ hrThreshold: 30, paperMm, noNonce: true }), false]]) {
      await page.click(btn);
      const payload = await copyPayload(page);
      const pctx = C.stackContext({ ...stackOptsOf(s), cheer: true, bits: probe.bits, mode: probe.mode });
      const part = C.packStackBodies(probe.bodies, pctx)[0];
      assert.equal(payload, part.payload);
      await check(page, 0, payload, { bits: probe.bits, cheer: true, raw, warned: false, contentPx: part.contentPx }, s, btn + " " + paperMm + " mm");
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  assert.ok(rawSeen > 20 && plainSeen > 4, "fixture: too few parts of each kind (" + rawSeen + " raw, " + plainSeen + " plain)");
  assert.ok(trimmedSeen > 0, "fixture: the length-limit config should make the bot cut a part the app warned about");
  assert.ok(noOps > 0, "fixture: no font shorthand reset was checked");
  if (process.env.RW_HEIGHTS) console.log(JSON.stringify(heights));
});

test("a stale answer from the preview frame is dropped: only the newest request is shown", async () => {
  const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: "AAA", bigLayout: "lines" })] });
  await settled(page);
  await drawnPart(page, 0, await copyPayload(page));
  // Slow the renderer down inside the frame, then ask for two drawings back to back: the first
  // answer arrives while the second is outstanding and must not be shown.
  const frame = await (await page.locator("#parts .part iframe").elementHandle()).contentFrame();
  await frame.evaluate(() => {
    const real = window.PrinterBot.render;
    window.PrinterBot.render = (e, o) => new Promise((r) => setTimeout(r, 400)).then(() => real(e, o));
  });
  const ta = cards(page).first().locator("textarea");
  await ta.fill("BBB");
  await ta.fill("CCC");
  const last = await copyPayload(page);
  assert.match(last, /CCC/);
  // ~400 ms: BBB's answer is in, CCC's is not. The card must still be waiting.
  await frame.waitForFunction(() => window.__rwPreview && /BBB/.test(window.__rwPreview.event.message), null, { timeout: 5000 });
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#parts .part").first().getAttribute("data-render"), "pending", "a stale answer was shown");
  const { last: drawn } = await drawnPart(page, 0, last);
  assert.match(drawn.event.message, /CCC/);
  assert.deepEqual(errors, []);
  await ctx.close();

  // The Thermal view's job is debounced 120 ms. A part that loses its frame inside that window
  // (its text cleared the moment the drawing lands) used to throw when the timer fired, because
  // the job read the part's request then instead of when it was scheduled.
  const t = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO" })], controls: { ...SETTINGS, thermalView: true } });
  await t.page.waitForSelector("#parts .part[data-thermal=done]", { timeout: 15000 });
  await t.page.evaluate(() => new Promise((res) => {
    const area = document.querySelector("#blockList textarea"), part = document.querySelector("#parts .part");
    const mo = new MutationObserver(() => {
      if (part.getAttribute("data-render") === "done" && part.getAttribute("data-thermal") === "pending") {
        mo.disconnect();
        area.value = ""; area.dispatchEvent(new Event("input", { bubbles: true }));
        res();
      }
    });
    mo.observe(part, { attributes: true });
    area.value = "HELLO WORLD"; area.dispatchEvent(new Event("input", { bubbles: true }));
  }));
  await t.page.waitForTimeout(500);
  assert.deepEqual(t.errors, [], "the Thermal job threw after its part lost its frame");
  await t.ctx.close();
});

test("an upward sideways part says when this browser can't draw writing-mode: sideways-lr", async () => {
  const up = { id: 1, type: "text", render: "sideways", sideDir: "up", text: "UP" };
  for (const supported of [true, false]) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(installClipboardStub);
    await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch (e) {} }, ["rw_blocks_v1", JSON.stringify([up])]);
    if (!supported) {
      await ctx.addInitScript(() => {
        if (window.parent !== window) return;   // the app's page only, not the preview frame
        const real = CSS.supports.bind(CSS);
        CSS.supports = (p, v) => (/sideways-lr/.test(String(p) + String(v)) ? false : real(p, v));
      });
    }
    const page = await ctx.newPage();
    await page.goto(server.url);
    await settled(page);
    const { verdict } = await drawnPart(page, 0, await copyPayload(page));
    assert.equal(/can't draw upward sideways text/.test(verdict), !supported, verdict);
    await ctx.close();
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

// ── Review round 2 ─────────────────────────────────────────────────────────

test("presets: names stay unique, Save asks before replacing, and Load, Rename and Delete act on the one picked", async () => {
  // Keyed on the name, two presets called "A" were one entry: Load on the second loaded the
  // first, and one Delete removed both. An older build could have saved such a list, so it is
  // seeded here, and the list must still tell the two apart.
  const P = (name, text, at) => ({ v: 1, name, savedAt: at, blocks: [BIG({ id: 1, text })] });
  const presets = { v: 1, presets: [P("A", "FIRST", 1), P("A", "SECOND", 2), P("B", "THIRD", 3)] };
  const { page, ctx, errors } = await freshPage({ presets });
  const names = () => page.locator("#presetList option").allTextContents();
  const text = () => cards(page).first().locator("textarea").inputValue();
  const note = () => page.textContent("#presetNote");
  assert.deepEqual(await names(), ["A", "A", "B"]);

  await page.selectOption("#presetList", { index: 1 });
  await page.click("#presetLoad");
  assert.equal(await page.textContent("#presetLoad"), "Replace stack?", "the default stack is in no preset, so Load asks first");
  await page.click("#presetLoad");
  assert.equal(await text(), "SECOND", "Load on the second A loaded another preset");
  assert.equal(await note(), 'Loaded "A".', "no uploaded pictures, so nothing to check and nothing promised");

  // Delete removes the one picked, and only after a second press.
  await page.selectOption("#presetList", { index: 0 });
  await page.click("#presetDelete");
  assert.equal(await page.textContent("#presetDelete"), "Really?");
  await page.click("#presetDelete");
  assert.deepEqual(await names(), ["A", "B"], "one Delete removed both A's");
  assert.deepEqual((await stored(page, "rw_presets_v1")).presets.map((p) => p.blocks[0].text), ["SECOND", "THIRD"]);

  // Rename onto a taken name is refused; renaming to the same name says so.
  await page.selectOption("#presetList", { label: "B" });
  await page.fill("#presetName", "A");
  await page.click("#presetRename");
  assert.match(await note(), /^There's already a setup called "A"\./);
  assert.deepEqual(await names(), ["A", "B"]);
  await page.fill("#presetName", "B");
  await page.click("#presetRename");
  assert.match(await note(), /^"B" is already its name\./);
  await page.fill("#presetName", "C");
  await page.click("#presetRename");
  assert.equal(await note(), 'Renamed "B" to "C".');
  assert.deepEqual(await names(), ["A", "C"]);

  // Save under a taken name asks first; the second press replaces it, and says so.
  await cards(page).first().locator("textarea").fill("NEW");
  await page.fill("#presetName", "C");
  await page.click("#presetSave");
  assert.equal(await page.textContent("#presetSave"), "Replace?");
  assert.match(await note(), /^There's already a setup called "C"\. Press Replace\?/);
  assert.equal((await stored(page, "rw_presets_v1")).presets[1].blocks[0].text, "THIRD", "replaced without asking");
  await page.click("#presetSave");
  assert.equal(await page.textContent("#presetSave"), "Save");
  assert.equal(await note(), 'Replaced "C" with this stack (1 block).');
  assert.deepEqual(await names(), ["A", "C"]);
  assert.equal((await stored(page, "rw_presets_v1")).presets[1].blocks[0].text, "NEW");
  // A new name in the box disarms the question.
  await page.fill("#presetName", "A");
  await page.click("#presetSave");
  assert.equal(await page.textContent("#presetSave"), "Replace?");
  await page.fill("#presetName", "D");
  assert.equal(await page.textContent("#presetSave"), "Save");
  await page.click("#presetSave");
  assert.deepEqual(await names(), ["A", "C", "D"]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a glyph-art picture from a picked file: read on this device, and after a reload or in a preset the app asks for it again", async () => {
  const blank = { id: 1, type: "image", imgKind: "glyph", url: "", width: 70, rotate: 0, adjBright: 0, adjContrast: 0,
                  tier: "cjk", cols: 16, dither: true, contrast: 128, invert: false };
  const { page, ctx, errors, requests } = await freshPage({ blocks: [blank] });
  const card = cards(page).first();
  const cardNote = () => card.locator(".text-note").innerText();
  assert.equal(await cardNote(), "Paste an image link or pick a file.");
  assert.match(await page.textContent("#parts"), /Nothing to print yet: add a block, or type into one\./);
  assert.match(await card.innerText(), /A picked file is read on this device and never uploaded/);

  await card.locator("input[type=file]").setInputFiles({ name: "photo.png", mimeType: "image/png",
    buffer: Buffer.from(PIC.split(",")[1], "base64") });
  await settled(page);
  const pay = await copyPayload(page);
  assertTags(pay);
  assert.match(pay, /^Cheer100 <div style=font-size:[\d.]+vw;line-height:1>/);
  assert.match(await cardNote(), /^16 columns × \d+ rows · 1 cheer/);
  assert.ok(!/Decoding/.test(await card.innerText()), "a finished read still says Decoding…");
  const saved = (await stored(page, "rw_blocks_v1"))[0];
  assert.equal(saved.fileName, "photo.png");
  assert.equal(saved.url, "");

  // A preset can't hold the picture; Save says so.
  await page.fill("#presetName", "Pic");
  await page.click("#presetSave");
  assert.match(await page.textContent("#presetNote"), /^Saved "Pic" with 1 block\. A picture picked from a file isn't saved with it/);

  // After a reload the block can't print, and every place that would show it says why.
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.match(await cards(page).first().locator(".text-note").innerText(), /^Pick “photo\.png” again: a picked file isn't kept after a reload/);
  assert.match(await page.textContent("#parts"), /pick the picture's file again on its Image card/);
  assert.equal(await page.locator("#parts .part button").count(), 0, "a cheer with nothing to print was offered");
  // Nothing was uploaded or fetched for it.
  assert.deepEqual(requests.filter((u) => /\/upload|\/px/.test(u)), []);
  assert.deepEqual(errors, []);
  await ctx.close();

  // A file that isn't a picture says so instead of "Decoding…" for ever.
  const { page: p2, ctx: c2 } = await freshPage({ blocks: [blank] });
  await cards(p2).first().locator("input[type=file]").setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not a png") });
  await p2.waitForFunction(() => /couldn't be read as a picture/.test(document.querySelector("#blockList .text-note").innerText), null, { timeout: 5000 });
  assert.ok(!/Decoding/.test(await cards(p2).first().innerText()));
  await c2.close();
});

test("a link that can't be read says so, and is not fetched again on every edit", async () => {
  // The test server has no /px, so every read fails. Before, the failure was never remembered:
  // each refresh started the read again (every keystroke anywhere, twice per Copy) and the card
  // said "Reading the picture…" for ever.
  const dead = { id: 1, type: "image", imgKind: "glyph", url: "https://example.com/dead.png", width: 70, rotate: 0,
                 adjBright: 0, adjContrast: 0, tier: "cjk", cols: 16, dither: true, contrast: 128, invert: false };
  const { page, ctx, errors, requests } = await freshPage({ blocks: [dead, BIG({ id: 2, text: "HI" })] });
  const pxReads = () => requests.filter((u) => u.includes("/px?u=")).length;
  const card = cards(page).first();
  await page.waitForFunction(() => /couldn't be read/.test(document.querySelector("#blockList .text-note").innerText), null, { timeout: 5000 });
  assert.match(await card.locator(".text-note").innerText(), /^The picture couldn't be read\. Check the link, or pick the file instead/);
  const n = pxReads();
  assert.equal(n, 1);
  for (const b of ["101", "102", "103"]) await page.fill("#bitsAmount", b);
  await copyPayload(page, 0);
  await page.waitForTimeout(400);
  assert.equal(pxReads(), n, "the dead link was fetched again by an unrelated edit");
  // A new link is read once.
  await card.locator("input[type=url]").fill("https://example.com/also-dead.png");
  await page.waitForFunction(() => /couldn't be read/.test(document.querySelector("#blockList .text-note").innerText), null, { timeout: 5000 });
  assert.equal(pxReads(), n + 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Copy sits in each part's header, full size, and the header stays in view while its preview scrolls", async () => {
  for (const viewport of [undefined, { width: 390, height: 844 }]) {
    const { page, ctx } = await freshPage({ viewport, blocks: [BIG({ id: 1, text: "HELLO" }), BIG({ id: 2, text: "WORLD" })] });
    await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 2);
    for (let i = 0; i < 2; i++) {
      const part = page.locator("#parts .part").nth(i);
      assert.equal(await part.locator("button").count(), 1, "one Copy a part");
      const btn = part.locator(".part-head button.copy-btn");
      assert.equal(await btn.textContent(), "Copy part " + (i + 1));
      const b = await btn.boundingBox(), stage = await part.locator(".rcpt-stage").boundingBox();
      assert.ok(b.height >= 44, "Copy is " + b.height + "px tall");
      assert.ok(b.y + b.height <= stage.y + 1, "Copy is below its preview");
      assert.equal(await part.locator(".part-head").evaluate((e) => getComputedStyle(e).position), "sticky");
    }
    // Scrolled half way down part 1's preview, its header (and Copy) is still on screen.
    const stage = await page.locator("#parts .part").first().locator(".rcpt-stage").boundingBox();
    await page.evaluate((y) => window.scrollTo(0, y), stage.y + stage.height / 2);
    const head = await page.locator("#parts .part").first().locator(".part-head").boundingBox();
    assert.ok(head.y >= -1 && head.y < 5, "the header scrolled away: y " + head.y);
    await ctx.close();
  }
});

test("a probe shows the way back to the stack; number fields show the values the app uses; the dither waits for the thermal view", async () => {
  const { page, ctx, errors } = await freshPage();
  const stack = await copyPayload(page);
  await page.click("#hrProbeBtn");
  assert.match(await page.textContent("#modeNote"), /This is the High Roller test, not your stack/);
  await page.click("#backToStack");
  assert.equal(await page.locator("#backToStack").count(), 0);
  assert.equal(await copyPayload(page), stack, "Back to my stack did not bring the stack back");
  // The High Roller test is built for the receipt the threshold buys: at 50 bits per inch, 25
  // bits buy 48px, which the Cheer line fills, so there is nothing to test and no Copy.
  await page.fill("#bitsPerInch", "50");
  await page.click("#hrProbeBtn");
  assert.equal(await page.locator("#parts .part button").count(), 0);
  assert.match(await page.textContent("#parts"), /this test can't show anything/);
  await page.click("#backToStack");
  await page.fill("#bitsPerInch", "0");

  // 0 bits is 100 (a cheer is at least 1 bit), and the field says so once committed.
  await page.fill("#bitsAmount", "0");
  await page.locator("#bitsAmount").press("Tab");
  assert.equal(await page.inputValue("#bitsAmount"), "100");
  assert.match(await copyPayload(page), /^Cheer100 /);
  await page.fill("#maxInches", "50");
  await page.locator("#maxInches").press("Tab");
  assert.equal(await page.inputValue("#maxInches"), "40", "the dock's maximum length is 40 inches");

  assert.equal(await page.locator("#thermalDither").isDisabled(), true);
  await page.check("#thermalView");
  assert.equal(await page.locator("#thermalDither").isDisabled(), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the cards' notes: High Roller off, labels at the threshold's bits, a free test's cost, and Han columns as printed", async () => {
  const pic = (o) => ({ id: 2, type: "image", imgKind: "glyph", url: PIC, width: 70, rotate: 0, adjBright: 0, adjContrast: 0,
                        tier: "cjk", cols: 40, dither: true, contrast: 128, invert: false, ...o });
  // High Roller off (threshold 0): no "below the threshold (0 bits)".
  let { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO" }), pic()],
                                                controls: { ...SETTINGS, hrThreshold: 0 } });
  await settled(page);
  const tn = await cards(page).nth(0).locator(".text-note").innerText(), gn = await cards(page).nth(1).locator(".text-note").innerText();
  assert.match(tn, /High Roller is off \(threshold 0\)/);
  assert.ok(!/threshold \(0 bits\)|at the threshold or more/.test(tn), tn);
  assert.match(gn, /High Roller is off \(threshold 0\), so every picture prints as a plain grid/);
  await ctx.close();

  // Below a threshold of 1000 with 100 bits per inch, the labels describe a 1000-bit cheer
  // (960px of receipt), not this 1-bit cheer's 1px box.
  ({ page, ctx } = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO" })],
                                     controls: { ...SETTINGS, bits: 1, hrThreshold: 1000, bitsPerInch: 100 } }));
  const fit1 = await cards(page).first().locator(".sel-size option[value=fit1]").textContent();
  assert.ok(!/cut off by the box/.test(fit1), fit1);
  assert.match(await cards(page).first().locator(".text-note").innerText(), /The sizes above are what it prints at 1000 bits or more/);
  await ctx.close();

  // A free test costs nothing: messages, not bits.
  ({ page, ctx } = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO" }), BIG({ id: 3, text: "WORLD" })],
                                     controls: { ...SETTINGS, cheer: false } }));
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 2);
  assert.match(await page.textContent("#partsTotal"), /2 messages, free/);
  const fn = await cards(page).first().locator(".text-note").innerText();
  assert.match(fn, /1 message, free/);
  assert.match(fn, /Your whole stack takes 2 messages/);
  assert.ok(!/bits/.test(fn), fn);
  await ctx.close();

  // A block saved with 40 columns of Han characters prints 30, and the field says 30.
  ({ page, ctx, errors } = await freshPage({ blocks: [pic({ id: 1 })] }));
  await settled(page);
  assert.equal(await cards(page).first().locator("input.num-cols").inputValue(), "30");
  assert.match(await cards(page).first().locator(".text-note").innerText(), /^30 columns ×/);
  assert.equal((await stored(page, "rw_blocks_v1"))[0].cols, 40, "showing the clamp rewrote the block");
  // Committing a value writes back the one that prints.
  await cards(page).first().locator("input.num-cols").fill("45");
  await cards(page).first().locator("input.num-cols").press("Tab");
  assert.equal(await cards(page).first().locator("input.num-cols").inputValue(), "30");
  assert.equal((await stored(page, "rw_blocks_v1"))[0].cols, 30);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("round 3: phone layout puts the preview under the blocks; every card control is labelled; the notes say what they mean", async () => {
  // On a phone the preview and its Copy sat about 1,900px below the text box, past the presets
  // and every setting. Now the page reads blocks, preview, settings on a phone, and on a wide
  // screen the preview sits beside the blocks with the settings under the blocks.
  for (const viewport of [{ width: 390, height: 844 }, undefined]) {
    const { page, ctx, errors } = await freshPage({ viewport });
    await settled(page);
    const box = (sel) => page.locator(sel).first().boundingBox();
    const list = await box("#blockList"), parts = await box("#parts"), presets = await box("#presets"), streamer = await box("#streamer");
    if (viewport) {
      assert.ok(parts.y > list.y + list.height - 1, "the preview comes after the blocks");
      assert.ok(parts.y < presets.y && parts.y < streamer.y, "the preview comes before the presets and the settings");
      assert.ok(parts.y - (list.y + list.height) < 400, "and right after the blocks: " + (parts.y - list.y - list.height) + "px");
    } else {
      assert.ok(parts.x > list.x + list.width - 1, "the preview is beside the blocks");
      assert.ok(presets.y > list.y + list.height - 1 && Math.abs(presets.x - list.x) < 2, "the presets sit under the blocks");
    }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(sw <= 0, "no sideways scroll: " + sw);
    assert.deepEqual(errors, []);
    await ctx.close();
  }

  const pic = { id: 2, type: "image", imgKind: "glyph", url: PIC, width: 70, rotate: 0, adjBright: 0, adjContrast: 0,
                tier: "cjk", cols: 20, dither: true, contrast: 128, invert: false };
  const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: "good game everyone" }), pic] });
  await settled(page);
  // Every textarea, select and input in a card has a label (for= or wrapping) or an aria-label;
  // the icon buttons are named by what they do.
  const unlabelled = await page.evaluate(() => Array.from(document.querySelectorAll("#blockList textarea, #blockList select, #blockList input"))
    .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute("aria-label")).map((el) => el.outerHTML.slice(0, 80)));
  assert.deepEqual(unlabelled, []);
  assert.equal(await cards(page).first().getByLabel("Text").count(), 1, "the Text label names the textarea");
  assert.equal(await cards(page).first().getByLabel("Layout").count(), 1);
  for (const name of ["Move block up", "Move block down", "Remove block"]) assert.equal(await cards(page).first().getByRole("button", { name }).count(), 1, name);
  assert.equal(await cards(page).nth(1).getByRole("button", { name: "Reset detail (columns) to 18" }).count(), 1);
  // Big text says how much tape each choice takes, and the wrapped form is one pick away.
  const layouts = await cards(page).first().locator(".sel-layout option").evaluateAll((os) => os.map((o) => [o.value, o.textContent]));
  assert.deepEqual(layouts.map((l) => l[0]), ["auto", "lines", "wrap", "stack", "each"]);
  for (const [v, t] of layouts) assert.match(t, /cm of message/, v + ": " + t);
  assert.match(layouts[2][1], /^Words wrapped to the paper · capitals/);
  // One part says what it costs (the hints point under the preview for it).
  await cards(page).nth(1).getByRole("button", { name: "Remove block" }).click();
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 1);
  assert.match(await page.textContent("#partsTotal"), /^One 100-bit cheer\./);
  // A probe's banner no longer says "on the left" (on a phone the blocks are above).
  await page.click("#hrProbeBtn");
  assert.match(await page.textContent("#modeNote"), /not your stack\. Your blocks are unchanged\./);
  await page.click("#backToStack");
  // A free test below the threshold says the real cheer prints as Han tiling.
  await page.uncheck("#cheer");
  await page.fill("#bitsAmount", "10");
  await page.locator("#bitsAmount").press("Tab");
  assert.match(await page.textContent("#modeNote"), /Your 10-bit cheer will print as Han tiling instead: this tests the High Roller form, which needs 25 bits or more\./);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("round 3: an old preset's uploaded picture is checked on Load, explained, and worded for Glyph-art; Import adds under a free name", async () => {
  const minted = "https://i.uwutoowo.com/0123456789ab.png";
  const old = { v: 1, name: "Old", savedAt: 1, blocks: [{ id: 1, type: "takeover", items: [
    { kind: "pic", url: minted }, { kind: "text", text: "HI" }] }] };
  const keep = { v: 1, name: "Keep", savedAt: 2, blocks: [{ id: 1, type: "text", render: "big", text: "KEEP" }] };
  const { page, ctx, errors } = await freshPage({ presets: { v: 1, presets: [old, keep] } });
  // The upload has expired: its host answers 404 (never the real network in a test).
  await ctx.route("https://i.uwutoowo.com/**", (r) => r.fulfill({ status: 404, body: "gone" }));
  await page.selectOption("#presetList", "0");
  await page.click("#presetLoad");
  await page.click("#presetLoad");   // the default stack is in no preset: the first press asks
  const note = page.locator("#presetNote");
  // It was 0 links (counted on the stored takeover), so it said nothing about them; and the
  // check's promise was never returned, so a count of 1 would have hung on "Checking…".
  await page.waitForFunction(() => /expired/.test(document.getElementById("presetNote").textContent), null, { timeout: 8000 });
  const t = await note.textContent();
  assert.match(t, /^Loaded "Old"\. This setup had a Takeover/);
  assert.match(t, /The preset "Old" itself is unchanged/);
  assert.match(t, /1 picture's link has expired: pick the file again or paste a fresh link on the flagged block\./);
  const card = cards(page).first();
  assert.equal(await card.locator(".sel-kind").inputValue(), "glyph");
  await page.waitForFunction(() => !!document.querySelector("#blockList .expired-note"));
  assert.match(await card.locator(".expired-note").textContent(), /Pick the file again \(it stays on this device\) or paste another link\./);
  assert.ok(!/re-upload/.test(await card.innerText()), "a Glyph-art block's note talked about re-uploading");
  await page.waitForFunction(() => !/Reading the picture/.test(document.querySelector("#blockList .text-note").textContent));
  assert.ok(!/couldn't be read/.test(await card.locator(".text-note").innerText()), "two notes for one dead link");
  // The stored preset is unchanged.
  assert.equal((await stored(page, "rw_presets_v1")).presets[0].blocks[0].type, "takeover");

  // Picking another preset clears a note about the last one.
  await page.selectOption("#presetList", "1");
  assert.equal((await note.textContent()).trim(), "");
  // Import adds, and never replaces: a taken name gets a number, and the note says so.
  await page.click("#presetImport");
  await page.fill("#presetJson", JSON.stringify({ v: 1, presets: [{ ...keep, savedAt: 3 }, { ...keep, name: "New", savedAt: 4 }] }));
  await page.click("#presetImport");
  assert.equal(await note.textContent(), 'Imported 2 setups. "Keep" was already taken, so it was added as "Keep (2)".');
  await page.fill("#presetJson", JSON.stringify({ v: 1, presets: [{ ...keep, name: "Newer", savedAt: 5 }] }));
  await page.click("#presetImport");
  assert.equal(await note.textContent(), "Imported 1 setup.");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("round 3: Han tiling keeps every line (up to 50, and says so past it); a box too short for a row says every part is cut; over-length is worded for text", async () => {
  const letters = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + (i % 26))).join("\n");
  const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: letters(26) })],
                                                  controls: { ...SETTINGS, bits: 10 }, core: true });
  await settled(page);
  // The old cap was 24 lines, silently: Y and Z were gone below the threshold.
  const rows = await page.evaluate((t) => {
    const K = window.module.exports;
    return [K.designTTextGrid(t.slice(0, 2 * 24 - 1), 80, 700).length, K.designTTextGrid(t, 80, 700).length];
  }, letters(26));
  assert.ok(rows[1] > rows[0], "26 lines draw more rows than 24: " + rows);
  let tn = await cards(page).first().locator(".text-note").innerText();
  assert.match(tn, /^Han tiling: \d+ rows of 15 Han characters/);
  assert.ok(!/left out/.test(tn), tn);
  await cards(page).first().locator("textarea").fill(new Array(51).fill("I").join("\n"));
  await page.waitForFunction(() => /left out/.test(document.querySelector("#blockList .text-note").textContent), null, { timeout: 20000 });
  tn = await cards(page).first().locator(".text-note").innerText();
  assert.match(tn, /Han tiling draws the first 50 lines only, so the last line is left out\. Put the rest in another block\./);
  await ctx.close();

  // A Han tiling block in a High Roller cheer whose box (bits per inch) is shorter than a
  // header, one row and the Cheer line: every part is cut, and the card says so.
  ({ page: p2, ctx: c2 } = await freshPage({ blocks: [{ id: 1, type: "text", render: "hanzi", text: "HI" }],
                                              controls: { ...SETTINGS, bitsPerInch: 200 } }));
  await settled(p2);
  assert.match(await cards(p2).first().locator(".text-note").innerText(),
    /Even one row a part \(with its light first row and the Cheer line, 3 lines\) is taller than this cheer’s part of the receipt/);
  await c2.close();

  // A part over 500 characters: the fix is worded for text (it has no columns).
  ({ page: p2, ctx: c2 } = await freshPage({ blocks: [BIG({ id: 1, bigLayout: "lines", text: "ab ".repeat(175) })] }));
  await p2.waitForSelector("#parts .over-note");
  const over = await p2.locator("#parts .over-note").first().textContent();
  assert.match(over, /^Too long for Twitch \(500 characters\), so Twitch rejects it and it never prints\. To fix it, shorten the text or break it over more lines\.$/);
  assert.deepEqual(errors, []);
  await c2.close();
});
let p2, c2;

// ── Polish round 1 ─────────────────────────────────────────────────────────

// The clipboard as the places viewers paste from often have it: writeText refused. `__clip`
// picks what the execCommand fallback does: "fail" (copies nothing), "fallback" (copies) or
// "ok" (writeText works). The app's page only, not the preview frames.
function refusingClipboard() {
  if (window.parent !== window) return;
  window.__clip = "fail";
  window.__copied = [];
  const clip = { writeText: (t) => (window.__clip === "ok" ? (window.__copied.push(String(t)), Promise.resolve()) : Promise.reject(new Error("denied"))) };
  Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => clip });
  const real = document.execCommand.bind(document);
  document.execCommand = (c, ...a) => (c === "copy" ? window.__clip === "fallback" : real(c, ...a));
}

test("polish: Copy says Copied only when the clipboard took it; refused, the part shows its payload selected, to copy by hand", async () => {
  const blocks = [BIG({ id: 1, text: "HELLO" }), BIG({ id: 2, text: "WORLD" })];
  const { page, ctx, errors } = await freshPage({ blocks, init: refusingClipboard });
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 2);
  const want = expectNode(blocks);
  const part = (i) => page.locator("#parts .part").nth(i);
  await part(1).locator(".copy-btn").click();
  await page.waitForSelector("#parts .copy-fail textarea");
  assert.equal(await part(1).locator(".copy-btn").textContent(), "Copy part 2", "it said Copied for a copy that failed");
  assert.match(await part(1).locator(".copy-fail").innerText(), /^Couldn't copy automatically: select this text and copy it\./);
  const box = await part(1).locator(".copy-fail textarea").evaluate((t) => ({ value: t.value, ro: t.readOnly,
    focused: document.activeElement === t, a: t.selectionStart, b: t.selectionEnd }));
  assert.deepEqual(box, { value: want[1], ro: true, focused: true, a: 0, b: want[1].length });
  // It sits under that part's header, before its preview.
  assert.ok(await part(1).evaluate((el) => {
    const f = el.querySelector(".copy-fail"), h = el.querySelector(".part-head"), st = el.querySelector(".rcpt-stage");
    return !!(h.compareDocumentPosition(f) & 4) && !!(f.compareDocumentPosition(st) & 4);
  }), "the manual-copy box is not between the header and the preview");
  assert.equal(await part(0).locator(".copy-fail").count(), 0);
  // Typing elsewhere does not steal focus back to the box.
  await cards(page).first().locator("textarea").fill("HELLO");
  assert.equal(await page.evaluate(() => document.activeElement.closest(".copy-fail") === null), true);
  // The execCommand fallback copying counts as copied, and the box goes.
  await page.evaluate(() => { window.__clip = "fallback"; });
  await part(1).locator(".copy-btn").click();
  await page.waitForFunction(() => document.querySelectorAll("#parts .part")[1].querySelector(".copy-btn").textContent === "Copied");
  assert.equal(await page.locator("#parts .copy-fail").count(), 0);
  await page.evaluate(() => { window.__clip = "ok"; });
  await part(0).locator(".copy-btn").click();
  await page.waitForFunction(() => document.querySelectorAll("#parts .part")[0].querySelector(".copy-btn").textContent === "Copied");
  assert.deepEqual(await page.evaluate(() => window.__copied), [want[0]]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("polish: presets: Load asks before replacing an unsaved stack; Import never replaces; the expiry note counts Glyph-art only", async () => {
  const P = (name, text, at) => ({ v: 1, name, savedAt: at, blocks: [BIG({ id: 1, text })] });
  const { page, ctx, errors } = await freshPage({ presets: { v: 1, presets: [P("Stream", "FIRST", 1)] } });
  const names = () => page.locator("#presetList option").allTextContents();
  const text = () => cards(page).first().locator("textarea").inputValue();
  const note = () => page.textContent("#presetNote");
  // Import: two of one name in the file, one of them also a saved name. Everything is added.
  await page.click("#presetImport");
  await page.fill("#presetJson", JSON.stringify({ v: 1, presets: [P("Stream", "SECOND", 2), P("Stream", "THIRD", 3), P("Other", "FOURTH", 4)] }));
  await page.click("#presetImport");
  assert.deepEqual(await names(), ["Stream", "Stream (2)", "Stream (3)", "Other"]);
  assert.equal(await note(), 'Imported 3 setups. 2 had names already in use, so they were added with a number after the name: "Stream (2)" and "Stream (3)".');
  assert.deepEqual((await stored(page, "rw_presets_v1")).presets.map((p) => p.blocks[0].text), ["FIRST", "SECOND", "THIRD", "FOURTH"]);
  // The stack on screen (the default HELLO) is in no preset: Load asks first, and any other
  // preset action or a new pick disarms it.
  await page.selectOption("#presetList", { index: 1 });
  await page.click("#presetLoad");
  assert.equal(await page.textContent("#presetLoad"), "Replace stack?");
  assert.equal(await text(), "HELLO");
  await page.selectOption("#presetList", { index: 2 });
  assert.equal(await page.textContent("#presetLoad"), "Load", "a new pick did not disarm Load");
  // Saved first, it loads on the first press, and a loaded stack is a saved one.
  await page.fill("#presetName", "Mine");
  await page.click("#presetSave");
  await page.selectOption("#presetList", { label: "Stream (2)" });
  await page.click("#presetLoad");
  assert.equal(await text(), "SECOND", "a saved stack still made Load ask");
  await page.selectOption("#presetList", { label: "Other" });
  await page.click("#presetLoad");
  assert.equal(await text(), "FOURTH");
  // Edited, it is unsaved again.
  await cards(page).first().locator("textarea").fill("FOURTH!");
  await page.selectOption("#presetList", { label: "Mine" });
  await page.click("#presetLoad");
  assert.equal(await page.textContent("#presetLoad"), "Replace stack?");
  await page.click("#presetLoad");
  assert.equal(await text(), "HELLO");
  assert.deepEqual(errors, []);
  await ctx.close();

  // A preset whose Glyph-art AND Real picture links have both expired: only the Glyph-art one
  // stops printing, so only it is counted, and the advice fits it.
  const dead = (n) => "https://i.uwutoowo.com/" + n.repeat(12) + ".png";
  const img = (id, imgKind, url) => ({ id, type: "image", imgKind, url, width: 70, rotate: 0, adjBright: 0, adjContrast: 0,
                                       tier: "cjk", cols: 16, dither: true, contrast: 128, invert: false });
  const pics = { v: 1, name: "Pics", savedAt: 1, blocks: [img(1, "glyph", dead("a")), img(2, "real", dead("b"))] };
  const t = await freshPage({ blocks: [img(1, "glyph", "")], presets: { v: 1, presets: [pics] } });
  await t.ctx.route("https://i.uwutoowo.com/**", (r) => r.fulfill({ status: 404, body: "gone" }));
  await t.page.click("#presetLoad");
  // Wait for the check's answer, not its "Checking its uploaded pictures still load…" note,
  // which the old /expired|still load/ also matched: on a slow runner the test then read the
  // note before the check had finished.
  await t.page.waitForFunction(() => { const n = document.getElementById("presetNote").textContent;
    return !/Checking/.test(n) && /expired|still load/.test(n); }, null, { timeout: 8000 });
  assert.match(await t.page.textContent("#presetNote"), /^Loaded "Pics"\. 1 picture's link has expired: pick the file again or paste a fresh link on the flagged block\.$/);
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test("polish: a probe scrolls into view and takes focus; Back to my stack does the same for the stack", async () => {
  // A stack about 40 cm tall, on a phone, the probe buttons pressed from where they are.
  const tall = [BIG({ id: 1, text: "HELLO WORLD", bigLayout: "stack", bigSize: 200 })];
  for (const reduced of [true, false]) {
    const { page, ctx, errors } = await freshPage({ blocks: tall, viewport: { width: 390, height: 844 } });
    if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => document.querySelectorAll("#parts .part").length >= 2);
    const inView = (sel) => page.waitForFunction((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return r.top >= -2 && r.top < innerHeight / 2;
    }, sel, { timeout: 5000 });
    await page.locator("#hrProbeBtn").scrollIntoViewIfNeeded();
    await page.click("#hrProbeBtn");
    await inView("#modeNote");
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.matches("#parts .part .copy-btn")), true,
      "focus is not on the probe's Copy");
    await page.locator("#plainProbeBtn").scrollIntoViewIfNeeded();
    await page.click("#plainProbeBtn");
    await inView("#modeNote");
    await page.click("#backToStack");
    await inView("#parts");
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector("#parts .part .copy-btn")), true,
      "Back to my stack did not focus the stack's first Copy");
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // A probe with nothing to copy (High Roller off) focuses the way back.
  const { page, ctx } = await freshPage({ blocks: tall, controls: { ...SETTINGS, hrThreshold: 0 } });
  await page.click("#hrProbeBtn");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "backToStack");
  await ctx.close();
});

test("polish: a box with no room after the Cheer line: every part says so, Copy is off, and the total gives the advice", async () => {
  for (const [s, advice] of [
    [{ ...SETTINGS, bits: 25, bitsPerInch: 200 }, /^Nothing worth sending: every part would print only its Cheer line\. Set Bits per cheer higher: the streamer gives 1 inch \(2\.5 cm\) of receipt per 200 bits\.$/],
    [{ ...SETTINGS, maxInches: 0.2 }, /^Nothing worth sending: every part would print only its Cheer line, whatever the bits\./],
  ]) {
    const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO" }), { id: 2, type: "text", render: "hanzi", text: "HI" }], controls: s });
    await page.waitForFunction(() => document.querySelectorAll("#parts .part").length >= 2);
    const n = await page.locator("#parts .part").count();
    for (let i = 0; i < n; i++) {
      const part = page.locator("#parts .part").nth(i);
      assert.equal(await part.locator(".copy-btn").isDisabled(), true, "part " + (i + 1) + " can still be copied");
      assert.match(await part.locator(".over-note").first().textContent(), /^Prints (nothing but the Cheer line|only its light first row)/);
    }
    const total = await page.textContent("#partsTotal");
    assert.match(total, advice);
    assert.ok(!/bits total/.test(total), total);
    assert.match(await page.textContent("#modeNote"), /nothing after it prints/);
    // The card agrees with the parts: no price for something that can't be sent (polish 2).
    const sum = await cards(page).first().locator(".text-note .note-sum").textContent();
    assert.match(sum, /· prints nothing: the Cheer line fills this cheer’s whole part of the receipt/);
    assert.ok(!/bits\)|cheers/.test(sum), sum);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("polish: the cards: move buttons stop at the ends, the layout hint follows the layout, long hints fold, the file input empties, placeholders wrap", async () => {
  const { page, ctx, errors, requests } = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO", bigLayout: "lines" })], viewport: { width: 390, height: 844 } });
  const btn = (i, name) => cards(page).nth(i).getByRole("button", { name });
  assert.equal(await btn(0, "Move block up").isDisabled(), true);
  assert.equal(await btn(0, "Move block down").isDisabled(), true);
  await page.click("#addImageBtn");
  assert.deepEqual([await btn(0, "Move block up").isDisabled(), await btn(0, "Move block down").isDisabled(),
                    await btn(1, "Move block up").isDisabled(), await btn(1, "Move block down").isDisabled()], [true, false, false, true]);
  // The layout hint is about the layout picked, and only that one.
  const card = cards(page).first(), hint = card.locator(".layout-hint");
  assert.match(await hint.textContent(), /^Each line you typed prints as one line/);
  await card.locator(".sel-layout").selectOption("auto");
  assert.match(await hint.textContent(), /^Auto tries your lines as typed/);
  for (const [v, re] of [["wrap", /wrapped to the paper's width/], ["stack", /^One letter a line/], ["each", /^Every line you typed at its own size/]]) {
    await card.locator(".sel-layout").selectOption(v);
    assert.match(await hint.textContent(), re, v);
    assert.ok(!/Auto/.test(await hint.textContent()), v);
  }
  // Long explanations are folded, open on a click, and nothing about them is saved.
  const more = card.locator("details.more");
  assert.ok(await more.count() >= 2);
  assert.equal(await more.first().evaluate((d) => d.open), false);
  assert.ok(!/bold Arial and can't be changed/.test(await card.innerText()), "a folded hint shows");
  await card.locator("details.more summary", { hasText: "What's this?" }).nth(1).click();
  assert.match(await card.innerText(), /bold Arial and can't be changed/);
  assert.equal(await page.locator(".preview > details.more").evaluate((d) => d.open), false, "the thermal caption's detail is folded");
  assert.match(await page.locator(".preview > .hint").first().textContent(), /give or take fonts: this computer's fonts may differ from the streamer's/);
  // The Cheer-ready hint says where the word goes.
  assert.match(await page.locator("#cheer").locator("xpath=../following-sibling::div[1]").textContent(),
    /^Adds "Cheer<bits>" to each message \(at the start, or at the end of a plain-text part\) so it triggers the print/);
  // The part header names its unit.
  assert.match(await page.locator("#parts .part-count").first().textContent(), /^\d+ \/ 500 characters$/);
  // The file input: emptied once a file is taken, and on a change of kind, so the same file
  // picked again on a Real picture card uploads.
  const img = cards(page).nth(1), file = img.locator("input[type=file]");
  const pic = { name: "photo.png", mimeType: "image/png", buffer: Buffer.from(PIC.split(",")[1], "base64") };
  await file.setInputFiles(pic);
  assert.equal(await file.evaluate((f) => f.files.length), 0, "the input kept the file it handed over");
  await settled(page);
  await img.locator(".sel-kind").selectOption("real");
  assert.equal(await file.evaluate((f) => f.files.length), 0);
  await file.setInputFiles(pic);
  // The test server has no /upload, so the upload is asked for and fails.
  await page.waitForFunction(() => /Upload failed/.test(document.querySelectorAll("#blockList > .block-card")[1].innerText), null, { timeout: 5000 });
  assert.ok(requests.some((u) => new URL(u).pathname === "/upload"), "picking the same file on the Real card uploaded nothing");
  // A placeholder part is prose, wrapped to the column: nothing cut off.
  await cards(page).nth(1).getByRole("button", { name: "Remove block" }).click();
  await cards(page).first().locator("textarea").fill("");
  const ph = page.locator("#parts .rcpt-placeholder");
  assert.match(await ph.textContent(), /^Nothing to print yet: add a block, or type into one\.$/);
  assert.ok(await ph.evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).whiteSpace === "normal"), "the placeholder is cut off");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("polish: labels and notes say what really prints: Each's sizes, the message's length, the profile picture, a split word, more columns, a row too tall", async () => {
  {
    const { page, ctx, errors } = await freshPage({ blocks: [
      BIG({ id: 1, text: "HAPPY\nBIRTHDAY\nTO YOU", bigLayout: "each" }),
      BIG({ id: 2, text: "THIS IS A VERY LONG MESSAGE", bigLayout: "stack", bigSize: "width" }),
      { id: 3, type: "text", render: "sideways", sideDir: "down", sideSize: "fit1", text: "this is a really long sideways sentence that goes on and on" }] });
    const c0 = cards(page).nth(0);
    // In Each a size is a cap: 400 px prints exactly what Auto prints (69, 46 and 62 px).
    assert.match(await c0.locator('.sel-size option[value="400"]').textContent(), /^up to 400 px · capitals 0\.9–1\.3 cm, \d+\.\d cm of message · 1 cheer$/);
    assert.match(await c0.locator('.sel-size option[value="48"]').textContent(), /^up to 48 px · capitals 0\.9 cm, /);
    await c0.locator(".sel-layout").selectOption("lines");
    assert.match(await c0.locator('.sel-size option[value="48"]').textContent(), /^48 px · capitals 0\.9 cm, \d+\.\d cm of message/);
    // A stacked word over two cheers is named.
    assert.match(await cards(page).nth(1).locator(".text-note").innerText(),
      /“MESSAGE” is too tall for one receipt at this size, so it breaks across two cheers, with the bot's header in between\. Pick a smaller size to keep it whole\./);
    // One long sideways line: Enter makes more columns.
    assert.match(await cards(page).nth(2).locator(".text-note").innerText(), /Press Enter between words to make more columns/);
    // The part line adds what a found profile picture would.
    const { verdict } = await drawnPart(page, 0, await copyPayload(page, 0));
    assert.match(verdict, /header and footer included, plus about 4\.8 cm if the bot finds the viewer's profile picture\./);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  {
    const { page, ctx } = await freshPage({ blocks: [BIG({ id: 1 })], controls: { ...SETTINGS, paperMm: 58 } });
    const { verdict } = await drawnPart(page, 0, await copyPayload(page, 0));
    assert.match(verdict, /plus about 4\.0 cm if the bot finds the viewer's profile picture\./);
    await ctx.close();
  }
  {
    // 25 bits at 50 bits per inch: 26.4px after the Cheer line, and an 8-column ASCII row is
    // 57px. Every part is cut, the card says why, and the verdict does not blame fonts.
    const pic = { id: 1, type: "image", imgKind: "glyph", url: PIC, width: 70, rotate: 0, adjBright: 0, adjContrast: 0,
                  tier: "ascii", cols: 8, dither: true, contrast: 128, invert: false };
    const { page, ctx, errors } = await freshPage({ blocks: [pic], controls: { ...SETTINGS, bits: 25, bitsPerInch: 50 } });
    await settled(page);
    assert.match(await cards(page).first().locator(".text-note").innerText(),
      /One row is taller than this cheer’s part of the receipt .*, so the bot cuts every part\. Raise Detail \(columns\), which makes the rows shorter, or set Bits per cheer higher for more room\./);
    const { verdict } = await drawnPart(page, 0, await copyPayload(page, 0));
    assert.match(verdict, /The bot cuts this message/);
    assert.ok(!/expected it to fit/.test(verdict), verdict);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("polish: a stack of 80 parts stays responsive: frames draw lazily, one at a time, as parts come near", async () => {
  // 100 bits at 25 bits per inch buy 384px of receipt: one 400px letter a cheer, 80 cheers. Every
  // part's frame loads the bot's 140 KB page and runs its renderer; all 80 at once, and again on
  // every keystroke, froze the page.
  const blocks = [BIG({ id: 1, text: "X".repeat(80), bigLayout: "stack", bigSize: 400 })];
  const s = { ...SETTINGS, bitsPerInch: 25 };
  const { page, ctx, errors } = await freshPage({ blocks, controls: s });
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 80, null, { timeout: 20000 });
  // Copy works at once, before any frame has drawn, and sends what the core builds.
  const t1 = Date.now();
  assert.equal(await copyPayload(page, 0), expectNode(blocks, s)[0]);
  assert.ok(Date.now() - t1 < 2000, "a click took " + (Date.now() - t1) + "ms");
  await page.waitForFunction(() => document.querySelector("#parts .part").getAttribute("data-render") === "done", null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  const frames = await page.locator("#parts iframe").count();
  assert.ok(frames >= 1 && frames <= 20, frames + " frames for 80 parts: they are not drawn lazily");
  // Every part has its header and Copy now; one that has not drawn keeps a box of its height.
  assert.equal(await page.locator("#parts .part .copy-btn").count(), 80);
  const far = page.locator("#parts .part").nth(70);
  assert.equal(await far.getAttribute("data-render"), "pending");
  assert.ok((await far.locator(".rcpt-wait").boundingBox()).height > 300, "the waiting box is not the receipt's height");
  // A keystroke re-plans 80 parts and redraws only the near ones: it is handled quickly.
  const ms = await page.evaluate(() => {
    const ta = document.querySelector("#blockList textarea"), a = performance.now();
    ta.value += "X"; ta.dispatchEvent(new Event("input", { bubbles: true }));
    return performance.now() - a;
  });
  assert.ok(ms < 1000, "a keystroke took " + Math.round(ms) + "ms");
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 81);
  // Scrolled to, the last part draws.
  await page.locator("#parts .part").last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => { const ps = document.querySelectorAll("#parts .part"); return ps[ps.length - 1].getAttribute("data-render") === "done"; }, null, { timeout: 15000 });
  assert.ok(await page.locator("#parts iframe").count() < 60, "scrolling to the end drew every part on the way");
  assert.deepEqual(errors, []);
  await ctx.close();
});


test("polish 2: × keeps the block for Undo, in its place, until the next change; the head's buttons are full touch targets on a phone", async () => {
  const blocks = [BIG({ id: 1, text: "HAPPY BIRTHDAY TO MY FAVOURITE STREAMER" }), BIG({ id: 2, text: "THANKS FOR THE RAID" }),
                  { id: 3, type: "image", imgKind: "glyph", url: "", fileName: "cat.png", tier: "cjk", cols: 18 }];
  const { page, ctx, errors } = await freshPage({ blocks, viewport: { width: 390, height: 844 } });
  // On a phone every head button is at least 44px, and × stands apart from ↓.
  const head = await page.evaluate(() => Array.from(document.querySelectorAll("#blockList .block-card")[0].querySelectorAll(".bc-head button"))
    .map((b) => { const r = b.getBoundingClientRect(); return { name: b.getAttribute("aria-label"), w: r.width, h: r.height, x: r.x }; }));
  for (const b of head) assert.ok(b.w >= 44 && b.h >= 44, b.name + " is " + b.w + "x" + b.h);
  assert.ok(head[2].x - (head[1].x + head[1].w) >= 12, "× sits " + (head[2].x - (head[1].x + head[1].w)) + "px from ↓");
  const before = await copyAll(page);
  // Remove the first block: the note takes its place, names it, and Undo has the focus.
  await cards(page).first().getByRole("button", { name: "Remove block" }).click();
  assert.equal(await cardCount(page), 2);
  const note = page.locator("#blockList > .undo-note");
  assert.equal(await page.locator("#blockList > *").first().getAttribute("class"), "undo-note", "the note is not where the block was");
  assert.match(await note.textContent(), /^Removed a Text block \(HAPPY BIRTHDAY TO MY FAV…\)\.Undo$/);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "undoRemove");
  assert.equal((await stored(page, "rw_blocks_v1")).length, 2, "the removal was not saved");
  // Undo puts it back where it was, saved, and Copy sends what it sent before.
  await note.getByRole("button", { name: "Undo" }).click();
  assert.equal(await page.locator("#blockList > .undo-note").count(), 0);
  assert.equal(await cardCount(page), 3);
  assert.equal(await cards(page).first().locator("textarea").inputValue(), "HAPPY BIRTHDAY TO MY FAVOURITE STREAMER");
  assert.deepEqual((await stored(page, "rw_blocks_v1")).map((b) => b.id), [1, 2, 3]);
  await page.waitForFunction((n) => document.querySelectorAll("#parts .part").length === n, before.length);
  assert.deepEqual(await copyAll(page), before);
  // The last block: the note sits at the end and names the picture's file.
  await cards(page).last().getByRole("button", { name: "Remove block" }).click();
  assert.equal(await page.locator("#blockList > *").last().getAttribute("class"), "undo-note");
  assert.match(await page.locator("#blockList > .undo-note").textContent(), /^Removed an Image block \(cat\.png\)\./);
  // One slot: removing another replaces it, and a move ends it.
  await cards(page).first().getByRole("button", { name: "Remove block" }).click();
  assert.equal(await page.locator("#blockList > .undo-note").count(), 1);
  assert.match(await page.locator("#blockList > .undo-note").textContent(), /HAPPY BIRTHDAY/);
  await page.click("#addTextBtn");
  assert.equal(await page.locator("#blockList > .undo-note").count(), 0, "adding a block kept an Undo for an older stack");
  // Typing in another card leaves the note alone (value edits don't rebuild the cards).
  await cards(page).first().getByRole("button", { name: "Remove block" }).click();
  await cards(page).first().locator("textarea").fill("NEW WORDS");
  assert.equal(await page.locator("#blockList > .undo-note").count(), 1);
  // Nothing about it is stored, and a reload has no Undo.
  await page.reload();
  await page.waitForSelector("#blockList .block-card");
  assert.equal(await page.locator("#blockList > .undo-note").count(), 0);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), ["rw_blocks_v1", "rw_controls_v1"]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("polish 2: Copy takes the first click after a number field is committed; a failed copy's box stays with the payload it failed on", async () => {
  // Leaving a number field for Copy fires its change, and the redraw used to replace the Copy
  // button between mousedown and click: the click was lost, and the clipboard kept the older
  // payload. Real clicks here (mousedown, blur, change, mouseup), not a dispatched event.
  const blocks = [{ id: 1, type: "image", imgKind: "glyph", url: PIC, width: 70, rotate: 0, adjBright: 0, adjContrast: 0,
                    tier: "cjk", cols: 20, dither: true, contrast: 128, invert: false }];
  {
    const { page, ctx, errors } = await freshPage({ blocks, core: true });
    await settled(page);
    const cols = cards(page).first().locator("input.num-cols");
    await cols.click(); await cols.press("Control+a"); await cols.type("16");
    const before = await page.evaluate(() => window.__copied.length);
    await page.locator("#parts .copy-btn").first().click();
    await page.waitForFunction((n) => window.__copied.length > n, before, { timeout: 3000 });
    const want = await expectPage(page, [{ ...blocks[0], cols: 16 }]);
    assert.equal(await page.evaluate(() => window.__copied[window.__copied.length - 1]), want[0], "the first click copied, and copied the 16-column picture");
    assert.equal(await page.locator("#parts .copy-btn").first().textContent(), "Copied");
    // Bits 0 is corrected to 100 when the field is left: the Copy pressed to leave it still copies.
    await page.fill("#bitsAmount", "0");
    const n2 = await page.evaluate(() => window.__copied.length);
    await page.locator("#parts .copy-btn").first().click();
    await page.waitForFunction((n) => window.__copied.length > n, n2, { timeout: 3000 });
    assert.equal(await page.inputValue("#bitsAmount"), "100");
    assert.match(await page.evaluate(() => window.__copied[window.__copied.length - 1]), /^Cheer100 /);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  {
    // A probe's Copy fails; Back to my stack must not show the stack's part in the copy-by-hand
    // box (nobody pressed its Copy), and neither must a part that changed since.
    const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: "HELLO" })], init: refusingClipboard });
    await page.waitForSelector("#parts .copy-btn");
    await page.click("#hrProbeBtn");
    await page.locator("#parts .copy-btn").first().click();
    await page.waitForSelector("#parts .copy-fail textarea");
    assert.match(await page.locator(".copy-fail textarea").inputValue(), /^Cheer25 /);
    await page.click("#backToStack");
    await page.waitForFunction(() => !document.getElementById("backToStack"));
    assert.equal(await page.locator("#parts .copy-fail").count(), 0, "the stack's part shows a failure it never had");
    await page.locator("#parts .copy-btn").first().click();
    await page.waitForSelector("#parts .copy-fail textarea");
    await cards(page).first().locator("textarea").fill("HELLO THERE");
    await page.waitForFunction(() => !document.querySelector("#parts .copy-fail"));
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("polish 2: new Glyph-art at 18 columns, the Auto layout's name, hints that wrap, no thumbnail speck, the tests' cost with Cheer-ready off, and the controls' names", async () => {
  const { page, ctx, errors } = await freshPage({ blocks: [BIG({ id: 1, text: "THANKS FOR THE RAID" })], viewport: { width: 390, height: 844 }, core: true });
  // A new Image block starts at 18 columns: a square picture is then one cheer (20 was two).
  await page.click("#addImageBtn");
  assert.equal((await stored(page, "rw_blocks_v1"))[1].cols, 18);
  assert.equal(await cards(page).nth(1).getByRole("button", { name: "Reset detail (columns) to 18" }).count(), 1);
  const square = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 64, 64); x.fillStyle = "#000"; x.beginPath(); x.arc(32, 32, 24, 0, 7); x.fill();
    return c.toDataURL("image/png"); });
  await cards(page).nth(1).locator("input[type=url]").fill(square);
  await page.waitForFunction(() => /18 columns × 18 rows · 1 cheer/.test(document.querySelectorAll("#blockList .block-card")[1].innerText), null, { timeout: 8000 });
  // The card's controls: Darkness centred on 0 (the stored field is unchanged), Smooth shading.
  const img = cards(page).nth(1);
  assert.equal(await img.getByRole("slider", { name: "Darkness" }).inputValue(), "0");
  await img.getByRole("slider", { name: "Darkness" }).fill("40");
  assert.equal((await stored(page, "rw_blocks_v1"))[1].contrast, 168);
  assert.match(await img.innerText(), /Smooth shading \(photos\)/);
  assert.ok(!/Dither/.test(await img.innerText()), "the card still says Dither");
  await img.getByRole("button", { name: "Reset darkness to 0" }).click();
  assert.equal((await stored(page, "rw_blocks_v1"))[1].contrast, 128);
  // A Real picture with no link draws no thumbnail at all.
  await img.locator(".sel-kind").selectOption("real");
  await img.locator("input[type=url]").fill("");
  assert.equal(await img.locator(".img-thumb").evaluate((t) => getComputedStyle(t).display), "none");
  // The Auto layout is named for what it picks; the size's goal stays with the Size.
  const auto = await cards(page).first().locator(".sel-layout option[value=auto]").textContent();
  assert.match(auto, /^Auto — the layout that prints biggest/);
  assert.ok(!/in one cheer/.test(auto), auto);
  // The thermal view's dither says why it is off, beside it.
  assert.equal(await page.locator("label", { has: page.locator("#thermalDither") }).evaluate((l) => l.firstChild.textContent), "Thermal dither: ");
  assert.equal(await page.locator("#thermalDitherOff").isVisible(), true);
  await page.check("#thermalView");
  assert.equal(await page.locator("#thermalDitherOff").isVisible(), false);
  await page.uncheck("#thermalView");
  // A 60-character preset name with no spaces, echoed in the note, wraps: no sideways scroll.
  await page.fill("#presetName", "A_VERY_LONG_PRESET_NAME_WITHOUT_ANY_SPACES_AT_ALL_1234567890");
  await page.click("#presetSave");
  assert.match(await page.textContent("#presetNote"), /A_VERY_LONG/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the page scrolls sideways");
  // With Cheer-ready off, a test says it is still a real cheer.
  await page.uncheck("#cheer");
  await page.click("#hrProbeBtn");
  assert.match(await page.textContent("#modeNote"), /It is a real cheer even with Cheer-ready off/);
  assert.match(await copyPayload(page), /^Cheer25 /);
  await page.click("#backToStack");
  await page.check("#cheer");
  await page.click("#plainProbeBtn");
  assert.ok(!/Cheer-ready off/.test(await page.textContent("#modeNote")));
  assert.deepEqual(errors, []);
  await ctx.close();
});
