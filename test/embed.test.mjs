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
  // and must actually emit it. Tokens are unique, with ONE deliberate exception: the
  // live sanitizer keys <img> on its CLASS, not just the tag, so imgemote and imgbits
  // both declare "<img" and are told apart by "emote" vs "bits". They are real
  // alternatives to each other even though a "<img" blocked term would take both.
  const seen = new Set();
  for (const e of C.EMBEDS) {
    assert.ok(e.token && e.token.startsWith("<"), e.id + " must declare its blocked-term token");
    const html = C.buildImageEmbed(e.id, BOX);
    assert.ok(html.indexOf(e.token) >= 0, e.id + " doesn't emit its declared token " + e.token);
    if (e.token === "<img") {
      // The <img family is distinguished by class, so assert on that instead of the
      // token. The two LIVE ones must carry an emote/bits class (that is what the
      // sanitizer keeps); the old classless <img is kept blocked for re-probe and is
      // distinct precisely because it has no class.
      const cls = (html.match(/class="([^"]*)"/) || [])[1] || "(none)";
      if (!e.blocked) assert.ok(cls === "emote" || cls === "bits", e.id + " must carry an emote/bits class: " + html);
      assert.ok(!seen.has(e.token + cls), "two <img carriers share the class " + cls);
      seen.add(e.token + cls);
    } else {
      assert.ok(!seen.has(e.token), "two carriers share the token " + e.token + " — not real alternatives");
      seen.add(e.token);
    }
  }
});

test("under the live sanitizer, only the two img-class carriers survive", () => {
  // The sanitizer (confirmed live 2026-09-15) strips every tag but a short allow-list,
  // and the only picture it keeps is <img class="emote"|"bits">. So the field record
  // above is superseded: embed/input/iframe/object AND the SVG image form are ALL dead
  // now, and the only live carriers are the two img-class forms.
  const stripped = new Set(["<object", "<image", "<embed", "<input", "<iframe"]);
  for (const e of C.EMBEDS) {
    if (stripped.has(e.token)) assert.ok(e.blocked, e.token + " is stripped by the sanitizer but not flagged blocked");
  }
  // The bare <img (no class) is still dead: the sanitizer deletes a classless <img>.
  assert.ok(C.getEmbed("img").blocked, "a classless <img must stay flagged blocked");
  const live = C.EMBEDS.filter(e => !e.blocked).map(e => e.id);
  assert.equal(live.slice().sort().join(","), "imgbits,imgemote", "only the img-class carriers survive, got " + live.join(","));
});

test("every live carrier emits ONLY the attributes the sanitizer keeps (src, class)", () => {
  // The old width clamp (max-width:100%) lived in `style`, and the sanitizer strips
  // `style` along with width/height — so on a live carrier a clamp is dead weight that
  // never reaches the tape. The live forms therefore carry nothing but src and class;
  // sizing has to come from the uploaded PNG's own pixels (and printer-bot's emote/bits
  // CSS), not from markup. This asserts we don't ship attributes that get stripped.
  const ALLOWED = new Set(["src", "class"]);
  for (const e of C.EMBEDS) {
    if (e.blocked) continue;                       // dead forms aren't worth auditing
    const html = C.buildImageEmbed(e.id, BOX);
    const attrs = [...html.matchAll(/(\w[\w-]*)=/g)].map(m => m[1]);
    for (const a of attrs) {
      assert.ok(ALLOWED.has(a), e.id + " emits '" + a + "', which the sanitizer strips: " + html);
    }
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
  assert.equal(ids().slice(0, 2).join(","), "imgemote,imgbits", "the two the sanitizer keeps lead the list");
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

test("a carrier that won't reach the tape says so in its label, so the dropdown can't mislead", () => {
  // Two ways a carrier is dead now: the blocked-terms list ate its tag, or the
  // sanitizer strips it. Either way the label has to say so.
  for (const e of C.EMBEDS) {
    if (e.blocked) assert.ok(/blocked|stripped/i.test(e.label), e.id + " is dead but doesn't say so: " + e.label);
  }
  // The two live carriers must flag themselves as unverified — the tag survives the
  // sanitizer, but only a real print confirms it clears chat and prints at a usable size.
  for (const id of ["imgemote", "imgbits"]) {
    assert.ok(/probe/i.test(C.getEmbed(id).label), id + " should tell the user to probe it: " + C.getEmbed(id).label);
  }
});

test("sizes are normalized, so a missing aspect probe or junk slider can't emit a broken box", () => {
  for (const e of C.EMBEDS) {
    for (const bad of [{ w: NaN, h: 0, mm: -5 }, { w: undefined, h: undefined, mm: undefined }, {}]) {
      const html = C.buildImageEmbed(e.id, { url: BOX.url, ...bad });
      assert.ok(!/(NaN|Infinity|undefined|null)/.test(html), e.id + " emitted junk: " + html);
      const dims = [...html.matchAll(/(?:width|height)(?:="|:)(-?\d+)/g)].map(m => Number(m[1]));
      // The live img-class carriers state no size on purpose — the sanitizer strips
      // width/height, so a stated box would be dead weight. Every OTHER carrier that
      // states a dimension must normalize it to a positive number.
      if (e.token === "<img" && !e.blocked) {
        assert.equal(dims.length, 0, e.id + " should state no size (the sanitizer strips it): " + html);
      } else {
        assert.ok(dims.length > 0, e.id + " stated no size at all: " + html);
        for (const d of dims) assert.ok(d > 0, e.id + " emitted a non-positive size: " + html);
      }
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

test("the default is the only sanitizer-legal carrier, flagged honestly and never overclaimed", () => {
  // The old rule was: only a carrier field-recorded as "prints" may be the default,
  // because the default was once set on a bench result the tape contradicted. The
  // sanitizer forces a harder situation — the ONLY carrier it keeps is <img class=…>,
  // which no one has printed yet — so the default is legitimately unverified. The rule
  // that survives is the honest half: we do NOT relabel it "prints" to make it look
  // proven. It carries field "probe" until the rig says otherwise.
  const def = C.getEmbed(C.EMBED_DEFAULT);
  assert.ok(!def.blocked, "default " + def.id + " is blocked");
  assert.equal(def.token, "<img", "default must be a sanitizer-legal <img carrier");
  assert.equal(def.field, "probe", "default " + def.id + " must be flagged 'probe', not overclaimed — got '" + def.field + "'");
  // No carrier may claim "prints" until a real print earns it: nothing has, post-sanitizer.
  for (const e of C.EMBEDS) {
    assert.ok(["probe", "blocked", "stripped"].includes(e.field),
      e.id + " has an unexpected field verdict: " + JSON.stringify(e.field));
  }
});
