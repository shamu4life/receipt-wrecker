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
  * the page — two ways. By default, this file's own copy of the receipt container with
    the message inserted RAW, and the CSS printer-bot really prints with when
    tools/printerbot.mjs has cached it (else a hand-copied subset). That page has no
    sanitizer: since 2026-09-15 printer-bot strips everything outside its allow-list
    BEFORE this point, so markup that renders here may never reach paper. The faithful
    path is --document: tools/printerbot.mjs runs printer-bot's own sanitizer and
    cheermote pass on nutty's live files and emits the document GetRenderedHTML builds
    (its template, every stylesheet it inlines), and this renders it untouched. Checked
    on the field payload: that document matched, byte for byte apart from image paths,
    the one printer-bot's own overlay code builds when run in a browser.
  * the font — the rig is Windows, so the receipt prints in Segoe UI. It is not here
    unless you supply your own copy (--fonts); every result names the faces the PDF
    really embeds, and warns when Segoe UI is not among them.
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
    python3 tools/rig.py case-name --document .render/printerbot/receipt.html
    node tools/printerbot.mjs --out - < msg.txt | python3 tools/rig.py case --document -

  --paper MM      roll width in mm (default 80, the rig's); the page is MM-8.
  --document F    render F (a path, or - for stdin) AS-IS: a complete document, normally
                  the one tools/printerbot.mjs builds the way printer-bot's GetRenderedHTML
                  does. The PAGE template below is skipped, so nothing of ours is in it.
  --fonts DIR     add the fonts in DIR (yours: e.g. Segoe UI copied from C:\\Windows\\Fonts)
                  through a FONTCONFIG_FILE written under .render/fonts/. Linux build only;
                  this never downloads a font, and no font ever belongs in the repo.
  --embedded-css  use the embedded CSS subset even when tools/printerbot.mjs has cached
                  the real stylesheets (reproduces measurements taken before that cache).

Output is JSON on stdout: ink-pixel count, raster size, ink bounding box (all for PAGE 1,
as always), the page count, which CSS the page was rendered with and where it came from,
the fonts the PDF actually embeds, and the image XObjects present in the PDF (an image
that is in the PDF but absent from the ink is a picture the engine parsed and never
painted — the exact multi-foreignObject bug). More than one page gets a WARNING and a
per-page ink list: the page is 500mm, and a message that runs past it prints the rest
as a further page on the rig, which a page-1-only raster would never show.

Exit status: 0 rendered; 1 the render failed (or bad arguments); 3 there is no
wkhtmltopdf at all, the one case tools/printerbot.mjs may answer with an APPROXIMATE
Chromium render instead.

Artifacts go to .render/, which is gitignored: loose t*.html / *.pdf / *-1.png in the
repo root have been swept into a commit by a `git add -A` before.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

def _pil_image():
    """Pillow, imported only when a render actually needs it.

    Kept lazy so the parts of this tool that touch no pixels — the --help text, the
    argument checks, and above all the case-name guard that refuses a stem outside
    .render/ (a path-safety property, which must not hinge on an image library being
    installed) — run on a box without Pillow. CI has no Pillow, so test/rig.test.mjs
    exercises exactly that guard; a top-level import would exit before it ran.
    """
    try:
        from PIL import Image
    except ImportError:                                         # pragma: no cover
        sys.exit("This needs Pillow: python3 -m pip install --user Pillow")
    return Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, ".render")
WANT_VERSION = "0.12.6 (with patched qt)"
# The macOS .pkg reports "0.12.6 (with patched qt)" and the Linux .deb "0.12.6.1 (with
# patched qt)": the same patched Qt 4.8.7 / QtWebKit 534.34. A plain substring test
# rejected the Linux one, so match the family, not one point release.
WANT_RE = re.compile(r"0\.12\.6(\.\d+)? \(with patched qt\)")
# Exit status when there is no engine at all, distinct from a render that failed, so
# tools/printerbot.mjs can fall back to an APPROXIMATE render only in that case. A
# wkhtmltopdf that runs and fails is a finding about the payload, never a reason to
# quietly switch engines.
EXIT_NO_ENGINE = 3
# Where tools/printerbot.mjs caches the stylesheet text printer-bot really inlines.
PRINTED_CSS = os.path.join(OUT, "printerbot", "printed.css")
PRINTED_CSS_META = PRINTED_CSS + ".json"


def find_wkhtmltopdf():
    """$WKHTMLTOPDF, then PATH, then the two user-prefix installs.

    Resolved at RUN TIME and never hardcoded. A pinned absolute path is what killed the
    previous copy of this script. ~/.local/opt/bin is where the macOS .pkg's tarball
    lands; ~/.local/opt/usr/local/bin is where `dpkg -x` puts the Linux .deb.
    """
    candidates = [os.environ.get("WKHTMLTOPDF")]
    from shutil import which
    candidates.append(which("wkhtmltopdf"))
    candidates.append(os.path.expanduser("~/.local/opt/bin/wkhtmltopdf"))
    candidates.append(os.path.expanduser("~/.local/opt/usr/local/bin/wkhtmltopdf"))
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    print(
        "wkhtmltopdf not found. This bench needs " + WANT_VERSION + " specifically —\n"
        "the distro QtWebKit 5.212 build renders differently and will mislead you.\n"
        "Neither needs admin rights; point $WKHTMLTOPDF at the binary, or unpack into\n"
        "~/.local/opt where this looks:\n"
        "  macOS: https://github.com/wkhtmltopdf/packaging/releases/tag/0.12.6-2\n"
        "         pkgutil --expand-full the .pkg, untar wkhtmltox.tar.gz into ~/.local/opt\n"
        "  Linux: https://github.com/wkhtmltopdf/packaging/releases/tag/0.12.6.1-2\n"
        "         dpkg -x wkhtmltox_0.12.6.1-2.<distro>_amd64.deb ~/.local/opt",
        file=sys.stderr)
    sys.exit(EXIT_NO_ENGINE)


def check_version(wk):
    got = subprocess.run([wk, "--version"], capture_output=True, text=True).stdout.strip()
    if not WANT_RE.search(got):
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

# The classes giant type borrows. printer-bot builds the printed page with
# GetRenderedHTML, which inlines EVERY stylesheet linked from its settings page (nutty's
# shared global.css, then contents/style.css) into the document wkhtmltopdf prints. The
# sanitizer strips `style` but keeps `class`, so any class those sheets define styles our
# markup on paper: `.title` nests at 1.2x per level and is the whole of giant type. With
# no such rule here a giant payload renders at 16px and reads as "giant does not work".
#
# These are the PB_CLASSES rows of public/index.html, COPIED BY HAND (Python cannot load
# the app core) in the same compact `.cls{decl}` form pbPreviewCss emits. Change one,
# change the other. They come BEFORE the style.css subset because global.css comes first
# in the real cascade. They are only the fallback: once tools/printerbot.mjs has cached
# the real stylesheets, render() uses that text instead, and every result says which CSS
# it measured (the "css" field).
PB_CSS = """\
.title{font-weight:900;font-size:1.2em;text-transform:uppercase}
.setting-description{font-size:.9em;font-weight:100}
.setting-attribute{font-size:.8em;font-weight:200}
.switch{position:relative;display:inline-block;width:3em;height:1.5em;font-size:1em;overflow:hidden}
.dialog-nav-button{background:transparent;border:none;font-size:1.5em;font-weight:100;padding:0;width:1em;height:1em;position:fixed;top:.5em;right:.5em}
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
    im = _pil_image().new("L", (px, px), 255)
    for y in range(px):                       # a diagonal wedge: cheap, and asymmetric
        for x in range(px):                   # so a flipped or rotated draw is obvious
            if (x + y) % 24 < 12:
                im.putpixel((x, y), 0)
    im.save(path)


def warn(msg):
    print("WARNING: " + msg, file=sys.stderr)


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _cache_meta():
    try:
        with open(PRINTED_CSS_META, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def page_css(mode="auto"):
    """The stylesheet for the PAGE template, and where it came from.

    "auto" prefers the real thing: the exact text printer-bot's GetRenderedHTML inlines,
    which tools/printerbot.mjs caches together with its sha256 and when it was fetched.
    Without that cache, or with mode "embedded", it is the hand-copied subset above. The
    answer goes into every result, because a number that does not say which CSS it was
    measured against cannot be re-run, which is the failure this file exists to prevent.
    """
    if mode != "embedded" and os.path.isfile(PRINTED_CSS):
        with open(PRINTED_CSS, encoding="utf-8") as fh:
            text = fh.read()
        meta = _cache_meta() or {}
        info = {"source": "cache", "sha256": sha256(text),
                "fetched_at": meta.get("fetched_at"),
                "file": os.path.relpath(PRINTED_CSS, REPO)}
        if meta.get("sha256") and meta["sha256"] != info["sha256"]:
            info["edited"] = True                 # no longer what was fetched
        # WHERE that cache came from, carried into the result. printerbot.mjs records it
        # (`source`: live, or a repo commit under --ref; each sheet's `from`), and this
        # used to drop both: after a pinned run, every later template-mode number was
        # measured against that commit's CSS and reported as plain "cache". printerbot.mjs
        # now only rewrites the cache from a fully live run, but a file written by an older
        # copy of it can still be pinned or carry a fallback, so it is said, not assumed.
        origin = meta.get("source")
        froms = [st.get("from") for st in meta.get("stylesheets") or []]
        info["origin"] = origin
        info["stylesheets_from"] = froms
        if isinstance(origin, dict) and origin.get("sha"):
            warn("the cached printer-bot CSS (%s) was read at a PINNED commit, %s, not the "
                 "live site; run tools/printerbot.mjs once without --ref to measure against "
                 "what printer-bot loads today" % (info["file"], origin["sha"][:12]))
        if "cache" in froms:
            warn("part of the cached printer-bot CSS (%s) came from a stale cached copy "
                 "after a failed fetch, not from the live site" % info["file"])
        return text, info
    text = PB_CSS + CSS
    return text, {"source": "embedded", "sha256": sha256(text), "fetched_at": None}


def document_css(doc):
    """The <style> a complete document carries (GetRenderedHTML emits exactly one), and
    its provenance: when its hash matches the cache tools/printerbot.mjs wrote, the fetch
    time comes from there."""
    m = re.search(r"<style[^>]*>(.*?)</style>", doc, re.S | re.I)
    style = m.group(1) if m else ""
    info = {"source": "document", "sha256": sha256(style) if m else None,
            "fetched_at": None}
    meta = _cache_meta()
    if m and meta and meta.get("sha256") == info["sha256"]:
        info["fetched_at"] = meta.get("fetched_at")
        info["matches"] = os.path.relpath(PRINTED_CSS, REPO)
    return style, info


def class_tokens(doc):
    """Every class name used in a document, quoted or not."""
    out = set()
    for m in re.finditer(r"""\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", doc, re.I):
        out.update((m.group(1) or m.group(2) or m.group(3) or "").split())
    return out


def fonts_env(fonts_dir):
    """The environment for wkhtmltopdf: --fonts DIR adds the user's OWN font folder.

    The rig is Windows, so the receipt's font stack lands on Segoe UI. That face is not
    redistributable and not on Linux, and without it the engine falls back to another
    face (Liberation Sans, i.e. Arial metrics, on a stock Linux) whose line height is
    about 1.15em against Segoe UI's 1.33em, so every height measured here reads short.
    This writes a FONTCONFIG_FILE that keeps the system's fonts (Hanzi still needs a CJK
    face) and adds DIR. It never downloads a font, and no font ever belongs in the repo:
    the config and its cache live under the gitignored .render/. Linux build only; the
    macOS build finds fonts through the system, not fontconfig.
    """
    env = dict(os.environ)
    if not fonts_dir:
        return env
    d = os.path.abspath(os.path.expanduser(fonts_dir))
    if not os.path.isdir(d):
        sys.exit("--fonts: %r is not a directory" % fonts_dir)
    if sys.platform == "darwin":
        warn("--fonts has no effect on macOS: that build of wkhtmltopdf finds fonts "
             "through the system, not fontconfig. Install them in ~/Library/Fonts.")
        return env
    fdir = os.path.join(OUT, "fonts")
    os.makedirs(fdir, exist_ok=True)
    conf = os.path.join(fdir, "fonts.conf")

    def esc(t):
        return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    with open(conf, "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n'
                 '<fontconfig>\n'
                 '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n'
                 '  <dir>%s</dir>\n  <cachedir>%s</cachedir>\n</fontconfig>\n'
                 % (esc(d), esc(os.path.join(fdir, "cache"))))
    env["FONTCONFIG_FILE"] = conf
    # Say so up front when the folder cannot do what it is for. The authoritative check
    # is after the render (fonts_in_pdf); this one only names the folder's problem.
    try:
        r = subprocess.run(["fc-list", "--format", "%{family}\t%{file}\n"],
                           capture_output=True, text=True, env=env)
        fams = set()
        for ln in r.stdout.splitlines():
            fam, _, f = ln.partition("\t")
            if f.startswith(d + os.sep):
                fams.update(x.strip() for x in fam.split(","))
        if not fams:
            warn("--fonts: fontconfig found no fonts in %s" % d)
        elif "Segoe UI" not in fams:
            warn("--fonts: no Segoe UI in %s (found: %s). The rig prints in Segoe UI."
                 % (d, ", ".join(sorted(fams))))
    except FileNotFoundError:
        pass
    return env


def pdf_fonts(pdf):
    """The faces the PDF really embeds, subset prefixes stripped. This, not a font list
    or a config, is the authoritative answer to "which font did this print in"."""
    try:
        r = subprocess.run(["pdffonts", pdf], capture_output=True, text=True)
    except FileNotFoundError:
        return None
    names = []
    for ln in r.stdout.splitlines()[2:]:
        if ln.strip():
            n = re.sub(r"^[A-Z]{6}\+", "", ln.split()[0])
            if n not in names:
                names.append(n)
    return names


def page_count(pdf, pngs):
    try:
        r = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True)
        m = re.search(r"^Pages:\s+(\d+)", r.stdout, re.M)
        if m:
            return int(m.group(1))
    except FileNotFoundError:
        pass
    return len(pngs)


def print_pdf(html_path, stem, paper_mm=80, dpi=203, env=None):
    """Print one HTML file the way printer-bot's Print Routine does, rasterize EVERY page."""
    wk = find_wkhtmltopdf()
    check_version(wk)
    base = os.path.join(OUT, stem)
    os.makedirs(os.path.dirname(base), exist_ok=True)

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
           html_path, base + ".pdf"]
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        # A failed subresource whose extension is not in wkhtmltopdf's hardcoded media
        # list is FATAL — exit 1, whole job — and --load-error-handling ignore does not
        # suppress it. That is why /upload mints .png links.
        return {"error": "wkhtmltopdf exit %d" % r.returncode, "stderr": r.stderr[-800:]}

    # Every page, not only the first. The page is 500mm, and the way a tall payload fails
    # is by running past it, which a page-1-only raster shows as a clean print. Clear this
    # stem's old pages first, or a stale page 2 from an earlier run reads as a spill.
    d, prefix = os.path.dirname(base), os.path.basename(base)
    page_re = re.compile(r"^%s-(\d+)\.png$" % re.escape(prefix))
    for f in os.listdir(d):
        if page_re.match(f):
            os.remove(os.path.join(d, f))
    subprocess.run(["pdftoppm", "-png", "-r", str(dpi), base + ".pdf", base], check=True)
    pngs = sorted((f for f in os.listdir(d) if page_re.match(f)),
                  key=lambda f: int(page_re.match(f).group(1)))
    pngs = [os.path.join(d, f) for f in pngs]
    return {"png": pngs[0], "pngs": pngs, "pdf": base + ".pdf", "html": html_path,
            "pages": page_count(base + ".pdf", pngs)}


def render(message_html, stem, avatar_attr=None, bits=100, subtitle="shamu4life",
           paper_mm=80, dpi=203, fonts=None, css="auto"):
    """The message inside printer-bot's receipt PAGE (template mode)."""
    os.makedirs(OUT, exist_ok=True)
    if avatar_attr is None:
        av = os.path.join(OUT, "avatar.png")
        default_avatar(av)
        avatar_attr = 'src="%s"' % av
    style, css_info = page_css(css)
    base = os.path.join(OUT, stem)
    os.makedirs(os.path.dirname(base), exist_ok=True)
    with open(base + ".html", "w", encoding="utf-8") as fh:
        fh.write(PAGE % (style, avatar_attr, bits, subtitle, message_html))
    out = print_pdf(base + ".html", stem, paper_mm, dpi, fonts_env(fonts))
    if "error" not in out:
        out["css"] = css_info
    return out


def render_document(src, stem, paper_mm=80, dpi=203, fonts=None):
    """A complete document AS-IS (--document): nothing of ours is added to it.

    This is the mode for tools/printerbot.mjs output, which is printer-bot's own
    template, its real stylesheets and the message after its real sanitizer and
    cheermote pass. A path is rendered in place, so its relative references resolve the
    way its author meant; "-" reads stdin into .render/<stem>.html.
    """
    os.makedirs(OUT, exist_ok=True)
    if src == "-":
        doc = sys.stdin.read()
        path = os.path.join(OUT, stem + ".html")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(doc)
    else:
        path = os.path.abspath(src)
        try:
            with open(path, encoding="utf-8") as fh:
                doc = fh.read()
        except OSError as e:
            sys.exit("--document: %s" % e)
    style, css_info = document_css(doc)
    # A giant payload against CSS with no .title rule prints at 16px, and the natural
    # (wrong) reading of that is "giant type does not work".
    if "title" in class_tokens(doc) and not re.search(r"\.title(?![\w-])", style):
        warn("this document uses class=title but its CSS has no .title rule, so giant "
             "type renders at 16px here. Build it with tools/printerbot.mjs.")
    out = print_pdf(path, stem, paper_mm, dpi, fonts_env(fonts))
    if "error" not in out:
        out["css"] = css_info
    return out


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
    im = _pil_image().open(png).convert("L")
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


def confined(stem):
    """The stem, refused unless it stays under .render/.

    The stem names files this writes AND deletes: print_pdf clears every <stem>-N.png
    before rasterizing, so a stale page 2 cannot read as a spill. os.path.join honours an
    absolute stem or "..", so `rig.py /some/dir/photo` deleted photo-7.png and
    photo-12.png that were already there. printerbot.mjs only ever passes
    "printerbot/<basename>", so nothing legitimate is refused."""
    root = os.path.realpath(OUT)
    base = os.path.realpath(os.path.join(OUT, stem))
    if not base.startswith(root + os.sep):
        sys.exit("case name %r points outside %s; artifacts (and the stale pages this "
                 "clears) stay under .render/. Use a plain name like my-case or "
                 "sub/my-case." % (stem, os.path.relpath(OUT, REPO)))
    return stem


def _take(argv, flag):
    """Pull `flag VALUE` out of argv (flags come out before the positionals, so every
    existing invocation keeps working unchanged)."""
    if flag not in argv:
        return None
    i = argv.index(flag)
    if i + 1 >= len(argv):
        sys.exit("%s needs a value" % flag)
    v = argv[i + 1]
    del argv[i:i + 2]
    return v


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
    document = _take(argv, "--document")
    fonts = _take(argv, "--fonts")
    css_mode = "auto"
    if "--embedded-css" in argv:
        argv.remove("--embedded-css")
        css_mode = "embedded"
    unknown = [a for a in argv if a.startswith("--")]
    if unknown:
        sys.exit("unknown option %s" % unknown[0])

    if document is not None:
        if len(argv) > 1:
            warn("the avatar argument is ignored with --document; the document has its own")
        if argv:
            stem = argv[0]
        elif document == "-":
            stem = "document"
        else:
            stem = os.path.splitext(os.path.basename(document))[0]
        out = render_document(document, confined(stem), paper_mm=paper_mm, fonts=fonts)
    else:
        if not argv:
            sys.exit("usage: <payload html on stdin> | python3 tools/rig.py <case-name> "
                     "[avatar-attr] [--paper MM] [--fonts DIR] [--embedded-css]\n"
                     "       python3 tools/rig.py [case-name] --document FILE|- "
                     "[--paper MM] [--fonts DIR]")
        stem = confined(argv[0])
        avatar_attr = argv[1] if len(argv) > 1 else None
        out = render(sys.stdin.read(), stem, avatar_attr, paper_mm=paper_mm,
                     fonts=fonts, css=css_mode)
    if "error" in out:
        print(json.dumps(out, indent=1))
        sys.exit(1)
    res = ink(out["png"])
    res["case"] = stem
    # Report the roll every run was measured on. A number recorded without its paper is
    # how the old 72mm default went unnoticed.
    res["paper_mm"] = paper_mm
    # ink/size/bbox above are PAGE 1, as they always were. A spill gets said out loud.
    res["pages"] = out["pages"]
    if out["pages"] > 1:
        warn("%d pages. The receipt ran past one 500mm page, so the rig prints the rest "
             "as another page; ink/bbox are page 1 only (see pages_ink)." % out["pages"])
        res["pages_ink"] = []
        for i, p in enumerate(out["pngs"]):
            k = dict(res, page=1) if i == 0 else ink(p)
            res["pages_ink"].append({"page": i + 1, "ink": k["ink"], "bbox": k["bbox"],
                                     "png": os.path.relpath(p, REPO)})
    res["images_in_pdf"] = len(xobjects(out["pdf"]))
    res["css"] = out["css"]
    faces = pdf_fonts(out["pdf"])
    res["fonts_in_pdf"] = faces
    if faces and not any("segoe" in f.lower() for f in faces):
        warn("Segoe UI was not used (the PDF embeds %s). The Windows rig prints the "
             "receipt in Segoe UI; the face used here has a shorter line height (about "
             "1.15em against 1.33em), so heights read short. --fonts DIR adds your own "
             "copy (segoeui.ttf, segoeuib.ttf from C:\\Windows\\Fonts)." % ", ".join(faces))
    res["artifacts"] = {k: os.path.relpath(out[k], REPO) for k in ("png", "pdf", "html")}
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
