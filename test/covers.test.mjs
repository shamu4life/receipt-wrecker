// Continuation covers — spec §5.
//
// A takeover paints over printer-bot's header on the receipt it rides on and no other.
// When a stack splits across cheers, parts 2..N used to print with the bot's header
// intact, so a run read as one piece of artwork followed by a stack of ordinary
// receipts. Every part after the first now prepends the same plain cover.
//
// The load-bearing half is the BUDGET, not the markup: Twitch rejects an over-length
// message rather than truncating it, so a cover that is prepended but not reserved
// makes the tail of a run silently never send. The "reserved" test below is written to
// fail if that reservation is removed.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";

const C = loadCore();
const { packStackBodies, buildStackCover, buildTakeover, MAX_CHARS } = C;

const PULL = C.TAKEOVER_PULL_PT;
const COVER = buildStackCover({ pullPt: PULL, w: 263 });
const len = (s) => Array.from(s).length;

// A body of an exact character length, so the packing arithmetic in these tests is
// arithmetic and not an approximation of some real block's output.
function body(chars, extra) {
  const html = "<i>" + "x".repeat(Math.max(0, chars - 7)) + "</i>";
  return Object.assign({ html, chars: len(html), heightPx: 0 }, extra || {});
}
// A real takeover body: a blank takeover IS the plain box (it exists to erase the
// header), so its html and its continuation cover are the same string — which is the
// point. Using a stand-in here would let the "part 1 leads with its own takeover"
// assertion pass against markup a takeover never emits.
const takeoverBody = () => ({ html: COVER, chars: len(COVER), heightPx: 0, cover: COVER });

const OPTS = { cheer: true, bits: 100, nonceFn: () => "00" };

test("the plain cover is the takeover's own rect, and costs 106 characters", () => {
  // Not a hardcoded string anywhere: the cover a continuation prints and the takeover it
  // continues must be the same box at the same lift, or the run steps sideways mid-tape.
  assert.equal(COVER, buildTakeover({ items: [], pullPt: PULL, w: 263 }),
    "the cover stopped being buildTakeover's empty box");
  assert.equal(len(COVER), 106, "the cover's cost moved; the spec's 106 chars/part is stale");
  assert.match(COVER, /^<svg /, "the cover must lead with the lifted <svg>");
  assert.ok(!COVER.includes("<foreignObject"), "a plain cover must carry no picture");
});

test("a stack that fits in one part gets no cover", () => {
  const parts = packStackBodies([takeoverBody(), body(100)], OPTS);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].cover, "", "a single part has nothing to continue");
  // The box appears exactly once — as the takeover itself. A second one would be a
  // continuation cover on the only receipt there is, paying 106 characters to repaint
  // a header the takeover on the same receipt already painted.
  assert.equal(parts[0].payload.split(COVER).length - 1, 1,
    "the single receipt carries the box more than once: " + parts[0].payload);
});

test("every part after the first carries the cover, and the first does not", () => {
  const parts = packStackBodies(
    [takeoverBody(), body(160), body(160), body(160), body(160), body(160)], OPTS);
  assert.ok(parts.length >= 3, "expected a multi-part split, got " + parts.length);

  assert.equal(parts[0].cover, "", "part 1 has the real takeover, not a cover");
  assert.ok(parts[0].payload.startsWith(parts[0].lead + "<svg "),
    "part 1 should still lead with its own takeover");

  for (let i = 1; i < parts.length; i++) {
    assert.equal(parts[i].cover, COVER, "part " + (i + 1) + " lost its cover");
    // The cover sits BETWEEN the lead and the bodies: it is a lifted overlay, so it has
    // to be the first content we control, and the lead is not content we control.
    assert.equal(parts[i].payload.slice(0, parts[i].lead.length + COVER.length),
      parts[i].lead + COVER,
      "part " + (i + 1) + " put the cover somewhere other than straight after the lead");
  }
});

test("the cover's characters are RESERVED, so no part overflows Twitch's limit", () => {
  // 160-char bodies are chosen so three fit a part's raw 488-char body budget but only
  // two fit once 106 characters of cover are taken out. Prepend without reserving and
  // part 2 lands at 598 characters — over 500, and Twitch drops the whole message.
  const parts = packStackBodies(
    [takeoverBody(), body(160), body(160), body(160), body(160), body(160), body(160)],
    OPTS);
  assert.ok(parts.length >= 3, "expected a multi-part split, got " + parts.length);
  parts.forEach((p, i) => {
    assert.equal(p.chars, len(p.payload), "part " + (i + 1) + " miscounted its own payload");
    assert.ok(p.chars <= MAX_CHARS,
      "part " + (i + 1) + " is " + p.chars + " chars — over " + MAX_CHARS
      + ", so Twitch rejects it outright. The cover was prepended without being reserved.");
  });
});

test("covers:false spends those characters on content instead", () => {
  const bodies = [takeoverBody(), body(160), body(160), body(160), body(160), body(160), body(160)];
  const on = packStackBodies(bodies, Object.assign({}, OPTS, { covers: true }));
  const off = packStackBodies(bodies, Object.assign({}, OPTS, { covers: false }));

  off.forEach((p, i) => {
    assert.equal(p.cover, "", "part " + (i + 1) + " covered itself with the toggle off");
    assert.ok(p.chars <= MAX_CHARS, "part " + (i + 1) + " is over budget with covers off");
  });
  // The toggle has to buy something measurable, or it is a control that does nothing.
  // Compare PART 2 specifically: part 1 never carries a cover, so it packs identically
  // either way and a max-over-all-parts metric would call a real difference no change.
  assert.ok(off[1].bodies.length > on[1].bodies.length,
    "turning covers off freed no room in part 2: " + off[1].bodies.length
    + " bodies vs " + on[1].bodies.length);
});

test("only the FIRST part's takeover continues", () => {
  // A takeover that lands in part 3 covers part 3 itself; parts 1-2 never had a painted
  // header to carry on from, and printing one there would paint over content.
  const parts = packStackBodies(
    [body(300), body(300), takeoverBody(), body(300)], OPTS);
  assert.ok(parts.length >= 2);
  parts.forEach((p, i) => {
    assert.equal(p.cover, "",
      "part " + (i + 1) + " got a cover from a takeover that was not in part 1");
  });
});

test("the cover follows the block's own pull, not the default", () => {
  const odd = buildStackCover({ pullPt: 300, w: 263 });
  assert.notEqual(odd, COVER, "a different pull must produce a different cover");
  const parts = packStackBodies(
    [body(150, { cover: odd }), body(200), body(200), body(200), body(200)], OPTS);
  assert.ok(parts.length >= 2);
  assert.equal(parts[1].cover, odd,
    "the continuation must repaint at the SAME lift as the takeover it continues, "
    + "or the run steps sideways mid-tape");
});
