// 1.4.0: Big and Sideways text print in a face the block picks (its `face` field): Arial Bold,
// the default, or one of nine Windows faces measured by tools/fontmetrics.mjs (FACE_TABLES).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCore } from "./_harness.mjs";

const C = loadCore();
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures/arial-1.3.json");
const FACES = ["arial", "arialblack", "impact", "comic", "georgia", "times", "courier", "trebuchet", "verdana", "tahoma"];
const LABELS = ["Arial Bold", "Arial Black", "Impact", "Comic Sans MS", "Georgia", "Times New Roman", "Courier New", "Trebuchet MS", "Verdana", "Tahoma"];

// ── ARIAL IS UNCHANGED, BYTE FOR BYTE ──
// Every Arial message, height, fit and card note is what 1.3.1 sent. The fixture holds a hash of
// each case, written once from 1.3.1's core (RW_WRITE_FIXTURE=1 node --test test/faces.test.mjs).
const TEXTS = ["HELLO", "Hello world", "Happy birthday Rob!", "WE ARE SO BACK", "jeff stuff", "QUIZ", "你好你好",
  "GG 😀", "a\nbb\nccc", "The quick brown fox jumps over the lazy dog", "ÀÉÎÕÜ çß", "100% & #1", "1,2;3", "if j", "  "];
function arialCases(face) {
  const cases = {};
  const add = (key, fn) => { cases[key] = fn; };
  for (const text of TEXTS) for (const paperMm of [80, 58]) {
    for (const layout of ["auto", "lines", "wrap", "stack", "each"]) for (const size of ["fit1", "width", 60, 200]) {
      const opts = { layout, size, paperMm, ...(face ? { face } : {}) };
      add(`big|${text}|${paperMm}|${layout}|${size}`, () => {
        const b = C.buildBigBodies(text, opts);
        return [b.map((x) => [x.html, x.chars, x.heightPx, x.joinPx || 0]), C.bigFit(text, opts), C.bigReport(b, { bits: 100 })];
      });
    }
    add(`bigflip|${text}|${paperMm}`, () => C.buildBigBodies(text, { layout: "auto", size: "fit1", flip: true, paperMm, ...(face ? { face } : {}) }).map((x) => x.html));
    add(`bigtall|${text}|${paperMm}`, () => {
      const b = C.buildBigBodies(text, { layout: "lines", size: 120, paperMm, heightPx: 90, ...(face ? { face } : {}) });
      return [b.map((x) => [x.html, x.heightPx]), C.bigReport(b, { bits: 100, limit: { px: 111.6, by: "bits", fades: true } })];
    });
    for (const dir of ["down", "up"]) for (const size of ["fit1", "width", 120]) {
      const opts = { dir, size, paperMm, ...(face ? { face } : {}) };
      add(`side|${text}|${paperMm}|${dir}|${size}`, () => {
        const b = C.buildSideBodies(text, opts);
        return [b.map((x) => [x.html, x.chars, x.heightPx]), C.sideFit(text, opts), C.sideReport(b, { bits: 100 })];
      });
    }
  }
  for (const n of [1, 2, 3, 5]) for (const caps of [true, false]) for (const w of [244, 153]) add(`width|${n}|${caps}|${w}`, () => C.sideWidthPx(n, caps, w));
  for (const px of [20, 60, 301]) add(`capcm|${px}`, () => C.bigCapCm(px));
  return cases;
}
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

test("Arial Bold prints exactly what 1.3.1 sent: messages, heights, fits and the card's notes", () => {
  const cases = arialCases(null);
  const now = Object.fromEntries(Object.entries(cases).map(([k, fn]) => [k, hash(fn())]));
  if (process.env.RW_WRITE_FIXTURE) { writeFileSync(FIXTURE, JSON.stringify(now, null, 0) + "\n"); return; }
  assert.ok(existsSync(FIXTURE), "the fixture is missing");
  const was = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.deepEqual(Object.keys(now).sort(), Object.keys(was).sort(), "the same cases");
  const changed = Object.keys(was).filter((k) => was[k] !== now[k]);
  assert.deepEqual(changed, [], "Arial cases that changed");
  // A block that names Arial, or a face that doesn't exist, is the same Arial.
  for (const face of ["arial", "nope", 7]) {
    const named = arialCases(face);
    const off = Object.keys(was).filter((k) => !k.startsWith("width|") && !k.startsWith("capcm|") && was[k] !== hash(named[k]()));
    assert.deepEqual(off, [], "face " + JSON.stringify(face));
  }
});
