import test from "node:test";
import assert from "node:assert/strict";
import { imageKeyFor } from "../src/worker.js";

// The Worker's image routes. Since 1.0.0 no payload carries an uploaded link (a Real picture
// sends nothing on SassyTP's bot, and glyph-art is characters): the links matter for the Real
// picture card's thumbnail and for saved presets. Every link shape ever minted, the short root
// form (/<12 hex>.png) and the older /i/<hex> forms, must keep resolving, because a preset saved
// by an older build may still hold one. This file guards that routing.

const HEX12 = "a1b2c3d4e5f6";
const HEX32 = "0123456789abcdef0123456789abcdef";

test("the short root form resolves — that's the shape /upload now mints", () => {
  assert.equal(imageKeyFor("/" + HEX12 + ".png"), HEX12);
  assert.equal(imageKeyFor("/" + HEX12), HEX12);              // extension is stripped, not required
});

test("links minted before the change keep resolving", () => {
  // These live for 15 minutes, so the overlap is short — but a link that 404s mid-cheer
  // is a blank space on someone's tape, and there is no reason to cause one.
  assert.equal(imageKeyFor("/i/" + HEX32 + ".png"), HEX32);   // the previous form
  assert.equal(imageKeyFor("/i/" + HEX32), HEX32);            // and the one before that
  assert.equal(imageKeyFor("/" + HEX32 + ".png"), HEX32);     // long key on the new path
});

test("every extension the printer's engine tolerates is stripped", () => {
  // Minted links carry an image extension (the printer engine before 1.0.0 failed the whole
  // print on a subresource with an unknown one), and links minted then may still be in saved
  // presets, so serving must ignore the extension rather than 404 on it.
  for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "PNG", "JpEg"]) {
    assert.equal(imageKeyFor("/" + HEX12 + "." + ext), HEX12, "failed on ." + ext);
  }
});

test("the root form must not shadow the static site", () => {
  // This is the risk the short path buys: image keys now share a namespace with every
  // asset served from public/. A pattern that swallowed one of these would take the
  // page, the crawler policy or the sitemap offline.
  for (const p of ["/", "/index.html", "/robots.txt", "/llms.txt", "/sitemap.xml",
                   "/favicon.ico", "/upload", "/px", "/i/", "/deadbeef/x.png"]) {
    assert.equal(imageKeyFor(p), null, p + " was mistaken for an image key");
  }
});

test("a key is hex and long enough to be unguessable, or it isn't a key", () => {
  assert.equal(imageKeyFor("/abc.png"), null, "too short to be a real key");
  assert.equal(imageKeyFor("/" + "z".repeat(12) + ".png"), null, "not hex");
  assert.equal(imageKeyFor("/" + "a".repeat(65) + ".png"), null, "absurdly long");
  assert.equal(imageKeyFor("/" + HEX12 + ".exe"), null, "unknown extension is not stripped");
  assert.equal(imageKeyFor(""), null);
  assert.equal(imageKeyFor(null), null);
});

test("the minted link is short enough to matter", () => {
  // The numbers this whole change exists for.
  assert.equal(("https://receipt.uwutoowo.com/" + HEX12 + ".png").length, 45);
  assert.equal(("https://i.uwutoowo.com/" + HEX12 + ".png").length, 39);
  assert.equal(("https://receipt.uwutoowo.com/i/" + HEX32 + ".png").length, 67);   // what it was
});
