// BROWSER SMOKE TESTS — the half of the app the null-DOM harness cannot reach.
//
// Every case here is a bug that actually shipped, because nothing automated exercised
// the UI and hand-checking is the thing you skip when a change looks small:
//
//   * add/remove/reorder a block never called saveBlocks(), so a rebuilt stack was gone
//     on reload. Shipped to production.
//   * the expired-upload flag was set and never cleared, so the card kept warning after
//     the user did exactly what it asked.
//   * the takeover cost line said "Parts 2-2".
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

let server, browser;

test.before(async () => {
  server = await serve();
  browser = await chromium.launch();
});
test.after(async () => {
  await browser?.close();
  await server?.close();
});

async function freshPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(server.url);
  await page.waitForSelector("#blockList");
  return { page, ctx, errors };
}

const cardCount = (page) => page.locator("#blockList > *").count();

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
  await page.click("#addTakeoverBtn");
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

test("Seed fake donation fills an empty takeover, and the items are then editable", async () => {
  const { page, ctx } = await freshPage();
  await page.click("#addTakeoverBtn");
  const card = page.locator("#blockList > *").last();
  await card.getByRole("button", { name: "Seed fake donation" }).click();

  // Four items: the picture, the amount, the name, the italic note.
  await assert.doesNotReject(card.locator(".tk-item").first().waitFor());
  assert.equal(await card.locator(".tk-item").count(), 4,
    "the seed should produce the four-item header arrangement");

  // Ordinary items afterwards — not a frozen template.
  const before = await card.locator(".tk-item").count();
  await card.getByRole("button", { name: "+ text" }).click();
  assert.equal(await page.locator("#blockList > *").last().locator(".tk-item").count(),
    before + 1, "you should be able to add items around a seeded donation");
  await ctx.close();
});

test("the takeover card prices itself, and turns red only when over budget", async () => {
  const { page, ctx } = await freshPage();
  await page.click("#addTakeoverBtn");
  const card = page.locator("#blockList > *").last();
  await card.getByRole("button", { name: "Seed fake donation" }).click();

  const cost = page.locator(".cost-note").first();
  await cost.waitFor();
  assert.match(await cost.textContent(), /This takeover is \d+ characters\./);
  assert.ok(!(await cost.getAttribute("class")).includes("over"),
    "a seeded donation is well under 500 and must not read as over budget");

  // Push it over by stuffing the item list, and check the warning is real.
  for (let i = 0; i < 6; i++) await card.getByRole("button", { name: "+ text" }).click();
  const inputs = page.locator("#blockList > *").last().locator('input[type=text]');
  for (let i = 0; i < await inputs.count(); i++) {
    await inputs.nth(i).fill("OVERFLOWING THE TAKEOVER CHARACTER BUDGET " + i);
  }
  const after = page.locator(".cost-note").first();
  await assert.doesNotReject(after.locator("xpath=self::*[contains(@class,'over')]").waitFor({ timeout: 4000 }));
  assert.match(await after.textContent(), /over, so Twitch rejects it/);
  await ctx.close();
});

test("the cover surcharge line never says a range of one", async () => {
  // "Parts 2-2 each spend 106 more" shipped. A range of one is a sentence bug, and the
  // kind nothing but a real render catches.
  const { page, ctx } = await freshPage();
  await page.click("#addTakeoverBtn");
  const tk = page.locator("#blockList > *").last();
  await tk.getByRole("button", { name: "Seed fake donation" }).click();
  // .first(): the card's own move-up, not the per-item ones a seeded takeover also has.
  await tk.getByRole("button", { name: "↑" }).first().click();  // takeover into part 1

  // Enough text to force a second cheer.
  await page.click("#addTextBtn");
  await page.locator("#blockList > * textarea").last().fill("WRECK THE RECEIPT COMPLETELY");

  const cost = page.locator(".cost-note").first();
  await cost.waitFor();
  const text = await cost.textContent();
  // Both spellings, because the copy has already changed once underneath this test.
  // The en-dash form is what 0.7.2 shipped and the " to " form is what it says now; a
  // guard that only knows the retired spelling is a guard that has quietly stopped
  // working, which is worse than not having one.
  assert.ok(!/Parts (\d+)\s*(?:–|to)\s*\1\b/.test(text), "a range of one: " + text);
  if (/cheers/.test(text)) {
    assert.match(text, /Part 2 spends|Parts 2 to [3-9]/, "unexpected surcharge phrasing: " + text);
  }
  await ctx.close();
});

test("presets round-trip through a reload", async () => {
  const { page, ctx } = await freshPage();
  await page.click("#addTakeoverBtn");
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
  await page.click("#addTakeoverBtn");
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
