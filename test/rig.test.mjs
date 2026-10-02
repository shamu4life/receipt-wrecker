// tools/rig.py keeps everything it writes, and everything it DELETES, under .render/.
//
// The stem names the case's files, and before rasterizing rig.py clears every
// <stem>-N.png so a stale page 2 from an earlier run cannot read as a spill. The stem was
// joined onto .render/ with os.path.join, which honours an absolute path or "..":
// `rig.py /some/dir/photo` deleted photo-7.png and photo-12.png that were already there.
// The refusal happens before anything renders, so this needs python3 but no wkhtmltopdf.
// It is skipped where there is no python3, so `npm test` still needs nothing installed.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const RIG = join(REPO, "tools", "rig.py");
const hasPython = !spawnSync("python3", ["--version"]).error;

test("rig.py refuses a case name that leaves .render/, and deletes nothing out there", { skip: !hasPython && "no python3" }, () => {
  const outside = mkdtempSync(join(tmpdir(), "rw-rig-"));
  try {
    for (const f of ["photo-7.png", "photo-12.png"]) writeFileSync(join(outside, f), "x");
    const stems = [join(outside, "photo"), relative(join(REPO, ".render"), join(outside, "photo"))];
    for (const stem of stems) {
      // A bogus engine path: if the refusal ever moved after the render, this would fail
      // on the engine instead of silently passing.
      const r = spawnSync("python3", [RIG, stem], { input: "<b>x</b>", encoding: "utf8",
        env: { ...process.env, WKHTMLTOPDF: join(outside, "no-such-wkhtmltopdf") } });
      assert.equal(r.status, 1, stem + ": " + r.stderr);
      assert.match(r.stderr, /points outside \.render/, stem);
    }
    assert.deepEqual(readdirSync(outside).sort(), ["photo-12.png", "photo-7.png"], "rig.py touched files outside .render/");
    assert.ok(!existsSync(join(outside, "photo.html")));
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
