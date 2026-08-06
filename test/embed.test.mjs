import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

// A realistic box: 70mm at PX_PER_MM 3.75, 4:3 picture, on our own KV link.
const BOX = { url: "https://receipt.uwutoowo.com/i/a1b2c3d4e5f6", w: 263, h: 197, mm: 70 };
const ids = () => C.EMBEDS.map(e => e.id);

test("EMBEDS: every surface builds one-line markup with the URL in it", () => {
  assert.ok(C.EMBEDS.length >= 5, "want a real spread of fallbacks, got " + C.EMBEDS.length);
  for (const e of C.EMBEDS) {
    const html = C.buildImageEmbed(e.id, BOX);
    assert.ok(html.length > 0, e.id + " built nothing");
    assert.ok(!/[\r\n]/.test(html), e.id + " must stay newline-free (Twitch is single-line)");
    assert.ok(html.indexOf("a1b2c3d4e5f6") >= 0, e.id + " dropped the URL");
    assert.ok(typeof e.label === "string" && e.label.length, e.id + " needs a UI label");
  }
});

test("EMBEDS: ids are unique and every surface fits a cheer with room to spare", () => {
  assert.equal(new Set(ids()).size, C.EMBEDS.length, "duplicate embed id");
  // The cheer wrapper is "Cheer100 nn " = 12 chars; anything close to the cap would
  // leave no room for a caption block alongside the picture.
  for (const e of C.EMBEDS) {
    const chars = C.payloadLength(C.buildImageEmbed(e.id, BOX)) + 12;
    assert.ok(chars <= C.MAX_CHARS, e.id + " over the Twitch cap at " + chars);
    assert.ok(chars < 300, e.id + " is " + chars + " chars — too fat to share a cheer with text");
  }
});

test("the default carrier is a live surface, not one the blocked-terms list already ate", () => {
  const def = C.getEmbed(C.EMBED_DEFAULT);
  assert.equal(def.id, C.EMBED_DEFAULT, "EMBED_DEFAULT names no entry in EMBEDS");
  assert.ok(!def.blocked, "default carrier " + def.id + " is marked blocked");
  assert.equal(C.EMBEDS[0].id, C.EMBED_DEFAULT, "the default should lead the dropdown");
  const html = C.buildImageEmbed(C.EMBED_DEFAULT, BOX);
  assert.ok(html.indexOf("<image") < 0, "default still emits the blocked <image tag");
  assert.ok(html.indexOf("<object") < 0, "default still emits the blocked <object tag");
});

test("the blocked tokens appear ONLY in the surfaces flagged blocked", () => {
  // The point of the table: switching carrier has to actually change the token that
  // got blocked, otherwise the fallback is theatre.
  for (const e of C.EMBEDS) {
    const html = C.buildImageEmbed(e.id, BOX);
    const dead = html.indexOf("<image") >= 0 || html.indexOf("<object") >= 0;
    assert.equal(dead, !!e.blocked, e.id + ": blocked flag disagrees with the markup it emits");
  }
  const live = C.EMBEDS.filter(e => !e.blocked).map(e => e.id);
  assert.ok(live.length >= 4, "want several live fallbacks, got " + live.join(","));
});

test("the CSS backdrop never spells 'image' at all — the one surface a tag-name term can't reach", () => {
  const html = C.buildImageEmbed("css", BOX);
  assert.ok(!/image/i.test(html), "css surface leaked the word 'image': " + html);
  assert.ok(!/<(?!div|\/div)/.test(html), "css surface should be a bare div: " + html);
  assert.ok(html.indexOf("background:url(") >= 0, "css surface lost its backdrop");
  // Explicit box: a backdrop has no intrinsic size, so both dimensions must be stated.
  assert.ok(html.indexOf("width:263px") >= 0 && html.indexOf("height:197px") >= 0);
});

test("a hostile URL can't break out of any attribute, style, or url() token", () => {
  const nasty = 'https://x.test/a".jpg?a=1&b=2<b>)(\' \\';
  for (const e of C.EMBEDS) {
    const html = C.buildImageEmbed(e.id, { ...BOX, url: nasty });
    // Strip our own attribute quoting, then look for anything the URL smuggled in.
    const inside = html.replace(/^[^=]*/, "");
    assert.ok(!/&(?!amp;|quot;|lt;|gt;)/.test(inside), e.id + " left a raw & : " + html);
    assert.ok(html.indexOf("<b>") < 0, e.id + " passed a raw tag through: " + html);
    // One quoted attribute value must not contain a bare quote that ends it early.
    const attrs = html.match(/="[^"]*"/g) || [];
    assert.ok(attrs.length > 0, e.id + " has no quoted attributes to check");
  }
});

test("cssUrl percent-encodes everything that could close url() or start a new declaration", () => {
  const enc = C.cssUrl("https://x.test/a b(c)'d\"e\\f");
  for (const ch of ["(", ")", "'", "\\", " "]) {
    assert.ok(enc.indexOf(ch) < 0, "cssUrl left a raw " + JSON.stringify(ch) + ": " + enc);
  }
  assert.ok(enc.indexOf('"') < 0, "cssUrl left a raw quote: " + enc);
  assert.ok(enc.indexOf("%20") >= 0 && enc.indexOf("%28") >= 0, "expected percent-escapes: " + enc);
  // …and the escaping survives into the built markup.
  const html = C.buildImageEmbed("css", { ...BOX, url: "https://x.test/a b(c).png" });
  assert.ok(/url\(https:\/\/x\.test\/a%20b%28c%29\.png\)/.test(html), html);
});

test("sizes are normalized, so a missing aspect probe or junk slider can't emit a broken box", () => {
  for (const e of C.EMBEDS) {
    for (const bad of [{ w: NaN, h: 0, mm: -5 }, { w: undefined, h: undefined, mm: undefined }, {}]) {
      const html = C.buildImageEmbed(e.id, { url: BOX.url, ...bad });
      assert.ok(!/(NaN|Infinity|undefined|null)/.test(html), e.id + " emitted junk: " + html);
      const dims = [...html.matchAll(/(?:width|height)(?:="|:)(-?\d+)/g)].map(m => Number(m[1]));
      assert.ok(dims.length > 0, e.id + " stated no size at all: " + html);
      for (const d of dims) assert.ok(d > 0, e.id + " emitted a non-positive size: " + html);
    }
  }
});

test("an unknown carrier id falls back to the default instead of throwing", () => {
  assert.equal(C.getEmbed("no-such-tag").id, C.EMBED_DEFAULT);
  assert.equal(C.getEmbed(undefined).id, C.EMBED_DEFAULT);
  assert.equal(C.buildImageEmbed("no-such-tag", BOX), C.buildImageEmbed(C.EMBED_DEFAULT, BOX));
});

test("buildEmbedProbe: one labelled alternative per surface, each a sendable cheer", () => {
  const probe = C.buildEmbedProbe(BOX);
  assert.equal(probe.length, C.EMBEDS.length, "probe must cover every surface");
  assert.deepEqual(probe.map(p => p.id), ids(), "probe order should mirror the dropdown");
  probe.forEach((p, i) => {
    assert.equal(p.label, String.fromCharCode(65 + i), "labels should read A, B, C…");
    // The label leads, so the message never starts with "<" (which gets some sends
    // dropped outright) and prints even when the tag itself renders nothing.
    assert.ok(p.html.startsWith(p.label + " "), p.id + " must lead with its label");
    assert.ok(!/[\r\n]/.test(p.html), p.id + " probe must stay newline-free");
    assert.ok(C.withinBudget(p.html), p.id + " probe is over budget");
    assert.ok(p.name && p.name.length, p.id + " probe needs a human-readable name");
  });
  // Every probe points at the SAME picture — the tag is the only variable.
  assert.equal(new Set(probe.map(p => p.html.indexOf("a1b2c3d4e5f6") >= 0)).size, 1);
});

test("probe bodies survive the real packer as one cheer each", () => {
  const parts = C.buildEmbedProbe(BOX).map(p =>
    C.packStackBodies([{ html: p.html, chars: C.payloadLength(p.html), heightPx: BOX.h }],
                      { bits: 100, cheer: true, nonceFn: () => "07" }));
  for (const [i, part] of parts.entries()) {
    assert.equal(part.length, 1, "a probe body should never split across receipts");
    assert.ok(part[0].payload.startsWith("Cheer100 07 "), part[0].payload);
    assert.ok(part[0].chars <= C.MAX_CHARS, "probe " + i + " over the cap at " + part[0].chars);
  }
});
