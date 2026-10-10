// ESCAPING — the single chokepoint every user string passes through on its way into
// markup.
//
// It matters more here than in an ordinary web app. In a High Roller cheer the bot parses
// the message as HTML on the streamer's machine and prints what survives its sanitizer. A
// string that escapes its context does not produce a broken-looking preview and a shrug —
// it produces markup that a stranger's machine parses and prints, and the tool's whole
// premise is that the payload is exactly what the author intended.
//
// These pin the helpers. That every builder actually USES them is pinned where the builders
// are tested: the big and side tests strip our own tags from hostile input and find no "<"
// left, the glyph tests check that R4 rows are escaped, and tags.test feeds typed tags to
// every builder at both paper widths.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";

const C = loadCore();
const { escapeHtml, escapeAttr } = C;

test("escapeHtml neutralises the three characters that can open a tag or an entity", () => {
  assert.equal(escapeHtml("<b>"), "&lt;b&gt;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  assert.equal(escapeHtml("</text><script>alert(1)</script>"),
    "&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("the ampersand is escaped FIRST, so escaping is not applied twice", () => {
  // If < became &lt; before & became &amp;, this would come back as &amp;lt; and the
  // reader would see the literal text "&lt;" instead of a less-than sign.
  assert.equal(escapeHtml("<"), "&lt;");
  assert.equal(escapeHtml("&lt;"), "&amp;lt;", "an ampersand the user typed must survive as one");
  assert.equal(escapeHtml(escapeHtml("<")), "&amp;lt;", "double-escaping must be visible, not silent");
});

test("escapeHtml coerces rather than throwing on non-strings", () => {
  // Reachable: item text comes off a persisted block, and an exported preset can be
  // hand-edited into holding a number, a null or an object.
  assert.equal(escapeHtml(null), "null");
  assert.equal(escapeHtml(42), "42");
  assert.equal(escapeHtml(undefined), "undefined");
});

test("escapeAttr also closes the double quote — the attribute escape hatch", () => {
  // Without this a crafted URL ends the src attribute and starts new ones.
  assert.equal(escapeAttr('" onerror="x'), "&quot; onerror=&quot;x");
  assert.equal(escapeAttr('a"b'), "a&quot;b");
  // It is escapeHtml plus the quote, so it must still do everything escapeHtml does.
  assert.equal(escapeAttr("<&>"), "&lt;&amp;&gt;");
});
