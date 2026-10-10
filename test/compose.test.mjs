import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

// packStackBodies — dual char + height budget packing.
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

// 0.12.0: the repeat number (the two nonce digits) is opt-in. `noNonce: true` is what the
// app passes when it is off, which is its default.
test("noNonce: every lead is the bare token, and its reservation is exactly 3 smaller", () => {
  for (const bits of [1, 25, 100, 1000, 10000]) {
    const on = { cheer: true, bits }, off = { ...on, noNonce: true };
    const what = "bits " + bits;
    assert.equal(C.leadLength(off), C.leadLength(on) - 3, what + ": the digits and their space");
    const parts = C.packStackBodies([body(300, 50), body(300, 50)], off);
    assert.equal(parts.length, 2, what);
    for (const p of parts) {
      assert.equal(p.nonce, "", what);
      assert.equal(p.lead, "Cheer" + bits + " ", what);
      assert.equal(p.lead, C.buildLead(off, ""), what);
      assert.notEqual(p.payload[0], "<", what);
    }
  }
  // Not cheering, there was never a nonce: the nbsp guard either way.
  assert.equal(C.leadLength({ cheer: false, noNonce: true }), C.LEAD_GUARD.length);
});

test("noNonce never asks for a nonce, so the app's counter (a storage write per call) is untouched", () => {
  let calls = 0;
  C.packStackBodies([body(300, 50), body(300, 50)],
    { cheer: true, bits: 100, noNonce: true, nonceFn: () => { calls++; return "07"; } });
  assert.equal(calls, 0);
});

test("noNonce: a body sized to the smaller reservation still lands at exactly 500", () => {
  const opts = { cheer: true, bits: 100, noNonce: true };
  const budget = C.MAX_CHARS - C.leadLength(opts);
  const one = C.packStackBodies([body(budget, 10, "丶".repeat(budget))], opts);
  assert.equal(one.length, 1);
  assert.equal(one[0].chars, C.MAX_CHARS);
});

test("noNonce leaves bands where they were (the 14 floor)", () => {
  // The band reserve's floor of 14 still applies, so toggling the digits never re-bands a
  // Hanzi or glyph grid.
  assert.equal(C.bandReserve(C.MAX_CHARS - C.leadLength({ cheer: true, bits: 100, noNonce: true })), 14);
  assert.equal(C.bandReserve(C.MAX_CHARS - C.leadLength({ cheer: true, bits: 100 })), 14);
});

test("noNonce absent or false packs byte-identically: callers written before the toggle are unchanged", () => {
  const bodies = [body(200, 50), body(150, 700, "丶二土"), body(260, 900)];
  for (const cheer of [true, false]) {
    const a = C.packStackBodies(bodies, { cheer, bits: 100, nonceFn: (i) => C.makeNonce(i) });
    const b = C.packStackBodies(bodies, { cheer, bits: 100, noNonce: false, nonceFn: (i) => C.makeNonce(i) });
    assert.deepEqual(b.map((p) => p.payload), a.map((p) => p.payload));
  }
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

// ── THE LEAD ──
// buildLead is the ONE builder of a part's lead; leadLength is what the packer and the
// band builders reserve for it.
test("the plain lead is 'Cheer<bits> 07 ' for ANY amount from 1 up, and leadLength is token.length + 4", () => {
  // The packer used to reserve `"Cheer" + bits` + 4 inline; leadLength has to agree with
  // that at every bit amount. There is no 100-bit floor any more: a floor made the Bits
  // control say 25 while the payload sent (and spent) Cheer100. Absent, zero, negative or
  // junk falls back to the 100 default; a fraction is floored.
  assert.equal(C.buildLead({ cheer: true, bits: 100 }, "07"), "Cheer100 07 ");
  assert.equal(C.buildLead({ cheer: true, bits: 500 }, "07"), "Cheer500 07 ");
  assert.equal(C.buildLead({ cheer: true, bits: 25 }, "07"), "Cheer25 07 ");
  assert.equal(C.buildLead({ cheer: true, bits: 1 }, ""), "Cheer1 ");
  assert.equal(C.buildLead({ cheer: false }, "07"), C.LEAD_GUARD);
  const want = (bits) => (typeof bits === "number" && bits >= 1 ? Math.floor(bits) : 100);
  for (const bits of [undefined, 0, -5, NaN, 1, 2.9, 24, 25, 99, 100, 101, 500, 1000, 9999, 10000, 99999]) {
    const token = "Cheer" + want(bits);
    assert.equal(C.cheerBits(bits), want(bits), "bits " + bits);
    assert.equal(C.leadLength({ cheer: true, bits }), token.length + 4, "bits " + bits);
    assert.equal(C.leadLength({ cheer: true, bits, noNonce: true }), token.length + 1, "bits " + bits + ", no nonce");
    assert.equal(C.leadLength({ cheer: false, bits }), C.LEAD_GUARD.length, "bits " + bits);
  }
  // Strings (a saved setting, a <select> value) parse the same way.
  assert.equal(C.cheerBits("25"), 25);
  assert.equal(C.cheerBits("junk"), 100);
  assert.equal(C.leadLength({ cheer: true, bits: 100 }), 12);
});

test("the lead's real overhead is reserved: a body filling the budget lands at exactly 500, one more splits", () => {
  // The mutation this exists for: a reservation smaller than the lead the packer then
  // sends lets a part go over Twitch's limit, so the whole message is rejected and
  // nothing prints. Every amount from 1 up, with the repeat digits on and off.
  for (const bits of [1, 25, 100, 1000, 10000]) {
    for (const noNonce of [false, true]) {
      const opts = { cheer: true, bits, noNonce };
      const what = "bits " + bits + (noNonce ? ", no nonce" : "");
      const budget = C.MAX_CHARS - C.leadLength(opts);
      const one = C.packStackBodies([body(budget, 10, "丶".repeat(budget))], opts);
      assert.equal(one.length, 1, what);
      assert.equal(one[0].chars, C.MAX_CHARS, what + ": a full-budget body");
      const half = Math.floor(budget / 2);
      const two = C.packStackBodies([body(half, 10), body(budget - half + 1, 10)], opts);
      assert.equal(two.length, 2, what + ": " + two.map((p) => p.chars).join("/"));
      for (const p of two) {
        assert.ok(p.chars <= C.MAX_CHARS, what + ": a part is " + p.chars + " characters");
        assert.equal(p.chars, C.payloadLength(p.payload));
        assert.equal(p.lead, C.buildLead(opts, p.nonce), what + ": the part's lead is not buildLead's");
      }
    }
  }
});

test("the packer never touches a body: no <br> is added or stripped, whatever opens it", () => {
  // A giant body opens with its own <br> (it ends the lead's line); a Hanzi band opens with
  // a glyph. Both go out exactly as built, after exactly the lead.
  const giant = body(200, 600, "<br><b class=title>GG</b><br>" + "x".repeat(171));
  const hanzi = body(200, 600, "丶".repeat(200));
  for (const cheer of [true, false]) {
    const parts = C.packStackBodies([giant, hanzi, hanzi, giant], { cheer, bits: 100, heightPx: 5000 });
    assert.equal(parts.length, 2, parts.map((p) => p.chars).join("/"));
    for (const p of parts) assert.equal(p.payload, p.lead + p.bodies.map((b) => b.html).join(""));
    assert.equal(parts[1].payload, parts[1].lead + hanzi.html + giant.html);
  }
});

test("a full 15-column Hanzi band fits its message at every lead", () => {
  // hanziBodies sizes a band as floor((MAX_CHARS - bandReserve(budget)) / cols) rows of
  // pure text, and the packer never splits a band: 32 rows (480 chars, 492 with
  // "Cheer100 nn "). (hanziBodies itself needs a canvas, so its formula is replayed here
  // from the two exported pieces it uses; the structural check below pins that it still
  // calls them.)
  const rowsFor = (opts, cols) =>
    Math.max(1, Math.floor((C.MAX_CHARS - C.bandReserve(C.MAX_CHARS - C.leadLength(opts))) / cols));
  for (const opts of [{ cheer: true, bits: 100 }, { cheer: true, bits: 10000 }, { cheer: false },
                      { cheer: true, bits: 1, noNonce: true }]) {
    assert.equal(rowsFor(opts, 15), 32, "band changed for " + JSON.stringify(opts));
    assert.equal(C.bandReserve(C.MAX_CHARS - C.leadLength(opts)), 14, "reserve must stay 14");
  }
  for (const bits of [1, 100, 1000, 10000, 99999]) {
    const opts = { cheer: true, bits };
    for (const cols of [8, 15, 23, 48]) {
      const rows = rowsFor(opts, cols), band = "丶".repeat(rows * cols);
      const parts = C.packStackBodies([body(rows * cols, rows * 18, band)], opts);
      assert.equal(parts.length, 1);
      assert.ok(parts[0].chars <= C.MAX_CHARS, cols + "-column band at " + bits + " bits: " + parts[0].chars + " characters");
    }
  }
});

test("the banded builders size against the real lead (a structural check: they need a canvas)", () => {
  // hanziBodies and glyphImageBodies rasterize on a <canvas>, which the null-DOM sandbox
  // cannot run, so their band arithmetic is replayed above from the two exported pieces it
  // uses. This pins that they still USE them: the packer never splits a band, so a band
  // sized for a shorter lead than the one sent goes over 500 and Twitch rejects the cheer.
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../public/index.html"), "utf8");
  const fn = (name) => {
    const m = src.match(new RegExp("function " + name + "\\(([^)]*)\\)\\s*\\{[\\s\\S]*?\\n    \\}\\n"));
    assert.ok(m, "could not find " + name + " in index.html");
    return m;
  };
  for (const name of ["hanziBodies", "glyphImageBodies"]) {
    const m = fn(name);
    assert.ok(/\bbudget\b/.test(m[1]), name + " no longer takes the per-body budget");
    assert.ok(m[0].includes("bandReserve(budget)"), name + " sizes its band without bandReserve(budget)");
    assert.ok(!/MAX_CHARS - 14\b|\+ 14\b/.test(m[0]), name + " is back to a hardcoded 14-character lead");
  }
  const rbb = fn("renderBlockBodies")[0];
  assert.ok(/glyphImageBodies\(block, budget\)/.test(rbb), "renderBlockBodies stopped passing the budget to glyph-art");
  assert.ok(/hanziBodies\([^)]*\bbudget\)/.test(rbb), "renderBlockBodies stopped passing the budget to Hanzi");
  assert.ok(/MAX_CHARS - leadLength\(opts\)/.test(fn("packStack")[0]), "packStack no longer derives the budget from the lead");
});
