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

test("the default carrier is the one to re-probe first, and leads the dropdown", () => {
  // It used to be an invariant that the default was a LIVE surface. As of 2026-09-15
  // that is impossible: the sanitizer strips every tag but <img>, and automod blocks
  // "<img", so no carrier can deliver. The default's remaining job is to name the entry
  // worth re-probing first — the sanitizer-legal one — and to lead the dropdown.
  const def = C.getEmbed(C.EMBED_DEFAULT);
  assert.equal(def.id, C.EMBED_DEFAULT, "EMBED_DEFAULT names no entry in EMBEDS");
  assert.equal(C.EMBEDS[0].id, C.EMBED_DEFAULT, "the default should lead the dropdown");
  assert.notEqual(def.field, "stripped", "the default should be the sanitizer-legal candidate, not one the sanitizer removes");
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

test("every carrier is dead, and `field` records WHICH of the two gates killed it", () => {
  // Field-confirmed 2026-09-15, and the reason the app now warns instead of offering a
  // pick: the two gates have an empty intersection. The sanitizer keeps only <img>
  // (emote/bits class); automod blocks the literal "<img". Nothing clears both.
  assert.equal(C.anyCarrierLive(), false, "no carrier can deliver a picture — this must stay false until a gate opens");
  for (const e of C.EMBEDS) {
    assert.ok(e.blocked, e.id + " must be flagged blocked: nothing delivers a picture right now");
    assert.ok(["blocked", "stripped"].includes(e.field), e.id + " needs a gate on record, got " + JSON.stringify(e.field));
  }
  // The sanitizer is NOT what kills the img-class pair — chat is. That distinction is
  // the whole reason they lead the list: prune the terms list and they work again.
  for (const id of ["imgemote", "imgbits"]) {
    assert.equal(C.getEmbed(id).field, "blocked", id + " is chat-blocked, not sanitizer-stripped");
  }
  // The tags the sanitizer removes are on record as such, not mislabelled as chat-blocked.
  for (const id of ["embed", "input", "iframe"]) {
    assert.equal(C.getEmbed(id).field, "stripped", id + " is removed by the sanitizer");
  }
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

test("the carriers are ordered by what is worth re-probing first", () => {
  // Nothing is live any more, so "live ones first" can't be the rule. What replaces it:
  // the two the SANITIZER would keep lead the list, because they are the only entries a
  // pruned blocked-terms list could bring back. Everything the sanitizer strips sorts
  // below them — those need the sanitizer itself to change, which is a longer shot.
  // joined, not deepEqual: arrays built inside the vm realm aren't reference-equal
  // to this realm's Array, which assert/strict's deep compare rejects.
  assert.equal(ids().slice(0, 2).join(","), "imgemote,imgbits", "the two the sanitizer keeps lead the list");
  const sanitizerLegal = ["imgemote", "imgbits"].map(id => ids().indexOf(id));
  const strippedIdx = C.EMBEDS.map((e, i) => (e.field === "stripped" ? i : -1)).filter(i => i >= 0);
  assert.ok(Math.max(...sanitizerLegal) < Math.min(...strippedIdx),
    "sanitizer-legal carriers must sort above every tag the sanitizer strips");
  // A carrier that sniffs the extension has to say so, since it fails silently. This
  // loop is deliberately vacuous today (no carrier is live) and re-arms by itself the
  // moment one is — it is a guard for the state we want back, not a dead assertion.
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
    assert.ok(/block|stripped/i.test(e.label), e.id + " is dead but doesn't say so: " + e.label);
  }
  // The img-class pair must not read as merely "blocked" like the rest: their label has
  // to say the SANITIZER accepts them and CHAT is what refuses, because that is what
  // makes them the pair to re-probe rather than abandoned tags.
  for (const id of ["imgemote", "imgbits"]) {
    const label = C.getEmbed(id).label;
    assert.ok(/sanitizer-legal/i.test(label), id + " should say the sanitizer accepts it: " + label);
    assert.ok(/automod/i.test(label), id + " should name chat's filter as the blocker: " + label);
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
      // The img-class pair states no size on purpose — the sanitizer strips width/height,
      // so a stated box would be dead weight. Keyed by id, not by `blocked`: everything is
      // blocked now, and the classless <img> in this table DOES still state a size.
      if (e.id === "imgemote" || e.id === "imgbits") {
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

test("nothing claims to work: no carrier may be marked live without a field result", () => {
  // The rule this file has always enforced, in its current form. It began as "only a
  // carrier field-recorded as 'prints' may be the default", after the default was once
  // set on a bench result the tape contradicted. 0.9.0 briefly shipped the img-class
  // pair as the unverified default under field "probe" — and the free chat probe then
  // came back BLOCKED, which is precisely why the optimistic label was wrong to ship.
  // So: no entry may claim to print, and the app must report that nothing works.
  const def = C.getEmbed(C.EMBED_DEFAULT);
  assert.equal(def.token, "<img", "default must still be the sanitizer-legal <img candidate");
  assert.equal(C.anyCarrierLive(), false, "no carrier is live; the UI depends on this to warn");
  for (const e of C.EMBEDS) {
    assert.ok(["blocked", "stripped"].includes(e.field),
      e.id + " has an unexpected field verdict: " + JSON.stringify(e.field));
    assert.notEqual(e.field, "prints", e.id + " claims to print with no field result behind it");
    assert.notEqual(e.field, "probe", e.id + " is still marked unverified — the probe has since returned a verdict");
  }
});
