#!/usr/bin/env python3
"""Render a chat payload the way printer-bot really renders it, and measure the ink.

THIS FILE IS THIS PROJECT'S GROUND TRUTH. Nearly every "does this print?" claim in
CLAUDE.md was measured with an earlier, untracked copy of it. That copy lived in the
gitignored .render/ scratch directory with the wkhtmltopdf path hardcoded to a
throwaway job folder, so the bench quietly stopped working when the folder went away —
and a measurement that could not be re-run turned into a number nobody could check.
That is why this now lives in tools/ and is committed.

What it reproduces, from printer-bot's own shipped files:
  * the engine — wkhtmltopdf 0.12.6 with PATCHED Qt (QtWebKit ~534.34, a 2011 snapshot).
    The distro QtWebKit 5.212 build behaves differently and will mislead you, so the
    version is checked rather than assumed.
  * the page — the receipt container, its CSS, and the message inserted raw the way
    innerHTML inserts it.
  * the print flags — every one of them, including --no-background (which is why no
    CSS-background carrier can ever work) and --disable-smart-shrinking.
  * the paper — the ROLL WIDTH, which decides everything downstream. --paper is the
    roll in mm (default 80, the rig's); the page is roll-8mm and the usable body is
    that minus printer-bot's 1em margins. Get this wrong and the bench reports clipping
    for payloads that really fit: the old hardcoded 72 rendered a 64mm page, 8mm
    narrower than the rig, and the parameter was not reachable from the command line.

What it does NOT reproduce: the greyscale -> 1 bit conversion. wkhtmltopdf and pdftoppm
emit CONTINUOUS TONE — a 256-level ramp comes back with all 256 levels — so the step
that turns grey into burnt dots happens downstream in the printer or its driver, where
nothing here can see it. ink() hard-thresholds at 128 to COUNT INK, and that is all it
is: a proxy for "how much did this lay down", not a model of the head. Do not read the
raster as a picture of the tape. A real photo prints halftoned, so something downstream
diffuses error; which kernel is an open question that only a test print can answer.

Usage:
    echo '<b>hi</b>' | python3 tools/rig.py case-name
    node tools/payload.mjs spec.json | python3 tools/rig.py takeover-2pic
    npm run render -- case-name < payload.html

Output is JSON on stdout: ink-pixel count, raster size, ink bounding box, and the
image XObjects present in the PDF (an image that is in the PDF but absent from the ink
is a picture the engine parsed and never painted — the exact multi-foreignObject bug).

Artifacts go to .render/, which is gitignored: loose t*.html / *.pdf / *-1.png in the
repo root have been swept into a commit by a `git add -A` before.
"""
import json
import os
import subprocess
import sys

try:
    from PIL import Image
except ImportError:                                             # pragma: no cover
    sys.exit("This needs Pillow: python3 -m pip install --user Pillow")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, ".render")
WANT_VERSION = "0.12.6 (with patched qt)"


def find_wkhtmltopdf():
    """$WKHTMLTOPDF, then PATH, then the user-prefix install.

    Resolved at RUN TIME and never hardcoded. A pinned absolute path is what killed the
    previous copy of this script.
    """
    candidates = [os.environ.get("WKHTMLTOPDF")]
    from shutil import which
    candidates.append(which("wkhtmltopdf"))
    candidates.append(os.path.expanduser("~/.local/opt/bin/wkhtmltopdf"))
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    sys.exit(
        "wkhtmltopdf not found. This bench needs " + WANT_VERSION + " specifically —\n"
        "the distro QtWebKit 5.212 build renders differently and will mislead you.\n"
        "Install the upstream macOS package and point $WKHTMLTOPDF at the binary:\n"
        "  https://github.com/wkhtmltopdf/packaging/releases/tag/0.12.6-2"
    )


def check_version(wk):
    got = subprocess.run([wk, "--version"], capture_output=True, text=True).stdout.strip()
    if WANT_VERSION not in got:
        print("WARNING: this is %r, not %r — measurements will not match the rig."
              % (got, WANT_VERSION), file=sys.stderr)
    return got


# printer-bot's receipt CSS, verbatim. NOTHING here clamps message content: no
# max-width, no height:auto. Do not "fix" that to match Receipt Wrecker's own preview
# CSS — its .rcpt-body > svg { height: auto } collapses an SVG carrier to zero height
# and will make you conclude the engine cannot render SVG. It can.
CSS = """\
body { margin: 1em; }
#receipt-container { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; text-align: center; color: black; }
#receipt-content { padding: 0.5em 0em; }
#receipt-avatar { max-height: 15em; max-width: 90%; border-radius: 50%; object-fit: cover; }
#receipt-title { font-weight: 900; font-size: 1.5em; text-transform: uppercase; }
#receipt-subtitle { font-weight: 700; font-size: 1.2em; }
#receipt-icon { height: 2em; }
#receipt-date { margin: 0.5em 0em; font-size: 0.7em; text-transform: uppercase; }
.emote { height: 1em; }
"""

PAGE = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<style>%s</style></head><body>
<div id="receipt-container">
  <div id="receipt-header">
    <img id="receipt-avatar" %s>
    <div><div id="receipt-title">%s BITS</div>
         <div id="receipt-subtitle">%s</div></div>
  </div>
  <div id="receipt-content"><div>%s</div></div>
  <div id="receipt-footer">
    <div id="receipt-date">Monday, August '8th' 2026 13:50:00</div>
  </div>
</div></body></html>"""


def default_avatar(path, px=320):
    """A stand-in for the streamer's avatar.

    Its HEIGHT is what sets the header height, which is what a takeover's pull has to
    clear — so a bench run with no avatar measures a rig that does not exist.
    """
    if os.path.exists(path):
        return
    im = Image.new("L", (px, px), 255)
    for y in range(px):                       # a diagonal wedge: cheap, and asymmetric
        for x in range(px):                   # so a flipped or rotated draw is obvious
            if (x + y) % 24 < 12:
                im.putpixel((x, y), 0)
    im.save(path)


def render(message_html, stem, avatar_attr=None, bits=100, subtitle="shamu4life",
           paper_mm=80, dpi=203):
    os.makedirs(OUT, exist_ok=True)
    wk = find_wkhtmltopdf()
    check_version(wk)

    if avatar_attr is None:
        av = os.path.join(OUT, "avatar.png")
        default_avatar(av)
        avatar_attr = 'src="%s"' % av

    base = os.path.join(OUT, stem)
    with open(base + ".html", "w", encoding="utf-8") as fh:
        fh.write(PAGE % (CSS, avatar_attr, bits, subtitle, message_html))

    # printer-bot's Print Routine flags, all of them. Several decide whether a given
    # form renders AT ALL — --no-background is why a CSS-background carrier is dead,
    # and --disable-smart-shrinking is why an iframe crops instead of fitting.
    cmd = [wk,
           "--page-width", "%dmm" % (paper_mm - 8), "--page-height", "500mm",
           "--disable-smart-shrinking", "--load-error-handling", "ignore",
           "--no-background", "--enable-javascript", "--enable-local-file-access",
           "--javascript-delay", "800",
           "--margin-top", "0", "--margin-bottom", "0",
           "--margin-left", "0", "--margin-right", "0",
           base + ".html", base + ".pdf"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        # A failed subresource whose extension is not in wkhtmltopdf's hardcoded media
        # list is FATAL — exit 1, whole job — and --load-error-handling ignore does not
        # suppress it. That is why /upload mints .png links.
        return {"error": "wkhtmltopdf exit %d" % r.returncode, "stderr": r.stderr[-800:]}

    subprocess.run(["pdftoppm", "-png", "-r", str(dpi), "-f", "1", "-l", "1",
                    base + ".pdf", base], check=True)
    return {"png": base + "-1.png", "pdf": base + ".pdf", "html": base + ".html"}


def ink(png, thresh=128):
    """Hard-threshold at 128 and count black pixels: a proxy for how much ink a payload
    lays down, NOT a model of the thermal head.

    The raster this reads is continuous tone (see the module docstring). The head is
    genuinely 1 bit, but the conversion happens downstream and unobservably, and the
    field says photos come back halftoned rather than posterized — so error diffusion
    of some kind is at work and this threshold is not it. Use this number to compare
    two payloads, never to predict what the tape will look like.

    Reads the greyscale plane with tobytes() (one byte per pixel, row-major) rather than
    point()/load()/getdata(): those are variously deprecated in Pillow 14 or untypeable
    against its stubs, and this is a committed tool that should not start warning.
    """
    im = Image.open(png).convert("L")
    w, h = im.size
    raw = im.tobytes()
    n = 0
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for i, v in enumerate(raw):
        if v < thresh:
            x = i % w
            y = i // w
            n += 1
            if x < x0: x0 = x
            if x > x1: x1 = x
            if y < y0: y0 = y
            if y > y1: y1 = y
    return {"ink": n, "size": [w, h], "bbox": None if x1 < 0 else [x0, y0, x1, y1]}


def xobjects(pdf):
    """Images the PDF CONTAINS. One present here but absent from the ink is a picture
    the engine parsed and then never painted — how the multi-foreignObject bug hid."""
    r = subprocess.run(["pdfimages", "-list", pdf], capture_output=True, text=True)
    return [ln for ln in r.stdout.splitlines()[2:] if ln.strip()]


def main():
    # --paper is pulled out before the positionals so every existing invocation in the
    # docs and in npm run render keeps working unchanged.
    argv = sys.argv[1:]
    paper_mm = 80
    if "--paper" in argv:
        i = argv.index("--paper")
        if i + 1 >= len(argv):
            sys.exit("--paper needs a roll width in mm, e.g. --paper 58")
        try:
            paper_mm = int(argv[i + 1])
        except ValueError:
            sys.exit("--paper needs a whole number of mm, got %r" % argv[i + 1])
        if paper_mm <= 8:
            sys.exit("--paper must exceed 8mm; the page is roll-8mm")
        del argv[i:i + 2]
    if not argv:
        sys.exit("usage: <payload html on stdin> | python3 tools/rig.py <case-name> "
                 "[avatar-attr] [--paper MM]")
    stem = argv[0]
    avatar_attr = argv[1] if len(argv) > 1 else None
    out = render(sys.stdin.read(), stem, avatar_attr, paper_mm=paper_mm)
    if "error" in out:
        print(json.dumps(out, indent=1))
        sys.exit(1)
    res = ink(out["png"])
    res["case"] = stem
    # Report the roll every run was measured on. A number recorded without its paper is
    # how the old 72mm default went unnoticed.
    res["paper_mm"] = paper_mm
    res["images_in_pdf"] = len(xobjects(out["pdf"]))
    res["artifacts"] = {k: os.path.relpath(v, REPO) for k, v in out.items()}
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
