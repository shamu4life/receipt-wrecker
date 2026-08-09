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
