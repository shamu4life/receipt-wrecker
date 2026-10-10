import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, appScript } from "./_harness.mjs";
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
  // Two 900px-tall bodies (few chars each) can't share the bot's default 1600px box.
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

test("noNonce absent or false packs byte-identically: callers written before the toggle are unchanged", () => {
  const bodies = [body(200, 50), body(150, 700, "丶二土"), body(260, 900)];
  for (const cheer of [true, false]) {
    const a = C.packStackBodies(bodies, { cheer, bits: 100, nonceFn: (i) => C.makeNonce(i) });
    const b = C.packStackBodies(bodies, { cheer, bits: 100, noNonce: false, nonceFn: (i) => C.makeNonce(i) });
    assert.deepEqual(b.map((p) => p.payload), a.map((p) => p.payload));
  }
});

// The lead is CONTENT: the bot prints it as a line of text in #receipt-content, above the
// first body, and the height model counts that line. A preview built from the bodies alone
// would show a receipt the tape never produces. Exposing `lead` is what lets the preview
// render exactly what the message carries; asserting that the payload is literally
// lead + bodies is what stops the two being built separately again.
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
  // A big-text chunk carried over a word gap opens with its own <br>; a glyph grid opens with
  // a tag or a glyph. Both go out exactly as built, after exactly the lead.
  const gap = body(200, 600, "<br><div style=\"font:700 64px/.8 Arial\">GG</div>" + "x".repeat(152));
  const grid = body(200, 600, "丶".repeat(200));
  for (const cheer of [true, false]) {
    const parts = C.packStackBodies([gap, grid, grid, gap], { cheer, bits: 100, heightPx: 5000 });
    assert.equal(parts.length, 2, parts.map((p) => p.chars).join("/"));
    for (const p of parts) assert.equal(p.payload, p.lead + p.bodies.map((b) => b.html).join(""));
    assert.equal(parts[1].payload, parts[1].lead + grid.html + gap.html);
  }
});

test("a full Han tiling (Design T) band fits its message at every lead, on both papers", () => {
  // buildDesignT bands a grid by characters (500, its trailing token included) and by the
  // message box, and every plain part rides alone: the packer never splits one, so a band
  // sized for a shorter token than the one sent goes over 500 and Twitch rejects the cheer.
  for (const paperMm of [80, 58]) {
    const Cc = C.hanziCols(C.paperSpec(paperMm).contentW);
    const grid = Array.from({ length: 200 }, () => Array.from({ length: Cc }, () => "鬱"));
    for (const bits of [1, 24, 100, 10000, 99999]) {
      for (const noNonce of [true, false]) {
        const ctx = C.stackContext({ cheer: true, bits, noNonce, hrThreshold: 1000000, paperMm });
        assert.equal(ctx.mode, "plain");
        const bodies = C.buildDesignT(grid, { mode: ctx.mode, paperMm, cheer: true, bits, noNonce, limitPx: ctx.limit.px });
        const parts = C.packStackBodies(bodies, ctx);
        assert.equal(parts.length, bodies.length, "a plain band shared a part");
        for (const p of parts) {
          assert.ok(p.chars <= C.MAX_CHARS, `${paperMm} mm, ${bits} bits: ${p.chars} characters`);
          assert.ok(p.contentPx <= ctx.limit.px + 1e-6, `${paperMm} mm, ${bits} bits: ${p.contentPx}px`);
          assert.ok(p.payload.endsWith(" Cheer" + bits + (noNonce ? "" : " " + p.nonce)), p.payload.slice(-12));
        }
      }
    }
  }
});

test("the glue builds every block against the stack context it packs with (a structural check: it needs a canvas)", () => {
  // hanziBodies and glyphImageBodies rasterize on a <canvas>, which the null-DOM sandbox
  // cannot run. This pins that they, renderBlockBodies and packStack still hand the builders
  // the ONE stackContext the packer then packs with: a body sized for another budget or
  // another box than its part's goes over 500 (Twitch rejects it) or past the bot's box.
  const src = appScript();
  const fn = (name) => {
    const m = src.match(new RegExp("function " + name + "\\(([^)]*)\\)\\s*\\{[\\s\\S]*?\\n    \\}\\n"));
    assert.ok(m, "could not find " + name + " in index.html");
    return m[0];
  };
  const hz = fn("hanziBodies");
  assert.ok(/buildDesignT\(/.test(hz) && /limitPx: ctx\.limit\.px/.test(hz) && /mode: ctx\.mode/.test(hz), "hanziBodies: " + hz);
  for (const k of ["cheer", "bits", "noNonce", "paperMm"]) assert.ok(new RegExp(k + ": ctx\\." + k).test(hz), "hanziBodies drops ctx." + k);
  const gl = fn("glyphImageBodies");
  assert.ok(/buildGlyphBodies\([^;]*budget: ctx\.budget[^;]*heightPx: ctx\.room[^;]*paperMm: ctx\.paperMm/.test(gl), "glyphImageBodies: " + gl);
  assert.ok(/buildDesignTPicture\(/.test(gl), "glyphImageBodies lost the plain picture");
  // The band reservation is the real lead's and nothing more (no extra LEAD_GUARD on top).
  assert.ok(!/LEAD_GUARD/.test(gl), "glyphImageBodies reserves more than the lead");
  const rbb = fn("renderBlockBodies");
  for (const b of ["buildBigBodies", "buildSideBodies"]) {
    assert.ok(new RegExp(b + "\\([^;]*budget: ctx\\.budget[^;]*heightPx: ctx\\.room[^;]*contentW: ctx\\.contentW").test(rbb), b + " in " + rbb);
  }
  assert.ok(/ctx\.mode === "plain"/.test(rbb), "renderBlockBodies no longer falls back to the plain form");
  const ps = fn("packStack");
  assert.ok(/stackContext\(opts\)/.test(ps) && /renderBlockBodies\(blocks\[i\], ctx\)/.test(ps), "packStack: " + ps);
  assert.ok(/for \(k in ctx\) po\[k\] = ctx\[k\]/.test(ps) && /packStackBodies\(bodies, po\)/.test(ps), "packStack packs with another context");
});

// The core runs in its own vm realm, so its objects are compared as plain JSON.
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

// Final review 2: a word in the user's text that Twitch charges as a cheer of its own. The card
// said so; the parts, their total and the preview ignored it, so a free test carrying "Cheer50"
// was called free three times while Twitch would charge 50 bits and the bot would print it.
test("a cheer word in the text: the part, the total, the notice and the preview say what Twitch charges", () => {
  const free = C.buildBigBodies("HAPPY Cheer50 DAY", { layout: "lines", cheer: false, bits: 100 });
  const ex = C.extraCheers(free);
  same(ex, { sure: ["Cheer50"], maybe: [], bits: 50 });
  // Every occurrence is charged; a non-global prefix is only a maybe; a word glued to a tag is
  // not standalone, and a stack (one letter a line) holds none.
  same(C.extraCheers([{ html: "<div>x Kappa10 x Kappa10 PS5 y</div>" }, { html: "a<br>Cheer9<br>b <div>Cheer5</div>" }]),
    { sure: ["Kappa10"], maybe: ["PS5"], bits: 20 });
  same(C.extraCheers(C.buildBigBodies("Cheer50", { layout: "stack", cheer: true, bits: 100 })), { sure: [], maybe: [], bits: 0 });
  // The part's own line: red for a certain charge, a plain hedge otherwise.
  const off = C.extraCheerLines({ cheer: false, bits: 100, extra: ex }), on = C.extraCheerLines({ cheer: true, bits: 100, extra: ex });
  assert.equal(off.length, 1); assert.equal(off[0].warn, true);
  assert.match(off[0].text, /^Not free: Twitch reads “Cheer50” in it as a cheer, so sending it spends 50 bits and the bot prints it\./);
  assert.match(on[0].text, /^Costs 150 bits, not 100: Twitch reads “Cheer50” in it as another cheer\./);
  const maybe = C.extraCheerLines({ cheer: true, bits: 100, extra: { sure: [], maybe: ["PS5"], bits: 0 } });
  assert.equal(maybe.length, 1); assert.equal(maybe[0].warn, false);
  assert.match(maybe[0].text, /^If “PS5” is a cheer name on this channel/);
  same(C.extraCheerLines({ cheer: true, bits: 100, extra: { sure: [], maybe: [], bits: 0 } }), []);
  // The total: never "free" over a paid word, and the bits add up.
  const none = { sure: [], maybe: [], bits: 0 };
  same(C.partsCostWords([{ cheer: false, bits: 100, extra: none }]),
    { warn: false, text: "One message, free: with Cheer-ready off nothing prints; chat's filters still see it." });
  const f1 = C.partsCostWords([{ cheer: false, bits: 100, extra: ex }]);
  assert.equal(f1.warn, true); assert.doesNotMatch(f1.text, /, free|nothing prints/); assert.match(f1.text, /^Not free: .*spends 50 bits/);
  assert.equal(C.partsCostWords([{ cheer: true, bits: 100, extra: none }]).text, "One 100-bit cheer. Paste it into chat and send it.");
  assert.match(C.partsCostWords([{ cheer: true, bits: 100, extra: ex }]).text, /^One 150-bit cheer, not 100: Twitch also charges 50 bits for “Cheer50” in your text\./);
  const three = C.partsCostWords([{ cheer: true, bits: 100, extra: none }, { cheer: true, bits: 100, extra: ex }, { cheer: true, bits: 100, extra: none }]);
  assert.match(three.text, /in part 2 \(3 × 100 \+ 50 = 350 bits total\)/);
  assert.match(C.partsCostWords([{ cheer: false, bits: 100, extra: none }, { cheer: false, bits: 100, extra: ex }]).text,
    /^Paste the parts into chat in order: 2 messages, but not free\. Twitch reads “Cheer50” in part 2 as a cheer/);
  assert.match(C.paidTestNotice(["Cheer50"]), /^Not a free test: Twitch reads “Cheer50” in your text as a cheer/);
  // The preview draws the cheer Twitch would send: a free test with a paid word is a real cheer of
  // that word's bits, and a cheer adds them to its own (the header's BITS and the High Roller test).
  same(C.partCheer({ cheer: false, bits: 100, extra: ex }), { cheer: true, bits: 50 });
  same(C.partCheer({ cheer: true, bits: 100, extra: ex }), { cheer: true, bits: 150 });
  same(C.partCheer({ cheer: false, bits: 100, extra: none }), { cheer: false, bits: 100 });
  same(C.partCheer({ cheer: true, bits: 100, extra: { sure: [], maybe: ["PS5"], bits: 0 } }), { cheer: true, bits: 100 });
  // The card: a free test holding the word is not "free", and its note says why.
  const rep = C.bigReport(free, { cheers: 1, bits: 100, free: true });
  assert.match(rep, /^Capitals ≈ [\d.]+ cm · 1 message, not free: Twitch reads a word in it as a cheer \(see below\)$/m);
  assert.match(rep, /as a cheer and charge for it, so this test isn't free: it spends the bits and the bot prints it\./);
  assert.doesNotMatch(rep, /never prints/);
  assert.match(C.bigReport(free, { cheers: 1, bits: 100 }), /as another cheer and charge for it too\./);
});

test("a part too wide for the paper says so, and the total stops saying 'send it'; no-room notes fit Han tiling parts", () => {
  const none = { sure: [], maybe: [], bits: 0 };
  assert.equal(C.wideLine([]), "");
  assert.equal(C.wideLine([2]), "Too wide for the paper: what runs past its edge wraps or is cut off. Block 2's card says how to fix it.");
  assert.match(C.wideLine([1, 3]), /The cards of blocks 1 and 3 say how to fix it\.$/);
  const one = C.partsCostWords([{ cheer: true, bits: 100, extra: none, wide: [1] }]);
  assert.equal(one.warn, true); assert.doesNotMatch(one.text, /Paste it into chat and send it/);
  assert.match(C.partsCostWords([{ cheer: true, bits: 100, extra: none, wide: [] }, { cheer: true, bits: 100, extra: none, wide: [2] }]).text,
    /^Part 2 is too wide for the paper, so it wraps or is cut off/);
  // A Han tiling part has no Cheer line at its top: with no room, it prints its light first row.
  const ht = { html: "x" }, part = (alone) => ({ alone, bodies: [ht] });
  assert.equal(C.partsShape([part(true), part(true)]), "plain");
  assert.equal(C.partsShape([part(true), part(false)]), "mixed");
  assert.equal(C.partsShape([part(false)]), "");
  const s = { cheer: true, bits: 100, hrThreshold: 25, bitsPerInch: 500 };
  assert.match(C.modeNotice(s, "plain"), /shorter than one line of text, so each Han tiling part prints only its light first row/);
  assert.doesNotMatch(C.modeNotice(s, "plain"), /Cheer line fills/);
  assert.match(C.modeNotice(s, "mixed"), /the Cheer line fills it, so nothing after it prints\. A Han tiling part prints only its light first row\./);
  assert.match(C.noRoomAdvice(s, "plain"), /^Nothing worth sending: every part would print only its light first row\./);
  assert.match(C.noRoomAdvice(s), /^Nothing worth sending: every part would print only its Cheer line\./);
});
