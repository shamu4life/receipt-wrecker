import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Extract the app's inline <script> and run it in a null-DOM sandbox.
//
// The app's script is picked out by its id. public/index.html also carries SassyTP's receipt
// page as an inert <script type="text/plain" id="sassytp-renderer"> block AFTER it (the preview
// loads it into a sandboxed frame), and that page has a <script> of its own inside, so "the
// first <script>" is not a safe way to find the app: the old /<script>(...)<\/script>/ match
// ran the bot's renderer here instead. test/vendor.test.mjs pins that this cannot happen again.
export const APP_SCRIPT_RE = /<script id="rw-app">([\s\S]*?)<\/script>/g;
export function appScript() {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, "../public/index.html"), "utf8");
  const all = [...html.matchAll(APP_SCRIPT_RE)];
  if (all.length !== 1) throw new Error("expected exactly one <script id=\"rw-app\"> in index.html, found " + all.length);
  return all[0][1];
}
export function loadCore() {
  const src = appScript();
  function nullNode() {
    const fn = function () { return proxy; };
    const proxy = new Proxy(fn, {
      get(_t, k) {
        if (k === "value" || k === "textContent") return "";
        if (k === "checked") return false;
        if (k === Symbol.toPrimitive) return () => "";
        return proxy;
      },
      set() { return true; },
      apply() { return proxy; },
    });
    return proxy;
  }
  const document = {
    getElementById: () => nullNode(), createElement: () => nullNode(),
    querySelector: () => nullNode(), querySelectorAll: () => [],
    documentElement: nullNode(), body: nullNode(), addEventListener() {},
  };
  const sandbox = {
    document, navigator: {}, location: { href: "" },
    setTimeout: () => 0, console, module: { exports: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "index.html#inline" });
  return sandbox.module.exports;
}

// Structural (prototype-agnostic) compare across the vm realm boundary.
export const eq = (a, b, msg) =>
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);

// Every tag in a blob, EVERY occurrence, with its attributes split the way an HTML
// parser splits them: name, then an optional value that is double-quoted, single-quoted
// or bare. Returns [{tag, closing, attrs:[{name, value, quoted}]}].
//
// The tag tests (tags, big, side, glyph, probes) all read markup through this one scan,
// because a simpler one has two blind spots: reading attributes off only the FIRST
// occurrence of each tag lets a stray attribute on a later element pass, and knowing only
// `name=` reads an unquoted value with a space in it (`<div style=a b>`) as one clean
// attribute, when a real parser makes `b` a separate boolean attribute. A bare name here
// comes back as its own attribute with value null, which is what makes that visible.
// Our markup never puts ">" inside an attribute value (escapeAttr), so a token scan is
// faithful to what a parser would see. test/tags.test.mjs pins both blind spots.
export function scanTags(html) {
  const out = [];
  for (const m of String(html).matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g)) {
    const body = m[3].replace(/\/\s*$/, "");
    const attrs = [];
    for (const a of body.matchAll(/([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const quoted = a[2] !== undefined || a[3] !== undefined;
      attrs.push({ name: a[1].toLowerCase(), value: a[2] ?? a[3] ?? a[4] ?? null, quoted });
    }
    out.push({ tag: m[2].toLowerCase(), closing: m[1] === "/", attrs });
  }
  return out;
}
