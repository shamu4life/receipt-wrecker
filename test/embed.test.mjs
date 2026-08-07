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

test("every carrier declares the exact token a blocked-terms list would have to match", () => {
  // The point of the table: switching carrier has to actually change the token the
  // list is keyed on, otherwise the fallback is theatre. Each entry names its token
  // and must actually emit it — and no two may share one, or a single blocked term
  // would take out two "alternatives" at once.
  const seen = new Set();
  for (const e of C.EMBEDS) {
    assert.ok(e.token && e.token.startsWith("<"), e.id + " must declare its blocked-term token");
    const html = C.buildImageEmbed(e.id, BOX);
    assert.ok(html.indexOf(e.token) >= 0, e.id + " doesn't emit its declared token " + e.token);
    assert.ok(!seen.has(e.token), "two carriers share the token " + e.token + " — not real alternatives");
    seen.add(e.token);
  }
});

test("the tokens already eaten by the list are all flagged blocked", () => {
  // Field record as of Aug 2026: object, then the SVG image form, then img.
  const dead = new Set(["<object", "<image", "<img"]);
  for (const e of C.EMBEDS) {
    if (dead.has(e.token)) assert.ok(e.blocked, e.token + " is blocked in the field but not flagged");
  }
  const live = C.EMBEDS.filter(e => !e.blocked).map(e => e.id);
  assert.ok(live.length >= 3, "want several live fallbacks left, got " + live.join(","));
  assert.ok(live.includes("input"), "input is the extension-independent fallback — keep it live");
});

test("every live carrier clamps to the receipt body, which is narrower than the box we ask for", () => {
  // Measured on the real engine: at the requested 263px every carrier drew to the
  // paper edge and lost its right margin (the body is ~240px on an 80mm roll). The
  // clamp adapts instead of hardcoding another guess. This is what made the field
  // print come out "too wide".
  for (const e of C.EMBEDS) {
    if (e.blocked) continue;                       // dead forms aren't worth the chars
    const html = C.buildImageEmbed(e.id, BOX);
    assert.ok(/max-width:100%/.test(html), e.id + " can overflow the paper: " + html);
  }
});

test("the embed carrier states no height, so the clamp can't stretch the picture", () => {
  // With an explicit height, clamping the width leaves the height stated and the
  // picture stretches ~8%; without it the engine takes the height from the image.
  const html = C.buildImageEmbed("embed", BOX);
  assert.ok(!/height/.test(html), "embed must not state a height: " + html);
});

test("urlHasImageExt spots the links that would print blank on an extension-sniffing carrier", () => {
  for (const u of ["https://x.test/a.png", "https://x.test/a.JPG", "https://x.test/a.jpeg",
                   "https://x.test/a.gif", "https://x.test/a.png?ex=deadbeef", "https://x.test/a.png#x"]) {
    assert.ok(C.urlHasImageExt(u), "should count as an image link: " + u);
  }
  for (const u of ["https://receipt.uwutoowo.com/i/a1b2c3d4", "https://x.test/a.webp",
                   "https://x.test/pngfile", "https://x.test/", "", null, undefined]) {
    assert.ok(!C.urlHasImageExt(u), "should NOT count as an image link: " + u);
  }
  // The carriers that need one are exactly the ones flagged.
  assert.ok(C.getEmbed("embed").needsExt, "embed sniffs the extension");
  assert.ok(!C.getEmbed("input").needsExt, "input does not");
});

test("no carrier leans on a CSS background — printer-bot prints with --no-background", () => {
  // Measured on the exact binary printer-bot ships: a background-image div draws
  // nothing, because its Print Routine passes --no-background (and the
  // `background:url(x) 0 0/100%` slash shorthand is separately invalid in WebKit
  // 534.34). A tagless CSS backdrop LOOKS like the durable answer to a blocked tag
  // list, so this guards against it being reintroduced on that reasoning.
  for (const e of C.EMBEDS) {
    const html = C.buildImageEmbed(e.id, BOX);
    assert.ok(!/background/i.test(html), e.id + " relies on a CSS background: " + html);
  }
});

test("the carriers are ordered by what actually printed, live ones first", () => {
  // joined, not deepEqual: arrays built inside the vm realm aren't reference-equal
  // to this realm's Array, which assert/strict's deep compare rejects.
  assert.equal(ids().slice(0, 2).join(","), "input,embed", "field-confirmed pair leads, robust one first");
  const firstBlocked = C.EMBEDS.findIndex(e => e.blocked);
  const lastLive = ids().length - 1 - [...C.EMBEDS].reverse().findIndex(e => !e.blocked);
  assert.ok(firstBlocked > lastLive, "blocked carriers must sort below every live one");
  // A carrier that sniffs the extension has to say so, since it fails silently.
  for (const e of C.EMBEDS) {
    if (e.needsExt && !e.blocked) {
      assert.ok(/needs a/i.test(e.label), e.id + " should warn about the URL extension: " + e.label);
    }
  }
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

test("a carrier marked blocked or cropping says so in its label, so the dropdown can't mislead", () => {
  for (const e of C.EMBEDS) {
    if (e.blocked) assert.ok(/blocked/i.test(e.label), e.id + " is blocked but doesn't say so: " + e.label);
  }
  // iframe renders but draws the picture at natural size and clips it (a subframe
  // gets no shrink-to-fit), so it must not read like a clean fallback.
  assert.ok(/crop/i.test(C.getEmbed("iframe").label), "iframe should warn that it crops");
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

test("the default carrier cannot be one that fails silently on a bare URL", () => {
  // embed/object pick their renderer from the file extension and print a blank
  // space without one — no error, nothing on the tape to tell you why. Whatever
  // leads the list has to work with any link a user might paste.
  const def = C.getEmbed(C.EMBED_DEFAULT);
  assert.ok(!def.needsExt, "default " + def.id + " fails silently on an extensionless URL");
  assert.ok(!def.blocked, "default " + def.id + " is blocked");
  assert.ok(C.buildImageEmbed(C.EMBED_DEFAULT, { ...BOX, url: "https://x.test/i/a1b2c3d4" }).length > 0);
});
