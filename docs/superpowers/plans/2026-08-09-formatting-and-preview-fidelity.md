# Text formatting + preview fidelity (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every piece of text in the app a font, weight, italic, underline and
strikethrough — and make the thermal preview show them, so no formatting choice is a
gamble.

**Architecture:** One shared `fmt` struct (`{font, weight, italic, underline, strike}`) and
one pure function `fmtAttrs(fmt)` that turns it into SVG `<text>` attributes. Every text
surface — takeover lines, fake-cheer lines, Big Text — routes through it. Nothing else
emits text attributes. The thermal preview already rasterizes the receipt at the real head
width; it needs verifying that formatting survives that path.

**Tech Stack:** Vanilla JS in one file (`public/index.html`), `node --test` against a
null-DOM sandbox (`test/_harness.mjs`), real-engine verification via wkhtmltopdf 0.12.6
patched-qt.

## Global Constraints

- **`public/index.html` is the entire application.** No build step, no dependencies. Edit
  that one file for all app behaviour.
- **Payload budget is 500 characters** (`MAX_CHARS`), whole message including the cheer
  token. Every attribute emitted costs budget — **omit anything at its default**.
- **Only these nine fonts are offered**, all verified on the real engine: Default (Arial),
  Arial Black, Impact, Comic Sans MS, Georgia, serif, monospace, cursive, fantasy.
  Do not add an unverified family.
- **A `<foreignObject>` deletes every SVG sibling that follows it.** Do not reorder
  emission in `buildTakeover`.
- **Existing blocks must render byte-identically** unless the user changes a new control.
- Tests: `npm test` must stay green. The engine cannot run in CI, so engine findings are
  pinned as documented constants with the measurement in a comment.

---

### Task 1: The font table and `fmtAttrs`

**Files:**
- Modify: `public/index.html` — add near `escapeHtml` / before `takeoverText` (~line 700)
- Modify: `public/index.html` — the `module.exports` block (~line 2990)
- Test: `test/fmt.test.mjs` (create)

**Interfaces:**
- Produces: `FONTS` (array of `{id, label, css}`), `getFont(id) -> entry`,
  `fmtAttrs(fmt) -> string` (leading-space-prefixed SVG attributes, `""` when everything
  is default).

- [ ] **Step 1: Write the failing test**

Create `test/fmt.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";
const C = loadCore();

test("a default fmt emits nothing — every attribute costs payload", () => {
  assert.equal(C.fmtAttrs(), "");
  assert.equal(C.fmtAttrs({}), "");
  assert.equal(C.fmtAttrs({ font: "", weight: 400, italic: false }), "");
});

test("each option emits its own attribute, in a stable order", () => {
  assert.equal(C.fmtAttrs({ weight: 900 }), ' font-weight="900"');
  assert.equal(C.fmtAttrs({ italic: true }), ' font-style="italic"');
  assert.equal(C.fmtAttrs({ underline: true }), ' text-decoration="underline"');
  assert.equal(C.fmtAttrs({ strike: true }), ' text-decoration="line-through"');
  assert.equal(C.fmtAttrs({ font: "black" }), ' font-family="Arial Black"');
  // order is font, weight, style, decoration — pinned so payload lengths are stable
  assert.equal(C.fmtAttrs({ font: "black", weight: 900, italic: true, underline: true }),
    ' font-family="Arial Black" font-weight="900" font-style="italic" text-decoration="underline"');
});

test("underline and strike together are one attribute", () => {
  assert.equal(C.fmtAttrs({ underline: true, strike: true }),
    ' text-decoration="underline line-through"');
});

test("the font table only offers engine-verified families", () => {
  const ids = C.FONTS.map((f) => f.id);
  assert.deepEqual(ids, ["", "black", "impact", "comic", "georgia", "serif", "mono", "script", "fantasy"]);
  assert.equal(C.FONTS[0].css, "", "the default emits no font-family at all");
  for (const f of C.FONTS.slice(1)) assert.ok(f.css && f.label, "every entry needs a css value and a label");
});

test("an unknown font id falls back to the default rather than emitting junk", () => {
  assert.equal(C.fmtAttrs({ font: "papyrus" }), "");
  assert.equal(C.getFont("nope").id, "");
});

test("a font name is attribute-escaped", () => {
  // ids are ours, but getFont must never let a quote reach the markup
  assert.ok(!/["]/.test(C.fmtAttrs({ font: "comic" }).replace(/^ font-family="|"$/g, "")));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `C.fmtAttrs is not a function`.

- [ ] **Step 3: Implement**

Insert in `public/index.html` immediately before `function takeoverText`:

```js
  // The ONLY font families offered, and every one was rendered through printer-bot's
  // own binary (wkhtmltopdf 0.12.6 patched-qt) at both 24px and 58px before being
  // listed — at 203dpi 1-bit they are visibly distinct shapes, not mush. The four
  // generics always resolve somewhere; the named ones are core Windows fonts, which is
  // what the streamer's box runs. An unverified family is a silent fallback that looks
  // like the control not working, so nothing else goes in this table.
  // `css` is what reaches the markup; "" means emit no font-family at all (Arial is
  // the receipt's own default and costs zero characters).
  var FONTS = [
    { id: "",        label: "Default (Arial)", css: "" },
    { id: "black",   label: "Arial Black",     css: "Arial Black" },
    { id: "impact",  label: "Impact",          css: "Impact" },
    { id: "comic",   label: "Comic Sans MS",   css: "Comic Sans MS" },
    { id: "georgia", label: "Georgia",         css: "Georgia" },
    { id: "serif",   label: "Serif",           css: "serif" },
    { id: "mono",    label: "Monospace",       css: "monospace" },
    { id: "script",  label: "Script",          css: "cursive" },
    { id: "fantasy", label: "Fantasy",         css: "fantasy" }
  ];
  function getFont(id) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === id) return FONTS[i];
    return FONTS[0];
  }
  // fmt -> SVG <text> attributes. EVERY DEFAULT IS OMITTED: this string is payload, and
  // the fake cheer already sits within single digits of Twitch's 500-character limit, so
  // an always-emitted attribute would cost a cheer. Attribute ORDER is pinned by test so
  // payload lengths stay predictable.
  function fmtAttrs(fmt) {
    fmt = fmt || {};
    var out = "", f = getFont(fmt.font), w = Math.round(fmt.weight) || 0;
    if (f.css) out += ' font-family="' + escapeAttr(f.css) + '"';
    if (w && w !== 400) out += ' font-weight="' + w + '"';
    if (fmt.italic) out += ' font-style="italic"';
    // Both decorations in one attribute; verified on the engine in Task 7. If the
    // combined form ever stops rendering, emit underline alone rather than neither.
    var dec = [];
    if (fmt.underline) dec.push("underline");
    if (fmt.strike) dec.push("line-through");
    if (dec.length) out += ' text-decoration="' + dec.join(" ") + '"';
    return out;
  }
```

Add to `module.exports`:

```js
      FONTS: FONTS, getFont: getFont, fmtAttrs: fmtAttrs,
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, and the pre-existing suite still green (103 passing before this task).

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/fmt.test.mjs
git commit -m "feat: shared text-formatting struct and the engine-verified font table"
```

---

### Task 2: Takeover and fake-cheer lines honour `fmt`

**Files:**
- Modify: `public/index.html:721` — `takeoverText`
- Modify: `public/index.html:1463` — `renderBlockBodies`, the takeover branch
- Modify: `public/index.html` — `buildFakeCheer`'s line construction (~line 850)
- Test: `test/takeover.test.mjs` (append)

**Interfaces:**
- Consumes: `fmtAttrs` from Task 1.
- Produces: `lineFmt(stored, defWeight, defItalic) -> fmt`. Takeover line objects now
  carry `fmt` instead of `weight` / `italic`.

- [ ] **Step 1: Write the failing test**

Append to `test/takeover.test.mjs`:

```js
test("a line's formatting reaches the markup", () => {
  const html = C.buildTakeover({ pullPt: 240, w: 263, lines: [
    { text: "NOTICE", size: 24, fmt: { font: "impact", weight: 900, underline: true } }] });
  assert.match(html, /<text[^>]*font-family="Impact"/);
  assert.match(html, /<text[^>]*font-weight="900"/);
  assert.match(html, /<text[^>]*text-decoration="underline"/);
});

test("an unformatted line is byte-identical to before — no new attributes", () => {
  // The three slot defaults are 900 / 700 / italic. They must still emit exactly what
  // they emitted before fmt existed, or every saved takeover changes appearance.
  const html = C.buildTakeover({ pullPt: 240, w: 263, lines: [
    { text: "A", size: 24, fmt: C.lineFmt(null, 900, false) },
    { text: "B", size: 19, fmt: C.lineFmt(null, 700, false) },
    { text: "C", size: 13, fmt: C.lineFmt(null, 400, true) }] });
  assert.match(html, /<text x="132" y="\d+" font-size="24" font-weight="900">A<\/text>/);
  assert.match(html, /<text x="132" y="\d+" font-size="19" font-weight="700">B<\/text>/);
  assert.match(html, /<text x="132" y="\d+" font-size="13" font-style="italic">C<\/text>/);
});

test("lineFmt takes the slot default and lets a stored value win", () => {
  assert.equal(C.lineFmt(null, 900, false).weight, 900);
  assert.equal(C.lineFmt({ weight: 400 }, 900, false).weight, 400);
  assert.equal(C.lineFmt(null, 400, true).italic, true);
  assert.equal(C.lineFmt({ italic: false }, 400, true).italic, false);
  assert.equal(C.lineFmt({ font: "serif" }, 900, false).font, "serif");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `C.lineFmt is not a function`.

- [ ] **Step 3: Implement**

Replace `takeoverText` (currently at `public/index.html:721`):

```js
  // Formatting comes in as ONE fmt object rather than loose weight/italic flags, so
  // every text surface in the app emits attributes through the same function and they
  // cannot drift. Slot defaults (900 / 700 / italic) are applied by lineFmt at the call
  // site, which is what keeps saved takeovers byte-identical.
  function takeoverText(cx, y, size, l) {
    return '<text x="' + cx + '" y="' + y + '" font-size="' + size + '"'
      + fmtAttrs(l.fmt) + '>' + escapeHtml(l.text) + '</text>';
  }
  // A stored per-line fmt merged over this slot's defaults. `null`/absent means "never
  // touched", which must reproduce the old hardcoded look exactly.
  function lineFmt(stored, defWeight, defItalic) {
    var f = stored || {};
    return { font: f.font || "",
             weight: f.weight != null ? f.weight : defWeight,
             italic: f.italic != null ? f.italic : !!defItalic,
             underline: !!f.underline, strike: !!f.strike };
  }
```

In `renderBlockBodies` (`public/index.html:1472`), replace the blank-takeover lines array:

```js
              lines: [{ text: block.l1, size: block.s1, fmt: lineFmt(block.f1, 900, false) },
                      { text: block.l2, size: block.s2, fmt: lineFmt(block.f2, 700, false) },
                      { text: block.l3, size: block.s3, fmt: lineFmt(block.f3, 400, true) }],
```

In `buildFakeCheer`, replace its `lines` array with the same shape, passing the fmt through
from a new `o.fmts` option (`{bits, name, note}`):

```js
    var fm = o.fmts || {};
    var lines = [{ text: bits ? bits + CHEER_SUFFIX : "", size: sz.bits || 24, fmt: lineFmt(fm.bits, 900, false) },
                 { text: o.name || "", size: sz.name || 19, fmt: lineFmt(fm.name, 700, false) },
                 { text: o.note || "", size: sz.note || 13, fmt: lineFmt(fm.note, 400, true) }]
      .filter(function (l) { return String(l.text || "") !== ""; });
```

And in `renderBlockBodies`'s cheer branch, pass `fmts: { bits: block.f1, name: block.f2, note: block.f3 }`.

Add to `module.exports`: `lineFmt: lineFmt,`

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. In particular the pre-existing fake-cheer reference-layout test must still
pass — if it fails, the slot defaults are wrong, not the test.

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/takeover.test.mjs
git commit -m "feat: takeover and fake-cheer lines carry a formatting struct"
```

---

### Task 3: Per-line formatting controls on the takeover card

**Files:**
- Modify: `public/index.html:2384-2399` — `mkSize` / `mkText` helpers in `takeoverCard`
- Modify: `public/index.html:2400-2404` — the blank-takeover field group
- Modify: `public/index.html` — the fake-cheer field group (same `mkText`/`mkSize` calls)

**Interfaces:**
- Consumes: `FONTS`, `lineFmt` from Tasks 1–2. Writes `block.f1` / `f2` / `f3`.

- [ ] **Step 1: Add the control builder**

Insert inside `takeoverCard`, next to `mkSize`:

```js
      // Font + weight + the three toggles for one line, on a single row. WEIGHT IS A
      // SELECT, NOT A BOLD TOGGLE, and that is deliberate: the three slots already use
      // 900 / 700 / normal, so collapsing weight to a boolean would change the look of
      // every takeover that already exists. Normal/Bold/Black covers "bold" and keeps
      // 700 reachable.
      var mkFmt = function (parent, key, defWeight, defItalic) {
        var cur = function () { return block[key] || (block[key] = {}); };
        var row = mkEl("div", { "class": "fmt-row" });
        var font = mkEl("select");
        for (var i = 0; i < FONTS.length; i++) {
          font.appendChild(opt(FONTS[i].id, FONTS[i].label, (block[key] || {}).font === FONTS[i].id));
        }
        font.addEventListener("change", function () { cur().font = font.value; saveBlocks(); update(); });
        row.appendChild(font);
        var wsel = mkEl("select");
        var wNow = lineFmt(block[key], defWeight, defItalic).weight;
        wsel.appendChild(opt("400", "Normal", wNow === 400));
        wsel.appendChild(opt("700", "Bold", wNow === 700));
        wsel.appendChild(opt("900", "Black", wNow === 900));
        wsel.addEventListener("change", function () { cur().weight = parseInt(wsel.value, 10); saveBlocks(); update(); });
        row.appendChild(wsel);
        [["italic", "I"], ["underline", "U"], ["strike", "S"]].forEach(function (t) {
          var on = lineFmt(block[key], defWeight, defItalic)[t[0]];
          var b = mkEl("button", { type: "button", "class": "fmt-tog" + (on ? " on" : "") }, t[1]);
          b.addEventListener("click", function () {
            var v = !lineFmt(block[key], defWeight, defItalic)[t[0]];
            cur()[t[0]] = v;
            b.className = "fmt-tog" + (v ? " on" : "");
            saveBlocks(); update();
          });
          row.appendChild(b);
        });
        parent.appendChild(row);
      };
```

- [ ] **Step 2: Wire it into both field groups**

Replace the blank group (`public/index.html:2401-2403`):

```js
      mkText(blankWrap, "Line 1 (big)", "l1"); mkSize(blankWrap, "s1", 24); mkFmt(blankWrap, "f1", 900, false);
      mkText(blankWrap, "Line 2", "l2");       mkSize(blankWrap, "s2", 19); mkFmt(blankWrap, "f2", 700, false);
      mkText(blankWrap, "Line 3 (italic)", "l3"); mkSize(blankWrap, "s3", 13); mkFmt(blankWrap, "f3", 400, true);
```

Add the matching `mkFmt(cheerWrap, "f1", 900, false)` etc. after each fake-cheer
`mkSize` call, in the same slot order (bits, name, note).

- [ ] **Step 3: Add the CSS**

Next to the other `.block-card` rules in the `<style>` block:

```css
  .fmt-row { display: flex; gap: .3rem; align-items: center; margin: 0 0 .5rem; flex-wrap: wrap; }
  .fmt-row select { flex: 1 1 7rem; min-width: 6rem; }
  .fmt-tog { width: 2rem; padding: .25rem 0; font-weight: 700; cursor: pointer; }
  .fmt-tog.on { background: #772ce8; color: #fff; border-color: #772ce8; }
```

- [ ] **Step 4: Verify in the browser**

```bash
cd public && python3 -m http.server 8791 &
```

Open `http://127.0.0.1:8791/index.html`, add a Takeover block, type into Line 1, and:
- change Font to Impact → the preview text changes shape;
- click **U** → it underlines and the button highlights;
- reload → the choices persist.

Expected: all three true, and `0` console errors.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: per-line font, weight and I/U/S controls on the takeover card"
```

---

### Task 4: Measure Big Text in the font it will render in

**Files:**
- Modify: `public/index.html:1236` — `measureRun`
- Modify: `public/index.html:1243` — `runLength`
- Modify: callers — `buildBigTextSvg` (1187), `rotatedSpan` (1261), `rotateBodies` (1324)
- Test: `test/render.test.mjs` (append)

**Interfaces:**
- Produces: `measureRun(text, fontPx, cssFont)` and `runLength(text, fontPx, cssFont)`,
  both defaulting to `BIG_FONT` when `cssFont` is falsy.

**Why this task exists:** `buildBigTextSvg` scales text to fit the paper by measuring it on
a canvas, and `runLength` sizes each sideways strip's box the same way. Both hardcode
`BIG_FONT`. Offer a font without threading it through and the app measures Arial while the
printer draws Impact — the box comes out short and **the last letters get sheared**. The
existing comment above `BIG_FONT` documents exactly this failure.

- [ ] **Step 1: Write the failing test**

Append to `test/render.test.mjs`:

The null-DOM harness has no canvas, so the metrics themselves are not observable. Rather
than assert arity — which proves nothing about behaviour — extract the font resolution into
a pure function and test that, then have `measureRun` use it.

```js
test("bigFontFor resolves the css font that measurement and rendering must share", () => {
  // Measuring in one font and drawing in another is what shears the last letters off a
  // sideways strip, so one function owns the answer and both callers use it.
  assert.equal(C.bigFontFor(), C.BIG_FONT, "no fmt means the default");
  assert.equal(C.bigFontFor({}), C.BIG_FONT);
  assert.equal(C.bigFontFor({ font: "" }), C.BIG_FONT, "the default entry falls back, never ''");
  assert.equal(C.bigFontFor({ font: "impact" }), "Impact");
  assert.equal(C.bigFontFor({ font: "mono" }), "monospace");
  assert.equal(C.bigFontFor({ font: "papyrus" }), C.BIG_FONT, "unknown ids fall back");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- --test-name-pattern="bigFontFor"`
Expected: FAIL — `C.bigFontFor is not a function`.

- [ ] **Step 3: Implement**

Add next to `BIG_FONT` (`public/index.html:1215`):

```js
    // ONE owner of "which font is this text in". measureRun and every renderer read it,
    // so they cannot disagree — and disagreeing is what shears letters off a sideways
    // strip. Falls back to BIG_FONT (Arial) for the default entry and for junk, because
    // "" would make the canvas font string invalid.
    function bigFontFor(fmt) {
      return bigFontFor(fmt);
    }
```

Add `bigFontFor: bigFontFor, BIG_FONT: BIG_FONT,` to `module.exports`, then:

```js
    function measureRun(text, fontPx, cssFont) {
      var c = measureRun._c || (measureRun._c = document.createElement("canvas").getContext("2d"));
      // MEASURE IN THE FONT WE WILL RENDER IN. Measuring Arial while the printer draws
      // Impact makes every per-glyph width wrong, the error accumulates across a word,
      // and the box comes out short — which shears the last letters off a sideways
      // strip. See BIG_FONT's note.
      c.font = "800 " + fontPx + "px " + (cssFont || BIG_FONT);
      c.textBaseline = "alphabetic";
      return c.measureText(text);
    }
    function runLength(text, fontPx, cssFont) {
      var m = measureRun(text, fontPx, cssFont);
```

Then give every caller an explicit font argument, still `BIG_FONT` for now — this task
changes plumbing only, and Task 5 is what makes it vary. In `buildBigTextSvg`:

```js
      var wide100 = lines.reduce(function (m, l) {
        return Math.max(m, measureRun(l || " ", 100, BIG_FONT).width); }, 1);
```

In `rotateBodies` and `rotatedSpan`, add a trailing `cssFont` parameter, default it
(`cssFont = cssFont || BIG_FONT;`) and pass it into every `runLength` / `measureRun` call
inside them. No behaviour change: every call site still resolves to `BIG_FONT`, so the
existing render tests must pass untouched.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/render.test.mjs
git commit -m "refactor: measure Big Text in the font it renders in, not always Arial"
```

---

### Task 5: Big Text blocks honour `fmt`

**Files:**
- Modify: `public/index.html:1187` — `buildBigTextSvg`
- Modify: `public/index.html:1489` — `renderBlockBodies`, the text branch
- Test: `test/render.test.mjs` (append)

**Interfaces:**
- Consumes: `fmtAttrs`, `getFont`, the font-aware `measureRun` from Tasks 1 and 4.
- Produces: `buildBigTextSvg(text, factor, fmt)`.

- [ ] **Step 1: Write the failing test**

```js
test("Big Text carries its block's formatting onto the shared <g>", () => {
  const html = C.buildBigTextSvg("HELLO", 1, { font: "georgia", underline: true });
  assert.match(html, /<g [^>]*font-family="Georgia"/);
  assert.match(html, /<g [^>]*text-decoration="underline"/);
  // one <g>, not per-line attributes — that sharing is what keeps multi-line affordable
  assert.equal((html.match(/<g /g) || []).length, 1);
});

test("an unformatted Big Text block emits exactly what it emits today", () => {
  const before = C.buildBigTextSvg("HELLO", 1);
  assert.ok(!/font-family=/.test(before), "no font-family when the default is chosen");
  assert.ok(!/text-decoration=/.test(before));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- --test-name-pattern="Big Text"`
Expected: FAIL — no `font-family` in output.

- [ ] **Step 3: Implement**

Change the signature to `function buildBigTextSvg(text, factor, fmt) {`, resolve the font
once at the top, use it for measurement, and put the attributes on the existing shared
`<g>`:

```js
      var cssFont = bigFontFor(fmt);
      var wide100 = lines.reduce(function (m, l) {
        return Math.max(m, measureRun(l || " ", 100, cssFont).width); }, 1);
```

```js
      var body = '<g font-size="' + S + '" text-anchor="middle" fill="#000" stroke="#000" stroke-width="' + sw + '"'
        + fmtAttrs(fmt) + '>' + kids + '</g>';
```

Give `bigTypeBodies(text, factor, orient, fmt)` and `rotateBodies(text, factor, len, angle, fmt)`
a trailing `fmt` parameter. `bigTypeBodies` forwards it to `buildBigTextSvg`; `rotateBodies`
resolves `var cssFont = bigFontFor(fmt);`, passes that to
`runLength` and to `rotatedSpan`, and puts `fmtAttrs(fmt)` on the span's text element.

In `renderBlockBodies`'s text branch (`public/index.html:1489-1492`):

```js
      var orient = block.orient || 0;
      if (orient === 90 || orient === 270) return rotateBodies(text, factor, block.rotateLen, orient, block.fmt);
      return bigTypeBodies(text, factor, orient, block.fmt);   // 0 or 180
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/render.test.mjs
git commit -m "feat: Big Text blocks carry font, weight, italic, underline and strike"
```

---

### Task 6: Formatting controls on the text card

**Files:**
- Modify: `public/index.html:2189` — `textCard`

**Interfaces:**
- Consumes: `FONTS`, `fmtAttrs`. Writes `block.fmt`.

- [ ] **Step 1: Add the controls**

After the Size slider in `textCard` (`public/index.html:2231`), insert:

```js
      // One fmt per block (a text block is one run of type, unlike a takeover's three
      // slots). Weight is a select for the same reason as on the takeover card: Bold and
      // Black are both wanted and a boolean can only carry one of them.
      var fmtWrap = mkEl("div");
      var curFmt = function () { return block.fmt || (block.fmt = {}); };
      var fmtRow = mkEl("div", { "class": "fmt-row" });
      var font = mkEl("select");
      for (var fi = 0; fi < FONTS.length; fi++) {
        font.appendChild(opt(FONTS[fi].id, FONTS[fi].label, (block.fmt || {}).font === FONTS[fi].id));
      }
      font.addEventListener("change", function () { curFmt().font = font.value; saveBlocks(); update(); syncFontNote(); });
      fmtRow.appendChild(font);
      var wsel = mkEl("select");
      var wNow = (block.fmt || {}).weight || 400;
      wsel.appendChild(opt("400", "Normal", wNow === 400));
      wsel.appendChild(opt("700", "Bold", wNow === 700));
      wsel.appendChild(opt("900", "Black", wNow === 900));
      wsel.addEventListener("change", function () { curFmt().weight = parseInt(wsel.value, 10); saveBlocks(); update(); });
      fmtRow.appendChild(wsel);
      [["italic", "I"], ["underline", "U"], ["strike", "S"]].forEach(function (t) {
        var on = !!(block.fmt || {})[t[0]];
        var b = mkEl("button", { type: "button", "class": "fmt-tog" + (on ? " on" : "") }, t[1]);
        b.addEventListener("click", function () {
          var v = !curFmt()[t[0]];
          curFmt()[t[0]] = v;
          b.className = "fmt-tog" + (v ? " on" : "");
          saveBlocks(); update();
        });
        fmtRow.appendChild(b);
      });
      fmtWrap.appendChild(fmtRow);
      card.appendChild(fmtWrap);
```

Hide `fmtWrap` when `block.render === "hanzi"` — hanzi tiling draws glyphs, not type, so
formatting does nothing there. Extend the existing `applyRender`:

```js
      var applyRender = function () {
        var hanzi = block.render === "hanzi";
        typeWrap.style.display = hanzi ? "none" : "";
        hanziWrap.style.display = hanzi ? "" : "none";
        fmtWrap.style.display = hanzi ? "none" : "";
      };
```

- [ ] **Step 2: Say what the preview cannot prove**

The spec requires the font control to admit its one uncertainty rather than imply
certainty: the preview renders with **your** fonts, the print with the **streamer's**.
Add a note under the row, and make it sharper for sideways text, where a wrong font does
not merely look different — it shears letters off.

```js
      var fontNote = mkEl("div", { "class": "hint" });
      var syncFontNote = function () {
        var f = (block.fmt || {}).font || "";
        var sideways = block.orient === 90 || block.orient === 270;
        if (!f) { fontNote.hidden = true; return; }
        fontNote.hidden = false;
        fontNote.textContent = sideways
          ? "Sideways strips are sized by measuring this font in your browser. If the "
            + "streamer's PC doesn't have it, it draws something else, the strip is the "
            + "wrong length, and the last letters shear off. Default (Arial) is the safe "
            + "pick for sideways."
          : "The preview uses your fonts; the printer uses the streamer's. Serif, "
            + "Monospace, Script and Fantasy always resolve to something; the named "
            + "fonts are standard on Windows. If it isn't there it falls back — one test "
            + "print settles it.";
      };
      fmtWrap.appendChild(fontNote);
      syncFontNote();
```

Call `syncFontNote()` from the existing orientation `change` handler as well, so switching
to sideways upgrades the warning.

- [ ] **Step 3: Verify in the browser**

Serve `public/`, add a Text block, set Font to Impact — the preview changes shape. Switch
Render to Hanzi — the formatting row disappears. Set Orientation to Giant sideways ▷ with
Impact selected — the warning appears. Reload — choices persist. `0` console errors.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: formatting controls on text blocks, with the sideways-shear warning"
```

---

### Task 7: Prove the preview and the printer agree

**Files:**
- Create: `docs/superpowers/plans/2026-08-09-phase1-verification.md` (findings)
- Modify: `public/index.html` only if a defect is found

**Why:** the spec's governing requirement is that no option may be a gamble. A formatting
control the preview renders differently from the tape is worse than no control.

- [ ] **Step 1: Verify the combined decoration on the real engine**

`fmtAttrs` emits `text-decoration="underline line-through"`. Underline and line-through
were each verified separately; the combined value was not. Render a takeover with a line
carrying both through wkhtmltopdf (printer-bot's flags, its stylesheet) and confirm **both**
rules are drawn. If only one is, change `fmtAttrs` to emit `underline` alone when both are
set, and record why in a comment.

- [ ] **Step 2: Render one sheet of every option through the engine**

One message containing a line per option (each font, each toggle, and bold+italic+underline
together) at a takeover size (24px) and a headline size (58px). Rasterize at **203 dpi** and
threshold to 1 bit — that is what the head lays down. Every line must be legible and
visibly distinct from the default.

- [ ] **Step 3: Assert the thermal preview reflects formatting**

In the browser with the thermal preview on, capture the canvas for a takeover line in the
default font and again in Impact, and compare the raster. **They must differ.** Repeat for
plain vs underlined. If either pair is identical, the serialized `foreignObject` is dropping
the attributes and the preview is lying — fix that before shipping the controls.

Run in the page console (or via Playwright `browser_evaluate`) after setting the line's
font, once per variant, and compare the two returned strings:

```js
() => {
  const c = document.querySelector(".rcpt-thermal");
  if (!c) return "NO THERMAL CANVAS — the takeover frame did not thermalize";
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 128) ink++;
  return c.width + "x" + c.height + " ink=" + ink;
}
```

Differing `ink` counts prove the attribute reached the raster. Identical counts across a
font change mean it did not.

- [ ] **Step 4: Confirm a takeover thermalizes at all**

With a Takeover block in the stack and the thermal toggle on, the frame must render as a
dithered 1-bit canvas with the overlay present and clipped at the paper edge — not blank,
and no console errors.

- [ ] **Step 5: Record and commit**

Write the measurements into the findings doc — actual numbers, not "looks fine" — and note
anything that failed and what changed as a result.

```bash
git add docs/superpowers/plans/2026-08-09-phase1-verification.md public/index.html
git commit -m "test: verify formatting renders on the real engine and in the thermal preview"
```

---

## Out of scope for this plan

Phases 2–4 of the spec get their own plans: the **container** (items, seed, anchor, align,
nudge, migration), **continuation covers** (the `packStackBodies` change), and **presets**
(save/load/export/import with expired-link detection). Each produces working software on
its own; none is blocked by the others.
