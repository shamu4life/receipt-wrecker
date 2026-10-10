// BROWSER SMOKE TESTS — the half of the app the null-DOM harness cannot reach.
//
// Every case here is a bug that actually shipped, because nothing automated exercised
// the UI and hand-checking is the thing you skip when a change looks small:
//
//   * add/remove/reorder a block never called saveBlocks(), so a rebuilt stack was gone
//     on reload. Shipped to production.
//   * the expired-upload flag was set and never cleared, so the card kept warning after
//     the user did exactly what it asked.
//
// Since 0.10.0 (Giant type, the cheer-gem tuck) it also holds the cases that need a real
// layout engine to mean anything: what printer-bot's sanitizer and its borrowed class
// rules do to the payload Copy hands over, the preview's 240px body, the tuck's corner
// box, and the promise that the Emote layout never fetches an emote.
//
// These are node:test + playwright, kept OUT of `npm test` on purpose: that command is
// documented as needing zero installs, and it should stay true. Run `npm run
// test:browser`, which needs `npx playwright install chromium` once.
//
// Anything needing the Worker (/px, /upload) is NOT faked here — see _serve.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serve } from "./_serve.mjs";
// The app's own pure core, from the same file the page loads. Expected sizes, levels and
// the printer-bot class table come from HERE rather than being written down in this file,
// so a test can't keep passing against numbers the app no longer produces.
import { loadCore } from "../test/_harness.mjs";

const C = loadCore();
let server, browser;

test.before(async () => {
  server = await serve();
  browser = await chromium.launch();
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

// `blocks` seeds rw_blocks_v1 (and `presets` rw_presets_v1) before the app's first load,
// the way a returning user's saved stack is there before the page runs. Only when the key
// is ABSENT: the app writes it back, so a reload sees the app's own copy, not the seed again.
async function freshPage({ blocks, presets, viewport } = {}) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  await ctx.addInitScript(installClipboardStub);
  for (const [key, value] of [["rw_blocks_v1", blocks], ["rw_presets_v1", presets]]) {
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
// A text card's selects, found by an option only that select has. Positional `select`
// indices are wrong here: the hidden Type/Hanzi/formatting selects come first in the card.
const RENDER_SEL = 'select:has(option[value="hanzi"])';
const LAYOUT_SEL = 'select:has(option[value="emote"])';
const SIZE_SEL = 'select:has(option[value="fit1"])';

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
// The page's default lead: Cheer-ready on, 100 bits, and no repeat number (the two nonce
// digits are opt-in since 0.12.0). Every helper below that predicts what the page sends
// uses it, because a budget 3 characters off can pick a different size.
const PAGE_LEAD = { cheer: true, bits: 100, noNonce: true };
// A lead's budget, from the core: what packStack hands a block's builder.
const budgetFor = (o) => C.MAX_CHARS - C.leadLength(o);
// What one giant block becomes, per the core, at the defaults the page uses.
const giantOf = (text, layout, size, tuck) =>
  C.buildGiantBodies(text, { layout, size, budget: budgetFor({ ...PAGE_LEAD, tuck }), tuck })[0].giant;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || "") + ` (${a} vs ${b} ±${tol})`);

test("the app boots with no page errors and renders a first part", async () => {
  const { page, ctx, errors } = await freshPage();
  assert.equal(await cardCount(page), 1, "a default stack should have exactly one block");
  await assert.doesNotReject(page.waitForSelector(".part-count"));
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

  // Delete one, and make the deletion stick too — the same function family.
  await page.locator("#blockList > *").last().getByRole("button", { name: "×" }).click();
  assert.equal(await cardCount(page), 2);
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await cardCount(page), 2, "the deletion did not survive a reload");
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

  // And loading one actually restores the stack it captured.
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
  assert.deepEqual(await p2.locator("#presetList option").allTextContents(),
    ["(nothing saved yet)"], "the second browser should start empty");
  // The real two-step flow: the first Import press reveals the box and says to paste
  // into it, the second actually imports. Driving it any other way would test a UI the
  // user never sees.
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
  const stored = async (k) => JSON.parse(await page.evaluate((key) => localStorage.getItem(key), k));

  assert.deepEqual((await types()).map((t) => t.toLowerCase()), ["text", "image", "text", "text", "text", "text"]);
  const texts = await cards(page).locator("textarea").evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(texts, ["HELLO", "-100000 BITS", "IRS", "5 BITS", "chat"]);
  const saved = await stored("rw_blocks_v1");
  assert.ok(saved.every((b) => b.type !== "takeover"), "a takeover was saved back");
  assert.equal(new Set(saved.map((b) => b.id)).size, saved.length, "two blocks share an id");
  assert.equal(saved[1].imgKind, "glyph");
  assert.equal(saved[1].url, "https://example.invalid/avatar.png");

  // The user's preset is untouched, and the backup holds the stack exactly as it was.
  let ps = (await stored("rw_presets_v1")).presets;
  assert.deepEqual(ps.map((p) => p.name), ["mine", "Before 1.0.0"]);
  assert.deepEqual(ps[0], mine.presets[0], "the user's own preset changed");
  assert.deepEqual(ps[1].blocks, old, "the backup is not the stack as it was saved");
  assert.match(await page.textContent("#presetNote"), /saved as the preset "Before 1\.0\.0"/);

  // Once: a reload converts nothing more and writes no second backup.
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await cardCount(page), 6);
  ps = (await stored("rw_presets_v1")).presets;
  assert.deepEqual(ps.map((p) => p.name), ["mine", "Before 1.0.0"]);

  // Loading the backup converts it again (the stored preset keeps its takeovers).
  await page.selectOption("#presetList", "Before 1.0.0");
  await page.click("#presetLoad");
  await page.waitForFunction(() => document.querySelectorAll("#blockList > *").length === 6);
  assert.ok((await stored("rw_presets_v1")).presets[1].blocks.some((b) => b.type === "takeover"),
    "loading the backup rewrote it");
  const ids = (await stored("rw_blocks_v1")).map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "a loaded preset's blocks share an id");
  // Each converted card is its own block: removing one removes only that one.
  await cards(page).nth(2).getByRole("button", { name: "×" }).click();
  assert.equal(await cardCount(page), 5);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a Real picture sends nothing, says so plainly, and switches to Glyph-art in one click", async () => {
  // SassyTP's bot draws a picture only from an emote server, and this channel's chat filter
  // blocks the picture tag, so a Real picture can never arrive as one. A stack whose only
  // block is one must not offer a cheer at all (it would be the lead and nothing else).
  const real = { id: 1, type: "image", imgKind: "real", url: "https://example.invalid/p.png", width: 70,
                 rotate: 0, adjBright: 0, adjContrast: 0, tier: "cjk", cols: 40, dither: true, contrast: 128, invert: false };
  const { page, ctx, errors } = await freshPage({ blocks: [real] });
  const card = cards(page).first();
  assert.equal(await page.locator("#parts .part button").count(), 0, "a Real-picture-only stack offered a Copy");
  assert.match(await page.textContent("#parts"), /a Real picture can't print on SassyTP's bot/);
  const note = card.locator(".over-note");
  assert.match(await note.textContent(),
    /SassyTP's bot only prints pictures from emote servers, and this channel's chat filter blocks the picture tag, so an upload can't print as a picture\. Switch to Glyph-art to print it as characters\./);
  // The picture is still shown, on the card, from the block's own link.
  assert.equal(await card.locator("img.img-thumb").getAttribute("src"), real.url);
  assert.equal(await card.locator("select").first().inputValue(), "real");

  // Next to text it adds nothing to the payload: no tag of any kind for a picture.
  await page.click("#addTextBtn");
  await cards(page).last().locator("textarea").fill("HI");
  const payloads = await copyAll(page);
  assert.equal(payloads.length, 1);
  for (const p of payloads) assert.ok(!/<(img|object|image|embed|iframe|svg|input)\b/i.test(p), "a picture tag in: " + p);

  // One click: the block is Glyph-art, saved, and the note is gone.
  await card.getByRole("button", { name: "Switch to Glyph-art" }).click();
  assert.equal(await card.locator("select").first().inputValue(), "glyph");
  assert.equal(await note.isVisible(), false);
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("rw_blocks_v1")));
  assert.equal(saved[0].imgKind, "glyph");
  assert.ok(!("renderAs" in saved[0]) && !("embedV" in saved[0]));
  // And a NEW Image block starts as Glyph-art, the kind that prints.
  await page.click("#addImageBtn");
  assert.equal(await cards(page).last().locator("select").first().inputValue(), "glyph");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ── Giant type (0.10.0) ──────────────────────────────────────────────────────────────

test("a new Text block is Giant type, and Copy sends exactly what the core builds", async () => {
  const { page, ctx, errors } = await freshPage();
  const first = cards(page).first();
  assert.equal(await first.locator(RENDER_SEL).inputValue(), "giant", "the first-run seed should be Giant type");

  const payload = await copyPayload(page);
  // The lead, then the giant body. On an A4 receipt HELLO fits one cheer at L11x0.9, so the
  // body opens with a shrink wrapper (<b class=setting-description>) before the .title nest;
  // the byte-for-byte check below is the real assertion.
  assert.match(payload, /^Cheer100 <br><b class=\S/);
  // Byte for byte the pure core's answer for the same text and defaults. The glue
  // (card -> block fields -> giantOpts -> budget -> packer -> lead) is the half the unit
  // tests can't see, so this is where a field that never reaches the builder shows up.
  const bodies = C.buildGiantBodies("HELLO", { layout: "auto", size: "fit1",
    budget: budgetFor(PAGE_LEAD), tuck: false });
  const expected = C.packStackBodies(bodies, PAGE_LEAD)[0].payload;
  assert.equal(payload, expected);

  // A block added later is Giant too, and stores the auto / fit-one-cheer fields.
  await page.click("#addTextBtn");
  const last = cards(page).last();
  assert.equal(await last.locator(RENDER_SEL).inputValue(), "giant");
  assert.equal(await last.locator(LAYOUT_SEL).inputValue(), "auto");
  assert.equal(await last.locator(SIZE_SEL).inputValue(), "fit1");
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("rw_blocks_v1")));
  assert.deepEqual(saved.map((b) => [b.render, b.giantLayout, b.giantSize]),
    [["giant", "auto", "fit1"], ["giant", "auto", "fit1"]]);
  // The % Size slider, Type's length slider, Hanzi's columns and the formatting row all
  // mean nothing to Giant type (its size is the Size select), so none of them may show.
  assert.equal(await last.locator("input[type=range]:visible, input[type=number]:visible, .fmt-row:visible").count(), 0,
    "a Type/Hanzi-only control is showing on a Giant card");

  // A line no size can fit says so on the card instead of being clipped on the tape.
  await last.locator("textarea").fill("WRECK THE RECEIPT COMPLETELY");
  await last.locator(LAYOUT_SEL).selectOption("lines");
  await assert.doesNotReject(last.locator(".giant-note", { hasText: /Too wide/ }).waitFor({ timeout: 4000 }),
    "a line too wide for any size should be reported on the card");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// printer-bot, rebuilt in a clean room from its DOCUMENTED behaviour (CLAUDE.md's
// sanitizer banner and printer-bot notes), never from nutty's code, which this repo does
// not vendor. Runs in a blank page. Three parses, because printer-bot parses three times:
//  1. the sanitizer: DOMParser, walk every element; tags kept: img span b i br em strong
//     (img only with an `emote` or `bits` class); anything else is UNWRAPPED (children
//     kept); attributes kept: src and class, all others removed;
//  2. the overlay assigns that to the message element's innerHTML, then its cheermote
//     pass swaps the FIRST `Cheer<bits>` word in the innerHTML string for the gem image
//     plus a bits span (a data: gif here, so nothing leaves the test);
//  3. the standalone document wkhtmltopdf prints (setContent, by the caller).
// Returns what the sanitizer REMOVED as well: the strongest check is that it removed
// nothing, i.e. what we send is what prints.
function printerBot({ message, bits, css }) {
  const KEEP = ["IMG", "SPAN", "B", "I", "BR", "EM", "STRONG"], ATTRS = ["src", "class"], removed = [];
  const doc = new DOMParser().parseFromString(message, "text/html");
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    const tag = el.tagName;
    if (!KEEP.includes(tag) || (tag === "IMG" && !el.classList.contains("emote") && !el.classList.contains("bits"))) {
      removed.push(tag.toLowerCase());
      el.replaceWith(...el.childNodes);
      continue;
    }
    for (const a of Array.from(el.attributes)) {
      if (!ATTRS.includes(a.name)) { removed.push(tag.toLowerCase() + "[" + a.name + "]"); el.removeAttribute(a.name); }
    }
  }
  const msg = document.createElement("div");
  msg.innerHTML = doc.body.innerHTML;
  const gem = '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" class="emote"/>';
  const html = msg.innerHTML.replace(new RegExp("\\bCheer" + bits + "\\b", "i"), gem + '<span class="bits">' + bits + "</span>");
  return {
    removed,
    document: '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><style>' + css + "</style></head>"
      + '<body><div id="receipt-container"><div id="receipt-content">' + html + "</div></div></body></html>",
  };
}
// What came out of the printed document: every innermost .title (its depth and computed
// style), every text node in order (and whether it sits in giant markup), every attribute
// name, and the tuck box.
function inspectPrint() {
  const root = document.getElementById("receipt-content");
  const depth = (el) => { let n = 0; for (let e = el; e && e !== root; e = e.parentElement) if (e.classList.contains("title")) n++; return n; };
  const innermost = Array.from(root.querySelectorAll(".title")).filter((t) => !t.querySelector(".title")).map((t) => {
    const cs = getComputedStyle(t);
    return { depth: depth(t), text: t.textContent, fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight,
             textTransform: cs.textTransform, shrink: t.closest(".setting-description, .setting-attribute")?.className || "" };
  });
  const texts = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    texts.push({ text: n.data, inTitle: !!n.parentElement.closest(".title"), inB: !!n.parentElement.closest("b") });
  }
  const attrs = new Set();
  root.querySelectorAll("*").forEach((e) => { for (const a of e.attributes) attrs.add(a.name); });
  const box = root.querySelector(".switch");
  return {
    innermost, texts, attrs: [...attrs],
    tuck: box && { classes: [...box.classList], position: getComputedStyle(box).position,
                   overflow: getComputedStyle(box).overflow, gem: !!box.querySelector("img.emote"),
                   bits: box.querySelector(".bits")?.textContent ?? null, text: box.textContent },
  };
}
// The class rules printer-bot's printed page carries, from the app's PB_CLASSES table in
// cascade order and UNSCOPED, as global.css / style.css state them (position:fixed and
// all) — not the preview's scoped, adjusted copy. Plus the receipt rules CLAUDE.md
// records. If the table disagrees with nutty's live CSS, that is tools/printerbot.mjs
// --check's job to catch; this test checks what our markup does under the table.
const PB_CSS = C.PB_CLASSES.map((r) => "." + r.cls + "{" + r.decl + "}").join("\n")
  + "\nbody{margin:1em}#receipt-content{padding:.5em 0}"
  + "#receipt-container{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;text-align:center;color:black}";
async function printThroughPrinterBot(message, bits = 100) {
  const ctx = await browser.newContext({ viewport: { width: 272, height: 1890 } });   // a 72mm page
  const page = await ctx.newPage();
  const out = await page.evaluate(printerBot, { message, bits, css: PB_CSS });
  await page.setContent(out.document);
  const seen = await page.evaluate(inspectPrint);
  await ctx.close();
  return { removed: out.removed, ...seen };
}

test("MANDATORY: Copy's payload survives a clean-room printer-bot sanitizer and prints giant", async () => {
  // The control first, so the harness is proven able to see the failure it exists for:
  // an UNQUOTED tuck class makes `dialog-nav-button` a boolean attribute, which the
  // sanitizer strips — the corner box then isn't fixed, and the gem prints on its own line.
  const control = await printThroughPrinterBot(" <span class=switch dialog-nav-button> Cheer100 07 </span>");
  assert.deepEqual(control.tuck.classes, ["switch"], "the clean-room sanitizer kept an unquoted second class");
  assert.ok(control.removed.includes("span[dialog-nav-button]"), "the sanitizer did not report the stripped attribute");

  // 1. A [giant, hanzi] stack in ONE part, untucked, so the whole concatenated message is
  //    parsed at once the way the tape parses it: an unclosed .title in the giant body
  //    would make the Hanzi rows after it giant too, which the per-body preview can't show.
  const giantA = { id: 1, type: "text", render: "giant", giantLayout: "lines", giantSize: 6, text: "HI" };
  const hanziA = { id: 2, type: "text", render: "hanzi", text: "I", cols: 8, size: 90, orient: 0, rotateLen: 800 };
  {
    const { page, ctx } = await freshPage({ blocks: [giantA, hanziA] });
    const payload = await copyPayload(page, 0);
    await ctx.close();
    assert.ok(payload.includes("<b class=title>") && /[㐀-鿿]/.test(payload),
      "the giant and Hanzi bodies were expected in the same part: " + payload);
    const want = giantOf("HI", "lines", 6, false);
    const pr = await printThroughPrinterBot(payload);
    assert.deepEqual(pr.removed, [], "the sanitizer had to strip something from our payload");
    assert.deepEqual(pr.attrs.filter((a) => a !== "class" && a !== "src"), []);
    assert.equal(pr.innermost.length, 1, "one giant body, one innermost .title");
    const t = pr.innermost[0];
    assert.equal(t.depth, want.levels, "nesting depth on paper != the level the core chose");
    near(t.fontSize, 16 * Math.pow(1.2, want.levels) * want.factor, 0.01, "computed font-size");
    assert.equal(t.fontWeight, "900");
    assert.equal(t.textTransform, "uppercase");
    assert.equal(t.text, "HI");
    // Nothing after the giant body is inside giant markup (or any <b>).
    const lastGiant = pr.texts.map((x) => x.inTitle).lastIndexOf(true);
    const after = pr.texts.slice(lastGiant + 1);
    assert.ok(after.some((x) => /[㐀-鿿]/.test(x.text)), "no Hanzi text after the giant body");
    for (const x of after) assert.ok(!x.inTitle && !x.inB, "text after the giant body is still in giant markup: " + JSON.stringify(x));
  }

  // 2. The tuck, with a shrink step: the corner span must keep BOTH classes, take the
  //    cheermote gem and its "100" with it, and the giant line follows with no <br>.
  {
    const { page, ctx } = await freshPage({ blocks: [{ id: 1, type: "text", render: "giant",
      giantLayout: "auto", giantSize: "fit1", text: "HELLO" }] });
    await page.locator("#cheerTuck").check();
    const payload = await copyPayload(page, 0);
    await ctx.close();
    assert.match(payload, /^ <span class="switch dialog-nav-button"> Cheer100 <\/span><b class=/);
    // On an A4 receipt HELLO fits one cheer at L11x0.9, so this exercises a shrink wrapper.
    const want = giantOf("HELLO", "auto", "fit1", true);
    assert.ok(want.shrink, "this case is meant to exercise a shrink wrapper; pick another text");
    const pr = await printThroughPrinterBot(payload);
    assert.deepEqual(pr.removed, []);
    assert.deepEqual(pr.attrs.filter((a) => a !== "class" && a !== "src"), []);
    assert.deepEqual(pr.tuck.classes, ["switch", "dialog-nav-button"]);
    assert.equal(pr.tuck.position, "fixed");
    assert.equal(pr.tuck.overflow, "hidden");
    assert.ok(pr.tuck.gem, "the cheermote gem did not land inside the corner box");
    assert.equal(pr.tuck.bits, "100");
    assert.match(pr.tuck.text, /^\s*100\s*$/, "the whole visible lead belongs in the box");
    assert.equal(pr.innermost.length, 1);
    const t = pr.innermost[0];
    assert.equal(t.depth, want.levels);
    assert.equal(t.shrink, want.shrink);
    near(t.fontSize, 16 * Math.pow(1.2, want.levels) * want.factor, 0.01, "computed font-size under a shrink step");
    near(t.fontSize, want.px, 0.01, "the core's px");
    assert.equal(t.fontWeight, "900");
  }
});

test("the preview's body is the tape's 240px, and draws giant type at its real size", async () => {
  // The preview was 268px wide for a long time against a 240px tape body, so a line that
  // wraps or runs off the paper sat whole in the preview. Phone width too: the receipt has
  // to stay 240 there without a horizontal scroll.
  const want = giantOf("HELLO", "auto", "fit1", false);
  for (const viewport of [undefined, { width: 390, height: 844 }]) {
    const { page, ctx, errors } = await freshPage({ viewport });
    const m = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll(".rcpt .title")).find((e) => !e.querySelector(".title"));
      return { cw: document.querySelector(".rcpt-body").clientWidth,
               sw: document.documentElement.scrollWidth, iw: innerWidth,
               fs: t && parseFloat(getComputedStyle(t).fontSize) };
    });
    const label = viewport ? viewport.width + "px viewport" : "default viewport";
    near(m.cw, C.PAPER_PX, 1, ".rcpt-body content width at " + label);
    assert.ok(m.sw <= m.iw, `horizontal scroll at ${label}: ${m.sw} > ${m.iw}`);
    near(m.fs, want.px, 0.01, "preview font-size of the innermost .title at " + label);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("the Thermal preview draws giant type too (its own copy of the class rules)", async () => {
  // The thermal raster re-renders the receipt from RCPT_CSS, a SEPARATE copy of the
  // preview rules (page CSS doesn't reach into its foreignObject). Without the .title rules
  // there, HELLO shrinks to 16px and everything below it rides up the strip, leaving the
  // bottom of the raster blank. The raster keeps the live receipt's height, so where the
  // ink ENDS tells the two apart.
  const { page, ctx } = await freshPage();
  await page.check("#thermalView");
  const c = page.locator("canvas.rcpt-thermal");
  await c.waitFor({ timeout: 8000 });
  const ink = await c.evaluate((cv) => {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let last = -1, mid = 0;
    for (let y = 0; y < cv.height; y++) {
      let row = 0;
      for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4] < 128) row++;
      if (row) last = y;
      if (y > cv.height * 0.4 && y < cv.height * 0.8) mid = Math.max(mid, row);
    }
    return { last: last / cv.height, mid };
  });
  assert.ok(ink.last > 0.9, "the raster's ink ends at " + (ink.last * 100).toFixed(0) + "% of the receipt");
  // And it is rasterized at the TAPE's resolution: 2.119 print dots per CSS px, measured on
  // the engine (CLAUDE.md, "the 1:1 rule"). A 560-dot raster of the 72mm box was 2.06, ~3%
  // coarse, so dither texture and 1-dot detail were resampled rather than shown 1:1.
  // (The live .rcpt is REPLACED by the canvas, so a scratch one is measured.)
  const ratio = await page.evaluate(() => {
    const box = document.createElement("div");
    box.className = "rcpt";
    document.body.appendChild(box);
    const w = box.getBoundingClientRect().width;
    box.remove();
    return document.querySelector("canvas.rcpt-thermal").width / w;
  });
  near(ratio, 2.119, 0.01, "thermal dots per CSS px");
  assert.ok(ink.mid > 60, "no giant strokes in the middle of the raster (widest row " + ink.mid + " dots)");
  await ctx.close();
});

// Three ways the card and the parts note used to disagree with what Copy sends.
//  - The cheer count: "HELLO WORLD" at Level 10 is two chunks the packer sends as ONE part,
//    yet the Size select said "2 cheers" right above a note saying "fits 1 cheer".
//  - A Giant block of only emoji builds an empty body, which used to get a part of its own
//    when its neighbour was over-tall: a cheer that printed only the gem.
//  - "Send part 1 first and look at the printer" when part 1 carried no giant type at all.
const GIANT_SEED = { type: "text", render: "giant", giantLayout: "auto", giantSize: "fit1",
  orient: 0, size: 90, rotateLen: 800, cols: 15 };
test("cheer counts, empty blocks and the parts note all match the parts Copy sends", async () => {
  {
    const { page, ctx, errors } = await freshPage({ blocks: [{ ...GIANT_SEED, id: 1, text: "HELLO WORLD", giantSize: 10 }] });
    const card = cards(page).first();
    // On an A4 receipt (the default), L10 HELLO WORLD needs two receipts; the size label and
    // the rendered parts agree on that. (At the old fixed 1400px budget this was one part —
    // the budget is now the A4 page the real driver cuts at, see the 0.10.0 field cut-off fix.)
    assert.equal(await page.locator("#parts .part").count(), 2, "fixture: L10 HELLO WORLD needs two A4 receipts");
    assert.match(await card.locator(SIZE_SEL + ' option[value="10"]').textContent(), / · 2 cheers/);
    await card.locator(SIZE_SEL).selectOption("fit1");
    const fit1 = C.giantPlan("HELLO WORLD", { budget: budgetFor(PAGE_LEAD) }).fit;
    assert.deepEqual([fit1.levels, fit1.shrink], [7, "setting-description"], "fit1 is the biggest one-cheer size on A4");
    assert.equal(await page.locator("#parts .part").count(), 1, "fit1 fits one A4 receipt");
    assert.match(await card.locator(SIZE_SEL + ' option[value="fit1"]').textContent(),
      new RegExp("capitals " + C.giantCapCm(fit1.px).toFixed(1) + " cm · 1 cheer$"));
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  {
    const { page, ctx, errors } = await freshPage({ blocks: [
      { ...GIANT_SEED, id: 1, text: "THANK YOU SO MUCH", giantLayout: "lines", giantSize: 14 },
      { ...GIANT_SEED, id: 2, text: "🔥🔥" }] });
    const payloads = await copyAll(page);
    assert.equal(payloads.length, 1, "the emoji-only block got a cheer of its own: " + JSON.stringify(payloads));
    assert.ok(payloads[0].includes("class=title"));
    const note = await cards(page).nth(1).locator(".giant-note").innerText();
    assert.match(note, /Nothing else is left to print/);
    assert.ok(!/this text is in part|over 500/.test(note), note);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  {
    const { page, ctx, errors } = await freshPage({ blocks: [
      { id: 1, type: "text", render: "hanzi", orient: 0, text: "HELLO", size: 90, rotateLen: 800, cols: 15 },
      { ...GIANT_SEED, id: 2, text: "GG" }] });
    const payloads = await copyAll(page);
    const first = payloads.findIndex((p) => p.includes("class=title"));
    assert.ok(payloads.length > 1 && first > 0, "fixture: a run whose first giant part is not part 1");
    const note = await page.locator("#parts .parts-note", { hasText: /Paste the parts/ }).innerText();
    assert.match(note, new RegExp("Part " + (first + 1) + " is the first with Giant type"), note);
    assert.match(note, new RegExp("send up to part " + (first + 1) + ", then look at the printer"), note);
    assert.ok(!/Send part 1 first/.test(note), note);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("the cheer-gem tuck: a corner box in the preview, the tucked lead on Copy, kept across a reload", async () => {
  const { page, ctx, errors } = await freshPage();
  const tuck = page.locator("#cheerTuck");
  assert.equal(await tuck.isChecked(), false, "the tuck must be off by default");
  assert.equal(await tuck.isEnabled(), true);
  await tuck.check();

  const box = page.locator(".rcpt .switch.dialog-nav-button");
  await box.waitFor();
  const st = await box.evaluate((el) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect(), f = el.closest(".rcpt").getBoundingClientRect();
    return { position: cs.position, overflow: cs.overflow, text: el.textContent, top: r.top - f.top, right: f.right - r.right };
  });
  assert.equal(st.position, "absolute");
  assert.equal(st.overflow, "hidden");
  assert.match(st.text, /^\s*Cheer100\s*$/);
  // In the corner of the RECEIPT: .rcpt has to be the containing block, or the box lands
  // in the corner of the page and the preview stops showing what the tape does.
  assert.ok(st.top >= 0 && st.top < 40 && st.right >= 0 && st.right < 40, "box not in the receipt's corner: " + JSON.stringify(st));
  // The lead is rendered as markup, never as text.
  assert.ok(!(await page.locator(".rcpt").first().textContent()).includes("<span"), "the preview printed the tuck span as text");

  // Copy: the tucked lead, and the giant body's leading <br> gone (it would cost a line).
  const payload = await copyPayload(page);
  assert.match(payload, /^ <span class="switch dialog-nav-button"> Cheer100 <\/span><b class=\S/);
  assert.ok(len(payload) <= C.MAX_CHARS);

  // A field of rw_controls_v1, so it survives a reload.
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await page.locator("#cheerTuck").isChecked(), true, "the tuck did not survive a reload");
  await page.locator(".rcpt .switch.dialog-nav-button").waitFor();

  // Without Cheer-ready there is no gem to hide: disabled (NOT unchecked, so the choice
  // comes back with the cheer), and the free message carries no span at all.
  await page.locator("#cheer").uncheck();
  assert.equal(await page.locator("#cheerTuck").isDisabled(), true);
  assert.equal(await page.locator("#cheerTuck").isChecked(), true, "turning Cheer-ready off reset the tuck");
  assert.equal(await page.locator(".rcpt .switch").count(), 0);
  const free = await copyPayload(page);
  assert.ok(free.startsWith(" ") && !free.includes("<span"), "a non-cheer message got the tuck span: " + free);

  // The size ruler is never tucked: it proves the SIZE, so it looks like any other cheer.
  await page.locator("#cheer").check();
  await page.click("#rulerBtn");
  const ruler = await copyPayload(page);
  assert.match(ruler, /^Cheer100 <br><b class=title>1<br>/);
  assert.ok(!ruler.includes("<span"), "the ruler was tucked");
  assert.equal((ruler.match(/<b class=title>/g) || []).length, (ruler.match(/<\/b>/g) || []).length);
  assert.equal((ruler.match(/<b class=title>/g) || []).length, 13);
  assert.ok(len(ruler) <= C.MAX_CHARS);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Emote layout previews placeholders and never fetches an emote", async () => {
  // The obvious way to preview an emote is to load it from Twitch's CDN: a third party and
  // a seventh fetch site, both ruled out in CLAUDE.md. The preview draws a labelled square
  // instead, and THIS is what holds it to that: no request may leave our own origin, with
  // the Thermal preview (which inlines images) on as well.
  const { page, ctx, errors, requests } = await freshPage();
  const card = cards(page).first();
  await card.locator(LAYOUT_SEL).selectOption("emote");
  const names = ["Kappa", "PogChamp", "nuttyHi"];
  await card.locator("textarea").fill(names.join(" "));
  const ph = page.locator(".rcpt .rw-emote-ph");
  await page.waitForFunction((n) => document.querySelectorAll(".rcpt .rw-emote-ph").length === n, names.length);
  // Labelled with the name AS TYPED: case is what makes Twitch recognise an emote, and
  // .title uppercases everything around it.
  assert.deepEqual(await ph.allTextContents(), names);
  assert.equal(await ph.first().evaluate((e) => getComputedStyle(e).textTransform), "none");
  assert.equal(await page.locator(".rcpt-body img").count(), 0, "the preview drew an <img> for an emote");
  await assert.doesNotReject(card.locator(".giant-note", { hasText: /exact capitals/ }).waitFor({ timeout: 4000 }));

  // Each name a whitespace-delimited word, case intact, or Twitch never reports it as an emote.
  const payload = await copyPayload(page);
  for (const n of names) assert.match(payload, new RegExp("(^|\\s)" + n + "(?=\\s|$)"), n + " is glued to markup: " + payload);

  // Under the tuck the emote body keeps its ONE leading <br>. Its first line is padded
  // with a space so Twitch sees a whole word; at a line start that space collapses, but
  // after the tuck's nbsp it prints (real engine: line 1 shoved 27px out of line with line
  // 2). So no strip, no second <br>, and the preview does not draw the body inline.
  await page.locator("#cheerTuck").check();
  await page.locator(".rcpt .switch.dialog-nav-button").waitFor();
  const tucked = await copyPayload(page);
  assert.match(tucked, /^\u00A0<span class="switch dialog-nav-button"> Cheer100 <\/span><br><b class=/);
  assert.ok(!tucked.includes("<br><br>"), "a doubled <br> prints a blank line: " + tucked);
  for (const n of names) assert.match(tucked, new RegExp("(^|\\s)" + n + "(?=\\s|$)"), n + " is glued to markup: " + tucked);
  assert.equal(await page.locator(".rcpt .rw-giant").count(), 1);
  assert.equal(await page.locator(".rcpt .rw-giant.rw-inline").count(), 0, "the preview drew the tucked emote body inline");
  assert.ok(len(tucked) <= C.MAX_CHARS);
  await page.locator("#cheerTuck").uncheck();

  await page.check("#thermalView");
  await page.locator("canvas.rcpt-thermal").waitFor({ timeout: 8000 });
  const origin = new URL(server.url).origin;
  const away = requests.filter((u) => !/^(data|blob|about):/.test(u) && new URL(u).origin !== origin);
  assert.deepEqual(away, [], "a request left the app's origin");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("saved Hanzi and Type blocks are not migrated: same render, same payload after a reload", async () => {
  // 0.10.0 made Giant type the default for NEW blocks only. A returning user's saved
  // Hanzi block still prints, so it is left alone and the card offers the switch; a Type
  // block (which no longer prints) keeps showing as Type rather than as whatever option
  // happens to come first. Shaped exactly like 0.9.x's newBlock output.
  const seeded = [
    { id: 1, type: "text", render: "hanzi", orient: 0, text: "HELLO", size: 90, rotateLen: 800, cols: 15 },
    { id: 2, type: "text", render: "type", orient: 0, text: "OK", size: 90, rotateLen: 800, cols: 15 },
  ];
  const { page, ctx, errors } = await freshPage({ blocks: seeded });
  const renders = async () => [await cards(page).nth(0).locator(RENDER_SEL).inputValue(),
                               await cards(page).nth(1).locator(RENDER_SEL).inputValue()];
  // The lead's repeat digits (when they are on) are the only part of a payload that is
  // supposed to change between copies, so compare what follows them.
  const bodies = async () => (await copyAll(page)).map((p) => p.replace(/^Cheer100 (\d\d )?/, ""));
  const stored = async () => JSON.parse(await page.evaluate(() => localStorage.getItem("rw_blocks_v1")));

  assert.equal(await cardCount(page), 2);
  assert.deepEqual(await renders(), ["hanzi", "type"]);
  assert.equal(await cards(page).nth(0).locator('option[value="type"]').count(), 0, "Type offered to a block that isn't one");
  for (const i of [0, 1]) {
    assert.ok(await cards(page).nth(i).getByRole("button", { name: "Switch this block" }).isVisible(),
      "no Giant type nudge on a saved " + seeded[i].render + " block");
  }
  const before = await bodies();
  const all = before.join("");
  assert.ok(!all.includes("class=title"), "a saved block started sending Giant type");
  assert.ok(/[㐀-鿿]/.test(all) && all.includes("<svg"), "expected both the Hanzi and the Type payloads");

  await page.reload();
  await page.waitForSelector("#blockList");
  assert.deepEqual(await renders(), ["hanzi", "type"], "a reload changed a saved block's render");
  assert.deepEqual((await stored()).map((b) => [b.render, "giantLayout" in b, "giantSize" in b]),
    [["hanzi", false, false], ["type", false, false]], "saved blocks were migrated");
  assert.deepEqual(await bodies(), before, "a reload changed a saved block's payload");

  // Under the tuck a Hanzi band starts on a fresh line (the nbsp shares line 1 otherwise,
  // shifting the wrap), and the band must STILL fit: it is sized against the longer lead.
  await page.locator("#cheerTuck").check();
  // HELLO, not something shorter: only a FULL band (32 rows x 15) can overflow, and a
  // band sized for the 12-character lead goes out at 544 under the 60-character one.
  const tucked = await copyAll(page);
  for (const p of tucked) assert.ok(len(p) <= C.MAX_CHARS, "a tucked part is over " + C.MAX_CHARS + ": " + len(p));
  assert.ok(tucked.some((p) => len(p) > 450), "no full Hanzi band here, so the budget check above proves nothing");
  assert.match(tucked[0], /^ <span class="switch dialog-nav-button"> Cheer100 <\/span><br>[㐀-鿿]/);

  // And the nudge does what it says.
  await cards(page).nth(0).getByRole("button", { name: "Switch this block" }).click();
  assert.equal(await cards(page).nth(0).locator(RENDER_SEL).inputValue(), "giant");
  assert.equal((await stored())[0].render, "giant");
  assert.ok((await copyPayload(page, 0)).includes("<b class=title>"));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Receipt length: a field of rw_controls_v1 that re-splits the stack and survives a reload", async () => {
  // 0.11.0: the per-receipt height budget is derived from this control, so a tall stack is
  // split into receipts that each fit the printer's real page (the 0.10.0 field cut-off fix).
  const { page, ctx, errors } = await freshPage({ blocks: [{ ...GIANT_SEED, id: 1, text: "RECEIPT", giantSize: 12 }] });
  assert.equal(await page.locator("#receiptLen").inputValue(), "297", "defaults to A4");
  // RECEIPT at a fixed L12 overflows A4 and comes out as three cheers...
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 3);
  assert.equal(await page.locator("#parts .part").count(), 3, "RECEIPT L12 needs three A4 receipts");
  // ...but one 500mm roll holds it in a single cheer. (fill() dispatches the input event the
  // app listens to, so the parts recompute without a reload.)
  await page.fill("#receiptLen", "500");
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 1);
  assert.equal(await page.locator("#parts .part").count(), 1, "a 500mm receipt holds RECEIPT L12 in one cheer");
  // The setting survives a reload (a field of rw_controls_v1, no new storage key).
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("rw_")));
  assert.ok(!keys.includes("rw_receipt_len") && keys.includes("rw_controls_v1"), "no new storage key: " + keys.join(","));
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await page.locator("#receiptLen").inputValue(), "500", "the length did not survive the reload");
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 1);
  assert.equal(await page.locator("#parts .part").count(), 1, "the re-split survived the reload");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the repeat number: off by default, two digits when on, kept across a reload, and a repeated part says so", async () => {
  // 0.12.0: the two nonce digits after the cheer are opt-in. They print on the receipt, and
  // all they do is make repeat copies differ, because Twitch won't send the same message
  // twice within 30 seconds. Off, nothing makes two parts differ, so a stack that repeats
  // itself sends the SAME message twice and the second one is refused: the part must say so.
  // Two identical HELLO blocks: each fills its own cheer at fit1, so they can't share a part.
  const twin = { ...GIANT_SEED, text: "HELLO" };
  const { page, ctx, errors } = await freshPage({ blocks: [{ ...twin, id: 1 }, { ...twin, id: 2 }] });
  const box = page.locator("#cheerNonce");
  const partNote = (i) => page.locator("#parts .part").nth(i).locator(".parts-note");
  const twinBodies = (budget) => [0, 1].flatMap(() =>
    C.buildGiantBodies("HELLO", { layout: "auto", size: "fit1", budget, tuck: false }));
  assert.equal(await box.isChecked(), false, "the repeat number must be off by default");
  assert.equal(await box.isEnabled(), true);
  await page.waitForFunction(() => document.querySelectorAll("#parts .part").length === 2);

  // Off: no digits anywhere, byte for byte the core's answer, and part 2 warns.
  const off = await copyAll(page);
  // Array.from: the core runs in its own vm realm, and a strict deepEqual compares prototypes.
  assert.deepEqual(off, Array.from(C.packStackBodies(twinBodies(budgetFor(PAGE_LEAD)), PAGE_LEAD), (p) => p.payload));
  for (const p of off) assert.match(p, /^Cheer100 <br><b class=/, "digits with the repeat number off: " + p);
  assert.equal(off[0], off[1], "fixture: the two parts are meant to be the same message");
  assert.equal(await partNote(0).count(), 0, "part 1 repeats nothing, so it needs no note");
  assert.match(await partNote(1).textContent(), /^Same message as part 1\..*30 seconds.*Add a repeat number/);

  // On: two digits after the cheer, different in each part, the note gone, and byte for byte
  // the core's answer for the digits each part carries (its budget is 3 characters smaller).
  await box.check();
  assert.match(await page.textContent("#cheerTuckHint"), /two repeat digits/, "the tuck hint ignores the digits");
  const on = await copyAll(page);
  for (const p of on) assert.match(p, /^Cheer100 \d\d <br><b class=/, "no digits with the repeat number on: " + p);
  assert.notEqual(on[0], on[1], "the two parts should differ by their digits");
  const digits = on.map((p) => p.match(/^Cheer100 (\d\d) /)[1]);
  const lead = { cheer: true, bits: 100 };
  assert.deepEqual(on, Array.from(C.packStackBodies(twinBodies(budgetFor(lead)),
    { ...lead, nonceFn: (i) => digits[i] }), (p) => p.payload));
  assert.equal(await page.locator("#parts .part .parts-note").count(), 0, "the repeated-part note outlived the digits");
  // Copy advances the copied part's digits, so copying it again gives a different message.
  assert.notEqual(await copyPayload(page, 0), on[0], "Copy did not advance the digits");

  // A field of rw_controls_v1 (no new storage key), so it survives a reload.
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("rw_")));
  assert.ok(!keys.includes("rw_nonce"), "a new storage key: " + keys.join(","));
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem("rw_controls_v1")))).nonce, true);
  await page.reload();
  await page.waitForSelector("#blockList");
  assert.equal(await box.isChecked(), true, "the repeat number did not survive a reload");

  // Tucked, the digits ride inside the corner span with the token.
  await page.locator("#cheerTuck").check();
  assert.match(await copyPayload(page, 0), /^ <span class="switch dialog-nav-button"> Cheer100 \d\d <\/span><b class=/);
  await page.locator("#cheerTuck").uncheck();

  // Without Cheer-ready there is nothing to put the digits after: disabled, NOT unchecked,
  // and the free messages are identical again, so the note comes back without the toggle.
  await page.locator("#cheer").uncheck();
  assert.equal(await box.isDisabled(), true);
  assert.equal(await box.isChecked(), true, "turning Cheer-ready off reset the repeat number");
  assert.match(await page.textContent("#cheerNonceHint"), /^Needs Cheer-ready/);
  assert.ok((await copyPayload(page, 0)).startsWith(" <br><b class="), "a free message got a cheer lead");
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
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(installClipboardStub);
  await ctx2.addInitScript(() => {
    try {
      if (!localStorage.getItem("rw_controls_v1")) {
        localStorage.setItem("rw_controls_v1", JSON.stringify({ mode: "text", cheer: true, bits: "100", tuck: false }));
      }
    } catch (e) {}
  });
  const old = await ctx2.newPage();
  await old.goto(server.url);
  await old.waitForSelector("#blockList");
  assert.equal(await old.locator("#cheerNonce").isChecked(), false, "an old settings blob turned the digits on");
  assert.match(await copyPayload(old, 0), /^Cheer100 <br>/);
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
