#!/usr/bin/env python3
"""raster — drawing primitives for prototype sprite scripts (pure Python stdlib).

Two buffers, two idioms. Both hold their own size, so a script can mix frame sizes freely:

  Canvas  hard-alpha, 1 unit = 1 pixel. Every pixel is fully opaque or fully clear —
          the classic pixel-art constraint. Good for small cells (16-32 px) where a
          soft edge just reads as mud.
  Soft    supersampled shapes composited into a float buffer, box-downsampled at the
          end. Anti-aliased curves and rotated quads at the cost of partial alpha.
          This is what the project's committed 32 px entity art was drawn with.

Both finish the same way — a flat list of (r, g, b, a) tuples, row-major, which is what
`pixlib.write_png` and `gmsprite.write` take.

    import raster as R, gmsprite as G

    c = R.Canvas(16, 16)
    c.rect(5, 6, 10, 15, (122, 96, 62, 255))
    c.outline((38, 34, 24, 255))
    G.write("pixCrate", [c.px], 16, 16, anchor="foot")
"""
import math

TRANSPARENT = (0, 0, 0, 0)
INK = (38, 34, 24)          # a dark WARM brown outline — reads better than cold near-black


# ---- hard-alpha raster ------------------------------------------------------

class Canvas:
    """A w x h hard-alpha pixel buffer. Colors are (r, g, b, a) tuples; `None` is a no-op
    so a drawing routine can switch a detail off without branching at the call site."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [TRANSPARENT] * (w * h)

    def set(self, x, y, c):
        if c is not None and 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = c

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

    def outline(self, c=INK + (255,)):
        """Ink every transparent pixel that touches an opaque one (4-connected, so corners stay
        clean). Run last. A subject flush with an edge gets no outline there — which is what
        foot-anchored art wants at the bottom row."""
        src = self.px[:]
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
    """A w x h frame rendered at `ss`x internally, then box-downsampled. Shape coordinates are
    in OUTPUT pixels (0..w, 0..h) and may be fractional — the supersampling is internal."""

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

    def outline(self, ink=INK, width=1.6, a=0.9):
        """Darken a rim where opaque meets transparent. Run last, before resolve()."""
        src = [px[:] for px in self.d]
        rad = int(width * self.ss)
        for y in range(self.bh):
            for x in range(self.bw):
                if src[y * self.bw + x][3] > 0.5:
                    continue
                hit = False
                for dy in range(-rad, rad + 1):
                    for dx in range(-rad, rad + 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < self.bw and 0 <= ny < self.bh and src[ny * self.bw + nx][3] > 0.5:
                            hit = True
                            break
                    if hit:
                        break
                if hit:
                    self.over(x, y, ink, a)

    def resolve(self):
        """Box-downsample to a flat list of RGBA tuples — the anti-aliasing happens here."""
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


def soft_frame(drawfn, w, h, ink=INK, ss=4):
    """Render `drawfn(soft)` into a fresh w x h frame: draw -> outline -> downsample."""
    s = Soft(w, h, ss)
    drawfn(s)
    if ink is not None:
        s.outline(ink)
    return s.resolve()
