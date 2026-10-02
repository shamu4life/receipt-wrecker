// Giant type: printer-bot's own `.title` class, nested.
//
// printer-bot's sanitizer strips `style` but keeps `class`, and the receipt it prints
// inlines every stylesheet on its settings page, nutty's shared global.css included. So
// `.title` (font-size:1.2em; weight 900; uppercase) styles our markup on paper, and N
// nested levels print at 16px x 1.2^N. These tests pin the pure core that turns text
// into those nests: which size, how it splits into cheers, and that every body fits the
// 500-character message it has to ride in. What actually comes off the printer is the
// Print size ruler's job (one cheer) and tools/rig.py's (no cheer at all).
//
// Several numbers below are REAL-ENGINE measurements (wkhtmltopdf 0.12.6.1, patched Qt,
// printer-bot's exact flags, Segoe UI), recorded where they are used. They are fixtures,
// not targets to tune the code against.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCore, eq, scanTags } from "./_harness.mjs";

const C = loadCore();
const len = (s) => C.payloadLength(s);
const LAYOUTS = ["auto", "lines", "stack", "emote"];
const budgetFor = (opts) => C.MAX_CHARS - C.leadLength(opts);

// A seeded generator, so a failure names a reproducible text instead of a flake.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Chat-shaped junk: mostly letters, plenty of spaces and newlines (blank lines included,
// which is what exercises the chunk-edge rules), wide M/W and narrow I, markup
// characters, an emoji, a joiner, emote names and a cheer-shaped word, and the odd long
// unbreakable run. Lengths run to ~500 so the CHARACTER budget, not just the height one,
// decides where a body ends.
const PIECES = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789", "M", "W", "I", "I", " ", " ", " ", " ", " ", " ", "\n", "\n", "\n", "\n\n", "\n\n\n",
  "&", "<", ">", "'", "\"", "é", "🔥", "\u200D", "Kappa", "KEKW", "cheer100", "WWWWWWWW", "ÆØÅ",
];
function randomText(r) {
  const n = 1 + Math.floor(r() * r() * 260);
  let s = "";
  for (let i = 0; i < n; i++) s += PIECES[Math.floor(r() * PIECES.length)];
  return s;
}

// A giant body is exactly "<br>" + open + lines.join("<br>") + close + "<br>". Pull the
// printed lines back out of it (escaped as they were sent), checking the frame as we go.
function bodyLines(html) {
  const m = html.match(/^<br>((?:<b class=[a-z-]+>)+)([\s\S]*?)((?:<\/b>)+)<br>$/);
  assert.ok(m, "a giant body must be <br> + open + lines + close + <br>: " + html);
  const opens = m[1].match(/<b /g).length, closes = m[3].match(/<\/b>/g).length;
  assert.equal(opens, closes, "a giant body must close every tag it opens: " + html);
  return m[2].split("<br>");
}

// ── PB_CLASSES: the borrowed classes are DATA ──

test("PB_CLASSES rows are well-formed, in printer-bot's cascade order, and name what giant type uses", () => {
  const ids = C.PB_CLASSES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate PB_CLASSES id");
  for (const e of C.PB_CLASSES) {
    for (const k of ["id", "cls", "decl", "role", "source", "field", "checked"]) {
      assert.equal(typeof e[k], "string", e.id + " is missing " + k);
      assert.ok(e[k].length, e.id + " has an empty " + k);
    }
    assert.ok(["grow", "shrink", "tuck", "emote"].includes(e.role), e.id + ": unknown role " + e.role);
    assert.ok(["printed", "sent", "untested"].includes(e.field), e.id + ": unknown field " + e.field);
    assert.ok(["global.css", "style.css"].includes(e.source), e.id + ": unknown source " + e.source);
    assert.match(e.checked, /^\d{4}-\d\d-\d\d$/);
    if (e.role === "grow" || e.role === "shrink") {
      assert.equal(typeof e.factor, "number", e.id + " needs its em factor");
      assert.ok(e.decl.includes("font-size:" + String(e.factor).replace(/^0\./, ".") + "em"),
        e.id + ": factor " + e.factor + " disagrees with its own declaration " + e.decl);
    }
    assert.equal(C.pbClass(e.id), e);
  }
  assert.equal(C.pbClass("nope"), null);
  // Cascade order: global.css before style.css, the way GetRenderedHTML inlines them.
  const src = C.PB_CLASSES.map((e) => e.source);
  assert.ok(src.lastIndexOf("global.css") < src.indexOf("style.css"), "global.css rows must come first");
  // The rows the feature is built on, exactly as global.css/style.css declare them on
  // 2026-10-01. A retune by nutty is a one-row edit here AND in this test, after a probe.
  const want = {
    title: ["title", "font-weight:900;font-size:1.2em;text-transform:uppercase", "grow"],
    shrink9: ["setting-description", "font-size:.9em;font-weight:100", "shrink"],
    shrink8: ["setting-attribute", "font-size:.8em;font-weight:200", "shrink"],
    switch: ["switch", "position:relative;display:inline-block;width:3em;height:1.5em;font-size:1em;overflow:hidden", "tuck"],
    navbtn: ["dialog-nav-button", "background:transparent;border:none;font-size:1.5em;font-weight:100;padding:0;width:1em;height:1em;position:fixed;top:.5em;right:.5em", "tuck"],
    emote: ["emote", "height:1em", "emote"],
  };
  eq(ids, Object.keys(want));
  for (const [id, [cls, decl, role]] of Object.entries(want)) {
    const e = C.pbClass(id);
    assert.equal(e.cls, cls, id);
    assert.equal(e.decl, decl, id);
    assert.equal(e.role, role, id);
  }
  assert.equal(C.pbClass("title").field, "printed", "only .title (and .emote) have been judged on real tape");
});

test("every constant that describes a borrowed class is DERIVED from the table", () => {
  assert.equal(C.GIANT_RATIO, C.pbClass("title").factor);
  assert.equal(C.GIANT_MIN_PX, C.GIANT_BASE_PX * C.GIANT_RATIO);
  // The tuck span MUST be quoted: unquoted, dialog-nav-button parses as a boolean
  // attribute, the sanitizer strips it, and the gem prints in the flow as before.
  assert.equal(C.TUCK_OPEN, '<span class="switch dialog-nav-button">');
  assert.equal(C.TUCK_CLOSE, "</span>");
  const tuckClasses = C.PB_CLASSES.filter((e) => e.role === "tuck").map((e) => e.cls).join(" ");
  assert.equal(C.TUCK_OPEN, "<span " + C.classAttr(tuckClasses) + ">");
  // classAttr: unquoted where that is legal (2 characters cheaper, paid up to 18 times a
  // line), quoted where it is not.
  assert.equal(C.classAttr("title"), "class=title");
  assert.equal(C.classAttr("setting-description"), "class=setting-description");
  assert.equal(C.classAttr("switch dialog-nav-button"), 'class="switch dialog-nav-button"');
  assert.equal(C.classAttr("Title"), 'class="Title"');
  assert.equal(C.classAttr('a"b'), 'class="a&quot;b"');
});

test("every class giant type emits exists in PB_CLASSES, and every class attribute is quoted or a plain name", () => {
  // All-occurrences scan (scanTags), so level 17 of an 18-deep nest is checked as hard as
  // level 1. Only `class` is allowed through: anything else is stripped on the way in.
  const known = new Set(C.PB_CLASSES.map((e) => e.cls));
  const blobs = [C.buildGiantRuler().html, C.TUCK_OPEN + C.TUCK_CLOSE,
    C.buildLead({ cheer: true, bits: 100, tuck: true }, "07")];
  for (const text of ["HI", "PENIS", "A&B", "HAPPY\nBIRTHDAY\nCHAT", "Kappa KEKW"]) {
    for (const layout of LAYOUTS) {
      for (const size of ["fit1", "width", 1, 2, 3, 12, 18]) {
        for (const b of C.buildGiantBodies(text, { layout, size })) blobs.push(b.html);
      }
    }
  }
  const seen = new Set();
  for (const html of blobs) {
    for (const t of scanTags(html)) {
      for (const a of t.attrs) {
        assert.equal(a.name, "class", "giant/tuck markup carries a " + a.name + " attribute: " + html);
        assert.ok(a.quoted || /^[a-z][a-z0-9-]*$/.test(a.value),
          "an unquoted class value must be a plain name: " + a.value + " in " + html);
        for (const cls of String(a.value).split(/\s+/)) {
          assert.ok(known.has(cls), "class " + cls + " is not in PB_CLASSES: " + html);
          seen.add(cls);
        }
      }
    }
  }
  for (const cls of ["title", "setting-description", "setting-attribute", "switch", "dialog-nav-button"]) {
    assert.ok(seen.has(cls), "no builder output exercised class " + cls);
  }
});

test("the preview CSS is built from the table, minus .emote, with fixed turned into absolute", () => {
  const css = C.pbPreviewCss(".rcpt");
  for (const e of C.PB_CLASSES) {
    if (e.role === "emote") {
      // printer-bot's .emote{height:1em} would also catch the takeover preview's
      // <img class="emote"> carrier and shrink it to 16px.
      assert.ok(!css.includes("." + e.cls + "{"), "the emote rule must stay out of the preview");
      continue;
    }
    const decl = e.decl.replace(/position:fixed/g, "position:absolute");
    assert.ok(css.includes(".rcpt ." + e.cls + "{" + decl + "}"), "preview CSS lacks " + e.cls + ": " + css);
  }
  // The preview's .rcpt stands in for the PAGE; fixed would pin the tuck to the window.
  assert.ok(!/position:fixed/.test(css), css);
  // Segoe UI's line height on the rig, so preview heights track the tape on any OS font.
  assert.ok(css.includes(".rcpt .title{line-height:1.33}"), css);
  // Scoped: nothing in it may reach the app's own UI.
  for (const rule of css.split("}").filter(Boolean)) assert.ok(rule.startsWith(".rcpt ."), rule);
});

test("tools/rig.py's hand-synced copy of the borrowed rules matches PB_CLASSES", () => {
  // The bench's fallback CSS (used when no cached copy of printer-bot's real CSS exists)
  // is kept in step BY HAND. A drift there makes a giant payload bench at 16px and read
  // as "giant type doesn't work". Offline: this reads the file, it runs nothing.
  const here = dirname(fileURLToPath(import.meta.url));
  const rig = readFileSync(join(here, "../tools/rig.py"), "utf8");
  for (const e of C.PB_CLASSES) {
    if (e.source === "global.css") {
      assert.ok(rig.includes("." + e.cls + "{" + e.decl + "}"), "rig.py's PB_CSS lacks ." + e.cls + "{" + e.decl + "}");
    }
  }
  assert.ok(/\.emote\s*\{\s*height:\s*1em;?\s*\}/.test(rig), "rig.py's style.css subset lacks .emote{height:1em}");
});

// ── Widths ──

// Uppercase advance widths in em. Segoe UI Bold: hmtx advance / 2048, read from the font
// (the face the Windows rig's engine resolves printer-bot's font stack to). Arial Bold:
// Liberation Sans Bold (metric-compatible), measured on a real canvas at 1000px. Numbers
// only; no font is in this repo.
const SEGOE_UI_BOLD = {
  A: 0.7031, B: 0.6411, C: 0.624, D: 0.7373, E: 0.5322, F: 0.52, G: 0.7109, H: 0.7661, I: 0.3169,
  J: 0.4453, K: 0.6489, L: 0.5112, M: 0.957, N: 0.79, O: 0.7583, P: 0.6143, Q: 0.7583, R: 0.6528,
  S: 0.5605, T: 0.5859, U: 0.7231, V: 0.667, W: 1.0049, X: 0.6553, Y: 0.6069, Z: 0.6069,
  0: 0.5752, 1: 0.5752, 2: 0.5752, 3: 0.5752, 4: 0.5752, 5: 0.5752, 6: 0.5752, 7: 0.5752, 8: 0.5752, 9: 0.5752,
  " ": 0.2759, ".": 0.271, ",": 0.271, "!": 0.3271, "?": 0.438, "-": 0.4043, "'": 0.293,
  "\"": 0.4932, "&": 0.8496, "@": 0.9541, "#": 0.5923, ":": 0.271, "/": 0.4434,
};
const ARIAL_BOLD = {
  A: 0.722, B: 0.722, C: 0.722, D: 0.722, E: 0.667, F: 0.611, G: 0.778, H: 0.722, I: 0.278,
  J: 0.556, K: 0.722, L: 0.611, M: 0.833, N: 0.722, O: 0.778, P: 0.667, Q: 0.778, R: 0.722,
  S: 0.667, T: 0.611, U: 0.722, V: 0.667, W: 0.944, X: 0.667, Y: 0.667, Z: 0.611,
  0: 0.556, 1: 0.556, 2: 0.556, 3: 0.556, 4: 0.556, 5: 0.556, 6: 0.556, 7: 0.556, 8: 0.556, 9: 0.556,
  " ": 0.278, ".": 0.278, ",": 0.278, "!": 0.333, "?": 0.611, "-": 0.333, "'": 0.238,
  "\"": 0.474, "&": 0.722, "@": 0.975, "#": 0.556, ":": 0.333, "/": 0.278,
};

test("GIANT_W is never narrower than Segoe UI Bold or Arial Bold, for any key", () => {
  // The old table (Arial x1.10) sat BELOW Segoe UI Bold on M, -, ', & and /: "MM" was
  // fitted at 245.7px of a 240px body, and on the real engine "M&M M&M" wrapped to two
  // lines and "MMMMM" inked past the body edge. A width under either font is an overflow
  // waiting for the right word.
  eq(Object.keys(C.GIANT_W).sort(), Object.keys(SEGOE_UI_BOLD).sort());
  eq(Object.keys(ARIAL_BOLD).sort(), Object.keys(SEGOE_UI_BOLD).sort());
  for (const k of Object.keys(SEGOE_UI_BOLD)) {
    assert.ok(C.GIANT_W[k] >= SEGOE_UI_BOLD[k], JSON.stringify(k) + ": " + C.GIANT_W[k] + " < Segoe UI Bold " + SEGOE_UI_BOLD[k]);
    assert.ok(C.GIANT_W[k] >= ARIAL_BOLD[k], JSON.stringify(k) + ": " + C.GIANT_W[k] + " < Arial Bold " + ARIAL_BOLD[k]);
    // The documented derivation, so the comment beside the table can't drift from it.
    const want = Math.round(Math.max(SEGOE_UI_BOLD[k], ARIAL_BOLD[k]) * 1.03 * 1000) / 1000;
    assert.equal(C.GIANT_W[k], want, JSON.stringify(k) + " is not round(max(Segoe, Arial) x 1.03, 3)");
  }
  // Anything unlisted errs WIDE: wider than every listed glyph but W and @.
  assert.equal(C.GIANT_W_DEFAULT, 1.0);
  assert.equal(C.giantLineEm("Ж", "lines"), C.GIANT_W_DEFAULT);
});

test("the width margin absorbs the engine rounding font-size to a whole px, at every step", () => {
  // The engine prints at Math.round(px), up to +2.6% at the smallest step (20.736 -> 21).
  // A string fitted at px with GIANT_W stays inside the fit at round(px) in the real font
  // only if every glyph's margin over that font beats the rounding at every step.
  let minMargin = Infinity;
  for (const k of Object.keys(SEGOE_UI_BOLD)) {
    minMargin = Math.min(minMargin, C.GIANT_W[k] / Math.max(SEGOE_UI_BOLD[k], ARIAL_BOLD[k]));
  }
  for (const st of C.giantSteps()) {
    assert.ok(Math.round(st.px) / st.px <= minMargin,
      "step " + st.px.toFixed(3) + "px prints at " + Math.round(st.px) + "px, beyond GIANT_W's " + minMargin.toFixed(4) + " margin");
  }
});

test("a fitted line never overflows the paper in either real font (every 1-2 character string, and a 3-character sample)", () => {
  // End to end through giantFit's own pick, at the size the engine really prints. Every
  // string at "width" (the tightest pick) and at fit1.
  const keys = Object.keys(SEGOE_UI_BOLD);
  const strings = [];
  for (const a of keys) { strings.push(a); for (const b of keys) strings.push(a + b); }
  const r = rng(3);
  for (let i = 0; i < 600; i++) strings.push([0, 1, 2].map(() => keys[Math.floor(r() * keys.length)]).join(""));
  strings.push("MM", "M&M M&M", "MMMMM", "WWW", "@@@", "///");
  strings.forEach((s) => {
    // fit1 of ONE short line is the width pick (it is always one cheer), so it is only
    // re-checked on the single characters; "width" is the tight one.
    for (const size of s.length === 1 ? ["width", "fit1"] : ["width"]) {
      const f = C.giantFit([s], { layout: "lines", size });
      if (!f.fits) continue;   // honestly reported as too wide; not this test's business
      const px = Math.round(f.px);
      for (const [name, W] of [["Segoe UI Bold", SEGOE_UI_BOLD], ["Arial Bold", ARIAL_BOLD]]) {
        const w = Array.from(s.toUpperCase()).reduce((t, ch) => t + W[ch], 0) * px;
        assert.ok(w <= C.PAPER_PX, JSON.stringify(s) + " at " + size + " prints " + w.toFixed(1) + "px wide in " + name);
      }
    }
  });
});

test("giantLineEm measures the UPPERCASE text, and emote tokens as 1em squares plus a space each", () => {
  const W = C.GIANT_W;
  assert.equal(C.giantLineEm("hi", "lines"), W.H + W.I, "text-transform is visual, so measure the capitals");
  assert.equal(C.giantLineEm("A&B", "lines"), W.A + W["&"] + W.B, "an escaped & is one glyph wide, not five");
  assert.equal(C.giantLineEm("", "lines"), 0);
  // An emote is .emote{height:1em} and a Twitch emote is square. One space per token:
  // the gaps AND the trailing pad, which QtWebKit 534 counts when it centres the line.
  const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 1e-9, msg + ": " + x + " vs " + y);
  near(C.giantLineEm("Kappa", "emote"), 1 + W[" "], "one emote");
  near(C.giantLineEm("Kappa  KEKW PogChamp", "emote"), 3 * (1 + W[" "]), "three emotes, extra spaces collapsed");
});

// ── Steps and line pitch ──

test("giantSteps: ascending, unique, nothing below one .title level, each px = 16 x 1.2^n x factor", () => {
  const steps = C.giantSteps();
  const shrinks = C.PB_CLASSES.filter((e) => e.role === "shrink");
  // Rebuilt independently: 1..18 levels, unshrunk or inside ONE shrink wrapper.
  const want = new Map();
  for (let n = 1; n <= C.GIANT_MAX_LEVELS; n++) {
    for (const f of [1, ...shrinks.map((e) => e.factor)]) {
      const px = 16 * 1.2 ** n * f;
      if (px >= C.GIANT_MIN_PX - 1e-9 && !want.has(px.toFixed(6))) want.set(px.toFixed(6), px);
    }
  }
  assert.equal(steps.length, want.size, "step count");
  steps.forEach((st, i) => {
    if (i) assert.ok(st.px > steps[i - 1].px, "steps must ascend strictly: " + steps[i - 1].px + " then " + st.px);
    assert.ok(st.px >= 19.2 - 1e-9, "a step below one level (19.2px) is smaller than chat text: " + st.px);
    assert.ok(st.levels >= 1 && st.levels <= C.GIANT_MAX_LEVELS && Number.isInteger(st.levels));
    assert.ok(Math.abs(st.px - C.GIANT_BASE_PX * C.GIANT_RATIO ** st.levels * st.factor) < 1e-9, JSON.stringify(st));
    if (st.shrink) {
      const e = shrinks.find((x) => x.cls === st.shrink);
      assert.ok(e, "unknown shrink class " + st.shrink);
      assert.equal(st.factor, e.factor);
    } else {
      assert.equal(st.factor, 1);
    }
  });
  assert.equal(steps[0].px, C.GIANT_MIN_PX);
  assert.ok(Math.abs(steps.at(-1).px - 16 * 1.2 ** 18) < 1e-9);
});

test("giantLineH reproduces the real engine's line pitch, small sizes included", () => {
  // Measured on wkhtmltopdf 0.12.6.1 with Segoe UI (pitch in em of the font-size). A flat
  // 1.33em is right from L10 up and short at small sizes (the engine rounds font-size to
  // a whole px and ceils ascent and descent separately), which under-counts a page of
  // small lines.
  const fixtures = [[1, 1, 1.353], [3, 1, 1.410], [5, 1, 1.381], [8, 1, 1.351], [10, 1, 1.333],
    [10, 0.9, 1.346], [12, 1, 1.339], [13, 1, 1.332], [14, 1, 1.334], [15, 1, 1.334]];
  for (const [n, f, em] of fixtures) {
    const px = 16 * 1.2 ** n * f;
    assert.ok(Math.abs(C.giantLineH(px) - em * px) <= 0.5,
      "L" + n + "x" + f + ": giantLineH " + C.giantLineH(px) + " vs measured " + (em * px).toFixed(2));
  }
  assert.equal(C.GIANT_GAP_PX, 23, "the lead line / gap between giant bodies measured 23px on the engine");
});

// ── Fitting ──

test("NaN guard: the fit reads the real paper width (PAPER_PX lives inside the DOM guard)", () => {
  // If the fit ever reads PAPER_PX before it is assigned, every width test compares
  // against undefined and the pick goes silently wrong in one direction or the other.
  const i = C.giantFit(["I"], { size: "width" });
  const w = C.giantFit(["W"], { size: "width" });
  assert.ok(i.levels >= 15, "a lone I should fill the paper at a big step: " + JSON.stringify(i));
  assert.ok(Number.isFinite(w.px) && w.px > 0 && w.px <= C.PAPER_PX, JSON.stringify(w));
  assert.ok(C.GIANT_W.W * w.px <= C.PAPER_PX, "W fitted wider than the paper: " + JSON.stringify(w));
  assert.equal(C.PAPER_PX, 240);
});

test("fit sizes: the integer is exact, an empty list is 'none', and too-wide is reported, never silent", () => {
  const n9 = C.giantFit(["HI"], { size: 9 });
  assert.equal(n9.levels, 9); assert.equal(n9.factor, 1); assert.equal(n9.shrink, "");
  assert.ok(Math.abs(n9.px - 16 * 1.2 ** 9) < 1e-9);
  assert.equal(C.giantFit(["HI"], { size: "9" }).levels, 9, "a <select> hands the size over as a string");
  // Nothing to print is size "none", never 18 levels of empty tags spent on blank paper.
  for (const lines of [[], [""], ["", ""]]) {
    eq(C.giantFit(lines, { size: "fit1" }), { levels: 0, shrink: "", factor: 1, px: 0, fits: true, overflow: [], chunks: 0 });
    assert.equal(C.giantFit(lines, { size: 12 }).levels, 0);
  }
  // ~21em: wider than the paper even at the smallest step. The result says so.
  const wreck = C.giantFit(["WRECK THE RECEIPT COMPLETELY"], { layout: "lines", size: "fit1" });
  assert.equal(wreck.fits, false);
  eq(wreck.overflow, [0]);
  assert.equal(wreck.px, C.GIANT_MIN_PX, "no step fits, so the smallest");
  const manual = C.giantFit(["OK", "TOO WIDE HERE"], { layout: "lines", size: 12 });
  assert.equal(manual.fits, false);
  eq(manual.overflow, [1]);
  // A too-wide line WRAPS on paper, so it is counted as the rows it wraps to; counting it
  // as one line under-reports the height and a page of them runs past the 500mm sheet.
  const em = C.giantLineEm("WRECK THE RECEIPT COMPLETELY", "lines");
  const rows = Math.ceil(em * C.GIANT_MIN_PX / C.PAPER_PX);
  assert.ok(rows >= 2);
  const wrapped = C.buildGiantBodies("WRECK THE RECEIPT COMPLETELY", { layout: "lines", size: 1 })[0];
  assert.equal(wrapped.heightPx, C.GIANT_GAP_PX + C.giantLineH(C.GIANT_MIN_PX) * rows);
  const fine = C.giantFit(["HI"], { layout: "lines", size: "fit1" });
  assert.equal(fine.fits, true);
  eq(fine.overflow, []);
});

test("fit1 is the biggest size in ONE cheer, and never costs more cheers than the smallest size", () => {
  // Spot checks against the real choices for words people actually send.
  const penis = C.buildGiantBodies("PENIS", { layout: "stack", size: "fit1" });
  assert.equal(penis.length, 1, "PENIS stacked must fit one cheer (it printed from one)");
  assert.equal(penis[0].giant.levels, 14);
  for (const [text, layout] of [["PENIS", "stack"], ["HELLO", "lines"], ["HELLO", "stack"], ["GG", "lines"], ["LOL", "stack"]]) {
    const lines = C.giantLines(text, layout);
    const f = C.giantFit(lines, { layout, size: "fit1" });
    assert.equal(f.chunks, 1, text);
    assert.ok(f.fits, text);
    // No bigger whole level is also one cheer that fits the paper.
    for (let n = f.levels + 1; n <= C.GIANT_MAX_LEVELS; n++) {
      const g = C.giantFit(lines, { layout, size: n });
      assert.ok(!(g.fits && g.chunks === 1 && g.px > f.px), text + ": L" + n + " also fits one cheer, bigger than the pick " + JSON.stringify(f));
    }
  }
  // Fewest cheers first: the fallback when nothing fits one cheer is NOT the biggest
  // size (an 80-character stack once fell back to 20 cheers that way).
  const r = rng(11);
  for (let i = 0; i < 120; i++) {
    const text = randomText(r);
    for (const layout of ["lines", "stack", "emote"]) {
      for (const tuck of [false, true]) {
        const budget = budgetFor({ cheer: true, bits: 100, tuck });
        const fitPx = C.PAPER_PX - (tuck ? C.GIANT_TUCK_PX : 0);
        const lines = C.giantLines(text, layout);
        const fit1 = C.giantFit(lines, { layout, size: "fit1", budget, fitPx });
        const smallest = C.giantFit(lines, { layout, size: 1, budget, fitPx });
        assert.ok(fit1.chunks <= smallest.chunks,
          JSON.stringify(text) + " " + layout + ": fit1 costs " + fit1.chunks + " cheers, the smallest size " + smallest.chunks);
        if (smallest.chunks === 1) assert.equal(fit1.chunks, 1, JSON.stringify(text) + " " + layout);
      }
    }
  }
});

test("auto layout: a layout that fits beats one that doesn't; both in one cheer, the bigger; a tie, lines", () => {
  const r = rng(5);
  const texts = ["HELLO", "GG", "HAPPY\nBIRTHDAY\nCHAT", "WRECK THE RECEIPT COMPLETELY", "I LOVE YOU", "A B"];
  for (let i = 0; i < 40; i++) texts.push(randomText(r));
  for (const text of texts) {
    for (const size of ["fit1", "width", 6]) {
      const plan = C.giantPlan(text, { layout: "auto", size });
      const a = C.giantPlan(text, { layout: "lines", size }), s = C.giantPlan(text, { layout: "stack", size });
      let want;
      if (a.fit.fits !== s.fit.fits) want = s.fit.fits ? "stack" : "lines";
      else if (size === "width" || (a.fit.chunks === 1 && s.fit.chunks === 1)) want = s.fit.px > a.fit.px ? "stack" : "lines";
      else want = s.fit.chunks < a.fit.chunks ? "stack" : "lines";
      assert.equal(plan.layout, want, JSON.stringify(text) + " at " + size);
      assert.notEqual(plan.layout, "emote", "emote is never picked automatically");
    }
  }
  assert.equal(C.giantPlan("WRECK THE RECEIPT COMPLETELY", { layout: "auto" }).layout, "stack",
    "too wide as a line, so it must stack rather than print cut off");
  // A genuine tie in cheers (both fit, both two cheers at L14): lines, which reads as typed.
  // The random texts above never produce one, so it is built by hand.
  const tie = "A\nB\nC\nD\nE\nF";
  const tl = C.giantPlan(tie, { layout: "lines", size: 14 }), ts = C.giantPlan(tie, { layout: "stack", size: 14 });
  assert.ok(tl.fit.fits && ts.fit.fits && tl.fit.chunks === 2 && ts.fit.chunks === 2,
    "the tie fixture stopped being a tie: " + tl.fit.chunks + " vs " + ts.fit.chunks);
  assert.equal(C.giantPlan(tie, { layout: "auto", size: 14 }).layout, "lines");
});

// ── Bodies: characters, height, chunk edges ──

test("CHARACTER BUDGET: every body fits its message, for 200 seeded texts x every layout x tuck on/off", () => {
  // The packer never splits a body, and Twitch REJECTS an over-length message rather than
  // truncating it. So a giant body over (500 - lead) is a cheer that never prints. Height
  // alone allowed exactly that: 26 lines of "ROSES 000".. made one 487-character body.
  // The only exception is a single line too long on its own, which is flagged `over`
  // so the card can say so.
  const r = rng(1);
  let multi = 0, overs = 0;
  for (let i = 0; i < 200; i++) {
    const text = randomText(r);
    const size = i % 3 === 0 ? "width" : (i % 3 === 1 ? 1 + Math.floor(r() * 18) : "fit1");
    for (const layout of LAYOUTS) {
      for (const tuck of [false, true]) {
        const opts = { cheer: true, bits: 100, tuck };
        const budget = budgetFor(opts);
        const bodies = C.buildGiantBodies(text, { layout, size, budget, tuck });
        if (bodies.length > 1) multi++;
        const where = JSON.stringify(text) + " " + layout + " " + size + (tuck ? " tucked" : "");
        for (const b of bodies) {
          assert.equal(b.chars, len(b.html), where + ": chars must be the payload length of html");
          if (b.giant.over) { overs++; assert.equal(bodyLines(b.html).length, 1, where + ": only a SINGLE line may be over"); continue; }
          assert.ok(b.chars <= budget, where + ": a body of " + b.chars + " > budget " + budget);
        }
        // And through the packer: no part of the message goes over 500.
        for (const p of C.packStackBodies(bodies, opts)) {
          if (p.bodies.some((b) => b.giant && b.giant.over)) continue;
          assert.ok(p.chars <= C.MAX_CHARS, where + ": a part of " + p.chars + " characters");
        }
      }
    }
  }
  // Otherwise the test proved nothing about splitting.
  assert.ok(multi > 50, "only " + multi + " multi-body cases; the generator stopped exercising the split");
});

test("the 24-line case splits under the tuck: at least 2 bodies, each <= 440 characters", () => {
  const text = Array.from({ length: 24 }, (_, i) => "LINE NUMBER " + i).join("\n");
  const tuck = { cheer: true, bits: 100, tuck: true };
  const bodies = C.buildGiantBodies(text, { layout: "lines", size: "fit1", tuck: true, budget: budgetFor(tuck) });
  assert.ok(bodies.length >= 2, "one body of " + bodies.map((b) => b.chars).join("/") + " cannot fit a tucked cheer");
  for (const b of bodies) assert.ok(b.chars <= 440, "a " + b.chars + "-character body plus the 60-character tucked lead is over 500");
  // Untucked the same text is one body of 464, under the 488 the plain lead leaves.
  const plain = C.buildGiantBodies(text, { layout: "lines", size: "fit1", budget: budgetFor({ cheer: true, bits: 100 }) });
  assert.equal(plain.length, 1);
  assert.ok(plain[0].chars <= 488, plain[0].chars);
  // The same rule when the size is pinned: 40 lines at a manual size still split by characters.
  const forty = Array.from({ length: 40 }, (_, i) => "LINE " + String(i).padStart(4, "0")).join("\n");
  const pinned = C.buildGiantBodies(forty, { layout: "lines", size: 3, tuck: true, budget: budgetFor(tuck) });
  assert.ok(pinned.length >= 2);
  for (const b of pinned) assert.ok(b.chars <= budgetFor(tuck), b.chars);
  // The budget handed in is the one honoured, whatever it is (a 5-digit bit amount, a
  // future longer lead), not a default that happens to agree with the common case.
  const tight = C.buildGiantBodies(forty, { layout: "lines", size: 3, budget: 200 });
  assert.ok(tight.length > pinned.length);
  for (const b of tight) assert.ok(b.chars <= 200, "budget 200 ignored: a body of " + b.chars);
});

test("the banded builders size against the real lead (a structural check: they need a canvas)", () => {
  // hanziBodies and glyphImageBodies rasterize on a <canvas>, which the null-DOM sandbox
  // cannot run, so their band arithmetic is replayed in compose.test.mjs from the two
  // exported pieces it uses. This pins that they still USE them: a band sized with the
  // old hardcoded 14 is 480 characters at 15 columns, 544 with the tucked lead, and the
  // packer never splits a band, so Twitch rejects the whole cheer.
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

test("tucked, a real giant body sheds its leading <br> in every part; a Hanzi band ahead of it gains one", () => {
  // The packer only strips what a body flags with leadBr. Every giant body must carry it,
  // or the tuck hides the gem and saves no tape (the <br> leaves a blank line exactly as
  // tall as the one it hid: 156px either way on the engine, 133px with it stripped).
  const opts = { cheer: true, bits: 100, tuck: true };
  const text = "ABCDEFGHIJKLMNOPQRST".split("").join("\n");
  const bodies = C.buildGiantBodies(text, { layout: "lines", size: 11, tuck: true, budget: budgetFor(opts) });
  assert.ok(bodies.length >= 3, "want a multi-cheer giant run, got " + bodies.length);
  for (const b of bodies) {
    assert.equal(b.leadBr, true);
    assert.ok(b.html.startsWith("<br><b class="), b.html);
  }
  const parts = C.packStackBodies(bodies, opts);
  assert.equal(parts.length, bodies.length);
  parts.forEach((p, i) => {
    assert.equal(p.payload, p.lead + bodies[i].html.slice(4), "part " + (i + 1) + " kept the giant body's <br>");
    assert.ok(p.chars <= C.MAX_CHARS, "part " + (i + 1) + ": " + p.chars);
  });
  // A Hanzi band first, giant second: the band gains the <br> (so it starts on a clean
  // line instead of sharing one with the nbsp), the giant body after it is left alone.
  const band = "丶二土田".repeat(25);
  const last = bodies.at(-1);
  const mixed = C.packStackBodies([{ html: band, chars: len(band), heightPx: 126 }, last], opts);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].payload, mixed[0].lead + "<br>" + band + last.html);
  // Untucked, nobody's markup is touched.
  const plain = C.packStackBodies(bodies, { cheer: true, bits: 100 });
  plain.forEach((p, i) => assert.equal(p.payload, p.lead + bodies[i].html));
});

test("under the tuck the fit narrows by the nbsp that shares line 1", () => {
  // Tucked, the giant body's own <br> is gone, so the 16px nbsp lead (0.276em of Segoe UI,
  // 4.4px) sits on the first giant line and comes off its width.
  const fitPx = C.PAPER_PX - C.GIANT_TUCK_PX;
  assert.ok(C.GIANT_TUCK_PX >= 0.276 * 16, "the tuck margin is narrower than the nbsp it is for");
  for (const text of ["W", "MM", "HELLO", "OK"]) {
    const plan = C.giantPlan(text, { layout: "lines", size: "width", tuck: true });
    assert.equal(plan.fitPx, fitPx);
    assert.ok(C.giantLineEm(text, "lines") * plan.fit.px <= fitPx, text + " fitted wider than the tucked line");
  }
  // And there is a word it actually changes, or the margin is decoration.
  const changed = ["W", "MM", "HELLO", "OK", "A", "GG", "LOL", "HI", "WOW", "POG"].some((t) =>
    C.giantPlan(t, { layout: "lines", size: "width", tuck: true }).fit.px
      < C.giantPlan(t, { layout: "lines", size: "width" }).fit.px);
  assert.ok(changed, "the tucked fit never differs from the untucked one");
});

test("chunks never start or end on a blank line, never break a word when a gap is available, and fit the page", () => {
  // A chunk that STARTS blank prints a giant-height blank above its first letter
  // (measured: 396px of nothing above "D" at L16); one that ENDS blank is counted a giant
  // line tall but collapses to a small one. Both waste a cheer's paper.
  const abc = C.buildGiantBodies("ABC DEF", { layout: "stack", size: "width" });
  eq(abc.map((b) => bodyLines(b.html)), [["A", "B", "C"], ["D", "E", "F"]]);
  const hiyou = C.buildGiantBodies("HI YOU", { layout: "stack", size: "width" });
  eq(hiyou.map((b) => bodyLines(b.html)), [["H", "I"], ["Y", "O", "U"]]);
  // Runs of blank lines in a lines layout, at a size that has to split.
  const gappy = Array.from({ length: 30 }, (_, i) => "AB" + i).join("\n\n\n");
  const g = C.buildGiantBodies(gappy, { layout: "lines", size: 10 });
  assert.ok(g.length >= 3, "expected a split, got " + g.length);
  // The seeded sweep, every layout and size kind.
  const r = rng(7);
  const cases = [[gappy, "lines", 10], ["ABC DEF", "stack", "width"]];
  for (let i = 0; i < 150; i++) cases.push([randomText(r), LAYOUTS[i % 4], ["fit1", "width", 4, 12, 16][i % 5]]);
  const lineHtml = (l, layout) => C.escapeHtml(layout === "emote"
    ? (l.split(/\s+/).filter(Boolean).length ? " " + l.split(/\s+/).filter(Boolean).join(" ") + " " : "") : l);
  const ink = (ls) => ls.filter((l) => l !== "");
  for (const [text, layout, size] of cases) {
    const bodies = C.buildGiantBodies(text, { layout, size });
    if (!bodies[0].giant.levels) continue;
    const resolved = bodies[0].giant.layout;
    const kept = [];
    for (const b of bodies) {
      const ls = bodyLines(b.html);
      const where = JSON.stringify(text) + " " + layout + " " + size + ": " + JSON.stringify(ls);
      assert.notEqual(ls[0], "", where + " starts on a blank line");
      assert.notEqual(ls.at(-1), "", where + " ends on a blank line");
      // A multi-line chunk fits the page; a single line can't be split any further.
      if (ls.length > 1) assert.ok(b.heightPx <= C.HEIGHT_BUDGET, where + " is " + b.heightPx + "px tall");
      // The height model: the small lead/gap line plus one real-engine line pitch per
      // line (blank lines in a stack are giant-height too); a line too wide for the paper
      // wraps there and counts once per row it wraps to.
      const base = C.GIANT_GAP_PX + C.giantLineH(b.giant.px) * ls.length;
      if (b.giant.fits || resolved === "stack") assert.equal(b.heightPx, base, where);
      else assert.ok(b.heightPx >= base, where);
      kept.push(...ls);
    }
    // Nothing printed is lost, duplicated or reordered: only blank lines at chunk edges go.
    eq(ink(kept), Array.from(ink(C.giantLines(text, resolved)), (l) => lineHtml(l, resolved)),
      JSON.stringify(text) + " " + layout + " " + size);
  }
});

test("a split prefers the gap between words to the middle of one", () => {
  // Breaking mid-word puts printer-bot's whole header between the halves of a word. At
  // L10 a page holds 10 stacked lines; three-letter words plus their gaps are 4 lines
  // each, so a greedy split with no step-back would cut the third word after 2 letters.
  const bodies = C.buildGiantBodies("AAA BBB CCC DDD EEE FFF", { layout: "stack", size: 10 });
  assert.ok(bodies.length >= 2);
  for (const b of bodies) {
    const words = bodyLines(b.html).join("\n").split("\n\n").map((w) => w.replace(/\n/g, ""));
    for (const w of words) assert.match(w, /^([A-F])\1\1$/, "a chunk split a word: " + JSON.stringify(words));
  }
});

test("emote layout: every name is a whitespace-delimited word in the RAW message, case kept byte for byte", () => {
  // Twitch only reports an emote (in the data.emotes printer-bot swaps) when its name is
  // a standalone word of the raw chat message. Glued to a tag ("class=title>Kappa") it is
  // never reported, and the tape prints the NAME in giant capitals, sized for a 1em
  // square, so it overflows (measured on the real pipeline).
  const names = ["Kappa", "KEKW", "PogChamp", "catJAM", "LUL", "D:"];
  const text = "Kappa Kappa\n  KEKW   PogChamp \n\ncatJAM\nLUL D: Kappa";
  for (const tuck of [false, true]) {
    for (const size of ["fit1", "width", 3, 16]) {
      const opts = { cheer: true, bits: 100, tuck };
      const bodies = C.buildGiantBodies(text, { layout: "emote", size, tuck, budget: budgetFor(opts) });
      const payload = C.packStackBodies(bodies, opts).map((p) => p.payload).join("\n");
      for (const name of names) {
        const at = [...payload.matchAll(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))];
        assert.ok(at.length, name + " missing from " + payload);
        for (const m of at) {
          const before = payload.slice(0, m.index), after = payload.slice(m.index + name.length);
          assert.ok(/(^|\s)$/.test(before) && /^(\s|$)/.test(after),
            name + " is glued to its neighbours at " + m.index + ": …" + payload.slice(Math.max(0, m.index - 12), m.index + name.length + 12) + "…");
        }
      }
      assert.ok(!payload.includes("CATJAM") && !payload.includes("POGCHAMP"),
        "emote names are case-sensitive: never uppercase the payload (text-transform is visual)");
    }
  }
  // The preview draws a labelled placeholder, never an <img>: no request leaves the page.
  const pv = C.buildGiantBodies("Kappa catJAM", { layout: "emote" })[0].preview.html;
  assert.ok(!/<img/i.test(pv), pv);
  assert.ok(pv.includes('<span class="rw-emote-ph">catJAM</span>'), pv);
});

test("text is cleaned and escaped: emoji dropped and reported, markup inert, characters counted as sent", () => {
  eq(C.giantLines("A🔥B", "stack"), ["A", "B"]);
  eq(C.giantClean("A🔥B").dropped, ["🔥"]);
  const c = C.giantClean("a\r\nb👍🏽\u200D🔥🔥\uFE0F!");
  assert.equal(c.text, "a\nb!");
  eq(c.dropped, ["👍", "🏽", "\u200D", "🔥", "\uFE0F"], "each dropped character listed once");
  // By code point: a surrogate pair never splits into two "letters".
  for (const l of C.giantLines("Ж𝐀Ö", "stack")) assert.ok(!/[\uD800-\uDFFF]/.test(l), JSON.stringify(l));
  // A combining mark stays on its letter rather than printing alone as a dotted circle.
  eq(C.giantLines("E\u0301A", "stack"), ["E\u0301", "A"]);
  // Layout rules.
  eq(C.giantLines("  HI \n YOU  ", "stack"), ["H", "I", "", "Y", "O", "U"]);
  eq(C.giantLines("\n  A   B \n\n C\n\n", "lines"), ["A B", "", "C"]);
  eq(C.giantLines("\n  A   B \n\n C\n\n", "emote"), ["A B", "", "C"]);
  // Escaping: & < > become entities (quotes are inert in text and pass through), and
  // chars counts what is SENT, the entities included.
  const amp = C.buildGiantBodies("A&B", { layout: "lines" })[0];
  assert.ok(amp.html.includes(">A&amp;B<"), amp.html);
  assert.equal(amp.chars, len(amp.html));
  const q = C.buildGiantBodies('SAY "HI"', { layout: "lines" })[0];
  assert.ok(q.html.includes('SAY "HI"'), q.html);
  // Adversarial text: once the tags giant type itself emits are removed, nothing that
  // could open a tag is left.
  for (const layout of LAYOUTS) {
    for (const text of ["</b></b><img src=x>", "<br><b class=title>X", "<script>1</script>", "<<>>&lt;"]) {
      for (const b of C.buildGiantBodies(text, { layout, size: "fit1" })) {
        const rest = b.html.replace(/<\/?b( class=[a-z-]+)?>|<br>/g, "");
        assert.ok(!/[<>]/.test(rest), layout + " " + JSON.stringify(text) + " leaked markup: " + b.html);
        assert.equal(b.chars, len(b.html));
      }
    }
  }
});

test("empty or blank text is ONE empty body in every layout, never a cheer of empty tags", () => {
  for (const text of ["", "   ", "\n\n", "\t \n ", "🔥", "\u200D\uFE0F", null, undefined]) {
    for (const layout of LAYOUTS) {
      for (const size of ["fit1", "width", 18]) {
        const bodies = C.buildGiantBodies(text, { layout, size });
        assert.equal(bodies.length, 1, JSON.stringify(text) + " " + layout);
        const b = bodies[0];
        assert.equal(b.html, ""); assert.equal(b.chars, 0); assert.equal(b.heightPx, 0);
        assert.equal(b.leadBr, false, "an empty body has no <br> for the tuck to strip");
        assert.equal(b.giant.levels, 0);
        assert.equal(b.preview.html, "");
      }
    }
  }
  // The emoji-only case says WHY nothing is left, rather than nothing at all.
  assert.match(C.giantReport(C.buildGiantBodies("🔥")), /Emoji/);
});

test("giantOpts clamps whatever a preset or import hands it", () => {
  // giantLayout/giantSize come from saved stacks, presets and pasted JSON: untrusted. An
  // unclamped size of 1e6 would build megabytes of tags and freeze the tab.
  const size = (v) => C.giantOpts({ giantSize: v }).size;
  assert.equal(size(1e6), C.GIANT_MAX_LEVELS);
  assert.equal(size("abc"), "fit1");
  assert.equal(size(-3), 1);
  assert.equal(size(0), 1);
  assert.equal(size("15"), 15);
  assert.equal(size("99"), C.GIANT_MAX_LEVELS);
  assert.equal(size(7.6), 8);
  for (const junk of [NaN, Infinity, -Infinity, null, undefined, {}, [], true, ""]) assert.equal(size(junk), "fit1", String(junk));
  assert.equal(size("fit1"), "fit1");
  assert.equal(size("width"), "width");
  for (const l of ["auto", "lines", "stack", "emote"]) assert.equal(C.giantOpts({ giantLayout: l }).layout, l);
  for (const junk of ["x", "STACK", "constructor", "__proto__", 3, null]) {
    assert.equal(C.giantOpts({ giantLayout: junk }).layout, "auto", String(junk));
  }
  eq(C.giantOpts(null), { layout: "auto", size: "fit1" });
  eq(C.giantOpts({}), { layout: "auto", size: "fit1" });
});

test("hostile options finish fast and still fit one message", () => {
  const hostile = [
    ["HELLO WORLD THIS IS A TEST", { layout: { evil: 1 }, size: 1e9, budget: 1e9, tuck: "yes" }],
    ["HELLO", { layout: "stack", size: NaN, budget: -5 }],
    ["W".repeat(400), { layout: "lines", size: 1e6 }],
    ["AB ".repeat(160), C.giantOpts({ giantLayout: "constructor", giantSize: "1e9" })],
    ["X\n".repeat(240), { layout: "stack", size: "width" }],
  ];
  C.buildGiantBodies("warm", {});   // first-call JIT is not what this measures
  for (const [text, opts] of hostile) {
    let best = Infinity, bodies;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      bodies = C.buildGiantBodies(text, opts);
      best = Math.min(best, performance.now() - t0);
    }
    assert.ok(best < 50, JSON.stringify(opts) + " took " + best.toFixed(1) + "ms");
    for (const b of bodies) assert.ok(b.chars <= C.MAX_CHARS || b.giant.over, JSON.stringify(opts) + ": " + b.chars);
    for (const b of bodies) assert.ok(b.giant.levels <= C.GIANT_MAX_LEVELS);
  }
});

test("blockRender: giant and hanzi by name, anything else is Type (today's fall-through)", () => {
  assert.equal(C.blockRender({ render: "giant" }), "giant");
  assert.equal(C.blockRender({ render: "hanzi" }), "hanzi");
  assert.equal(C.blockRender({ render: "type" }), "type");
  for (const junk of [{}, { render: "zzz" }, { render: "GIANT" }, { render: null }, null, undefined]) {
    assert.equal(C.blockRender(junk), "type", JSON.stringify(junk));
  }
});

test("Print size ruler: 1..13, one level deeper each, balanced, one cheer on one page", () => {
  const ru = C.buildGiantRuler();
  assert.ok(ru.html.startsWith("<br>"), "the ruler starts on its own line, below the lead");
  assert.equal(ru.leadBr, true);
  assert.equal((ru.html.match(/<b class=title>/g) || []).length, C.GIANT_RULER_LEVELS);
  assert.equal((ru.html.match(/<\/b>/g) || []).length, C.GIANT_RULER_LEVELS, "every level closed");
  assert.equal(C.GIANT_RULER_LEVELS, 13);
  // Numbers in order, each inside one more level than the last.
  const text = ru.html.replace(/<b class=title>/g, "[").replace(/<\/b>/g, "]").replace(/<br>/g, "|");
  assert.equal(text, "|" + Array.from({ length: 13 }, (_, i) => "[" + (i + 1)).join("|") + "]".repeat(13));
  assert.equal(ru.chars, len(ru.html));
  assert.ok(ru.heightPx <= C.HEIGHT_BUDGET, ru.heightPx + "px is more than one page");
  for (const bits of [100, 10000]) {
    const parts = C.packStackBodies([ru], { cheer: true, bits });
    assert.equal(parts.length, 1);
    assert.ok(parts[0].chars <= C.MAX_CHARS, parts[0].chars);
  }
  assert.match(C.giantReport(ru), /1–13/);
});

test("giantReport speaks plain language: capitals in cm, cheers, and every warning", () => {
  const one = C.giantReport(C.buildGiantBodies("HELLO"));
  assert.match(one, /^Capitals ≈ \d+\.\d cm · fits 1 cheer$/);
  const b = C.buildGiantBodies("HELLO");
  assert.equal(one, "Capitals ≈ " + b[0].giant.capCm.toFixed(1) + " cm · fits 1 cheer");
  // capCm is the cap height (0.70em of Segoe UI), not the font-size nobody can see.
  assert.ok(Math.abs(b[0].giant.capCm - b[0].giant.px * C.GIANT_CAP_EM / C.PX_PER_MM / 10) < 1e-9);
  assert.match(C.giantReport(b, { cheers: 3, bits: 500 }), /needs 3 cheers \(1500 bits\)/);
  const reports = [
    C.giantReport(C.buildGiantBodies("WRECK THE RECEIPT COMPLETELY", { layout: "lines" })),
    C.giantReport(C.buildGiantBodies("OK\nTOO WIDE HERE", { layout: "lines", size: 12 })),
    C.giantReport(C.buildGiantBodies("THANKS CHEER100 SO MUCH 🔥", { layout: "lines" })),
    C.giantReport(C.buildGiantBodies("Kappa cheer50", { layout: "emote" })),
    C.giantReport(C.buildGiantBodies("W".repeat(480), { layout: "lines", size: 1 })),
    one,
  ];
  assert.match(reports[0], /Too wide for the paper even at the smallest size/);
  assert.match(reports[1], /Too wide for the paper at this size: “TOO WIDE HERE”/);
  assert.match(reports[2], /Emoji/);
  assert.match(reports[2], /“CHEER100”/, "a standalone cheer-shaped word is a second, charged cheer");
  assert.match(reports[3], /“cheer50”/);
  assert.match(reports[4], /too long for a single Twitch message/);
  for (const r of reports) {
    assert.ok(!/\bpx\b/.test(r) && !/level/i.test(r), "jargon in the card text: " + r);
  }
  // Only standalone words are charged: an edge word is glued to a tag, and a stack has
  // no spaces at all.
  eq(C.buildGiantBodies("CHEER100\nOK", { layout: "lines" })[0].giant.cheerWords, []);
  eq(C.buildGiantBodies("THANKS CHEER100 SO MUCH", { layout: "stack" }).flatMap((x) => x.giant.cheerWords), []);
});

// KNOWN APP BUG, reported, not fixed here (marked `todo` so the suite stays green; drop
// the todo flag once giantClean handles it). giantClean drops emoji, ZWJ and the
// variation selectors, but not the OTHER invisible format characters chat text picks up
// when it is copy-pasted (zero-width space U+200B, ZWNJ U+200C, word joiner U+2060, soft
// hyphen U+00AD) or control characters. None of them is whitespace to JS's \s, so the
// stack layout makes each one its own giant LINE: it prints nothing, costs a full line
// of height (measured: "HI​YOU" drops from 14 levels to 13 to make room for it,
// and leaves 228px of blank tape between I and Y), and since it is not "" the chunk-edge
// rule cannot trim it, so a cheer can open on an invisible giant line.
test("KNOWN BUG: an invisible format character never becomes a giant line of its own", {
  todo: "giantClean keeps U+200B/U+200C/U+2060/U+00AD and C0 controls (reported to the coordinator)",
}, () => {
  for (const ch of ["​", "‌", "⁠", "­", "\u0000"]) {
    for (const layout of ["stack", "lines"]) {
      const lines = C.giantLines("HI" + ch + "YOU\n" + ch + "\nOK", layout);
      for (const l of lines) {
        assert.ok(l === "" || /[^\u0000-\u001F\u007F-\u009F­​-‏⁠-⁤]/.test(l),
          layout + ": " + JSON.stringify(ch) + " became an invisible line of its own: " + JSON.stringify(lines));
      }
    }
  }
  eq(C.giantLines("HI​YOU", "stack"), ["H", "I", "Y", "O", "U"]);
});
