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
export function loadCore(metrics) {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, "../public/index.html"), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("could not find the inline <script> in index.html");
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
  vm.runInContext(m[1], sandbox, { filename: "index.html#inline" });
  const C = sandbox.module.exports;
  C.__fontLog = fontLog;
  return C;
}

// Structural (prototype-agnostic) compare across the vm realm boundary.
export const eq = (a, b, msg) =>
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
