// Glyph-art for SassyTP's printer-bot (1.0.0): R1 (CJK grid in a vw-sized div), R4 (Courier
// New <pre>), R6 (Braille rows), and the plain below-threshold form, Design T. The canvas work
// is browser glue; these builders take a finished grid. Shapes and formulas are the modes
// brief's, benched through the bot's real page (tools/forkbench.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, eq, scanTags } from "./_harness.mjs";
const C = loadCore();

const J = (x) => JSON.parse(JSON.stringify(x));
const CJK = C.getTier("cjk").ramp;
const ctx = (o) => C.stackContext(Object.assign({ cheer: true, bits: 100, noNonce: true, hrThreshold: 25 }, o || {}));
const opts = (k) => ({ budget: k.budget, heightPx: k.room, paperMm: k.paperMm });
// A synthetic picture (a dark disc on white), sampled and quantized by the app's own pure core.
function disc(cols, rows, ramp) {
  const W = 64, H = Math.round(64 * rows / cols), px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
    const v = d < 0.8 ? Math.round(255 * d / 0.8) : 255, i = (y * W + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }
  return C.quantizeTone(C.sampleLuma(px, W, H, cols, rows), ramp, {});
}
const rowsOf = (html, open, close, sep) => html.slice(open.length, html.length - close.length).split(sep);

test("R1: the vw-sized CJK grid, open tag pinned, a row inside 153px and 244px", () => {
  eq(C.buildCjkGrid(disc(12, 2, CJK), {}).map((b) => b.html.slice(0, b.html.indexOf(">") + 1)),
     ["<div style=width:12.2em;font-size:6.88vw;line-height:1;margin:auto>"]);
  for (let c = 12; c <= 30; c++) {
    const K = C.cjkGridK(c);
    assert.ok(K * 1.81 * (c + 0.2) <= 152 + 1e-9, "58 mm row, C=" + c);
    assert.ok(K * 2.72 * (c + 0.2) <= 244, "80 mm row, C=" + c);
    assert.ok(K * 2.72 * (c + 0.2) >= 224, "and it still uses the 80 mm paper, C=" + c);
  }
  assert.equal(C.cjkGridK(24), 3.47);
});

test("R1: bands by characters and height, every row exactly C cells, height R x K x page/100", () => {
  for (const k of [ctx(), ctx({ paperMm: 58 }), ctx({ bitsPerInch: 50 }), ctx({ noNonce: false, bits: 10000 })]) {
    for (const cols of [12, 16, 24, 30]) {
      const grid = disc(cols, Math.round(cols * 1.5), CJK);
      const b = C.buildCjkGrid(grid, opts(k)), where = cols + " cols, " + JSON.stringify(k.limit) + " " + k.budget;
      const open = b[0].html.slice(0, b[0].html.indexOf(">") + 1);
      const F = C.cjkGridK(cols) * k.paper.cssWidth / 100;
      let all = "";
      for (const x of b) {
        assert.ok(x.chars <= k.budget, where + ": " + x.chars);
        assert.ok(x.heightPx <= k.room + 1e-6, where + ": " + x.heightPx);
        assert.ok(x.html.startsWith(open) && x.html.endsWith("</div>"), "every band repeats the tag and closes it");
        const cells = Array.from(x.html.slice(open.length, -6));
        assert.equal(cells.length % cols, 0);
        assert.ok(Math.abs(x.heightPx - (cells.length / cols) * F) < 1e-3, where);
        all += cells.join("");
      }
      assert.equal(all, grid.map((r) => r.join("")).join(""), where + ": nothing lost");
      for (const p of C.packStackBodies(b, k)) assert.ok(p.chars <= 500 && p.contentPx <= k.limit.px + 1e-6, where);
    }
  }
  // The largest single cheer fits, with the closing tag: 12 x 34 at Cheer100 (the brief's
  // 12 x 35 was before margin:auto, 12 characters a band, centred the grid on 80 mm).
  const k = ctx();
  const b = C.buildCjkGrid(disc(12, 34, CJK), opts(k));
  assert.equal(b.length, 1);
  assert.equal(C.packStackBodies(b, k)[0].chars, 9 + 67 + 408 + 6);
  assert.equal(C.buildCjkGrid(disc(12, 35, CJK), opts(k)).length, 2, "35 rows band into two");
  assert.ok(Math.abs(C.buildCjkGrid(disc(12, 36, CJK), opts(k)).reduce((t, x) => t + x.heightPx, 0) - 36 * 6.88 * 2.72) < 1e-3,
    "12x36 at 80 mm is about 674px");
});

test("R4: Courier New <pre>, rows escaped and joined by <br>, spaces kept", () => {
  const ascii = C.getTier("ascii").ramp;
  const grid = disc(24, 11, ascii);
  const b = C.buildMonoGrid(grid, opts(ctx()));
  assert.equal(b.length, 1);
  const open = "<pre style=\"font:5.83vw/1.2 'Courier New';margin:0\">";
  assert.equal(open.length, 52);
  assert.ok(b[0].html.startsWith(open) && b[0].html.endsWith("</pre>"));
  eq(rowsOf(b[0].html, open, "</pre>", "<br>"), J(grid.map((r) => r.join(""))));
  assert.ok(b[0].html.includes(" "), "the lightest cell is a space, and <pre> keeps it");
  assert.ok(Math.abs(b[0].heightPx - 11 * 1.2 * 5.83 * 2.72) < 1e-3);
  // Escaping: a cell that is < & > goes out as an entity, never as markup.
  const hostile = C.buildMonoGrid([["<", "&", ">", "i"], ["a", "b", "<", "s"]], {})[0].html;
  assert.ok(!/[<>]/.test(hostile.replace(/^<pre[^>]*>|<\/pre>$|<br>/g, "")), hostile);
  // Rows a cheer: at most 15 at 24 columns with the bare Cheer100 lead, so 40 rows take three
  // cheers, and the rows are spread evenly over them: 14/14/12, not 15/15/10.
  assert.equal(Math.floor((491 - 52 - 6 + 4) / 28), 15);
  const tall = C.buildMonoGrid(disc(24, 40, ascii), opts(ctx()));
  eq(tall.map((x) => x.glyph.rows), [14, 14, 12]);
  for (const x of tall) assert.ok(x.chars <= 491);
  for (let c = 8; c <= 48; c++) assert.ok(C.monoK(c) * 1.81 * c * 0.6 <= 152 + 1e-9, "58 mm row, C=" + c);
});

test("R6: Braille rows in a px-sized div, with a margin for the rig's unknown face", () => {
  const dots = C.packBraille(C.lumaToDots(disc(32, 32, ["#", " "]).map((r) => r.map((c) => (c === "#" ? 0 : 255))), {}));
  const b = C.buildBrailleGrid(dots, opts(ctx()));
  assert.equal(b[0].html.slice(0, b[0].html.indexOf(">") + 1), "<div style=font-size:12px;line-height:14px>");
  assert.equal(b[0].glyph.form, "braille");
  assert.ok(Math.abs(b[0].heightPx - b[0].glyph.rows * 14) < 1e-9);
  assert.equal(C.brailleFontPx(24, 153), 7);
  for (const cw of [244, 153]) {
    const hi = C.glyphCols("braille", 999, cw === 153 ? 58 : 80);
    assert.ok(hi * 0.733 * C.brailleFontPx(hi, cw) <= cw * 0.85 + 1e-9, cw + ": the widest Braille grid keeps its margin");
  }
});

test("columns and rows per form", () => {
  assert.equal(C.glyphCols("cjk", 40), 30);
  assert.equal(C.glyphCols("cjk", 4), 12);
  assert.equal(C.glyphCols("mono", 40), 40);
  assert.equal(C.glyphCols("mono", 99), 48);
  assert.equal(C.glyphCols("braille", 48, 58), 29);
  assert.equal(C.glyphForm("cjk"), "cjk");
  for (const t of ["ascii", "asciifull", "safe"]) assert.equal(C.glyphForm(t), "mono");
  assert.equal(C.glyphForm("braille"), "braille");
  assert.equal(C.gridRows(12, 100, 100, C.GLYPH_ASPECT.cjk), 12, "R1 cells are square");
  assert.equal(C.gridRows(24, 100, 100, C.GLYPH_ASPECT.mono), 12, "a Courier cell is twice as tall as wide");
  assert.equal(C.gridRows(13, 100, 100, C.GLYPH_ASPECT.plain), 10, "a plain Han cell is 16 x 21.6");
  for (const f of ["cjk", "mono", "plain"]) assert.equal(C.glyphAspect(f, 20, 80), C.GLYPH_ASPECT[f]);
});

test("a Braille picture keeps its shape: rows sized for the 0.733F x (F + 2) cell, not a square one", () => {
  // Rows x (F + 2) must match cols x 0.733F x h/w to within half a row, at every column count
  // either paper allows and for a square, a wide and a tall picture. Sampled square (the bug),
  // a 200 x 200 disc at 20 columns printed 175.9 x 280px on 80 mm and took 2 parts.
  for (const mm of [80, 58]) {
    const cw = C.paperSpec(mm).contentW;
    for (let cols = 8; cols <= C.glyphCols("braille", 999, mm); cols++) {
      const F = C.brailleFontPx(cols, cw), asp = C.glyphAspect("braille", cols, mm);
      for (const [w, h] of [[200, 200], [300, 150], [150, 300]]) {
        const rows = C.gridRows(cols, w, h, asp);
        const want = cols * 0.733 * F * h / w;
        assert.ok(Math.abs(rows * (F + 2) - want) <= (F + 2) / 2 + 1e-9,
          mm + " mm, " + cols + " cols, " + w + "x" + h + ": " + rows + " rows print " + rows * (F + 2) + "px, want " + want.toFixed(1));
      }
    }
  }
  assert.equal(C.gridRows(20, 200, 200, C.glyphAspect("braille", 20, 80)), 13, "80 mm: 20 x 13 cells at 12px");
  assert.equal(C.gridRows(20, 200, 200, C.glyphAspect("braille", 20, 58)), 12, "58 mm: 20 x 12 cells at 8px");
});

test("Design T: header, rows of exactly C cells, the token LAST, alone in its cheer", () => {
  assert.equal(C.hanziCols(244), 15);
  assert.equal(C.hanziCols(153), 9);
  assert.equal(C.designTHeader(80, "plain"), 14, "the quote and 14 cells fill line 1");
  assert.equal(C.designTHeader(58, "plain"), 9, "quote + 9 cells fit 153px");
  assert.equal(C.designTHeader(80, "raw"), 15, "no quote in a High Roller part");
  const grid = disc(15, 12, CJK);
  const k = ctx({ bits: 24 });                    // below the threshold: plain
  assert.equal(k.mode, "plain");
  const b = C.buildDesignT(grid, { mode: k.mode, paperMm: 80, cheer: true, bits: 24, noNonce: true, limitPx: k.limit.px });
  assert.equal(b.length, 1);
  assert.equal(b[0].alone, true);
  assert.equal(b[0].html, "丶".repeat(14) + grid.map((r) => r.join("")).join(""));
  assert.ok(Math.abs(b[0].heightPx - (12 + 2) * 21.6) < 1e-9, "header, 12 rows and the token's line");
  const parts = C.packStackBodies(b, k);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].payload, b[0].html + " Cheer24");
  assert.equal(parts[0].lead, "");
  assert.ok(!/[ A-Za-z<>]/.test(parts[0].payload.slice(0, -" Cheer24".length)), "no space, Latin or markup inside the grid");
  assert.ok(!parts[0].payload.includes("　"));
});

test("Design T bands: 31 rows a cheer on 80 mm, 53 on 58 mm; every part repeats header and token", () => {
  const cases = [[80, 100, true, 31], [80, 100, false, 31], [80, 10, true, 31], [58, 100, true, 53], [58, 10000, false, 53]];
  for (const [mm, bits, noNonce, per] of cases) {
    const cols = C.hanziCols(C.paperSpec(mm).contentW);
    const grid = disc(cols, 80, CJK);
    const o = { mode: "plain", paperMm: mm, cheer: true, bits, noNonce };
    const where = mm + " mm, Cheer" + bits + (noNonce ? "" : " + digits");
    // `per` rows is one cheer, one more is two, and the rows are spread evenly over the cheers
    // (no last cheer carrying a lone row): every band within one row of the others.
    assert.deepEqual(Array.from(C.buildDesignT(disc(cols, per, CJK), o), (x) => x.hanzi.rows), [per], where);
    assert.deepEqual(Array.from(C.buildDesignT(disc(cols, per + 1, CJK), o), (x) => x.hanzi.rows),
      [Math.ceil((per + 1) / 2), Math.floor((per + 1) / 2)], where);
    const b = C.buildDesignT(grid, o);
    assert.equal(b.length, Math.ceil(80 / per), where);
    const sizes = b.map((x) => x.hanzi.rows);
    assert.ok(Math.max(...sizes) <= per && Math.max(...sizes) - Math.min(...sizes) <= 1, where + ": " + sizes);
    const parts = C.packStackBodies(b, { cheer: true, bits, noNonce, nonceFn: (i) => C.makeNonce(i) });
    assert.equal(parts.length, b.length);
    const h = C.designTHeader(mm, "plain");
    let rows = 0;
    for (const p of parts) {
      assert.ok(p.chars <= 500, p.chars + " chars");
      assert.ok(p.payload.startsWith("丶".repeat(h)));
      assert.ok(p.payload.endsWith(" Cheer" + bits + (noNonce ? "" : " " + p.nonce)));
      assert.equal((Array.from(p.payload.slice(0, -p.trail.length)).length - h) % cols, 0);
      rows += p.bodies[0].hanzi.rows;
    }
    assert.equal(rows, 80, "every row sent once");
  }
  // In a High Roller part the box may be the streamer's bits-per-inch limit: 384px holds
  // header + 15 rows + token.
  const k = ctx({ bitsPerInch: 25 });
  const hr = C.buildDesignT(disc(15, 45, CJK), { mode: "raw", paperMm: 80, cheer: true, bits: 100, noNonce: true, limitPx: k.limit.px });
  assert.equal(hr[0].hanzi.header, 15);
  assert.deepEqual(Array.from(hr, (x) => x.hanzi.rows), [15, 15, 15]);
  for (const x of hr) assert.ok(x.heightPx <= 384 + 1e-9);
  // Cheer-ready off: no token, so no token line, and a full header.
  const off = C.buildDesignT(disc(15, 4, CJK), { mode: "raw", paperMm: 80, cheer: false });
  assert.ok(Math.abs(off[0].heightPx - 5 * 21.6) < 1e-9);
  assert.equal(C.packStackBodies(off, { cheer: false })[0].payload, off[0].html);
});

test("Design T under a box too short for header, row and token: every part is flagged tall", () => {
  // bits 100 at 200 bits per inch: a 48px box. One row a part is still 3 lines (64.8px), so
  // every part is cut; the card says so (round 3: it said only the row and cheer counts).
  const k = ctx({ bitsPerInch: 200 });
  assert.equal(k.limit.px, 48);
  const o = { mode: "raw", paperMm: 80, cheer: true, bits: 100, noNonce: true, limitPx: k.limit.px };
  const b = C.buildDesignT(disc(15, 4, CJK), o);
  assert.equal(b.length, 4);
  for (const x of b) { assert.equal(x.tall, true); assert.equal(x.hanzi.tall, true); }
  // A box that holds them is not tall.
  for (const x of C.buildDesignT(disc(15, 4, CJK), { ...o, limitPx: 384 })) assert.equal(!!x.tall, false);
  for (const x of C.buildDesignT(disc(15, 40, CJK), { ...o, mode: "plain", limitPx: 1600 })) assert.equal(!!x.tall, false);
});

test("Han tiling takes at most HAN_MAX_LINES typed lines and says how many it left out", () => {
  assert.equal(C.HAN_MAX_LINES, 50);
  const t = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).join("\n");
  const a = C.hanTextLines(t);
  assert.equal(a.lines.length, 26, "26 letters, one a line: Y and Z are not dropped (the old cap was 24)");
  assert.equal(a.dropped, 0);
  const many = C.hanTextLines(Array.from({ length: 130 }, (_, i) => "L" + i).join("\r\n") + "\n\n  \n");
  assert.equal(many.lines.length, 50);
  assert.equal(many.lines[49], "L49");
  assert.equal(many.dropped, 80);
  eq(J(C.hanTextLines("  \n\n")), { lines: [], dropped: 0 });
});

test("Design T picture: a light frame column each side of C - 2 picture cells", () => {
  assert.equal(C.designTPictureCols(80), 13);
  assert.equal(C.designTPictureCols(58), 7);
  const pic = disc(13, 10, CJK);
  const b = C.buildDesignTPicture(pic, { mode: "plain", paperMm: 80, cheer: true, bits: 1, noNonce: true });
  const body = Array.from(b[0].html).slice(14);
  for (let r = 0; r < 10; r++) {
    const row = body.slice(r * 15, r * 15 + 15);
    assert.equal(row[0], "丶");
    assert.equal(row[14], "丶");
    assert.equal(row.slice(1, 14).join(""), pic[r].join(""));
  }
  // A row of the wrong length is padded or cut, never left to shear the rows after it.
  const ragged = C.buildDesignT([["鬱"], CJK.slice(0, 20)], { mode: "plain", paperMm: 58, cheer: true, bits: 1 });
  assert.equal(Array.from(ragged[0].html).length, 9 + 2 * 9);
});

test("every glyph builder emits only div, pre and br, and nothing of the user's as markup", () => {
  const grids = { cjk: disc(16, 8, CJK), ascii: disc(24, 6, C.getTier("asciifull").ramp), braille: [["⠁", "⣿"], ["⠿", "\u2800"]] };
  for (const mm of [80, 58]) {
    for (const tier of ["cjk", "ascii", "asciifull", "safe", "braille"]) {
      const g = tier === "cjk" ? grids.cjk : tier === "braille" ? grids.braille : grids.ascii;
      for (const b of C.buildGlyphBodies(tier, g, { paperMm: mm })) {
        const tags = J(scanTags(b.html).map((t) => t.tag));
        assert.ok(tags.every((t) => ["div", "pre", "br"].includes(t)), tier + ": " + tags);
        assert.ok(!/\\|&#/.test(b.html));
      }
    }
  }
});

test("a grid that needs several cheers is spread evenly over them, never a sliver in the last", () => {
  const k = ctx(), ascii = C.getTier("ascii").ramp;
  // 40 columns x 20 rows: 9 rows a cheer at most. Greedy was 9/9/2: the third cheer printed two
  // rows (one of them blank) for a whole header and footer.
  const b = C.buildMonoGrid(disc(40, 20, ascii), opts(k));
  eq(b.map((x) => x.glyph.rows), [7, 7, 6]);
  for (const x of b) assert.ok(x.chars <= k.budget);
  const flat = b.flatMap((x) => rowsOf(x.html, x.html.slice(0, x.html.indexOf(">") + 1), "</pre>", "<br>"));
  eq(flat, J(disc(40, 20, ascii).map((r) => r.join(""))), "every row once, in order");
  // Han characters and Braille band the same way.
  const cj = C.buildCjkGrid(disc(30, 40, C.getTier("cjk").ramp), opts(k));
  const rows = cj.map((x) => x.glyph.rows);
  assert.ok(Math.max(...rows) - Math.min(...rows) <= 1 || rows.length === 1, JSON.stringify(rows));
});

test("a box the Cheer line fills: the grid is banded by characters, not one cheer per row", () => {
  // 1 bit at 1000 bits per inch: a 1px box. Nothing after the Cheer line prints whatever a
  // band's height, so cutting the picture by height made a cheer of every row.
  const k = ctx({ bits: 1, hrThreshold: 1, bitsPerInch: 1000 });
  assert.ok(k.room <= 0);
  const b = C.buildCjkGrid(disc(14, 11, C.getTier("cjk").ramp), opts(k));
  assert.equal(b.length, 1);
  assert.equal(C.packStackBodies(b, k).length, 1);
});

test("a box with room, but less than one row: every band is flagged tall (the bot cuts each one)", () => {
  // 25 bits at 50 bits per inch: a 48px box, 26.4px after the Cheer line. An 8-column ASCII row
  // is 1.2 x 17.49vw = 57.1px tall, so each part prints the top half of one row.
  const k = ctx({ bits: 25, bitsPerInch: 50 });
  assert.ok(k.room > 0 && k.room < 57);
  const grid = Array.from({ length: 8 }, () => Array.from("MMMMMMMM"));
  const b = C.buildMonoGrid(grid, opts(k));
  assert.equal(b.length, 8);
  assert.ok(b.every((x) => x.tall === true && x.glyph.tall === true && x.heightPx > k.room));
  // Room enough for a row: nothing tall. No room at all (the Cheer line fills the box) is the
  // other case, banded by characters and said by the notice, so nothing there is tall either.
  assert.ok(C.buildMonoGrid(grid, opts(ctx())).every((x) => !x.tall));
  assert.ok(C.buildCjkGrid(disc(14, 11, CJK), opts(ctx({ bits: 1, hrThreshold: 1, bitsPerInch: 1000 }))).every((x) => !x.tall));
});
