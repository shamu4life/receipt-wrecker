// The two rig probes (1.0.0): one cheer at exactly the streamer's High Roller threshold, and
// one plain cheer just under it.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, scanTags, eq } from "./_harness.mjs";
const C = loadCore();

const pack = (probe, extra) => C.packStackBodies(probe.bodies, Object.assign({ cheer: true, bits: probe.bits, noNonce: true }, extra || {}));

test("High Roller test: one cheer at exactly the threshold, every shape on the bot's allow-list", () => {
  for (const mm of [80, 58]) {
    for (const t of [1, 25, 300]) {
      const p = C.buildHighRollerProbe({ hrThreshold: t, paperMm: mm });
      assert.equal(p.bits, t, "the cheapest High Roller cheer");
      assert.equal(p.mode, "raw");
      assert.equal(C.printMode({ cheer: true, bits: p.bits, hrThreshold: t }), "raw");
      const parts = pack(p);
      assert.equal(parts.length, 1);
      assert.ok(parts[0].payload.startsWith("Cheer" + t + " <div style="));
      assert.ok(parts[0].chars <= 500);
      assert.ok(parts[0].contentPx < 400, "a short strip: " + parts[0].contentPx);
      assert.match(p.note, new RegExp("exactly the threshold"));
      const tags = scanTags(parts[0].payload);
      assert.ok(tags.every((x) => x.tag === "div"), parts[0].payload);
      for (const want of ['font:700 60px/.8 Arial">BIG', '>MMMMM<', 'font:700 60px/1.15 Arial">jog', ";rotate:180deg\">BIG", "writing-mode:sideways-lr"]) {
        assert.ok(parts[0].payload.includes(want), want);
      }
    }
    // MMMMM is sized by the width rule for this paper.
    const p = C.buildHighRollerProbe({ hrThreshold: 25, paperMm: mm });
    const px = Number(/font:700 (\d+)px\/\.8 Arial">MMMMM/.exec(p.bodies[0].html)[1]);
    assert.equal(px, mm === 80 ? 57 : 35);
  }
  const off = C.buildHighRollerProbe({ hrThreshold: 0, bits: 100 });
  assert.equal(off.bits, 100);
  assert.match(off.note, /High Roller is off/);
  assert.equal(off.works, false);
  assert.equal(C.buildHighRollerProbe({ hrThreshold: 25 }).works, true);
  eq([...C.buildHighRollerProbe({ hrThreshold: 25 }).left], []);
});

test("High Roller test: only the shapes the threshold's receipt holds, and the note asks about nothing else", () => {
  // A maximum length of 1.5 in (144px; 122px after the Cheer line) on 58 mm: all five shapes
  // take about 250px, and the bot faded out three of the five the note asked about.
  const p = C.buildHighRollerProbe({ hrThreshold: 25, paperMm: 58, maxInches: 1.5 });
  const k = C.stackContext({ cheer: true, bits: 25, hrThreshold: 25, maxInches: 1.5, paperMm: 58, noNonce: true });
  const parts = C.packStackBodies(p.bodies, k);
  assert.equal(parts.length, 1);
  assert.ok(parts[0].contentPx <= k.limit.px + 1e-9, parts[0].contentPx + " vs " + k.limit.px);
  assert.equal(p.works, true);
  // Kept in order of what they prove: BIG, then UP (56.6px): 104.6px; the upside-down BIG (48)
  // would pass 122.4. They still print in their usual order.
  assert.ok(p.bodies[0].html.startsWith('<div style="font:700 60px/.8 Arial">BIG</div>'));
  assert.ok(p.bodies[0].html.includes("writing-mode:sideways-lr"));
  for (const gone of [">MMMMM<", ">jog<", "rotate:180deg"]) assert.ok(!p.bodies[0].html.includes(gone), gone);
  eq([...p.left], ["MMMMM", "jog", "the upside-down BIG"]);
  assert.match(p.note, /check that UP runs up the tape/);
  assert.ok(!/MMMMM keeps|jog keeps|second BIG/.test(p.note), p.note);
  assert.match(p.note, /leaves out MMMMM, jog and the upside-down BIG\.$/);
  // 50 bits per inch: 25 bits buy 48px, which the Cheer line and BIG can't share. Nothing to
  // show: the test is not offered.
  const none = C.buildHighRollerProbe({ hrThreshold: 25, bitsPerInch: 50 });
  assert.equal(none.works, false);
  assert.match(none.note, /can't show anything/);
});

test("Plain test: one bit under the threshold, a Design T HI grid, the token last", () => {
  for (const mm of [80, 58]) {
    const cols = mm === 80 ? 15 : 9, header = mm === 80 ? 14 : 9;
    const p = C.buildPlainProbe({ hrThreshold: 25, paperMm: mm });
    assert.equal(p.bits, 24);
    assert.equal(p.mode, "plain");
    const parts = pack(p);
    assert.equal(parts.length, 1);
    const pay = parts[0].payload;
    assert.ok(pay.endsWith(" Cheer24"));
    assert.equal(scanTags(pay).length, 0, "no markup at all");
    const grid = Array.from(pay.slice(0, -" Cheer24".length));
    assert.equal((grid.length - header) % cols, 0, "every row exactly " + cols);
    const rows = (grid.length - header) / cols;
    for (let r = 0; r < rows; r++) {
      assert.equal(grid[header + r * cols], "丶", "left frame, row " + r);
      assert.equal(grid[header + r * cols + cols - 1], "丶", "right frame, row " + r);
    }
    assert.match(p.note, new RegExp("holds " + cols + " characters"));
    assert.ok(Math.abs(parts[0].heightPx - (rows + 2) * 21.6) < 1e-9);
  }
  assert.equal(C.buildPlainProbe({ hrThreshold: 0 }).bits, 1, "High Roller off: every cheer is plain");
  assert.equal(C.buildPlainProbe({ hrThreshold: 0 }).mode, "plain");
  // With High Roller off there is no threshold for 1 bit to be under.
  assert.match(C.buildPlainProbe({ hrThreshold: 0 }).note, /^One 1-bit cheer\. High Roller is off, so every cheer prints plain/);
  assert.doesNotMatch(C.buildPlainProbe({ hrThreshold: 0 }).note, /under the threshold/);
  assert.match(C.buildPlainProbe({ hrThreshold: 25 }).note, /^One 24-bit cheer, one under the threshold\./);
  const one = C.buildPlainProbe({ hrThreshold: 1 });
  assert.equal(one.mode, "raw");
  assert.match(one.note, /no plain test/);
  // The repeat digits, when on, ride after the token.
  const p = C.buildPlainProbe({ hrThreshold: 25, noNonce: false });
  const parts = C.packStackBodies(p.bodies, { cheer: true, bits: p.bits, nonceFn: () => "07" });
  assert.ok(parts[0].payload.endsWith(" Cheer24 07"));
  assert.ok(parts[0].chars <= 500);
});

test("the High Roller test's note says 1 bit, not 1 bits", () => {
  const pr = C.buildHighRollerProbe({ hrThreshold: 1 });
  assert.match(pr.note, /One 1-bit cheer/);
  assert.match(pr.note, /High Roller is on at 1 bit:/);
  assert.doesNotMatch(pr.note, /1 bits/);
  assert.match(C.buildHighRollerProbe({ hrThreshold: 25 }).note, /High Roller is on at 25 bits:/);
  assert.equal(C.bitsWord(1), "1 bit");
  assert.equal(C.bitsWord(25), "25 bits");
  assert.doesNotMatch(C.modeNotice({ cheer: true, bits: 1, hrThreshold: 2 }), /1 bits|\(2 bit\)/);
  assert.match(C.modeNotice({ cheer: true, bits: 50, hrThreshold: 100, bitsPerInch: 1, maxInches: 0 }), /threshold \(100 bits\)/);
});
