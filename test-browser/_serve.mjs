// A static server for public/, using only Node built-ins.
//
// Deliberately not `wrangler dev`: these smoke tests exercise the BROWSER GLUE — the
// composer, persistence, the cards — none of which needs the Worker. Booting a Worker
// would make the suite slower, need network, and fail for reasons that have nothing to
// do with what is being tested. The handful of behaviours that genuinely need /px or
// /upload are verified by hand against `wrangler dev`; that is called out in the specs
// rather than faked here.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("../public", import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export async function serve() {
  const server = createServer(async (req, res) => {
    // Strip the query and normalise, so a path can't climb out of public/.
    const rel = normalize(decodeURIComponent((req.url || "/").split("?")[0]));
    if (rel.includes("..")) { res.writeHead(403).end("no"); return; }
    const file = join(ROOT, rel === "/" ? "index.html" : rel);
    try {
      const buf = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return { url: "http://127.0.0.1:" + port + "/", close: () => new Promise((r) => server.close(r)) };
}
