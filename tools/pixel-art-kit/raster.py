#!/usr/bin/env python3
"""raster — drawing primitives for prototype sprite scripts (pure Python stdlib).

The project's pixel art is hard: a 32 px world cell, every pixel fully opaque or fully clear
(entities are alpha-tested billboards), colors from AAP-64 (`palette`), and a 1 px ink outline
around each silhouette. Two buffers get there:

  Canvas  hard-alpha, 1 unit = 1 pixel. Draw in palette tones, `shade` a rim along the ramps,
          `outline` last. The native idiom for 16-32 px cells.
  Soft    shapes composited at `ss`x and box-downsampled, for curves and rotated quads that are
          a pain to place by hand. It never leaves the kit soft: `harden` thresholds the alpha,
          snaps every color to the palette and returns a Canvas, which is then shaded and
          outlined like any other. `soft_frame` does draw -> harden -> outline in one call.

Both finish as a flat list of (r, g, b, a) tuples, row-major, which `pixlib.write_png` takes.

    import os, raster as R, pixlib as P, palette as PAL

    c = R.Canvas(32, 32)
    c.rect(4, 12, 27, 31, PAL.tone("leather", 3))
    c.shade()                      # lit from above: top rim a tone lighter, bottom a tone darker
    c.outline()                    # ink the silhouette — run last
    P.write_png(os.path.join(P.out_dir("crate"), "pixCrate.png"), 32, 32, c.px)
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixlib as P
import palette as PAL

TRANSPARENT = (0, 0, 0, 0)
INK = PAL.INK


def _rgba(c):
    return c if len(c) == 4 else (c[0], c[1], c[2], 255)


# ---- hard-alpha raster ------------------------------------------------------

class Canvas:
    """A w x h hard-alpha pixel buffer. Colors are (r, g, b) or (r, g, b, a) tuples; `None` is a
    no-op so a drawing routine can switch a detail off without branching at the call site."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [TRANSPARENT] * (w * h)

    def get(self, x, y):
        return self.px[y * self.w + x] if 0 <= x < self.w and 0 <= y < self.h else TRANSPARENT

    def set(self, x, y, c):
        if c is not None and 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = _rgba(c)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def hline(self, x0, x1, y, c):
        self.rect(x0, y, x1, y, c)

    def vline(self, x, y0, y1, c):
        self.rect(x, y0, x, y1, c)

    def disc(self, cx, cy, r, c):
        # r*r + r, not r*r: a bare r*r reads as a diamond at small radii, r+0.5 as a square.
        rr = r * r + r
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= rr:
                    self.set(x, y, c)

    def paste(self, other, ox, oy):
        """Composite the opaque pixels of another Canvas at (ox, oy) — a held item, a garment."""
        for y in range(other.h):
            for x in range(other.w):
                c = other.px[y * other.w + x]
                if c[3]:
                    self.set(ox + x, oy + y, c)

    def quantize(self):
        """Snap every opaque pixel to its nearest palette entry (OKLab)."""
        self.px = [(PAL.nearest(c) + (255,)) if c[3] else TRANSPARENT for c in self.px]

    def shade(self, lit=(0, -1), n=1):
        """Rim-shade along the palette ramps: an opaque pixel whose neighbor toward `lit` is clear
        steps n tones lighter, one whose neighbor away from it is clear steps n darker. Off the frame
        counts as covered, so a foot-anchored subject keeps its bottom row flat. Run before outline."""
        src = self.px[:]
        lx, ly = lit

        def clear(x, y):
            return 0 <= x < self.w and 0 <= y < self.h and src[y * self.w + x][3] == 0

        for y in range(self.h):
            for x in range(self.w):
                c = src[y * self.w + x]
                if not c[3]:
                    continue
                if clear(x + lx, y + ly):
                    self.px[y * self.w + x] = PAL.step(c, n) + (255,)
                elif clear(x - lx, y - ly):
                    self.px[y * self.w + x] = PAL.step(c, -n) + (255,)

    def outline(self, c=INK):
        """Ink every transparent pixel that touches an opaque one (4-connected, so corners stay
        clean) — the 1 px outline. Run last. A subject flush with an edge gets no outline there,
        which is what foot-anchored art wants at the bottom row."""
        src = self.px[:]
        c = _rgba(c)
        for y in range(self.h):
            for x in range(self.w):
                if src[y * self.w + x][3] != 0:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src[ny * self.w + nx][3] != 0:
                        self.px[y * self.w + x] = c
                        break


# ---- supersampled soft-shape raster ----------------------------------------

class Soft:
    """A w x h frame rendered at `ss`x internally. Shape coordinates are in OUTPUT pixels
    (0..w, 0..h) and may be fractional — the supersampling is internal. Finish with `harden`."""

    def __init__(self, w, h, ss=4):
        self.ow, self.oh, self.ss = w, h, ss
        self.bw, self.bh = w * ss, h * ss
        self.d = [[0.0, 0.0, 0.0, 0.0] for _ in range(self.bw * self.bh)]

    def over(self, x, y, col, a=1.0):
        """Source-over composite one supersample-space pixel."""
        if x < 0 or x >= self.bw or y < 0 or y >= self.bh or a <= 0:
            return
        px = self.d[y * self.bw + x]
        na = a + px[3] * (1 - a)
        if na <= 0:
            return
        for k in range(3):
            px[k] = (col[k] * a + px[k] * px[3] * (1 - a)) / na
        px[3] = na

    def rrect(self, x0, y0, x1, y1, r, col, a=1.0):
        s = self.ss
        x0 *= s; y0 *= s; x1 *= s; y1 *= s; r *= s
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                cx = min(max(x, x0 + r), x1 - r)
                cy = min(max(y, y0 + r), y1 - r)
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.over(x, y, col, a)

    def ellipse(self, cx, cy, rx, ry, col, a=1.0):
        s = self.ss
        cx *= s; cy *= s; rx *= s; ry *= s
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.over(x, y, col, a)

    def tri(self, pts, col, a=1.0):
        s = self.ss
        xs = [p[0] * s for p in pts]
        ys = [p[1] * s for p in pts]

        def sg(ax, ay, bx, by, cx, cy):
            return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)

        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                d1 = sg(x, y, xs[0], ys[0], xs[1], ys[1])
                d2 = sg(x, y, xs[1], ys[1], xs[2], ys[2])
                d3 = sg(x, y, xs[2], ys[2], xs[0], ys[0])
                if not (((d1 < 0) or (d2 < 0) or (d3 < 0)) and ((d1 > 0) or (d2 > 0) or (d3 > 0))):
                    self.over(x, y, col, a)

    def thickline(self, x0, y0, x1, y1, w, col, a=1.0):
        """A thick line is a rotated quad — two triangles."""
        dx = x1 - x0
        dy = y1 - y0
        L = math.hypot(dx, dy) or 1
        px = -dy / L * w / 2
        py = dx / L * w / 2
        p = [(x0 + px, y0 + py), (x1 + px, y1 + py), (x1 - px, y1 - py), (x0 - px, y0 - py)]
        self.tri([p[0], p[1], p[2]], col, a)
        self.tri([p[0], p[2], p[3]], col, a)

    def resolve(self):
        """Box-downsample to a flat list of RGBA tuples, anti-aliased — a preview, not a sprite."""
        s = self.ss
        n = s * s
        out = [TRANSPARENT] * (self.ow * self.oh)
        for y in range(self.oh):
            for x in range(self.ow):
                r = g = b = a = 0.0
                for sy in range(s):
                    for sx in range(s):
                        px = self.d[(y * s + sy) * self.bw + (x * s + sx)]
                        r += px[0] * px[3]
                        g += px[1] * px[3]
                        b += px[2] * px[3]
                        a += px[3]
                out[y * self.ow + x] = (int(r / a), int(g / a), int(b / a),
                                        int(255 * a / n)) if a > 0 else TRANSPARENT
        return out

    def harden(self, cover=0.5):
        """The hard-alpha Canvas of this frame: a pixel is opaque when at least `cover` of its
        supersamples are, and takes the nearest palette entry to its mean color."""
        c = Canvas(self.ow, self.oh)
        for i, (r, g, b, a) in enumerate(self.resolve()):
            if a >= cover * 255:
                c.px[i] = PAL.nearest((r, g, b)) + (255,)
        return c


def soft_canvas(drawfn, w, h, ss=4):
    """`drawfn(soft)` into a fresh w x h frame, hardened — a Canvas to shade / detail / outline."""
    s = Soft(w, h, ss)
    drawfn(s)
    return s.harden()


def soft_frame(drawfn, w, h, ink=INK, ss=4):
    """draw -> harden -> outline, as a flat pixel list. `ink=None` skips the outline."""
    c = soft_canvas(drawfn, w, h, ss)
    if ink is not None:
        c.outline(ink)
    return c.px
