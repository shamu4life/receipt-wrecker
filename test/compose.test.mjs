import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

// Task 1: bits amount -> Cheer<N> token. packageCheer already supports opts.cheerToken;
// pin it so the bits control can rely on it.
test("packageCheer swaps in a custom cheer token (the bit amount)", () => {
  assert.equal(C.packageCheer("X", { cheer: true, cheerToken: "Cheer500", nonce: "07" }), "X Cheer500 07");
  assert.equal(C.packageCheer("X", { cheer: true, cheerToken: "Cheer100", nonce: "07" }), "X Cheer100 07");
});

test("packageCheer with no cheer returns the body unchanged (bits irrelevant)", () => {
  assert.equal(C.packageCheer("X", { cheer: false, cheerToken: "Cheer500" }), "X");
});

// Task 2: packStackBodies — dual char + height budget packing.
const body = (chars, heightPx, html) => ({ chars, heightPx, html: html || "x".repeat(chars) });

test("packs small bodies together, splits when the char budget is exceeded", () => {
  // 3 x 200 chars: 200+200 fit one receipt, the third spills -> 2 receipts.
  const parts = C.packStackBodies([body(200,50), body(200,50), body(200,50)], { bits: 100, cheer: true });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].bodies.length, 2);
  assert.equal(parts[1].bodies.length, 1);
});

test("splits on the physical height budget even when chars are tiny", () => {
  // Two ~900px-tall strips (few chars each) can't share one ~1500px page.
  const parts = C.packStackBodies([body(10,900), body(10,900)], { bits: 100, cheer: true });
  assert.equal(parts.length, 2);
});

test("a single over-budget body still gets its own receipt", () => {
  const parts = C.packStackBodies([body(800,50)], { bits: 100, cheer: true });
  assert.equal(parts.length, 1);
});

test("the cheer token reflects the bit amount", () => {
  const parts = C.packStackBodies([body(5,10)], { bits: 500, cheer: true });
  assert.ok(parts[0].payload.includes("Cheer500"), parts[0].payload);
});

test("cheer token + nonce lead each receipt (front, not trailing)", () => {
  const parts = C.packStackBodies([body(300,50), body(300,50)], { bits: 100, cheer: true });
  assert.equal(parts.length, 2);
  assert.notEqual(parts[0].nonce, parts[1].nonce);            // rotating nonce per receipt
  for (const p of parts) {
    assert.ok(/^Cheer100 \d\d /.test(p.payload), p.payload);  // "Cheer100 <nonce> " at the very front
    assert.equal(p.payload.charCodeAt(0), 0x43);              // starts with "C" (non-"<"), no nbsp guard needed
  }
});

test("no-cheer payload keeps the nbsp lead guard (may start with '<')", () => {
  const parts = C.packStackBodies([body(300,50)], { cheer: false });
  assert.equal(parts[0].payload.charCodeAt(0), 0x00A0);
});

// The bug this pins: the lead is CONTENT. It occupies a line in the bot's
// #receipt-content, above the first body, which shifts a lifted takeover DOWN by that
// line's height and leaves the top of the header uncovered. The preview used to render
// the bodies without it, so it showed a covered header the tape never produced — the
// shortfall only appeared on paper, after the bits were spent. Exposing `lead` is what
// lets the preview render exactly what the message carries; asserting that the payload
// is literally lead + bodies is what stops the two being built separately again.
test("each part exposes the lead it carries, and the payload is literally lead + bodies", () => {
  for (const cheer of [true, false]) {
    const parts = C.packStackBodies([body(120, 50, "<a>"), body(120, 50, "<b>")], { bits: 100, cheer });
    for (const p of parts) {
      assert.equal(typeof p.lead, "string", "every part must publish its lead");
      assert.ok(p.lead.length > 0, "the lead is never empty — it is a cheer token or the nbsp guard");
      const html = p.bodies.map((b) => b.html).join("");
      assert.equal(p.payload, p.lead + html,
        "payload must be exactly lead + bodies, or the preview can honestly render something else");
    }
  }
});

test("the lead is the cheer token when cheering and the nbsp guard when not", () => {
  const cheered = C.packStackBodies([body(120, 50, "<a>")], { bits: 500, cheer: true })[0];
  assert.match(cheered.lead, /^Cheer500 \d\d $/, cheered.lead);
  const bare = C.packStackBodies([body(120, 50, "<a>")], { cheer: false })[0];
  assert.equal(bare.lead.charCodeAt(0), 0x00A0);
});

// ── THE LEAD, AND THE CHEER-GEM TUCK ──
// buildLead is the ONE builder of a part's lead; leadLength is what the packer and the
// band builders reserve for it. The tuck moves the cheer token into a corner box:
// LEAD_GUARD + <span class="switch dialog-nav-button"> Cheer100 nn </span>, 60 characters
// against the plain lead's 12.
const TUCK_RE = /^\u00A0<span class="switch dialog-nav-button"> Cheer100 \d\d <\/span>$/;

test("the plain lead is unchanged: 'Cheer100 07 ', and the old token.length + 4 to the character", () => {
  // Byte-identical with the tuck off is a hard requirement: every untucked payload the
  // app sent before must still be the payload it sends now. The packer used to reserve
  // `"Cheer" + bits` + 4 inline; leadLength has to agree with that at every bit amount.
  assert.equal(C.buildLead({ cheer: true, bits: 100 }, "07"), "Cheer100 07 ");
  assert.equal(C.buildLead({ cheer: true, bits: 500, tuck: false }, "07"), "Cheer500 07 ");
  assert.equal(C.buildLead({ cheer: false }, "07"), C.LEAD_GUARD);
  for (const bits of [undefined, 0, 1, 99, 100, 101, 500, 1000, 9999, 10000, 99999]) {
    const token = "Cheer" + (bits && bits >= 100 ? bits : 100);
    assert.equal(C.leadLength({ cheer: true, bits }), token.length + 4, "bits " + bits);
    assert.equal(C.leadLength({ cheer: false, bits }), C.LEAD_GUARD.length, "bits " + bits);
  }
  assert.equal(C.leadLength({ cheer: true, bits: 100 }), 12);
});

test("tucked, the lead is the corner span after LEAD_GUARD, and never starts with '<'", () => {
  for (const bits of [100, 1000, 10000]) {
    const lead = C.buildLead({ cheer: true, bits, tuck: true }, "07");
    assert.match(lead.replace("Cheer" + bits, "Cheer100"), TUCK_RE, lead);
    assert.equal(lead.charCodeAt(0), 0x00A0, "the tucked lead must start with LEAD_GUARD, not '<'");
    // 60/61/62, plus the 4-character <br> the packer may add to a first body.
    const n = { 100: 60, 1000: 61, 10000: 62 }[bits];
    assert.equal(C.payloadLength(lead), n, "tucked lead at " + bits);
    assert.equal(C.leadLength({ cheer: true, bits, tuck: true }), n + 4, "reserve at " + bits);
  }
  // The token keeps a space on BOTH sides inside the span: Twitch only charges (and
  // printer-bot only turns into a gem) a standalone "Cheer100".
  assert.match(C.buildLead({ cheer: true, bits: 100, tuck: true }, "07"), /(^|\s)Cheer100(?=\s)/);
});

test("the tuck means nothing without a cheer: no token, no span, the nbsp guard", () => {
  const lead = C.buildLead({ cheer: false, tuck: true }, "07");
  assert.equal(lead, C.LEAD_GUARD);
  assert.equal(C.leadLength({ cheer: false, tuck: true }), C.LEAD_GUARD.length);
  const parts = C.packStackBodies([body(120, 50, "<b>x</b>")], { cheer: false, tuck: true });
  assert.equal(parts[0].lead, C.LEAD_GUARD);
  assert.ok(!parts[0].payload.includes("<span"), parts[0].payload);
  assert.equal(parts[0].payload, C.LEAD_GUARD + "<b>x</b>", "an uncheered body must not gain a <br> either");
});

test("tuck OFF packs byte-identically to no tuck option at all", () => {
  const bodies = [body(200, 50), body(150, 700, "丶二土"), body(260, 900), body(90, 10, "<br><b>x</b><br>")];
  bodies[3].leadBr = true;
  for (const cheer of [true, false]) {
    for (const bits of [100, 1000]) {
      const a = C.packStackBodies(bodies, { cheer, bits, nonceFn: (i) => C.makeNonce(i) });
      const b = C.packStackBodies(bodies, { cheer, bits, tuck: false, nonceFn: (i) => C.makeNonce(i) });
      assert.deepEqual(b.map((p) => p.payload), a.map((p) => p.payload));
      for (const p of a) {
        // Untucked, the packer touches no body: a leadBr body keeps its <br>.
        assert.equal(p.payload, p.lead + p.bodies.map((x) => x.html).join(""));
      }
    }
  }
});

test("the tuck lead's real overhead is reserved: two 230-char bodies are TWO parts, each <= 500", () => {
  // The mutation this exists for: reserving the old `token.length + 4` (12) instead of
  // leadLength (64 tucked) lets 230 + 230 share one part at 60 + 460 = 520 characters,
  // over Twitch's limit, so the whole message is rejected and nothing prints.
  for (const bits of [100, 1000, 10000]) {
    const opts = { cheer: true, tuck: true, bits };
    const parts = C.packStackBodies([body(230, 10), body(230, 10)], opts);
    assert.equal(parts.length, 2, "bits " + bits + ": " + parts.map((p) => p.chars).join("/"));
    for (const p of parts) {
      assert.ok(p.chars <= C.MAX_CHARS, "bits " + bits + ": a part is " + p.chars + " characters");
      assert.equal(p.chars, C.payloadLength(p.payload));
      assert.equal(p.lead, C.buildLead(opts, p.nonce), "the part's lead is not buildLead's");
      assert.notEqual(p.payload[0], "<");
    }
  }
});

test("the tuck's <br> is reserved too: a body filling the whole budget still lands at exactly 500", () => {
  // A body WITHOUT its own leading <br> (Hanzi, glyph-art) gains one under the tuck, and
  // leadLength counts those 4 characters. Drop them from the reserve and a body sized to
  // the budget lands at 504. Two bodies sharing the budget pay the <br> once.
  const opts = { cheer: true, bits: 100, tuck: true };
  const budget = C.MAX_CHARS - C.leadLength(opts);
  const one = C.packStackBodies([body(budget, 10, "丶".repeat(budget))], opts);
  assert.equal(one.length, 1);
  assert.equal(one[0].chars, C.MAX_CHARS, "a full-budget body under the tuck");
  const half = Math.floor(budget / 2);
  const two = C.packStackBodies([body(half, 10, "丶".repeat(half)), body(budget - half, 10, "二".repeat(budget - half))], opts);
  assert.equal(two.length, 1);
  assert.ok(two[0].chars <= C.MAX_CHARS, two[0].chars);
});

test("tucked, the FIRST body of every part is fixed up: a leadBr body loses its <br>, any other gains one", () => {
  // A giant body opens with <br> only to end the lead's line. Tucked, the lead is an nbsp
  // plus a box pinned out of the flow, so keeping that <br> leaves a blank line exactly as
  // tall as the gem line it hid (real engine: 156px either way); dropping it saves the
  // line (133px). A Hanzi/glyph grid has no <br>, and would share line 1 with the nbsp,
  // shifting its wrap and shearing the grid, so it gains one instead.
  const opts = { cheer: true, bits: 100, tuck: true, nonceFn: (i) => C.makeNonce(i) };
  const giant = (n) => Object.assign(body(n, 600, "<br><b class=title>" + "G".repeat(n - 27) + "</b><br>"), { leadBr: true });
  const hanzi = (n) => body(n, 600, "丶".repeat(n));
  const g1 = giant(200), h1 = hanzi(200), g2 = giant(200), h2 = hanzi(200);
  const parts = C.packStackBodies([g1, h1, h2, g2], opts);
  assert.equal(parts.length, 2, parts.map((p) => p.chars).join("/"));
  // Part 1 starts with the giant body minus its <br>; the hanzi body after it is untouched.
  assert.equal(parts[0].payload, parts[0].lead + g1.html.slice(4) + h1.html);
  // Part 2 starts with a hanzi body, which gains a <br>; the giant body after it keeps its own.
  assert.equal(parts[1].payload, parts[1].lead + "<br>" + h2.html + g2.html);
  // An EMPTY body ahead of the first real one changes nothing on paper, so it must not
  // absorb the fix-up.
  const empty = { html: "", chars: 0, heightPx: 0 };
  const e = C.packStackBodies([empty, hanzi(100)], opts);
  assert.equal(e[0].payload, e[0].lead + "<br>" + "丶".repeat(100));
  const eg = C.packStackBodies([empty, giant(100)], opts);
  assert.equal(eg[0].payload, eg[0].lead + giant(100).html.slice(4));
  // A body that opens with its own <br> but does NOT offer it (leadBr false: a giant body
  // in emote layout) already starts on a clean line. Adding the usual <br> would double
  // it into a blank line; stripping it would print its padded first line off-centre.
  const kept = body(200, 600, "<br><b class=title> Kappa </b><br>" + "x".repeat(200 - 34));
  const k = C.packStackBodies([kept], opts);
  assert.equal(k[0].payload, k[0].lead + kept.html);
  assert.ok(!k[0].payload.includes("<br><br>"), k[0].payload);
});

test("a full 15-column Hanzi band is resized for the tuck instead of going out over 500", () => {
  // hanziBodies sizes a band as floor((MAX_CHARS - bandReserve(budget)) / cols) rows of
  // pure text, and the packer never splits a band. Untucked that is 32 rows (480 chars,
  // 492 with "Cheer100 nn "), exactly as before; with the tuck's 60 + <br> a 32-row band
  // would be 544 and Twitch would reject it, so the reserve has to grow to the real lead.
  // (hanziBodies itself needs a canvas, so its formula is replayed here from the two
  // exported pieces it uses; giant.test.mjs checks it still calls them.)
  const rowsFor = (opts, cols) =>
    Math.max(1, Math.floor((C.MAX_CHARS - C.bandReserve(C.MAX_CHARS - C.leadLength(opts))) / cols));
  for (const opts of [{ cheer: true, bits: 100 }, { cheer: true, bits: 10000 }, { cheer: false }, { cheer: false, tuck: true }]) {
    assert.equal(rowsFor(opts, 15), 32, "untucked band changed for " + JSON.stringify(opts));
    assert.equal(C.bandReserve(C.MAX_CHARS - C.leadLength(opts)), 14, "untucked reserve must stay 14");
  }
  for (const bits of [100, 1000, 10000]) {
    const opts = { cheer: true, bits, tuck: true };
    for (const cols of [8, 15, 23, 48]) {
      const rows = rowsFor(opts, cols), band = "丶".repeat(rows * cols);
      const parts = C.packStackBodies([body(rows * cols, rows * 18, band)], opts);
      assert.equal(parts.length, 1);
      assert.ok(parts[0].chars <= C.MAX_CHARS,
        cols + "-column band at " + bits + " bits, tucked: " + parts[0].chars + " characters");
    }
  }
});
