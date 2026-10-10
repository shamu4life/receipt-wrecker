import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Extract the inline <script> and run it in a null-DOM sandbox.
// `metrics` (optional) turns the otherwise inert canvas into a measuring one: a map of
// "<the exact font string the app assigns> <the text>" -> {width, actualBoundingBoxLeft,
// actualBoundingBoxRight}, captured from a REAL canvas (headless Chrome, the same
// measurement the app makes in the streamer's browser). Without it nothing changes —
// getContext keeps returning the inert proxy, so every existing test measures exactly
// what it measured before. With it, size-fitting code that is otherwise unobservable
// here (buildBigTextSvg divides a measurement into the paper width) can be checked
// end-to-end instead of only through its helpers. An unlisted key throws rather than
// silently measuring NaN, so a test can't quietly stop measuring what it thinks it does.
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
export function loadCore(metrics) {
  const src = appScript();
  // Every `.font =` assignment any nullNode receives, in call order, for the lifetime
  // of this sandbox. The only thing in the app that ever sets `.font` on a DOM-ish
  // object is a canvas 2D context (see measureRun) — recording it here, without
  // changing what any *other* property/method on the proxy returns, is the one way to
  // observe what the app actually asked the (otherwise inert) canvas to measure with.
  // The context is memoized (measureRun._c), so this accumulates across every test
  // sharing this loadCore() instance — read from the end, or snapshot .length before
  // the call under test and slice from there.
  const fontLog = [];
  function measuringCtx() {
    let font = "";
    return {
      set font(v) { font = v; fontLog.push(v); },
      get font() { return font; },
      textBaseline: "alphabetic",
      measureText(text) {
        const key = font + " " + text;
        if (!(key in metrics)) throw new Error("no captured canvas metrics for: " + key);
        return metrics[key];
      },
    };
  }
  function nullNode() {
    const fn = function () { return proxy; };
    const proxy = new Proxy(fn, {
      get(_t, k) {
        if (metrics && k === "getContext") return () => measuringCtx();
        if (k === "value" || k === "textContent") return "";
        if (k === "checked") return false;
        if (k === Symbol.toPrimitive) return () => "";
        return proxy;
      },
      set(_t, k, v) {
        if (k === "font") fontLog.push(v);
        return true;
      },
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
  const C = sandbox.module.exports;
  C.__fontLog = fontLog;
  return C;
}

// Structural (prototype-agnostic) compare across the vm realm boundary.
export const eq = (a, b, msg) =>
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);

// Every tag in a blob, EVERY occurrence, with its attributes split the way an HTML
// parser splits them: name, then an optional value that is double-quoted, single-quoted
// or bare. Returns [{tag, closing, attrs:[{name, value, quoted}]}].
//
// Shared by the sanitizer and giant-type tests because the scan it replaces had two
// blind spots, and giant type walks straight into both. It read attributes off only the
// FIRST occurrence of each tag, so a stray attribute on level 2 of an 18-deep `.title`
// nest passed. And it only knew `name=`, so an unquoted two-class value,
// `<span class=switch dialog-nav-button>`, read as one clean class attribute, when a real
// parser makes `dialog-nav-button` a separate boolean attribute that printer-bot's
// sanitizer then strips, taking its effect with it. A bare name here comes back as its
// own attribute with value null, which is what makes that mistake visible.
// Our markup never puts ">" inside an attribute value (escapeAttr), so a token scan is
// faithful to what a parser would see.
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
