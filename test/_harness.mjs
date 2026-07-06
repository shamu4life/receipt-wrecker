import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Extract the inline <script> and run it in a null-DOM sandbox.
export function loadCore() {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, "../public/index.html"), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("could not find the inline <script> in index.html");
  function nullNode() {
    const fn = function () { return proxy; };
    const proxy = new Proxy(fn, {
      get(_t, k) {
        if (k === "value" || k === "textContent") return "";
        if (k === "checked") return false;
        if (k === Symbol.toPrimitive) return () => "";
        return proxy;
      },
      set() { return true; }, apply() { return proxy; },
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
  return sandbox.module.exports;
}

// Structural (prototype-agnostic) compare across the vm realm boundary.
export const eq = (a, b, msg) =>
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
