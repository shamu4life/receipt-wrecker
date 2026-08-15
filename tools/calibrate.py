#!/usr/bin/env python3
"""Build a test print that identifies how the printer turns grey into burnt dots.

WHY THIS EXISTS. Nothing in this repo can observe the greyscale->1-bit step. The engine
bench (tools/rig.py) stops at wkhtmltopdf + pdftoppm, and both emit CONTINUOUS TONE: a
256-level ramp comes back with all 256 levels. The quantisation happens further down, in
printer-bot's rasteriser, the driver, or the head itself. So the repo has been carrying
two contradictory guesses about it — the app's Thermal preview does Atkinson error
diffusion, and rig.py's ink() hard-thresholds at 128 — with no evidence for either.
The field says a photo prints halftoned rather than posterised, which rules OUT a plain
threshold, but it does not say which diffusion. Only a physical print can.

WHAT IT PRINTS. One PNG, five bands:

  A  continuous-tone grey patches. THIS IS THE ACTUAL PROBE. Whatever texture comes
     back is the downstream algorithm's own signature:
       * flat black and white, no texture      -> a hard threshold
       * organic non-repeating speckle         -> error diffusion (compare B and C)
       * a regular repeating crosshatch        -> an ordered/Bayer driver halftone
  B  the same levels, pre-dithered here with Atkinson (what the preview assumes)
  C  the same levels, pre-dithered here with Floyd-Steinberg
  D  the same levels, pre-dithered here with ordered Bayer 8x8
  E  a dot ruler: a 1px checkerboard, then 1/2/3/4-dot line pairs

  Read it by finding which of B/C/D has the same texture as A. Band E confirms the
  image survived at 1:1 and shows the finest pair of lines the head resolves.

THE 1:1 RULE, which is the whole reason this is a PNG and not an SVG of <rect>s. The
engine draws 1 CSS px as 2.119 device dots, so a pre-dithered patch drawn at any width
that is not its own pixel count over that ratio gets RESAMPLED, and a resampled dither is
grey mush that proves nothing. Measured by rendering an image with 1px black columns at
its own left and right edges and reading the distance between them: 1 CSS px is 2.119
dots, so a 498-dot image lands EXACTLY 498 dots wide at 235 CSS px and nowhere else
(234 -> 496, 236 -> 500, 240 -> 509, which also exceeds the 508-dot body and clamps).
The image is therefore built exactly BODY_DOTS wide and MUST be drawn at DRAW_PX.
Do not round this from a nicer-looking ratio; 2.11 gives 236 and 236 is wrong.

Usage:
    python3 tools/calibrate.py                 # writes .render/calibration.png + the payload
    python3 tools/calibrate.py --check         # also renders it through the engine bench

Then upload the PNG through the app (Image block -> Upload) and paste the payload into
chat as a Cheer100, or feed the emitted markup straight to tools/rig.py.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:                                             # pragma: no cover
    sys.exit("This needs Pillow: python3 -m pip install --user Pillow")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, ".render")

# Measured on the engine at --paper 80 with an edge-framed probe (see the module note).
# DRAW_PX is what makes the pre-dithered bands meaningful; --check verifies it rather
# than trusting the arithmetic, because the rounding here has already been wrong once.
BODY_DOTS = 498
DOTS_PER_CSS_PX = 2.119
DRAW_PX = int(round(BODY_DOTS / DOTS_PER_CSS_PX))               # 235

LEVELS = [26, 64, 102, 128, 153, 191, 230]                      # ~10..90%
PATCH_H = 34
GAP = 6

BAYER8 = [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
]


def _bands(n):
    """x ranges for n equal patches across the body, with gaps."""
    w = (BODY_DOTS - GAP * (n - 1)) // n
    return [(i * (w + GAP), i * (w + GAP) + w) for i in range(n)]


def continuous(im, y0):
    for (x0, x1), v in zip(_bands(len(LEVELS)), LEVELS):
        for y in range(y0, y0 + PATCH_H):
            for x in range(x0, x1):
                im.putpixel((x, y), v)


def _diffuse(im, y0, kernel, divisor):
    """Error diffusion over the patch row, in place, from the flat levels."""
    for (x0, x1), v in zip(_bands(len(LEVELS)), LEVELS):
        w, h = x1 - x0, PATCH_H
        buf = [[float(v)] * w for _ in range(h)]
        for yy in range(h):
            for xx in range(w):
                old = buf[yy][xx]
                new = 0.0 if old < 128 else 255.0
                err = (old - new) / divisor
                buf[yy][xx] = new
                for dx, dy, wt in kernel:
                    nx, ny = xx + dx, yy + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        buf[ny][nx] += err * wt
                im.putpixel((x0 + xx, y0 + yy), int(new))


# Atkinson leaks 2/8 of the error, which is why its highlights lift out.
ATKINSON = [(1, 0, 1), (2, 0, 1), (-1, 1, 1), (0, 1, 1), (1, 1, 1), (0, 2, 1)]
FLOYD = [(1, 0, 7), (-1, 1, 3), (0, 1, 5), (1, 1, 1)]


def ordered(im, y0):
    for (x0, x1), v in zip(_bands(len(LEVELS)), LEVELS):
        for yy in range(PATCH_H):
            for xx in range(x1 - x0):
                t = (BAYER8[yy % 8][xx % 8] + 0.5) * 255.0 / 64.0
                im.putpixel((x0 + xx, y0 + yy), 0 if v < t else 255)


def ruler(im, y0):
    """1px checkerboard, then 1/2/3/4-dot line pairs. Survives only at 1:1."""
    for y in range(y0, y0 + 16):
        for x in range(BODY_DOTS // 2):
            im.putpixel((x, y), 0 if (x + y) % 2 == 0 else 255)
    x = BODY_DOTS // 2 + 10
    for width in (1, 2, 3, 4):
        for _ in range(2):
            for dx in range(width):
                if x + dx < BODY_DOTS:
                    for y in range(y0, y0 + 16):
                        im.putpixel((x + dx, y), 0)
            x += width * 2
        x += 6


def ticks(im, y0, n):
    """n short bars down the left margin, so a band is identifiable with no type."""
    for i in range(n):
        for y in range(y0 + i * 4, y0 + i * 4 + 2):
            for x in range(0, 10):
                if y < y0 + PATCH_H:
                    im.putpixel((x, y), 0)


def build():
    names = ["A", "B", "C", "D", "E"]
    h = len(names) * (PATCH_H + GAP * 2) + 20
    im = Image.new("L", (BODY_DOTS, h), 255)
    y = 4
    marks = {}
    for i, name in enumerate(names):
        marks[name] = y
        if name == "A":
            continuous(im, y)
        elif name == "B":
            _diffuse(im, y, ATKINSON, 8)
        elif name == "C":
            _diffuse(im, y, FLOYD, 16)
        elif name == "D":
            ordered(im, y)
        else:
            ruler(im, y)
        ticks(im, y, i + 1)
        y += PATCH_H + GAP * 2
    # 1px black columns at the extreme left and right edges: they make the drawn width
    # measurable by --check, and on the tape they show at a glance whether the strip
    # printed whole or lost an edge.
    for yy in range(im.size[1]):
        im.putpixel((0, yy), 0)
        im.putpixel((BODY_DOTS - 1, yy), 0)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "calibration.png")
    im.save(path)
    return path, im.size, marks


def main():
    path, size, marks = build()
    print("wrote %s  %dx%d" % (path, size[0], size[1]))
    print("DRAW IT AT width=\"%d\" — any other width resamples the dither and the test"
          " means nothing." % DRAW_PX)
    print()
    print("bands (1 tick = A, 2 = B, ...):")
    for k, v in marks.items():
        print("  %s  y=%d  %s" % (k, v, {
            "A": "continuous tone — THE PROBE. Its texture is the printer's own algorithm.",
            "B": "pre-dithered Atkinson (what the app's preview assumes)",
            "C": "pre-dithered Floyd-Steinberg",
            "D": "pre-dithered ordered Bayer 8x8",
            "E": "dot ruler: 1px checkerboard + 1/2/3/4-dot line pairs",
        }[k]))
    print()
    print("payload markup (upload the PNG first, then substitute the minted URL):")
    print('  <embed src="https://i.uwutoowo.com/<hex>.png" width="%d" style="max-width:100%%">'
          % DRAW_PX)

    if "--check" in sys.argv:
        import importlib.util
        spec = importlib.util.spec_from_file_location("rig", os.path.join(REPO, "tools", "rig.py"))
        if spec is None or spec.loader is None:
            sys.exit("could not load tools/rig.py")
        rig = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(rig)
        html = '<img src="file://%s" width="%d" style="max-width:100%%;display:block">' % (path, DRAW_PX)
        out = rig.render(html, "calibration")
        if "error" in out:
            print("\nbench: %s" % out["error"])
            return
        shot = Image.open(out["png"]).convert("L")
        w, hh = shot.size
        raw = shot.tobytes()                     # one byte per pixel, row-major (see rig.ink)
        # Contiguous ink bands down the page: avatar, title, subtitle, MESSAGE, date.
        # Taking the message band is what makes this unambiguous — the earlier
        # "row with the most alternations" heuristic kept landing on a pre-dithered
        # band, which is also pure black and white, and reported nonsense.
        bands = []
        start = -1
        for y in range(hh):
            inked = any(raw[y * w + x] < 128 for x in range(w))
            if inked and start < 0:
                start = y
            elif not inked and start >= 0:
                bands.append((start, y - 1))
                start = -1
        if start >= 0:
            bands.append((start, hh - 1))
        if len(bands) < 4:
            print("\nbench: could not find the message band")
            return
        top = bands[3][0]

        # Width first, off the 1px edge columns the strip carries. This is the whole
        # 1:1 proof: 235 css px lands 498 dots, 234 lands 496 and 236 lands 500.
        row = raw[(top + 4) * w:(top + 5) * w]
        xs = [x for x, v in enumerate(row) if v < 128]
        drawn = (max(xs) - min(xs) + 1) if xs else 0

        # Softness must be read off a band that is pure black and white IN THE SOURCE.
        # Band A is continuous tone by design, so sampling it reports grey that is
        # supposed to be there — that mistake made this check cry wolf once already.
        # At 1:1 the source row maps to top + source_y, so read the ruler in band E.
        e_y = top + marks["E"] + 8
        soft = 0
        if e_y < hh:
            erow = raw[e_y * w:(e_y + 1) * w]
            soft = sum(1 for v in erow if 60 < v < 200)

        print("\nbench: page=%d dots, strip drawn %d dots wide (want %d), "
              "%d soft pixels across the band-E ruler" % (w, drawn, BODY_DOTS, soft))
        if drawn == BODY_DOTS and soft == 0:
            print("bench: 1:1 CONFIRMED — the strip is valid, print it")
        else:
            print("bench: NOT 1:1 — do not print this; the pre-dithered bands would be "
                  "resampled into mush. Re-derive DRAW_PX by sweeping widths.")


if __name__ == "__main__":
    main()
