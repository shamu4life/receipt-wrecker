// The two rig probes (1.0.0): one cheer at exactly the streamer's High Roller threshold, and
// one plain cheer just under it.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, scanTags } from "./_harness.mjs";
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
