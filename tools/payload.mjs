// Emit a payload built by the app's OWN pure core, for tools/rig.py to render.
//
// The point is that the bench measures what the app really sends. Hand-writing the
// markup for a bench case is how you end up measuring a page the app would never
// produce and then writing the result into CLAUDE.md as though it meant something.
//
// Usage:
//   node tools/payload.mjs '{"kind":"takeover","items":[...],"pullPt":240}' | python3 tools/rig.py case
//   node tools/payload.mjs spec.json | python3 tools/rig.py case
//   node tools/payload.mjs '{"kind":"giant","text":"HELLO"}' \
//     | node tools/printerbot.mjs --out - | python3 tools/rig.py hello --document - --fonts DIR
//
// Giant type and the ruler are COMPLETE MESSAGES (lead included), because they only mean
// anything after printer-bot's sanitizer and cheermote pass, and the faithful path is the
// one above: printerbot.mjs runs both on nutty's live files, rig.py prints the result.
// Piped straight into rig.py (template mode) they still render, but with no sanitizer and
// the token left as text, which is not what the tape gets.
//
// Specs (all fields optional unless noted):
//   {"kind":"giant","text":"HELLO","layout":"auto|lines|stack|emote",
//    "size":"fit1|width"|1..18,"tuck":false,"bits":100,"cheer":true,"part":0}
//        Giant type, through the app's own path: buildGiantBodies at the budget packStack
//        gives it, then packStackBodies, so the lead, the tuck's <br> handling and the
//        split into cheers are the app's. Emits parts[part] (0-based); the part count and
//        the size the app predicts go to stderr. "cheer":false is the free probe message
//        (no token, never reaches the printer, still passes the chat filter).
//   {"kind":"ruler","bits":100}                            the Print size ruler (never tucked)
//   {"kind":"takeover","items":[{"kind":"text","text":"HI","size":24},
//                               {"kind":"pic","url":"...","width":120}],
//    "anchor":"top|middle|bottom","pullPt":240,"carrier":"embed|input|iframe","w":263}
//   {"kind":"cover","pullPt":240,"w":263}                  the continuation cover
//   {"kind":"embed","url":"...","w":160,"h":160,"carrier":"embed"}   one bare picture
//   {"kind":"raw","html":"<b>anything</b>"}                escape hatch
//
// Add "lead":true to the last four to prefix the real cheer lead ("Cheer100 00 ", or the
// tucked one with "tuck":true; "bits" sets the amount). That lead occupies a line in
// #receipt-content and pushes a lifted takeover DOWN by its height — measuring without it
// is what made the pull calibration a line short and printed a crescent of the streamer's
// avatar above the artwork.
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

// The lead, from the app's ONE lead builder (buildLead, via packStackBodies). This used to
// be hand-built here as "Cheer100 " + nonce + " ", a second description of the lead that
// agreed with the app's only until the tuck: a tucked bench case would have measured a
// payload the app never sends, without the corner span and without the packer's <br>.
const leadOpts = {
  cheer: spec.kind === "giant" ? spec.cheer !== false : true,
  bits: Number(spec.bits) >= 100 ? Math.floor(Number(spec.bits)) : 100,
  tuck: !!spec.tuck,
};
// One message through the packer, exactly as probeParts sends a single body: the lead,
// the nonce, and under the tuck the packer's first-body <br> rule all come from the app.
const wrap = (body) => C.packStackBodies([{ html: body, chars: C.payloadLength(body), heightPx: 0 }],
  leadOpts)[0].payload;

const W = spec.w || C.PAPER_PX;
let html;
switch (spec.kind) {
  case "giant": {
    // packStack's budget: what a body may spend after the lead this part will carry.
    const budget = C.MAX_CHARS - C.leadLength(leadOpts);
    const tuck = leadOpts.cheer && leadOpts.tuck;
    const bodies = C.buildGiantBodies(String(spec.text == null ? "" : spec.text),
      { layout: spec.layout, size: spec.size, budget, tuck });
    const parts = C.packStackBodies(bodies, leadOpts);
    const idx = spec.part == null ? 0 : Number(spec.part);
    if (!Number.isInteger(idx) || idx < 0 || idx >= parts.length) {
      console.error("part " + JSON.stringify(spec.part) + " does not exist: this text packs into "
        + parts.length + " part(s), numbered from 0");
      process.exit(2);
    }
    html = parts[idx].payload;
    const g = bodies[0].giant;
    console.error("[payload] giant: layout " + g.layout + ", "
      + (g.levels ? g.levels + " level(s)" + (g.shrink ? " in ." + g.shrink : "")
        + " = " + g.px.toFixed(1) + "px, capitals " + g.capCm.toFixed(2) + " cm"
        + (g.fits ? "" : ", TOO WIDE: " + JSON.stringify(g.overflowText))
      : "nothing to print")
      + "; " + bodies.length + " body(ies), predicted height "
      + bodies.map((b) => b.heightPx + "px").join(" + "));
    console.error("[payload] " + parts.length + " part(s): "
      + parts.map((p, k) => (k === idx ? "[" + p.chars + "]" : String(p.chars))).join(", ")
      + " chars (emitting part " + idx + ")");
    break;
  }
  case "ruler": {
    // rulerParts: the normal lead and nonce, NEVER tucked (a diagnostic should look like
    // any other cheer; the one thing it has to prove is the size).
    const body = C.buildGiantRuler();
    html = C.packStackBodies([body], { cheer: true, bits: leadOpts.bits })[0].payload;
    console.error("[payload] ruler: 1.." + body.giant.levels + ", predicted height " + body.heightPx + "px");
    break;
  }
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
      + ' — expected giant, ruler, takeover, cover, embed or raw');
    process.exit(2);
}

// The real message leads with the cheer token (or, tucked, LEAD_GUARD and the corner
// span), never with "<": some sends are dropped outright on a leading angle bracket.
// packStackBodies builds `lead + bodies` as ONE string so the preview and the print
// cannot diverge; wrap() goes through it so this cannot diverge from either.
if (spec.lead && spec.kind !== "giant" && spec.kind !== "ruler") html = wrap(html);

process.stdout.write(html);
if (process.stdout.isTTY) process.stdout.write("\n");
console.error("[payload] " + Array.from(html).length + " chars of "
  + C.MAX_CHARS + (Array.from(html).length > C.MAX_CHARS ? "  — OVER, Twitch would reject this" : ""));
