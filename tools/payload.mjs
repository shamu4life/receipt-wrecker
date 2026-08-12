// Emit a payload built by the app's OWN pure core, for tools/rig.py to render.
//
// The point is that the bench measures what the app really sends. Hand-writing the
// markup for a bench case is how you end up measuring a page the app would never
// produce and then writing the result into CLAUDE.md as though it meant something.
//
// Usage:
//   node tools/payload.mjs '{"kind":"takeover","items":[...],"pullPt":240}' | python3 tools/rig.py case
//   node tools/payload.mjs spec.json | python3 tools/rig.py case
//
// Specs (all fields optional unless noted):
//   {"kind":"takeover","items":[{"kind":"text","text":"HI","size":24},
//                               {"kind":"pic","url":"...","width":120}],
//    "anchor":"top|middle|bottom","pullPt":240,"carrier":"embed|input|iframe","w":263}
//   {"kind":"cover","pullPt":240,"w":263}                  the continuation cover
//   {"kind":"embed","url":"...","w":160,"h":160,"carrier":"embed"}   one bare picture
//   {"kind":"raw","html":"<b>anything</b>"}                escape hatch
//
// Add "lead":true to prefix the real cheer lead ("Cheer100 00 "). That lead occupies a
// line in #receipt-content and pushes a lifted takeover DOWN by its height — measuring
// without it is what made the pull calibration a line short and printed a crescent of
// the streamer's avatar above the artwork.
import { readFileSync, existsSync } from "node:fs";
import { loadCore } from "../test/_harness.mjs";

const C = loadCore();
const arg = process.argv[2];
if (!arg) {
  console.error("usage: node tools/payload.mjs '<json>'|<spec.json>  [ | python3 tools/rig.py <case> ]");
  process.exit(2);
}

let spec;
try {
  spec = JSON.parse(existsSync(arg) ? readFileSync(arg, "utf8") : arg);
} catch (e) {
  console.error("could not parse the spec as JSON: " + e.message);
  process.exit(2);
}

const W = spec.w || C.PAPER_PX;
let html;
switch (spec.kind) {
  case "takeover":
    html = C.buildTakeover({
      items: spec.items || [], anchor: spec.anchor, carrier: spec.carrier,
      pullPt: spec.pullPt, w: W,
    });
    break;
  case "cover":
    html = C.buildStackCover({ pullPt: spec.pullPt, w: W });
    break;
  case "embed":
    html = C.buildImageEmbed(spec.carrier || C.EMBED_DEFAULT,
      { url: spec.url, w: spec.w || 160, h: spec.h || 160, framed: !!spec.framed });
    break;
  case "raw":
    html = String(spec.html || "");
    break;
  default:
    console.error('unknown kind: ' + JSON.stringify(spec.kind)
      + ' — expected takeover, cover, embed or raw');
    process.exit(2);
}

// The real message leads with the cheer token, never with "<" (some sends are dropped
// outright on a leading angle bracket). packStackBodies builds `lead + bodies` as ONE
// string so the preview and the print cannot diverge; this mirrors that.
if (spec.lead) html = "Cheer100 " + C.makeNonce(0) + " " + html;

process.stdout.write(html);
if (process.stdout.isTTY) process.stdout.write("\n");
console.error("[payload] " + Array.from(html).length + " chars of "
  + C.MAX_CHARS + (Array.from(html).length > C.MAX_CHARS ? "  — OVER, Twitch would reject this" : ""));
