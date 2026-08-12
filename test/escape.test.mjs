// ESCAPING — the single chokepoint every user string passes through on its way into
// markup, and until now the only part of the pure core with no test at all.
//
// It matters more here than in an ordinary web app. The payload is inserted into
// printer-bot's page with raw `innerHTML`, unsanitised, then re-serialised and parsed a
// SECOND time by wkhtmltopdf. A string that escapes its context does not produce a
// broken-looking preview and a shrug — it produces markup that a stranger's machine
// parses and prints, and the tool's whole premise is that the payload is exactly what
// the author intended.
//
// These tests assert against the REAL builders as well as the helpers, because the
// helpers being correct is worth nothing if a call site forgets to use them.
import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./_harness.mjs";

const C = loadCore();
const { escapeHtml, escapeAttr, buildTakeover, buildImageEmbed } = C;

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

test("a takeover line cannot break out of its <text> element", () => {
  // The call site, not the helper. buildTakeover is where a user's typed line becomes
  // markup, and this is the string that would end the element early.
  const html = buildTakeover({
    items: [{ kind: "text", text: '</text><rect width="999" height="999"/>', size: 24 }],
    pullPt: 240, w: 263,
  });
  assert.ok(!html.includes("</text><rect"),
    "the line closed its own element and injected a sibling: " + html);
  assert.ok(html.includes("&lt;/text&gt;"), "the line should appear escaped: " + html);
  // Exactly one real <text> element — the injected one must not have materialised.
  assert.equal((html.match(/<text /g) || []).length, 1);
  assert.equal((html.match(/<rect /g) || []).length, 1, "only the cover's own rect may exist");
});

test("a crafted picture URL cannot break out of the carrier's src attribute", () => {
  // Every live carrier states the URL inside a double-quoted attribute, so every live
  // carrier has to hold. Looping the table means a carrier added later is covered too.
  const nasty = 'https://x.test/a.png" onload="alert(1)';
  for (const e of C.EMBEDS) {
    const html = buildImageEmbed(e.id, { url: nasty, w: 120, h: 120 });
    assert.ok(!html.includes('onload="alert(1)"'),
      e.id + " let a crafted URL open a new attribute: " + html);
    assert.ok(html.includes("&quot;"), e.id + " did not escape the quote: " + html);
  }
});

test("a takeover picture URL is escaped through the item path too", () => {
  const html = buildTakeover({
    items: [{ kind: "pic", url: 'https://x.test/a.png"><script>x</script>', width: 120 }],
    pullPt: 400, w: 263, carrier: "embed",
  });
  assert.ok(!html.includes("<script>"), "a script tag reached the payload: " + html);
  assert.ok(html.includes("&quot;"), "the quote was not escaped: " + html);
});
