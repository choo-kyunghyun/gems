"""Builders over polylib.Mesh — every emitter winds CCW-from-outside and skips the bottom
(the runtime contract: no downward faces). Author space: x east, y south, z UP, feet z = 0."""
import math


def box(m, x0, y0, z0, x1, y1, z1, color):
    """Axis-aligned box, corners inclusive of the given bounds; five faces, no bottom."""
    a, b = (min(x0, x1), min(y0, y1), min(z0, z1)), (max(x0, x1), max(y0, y1), max(z0, z1))
    (x0, y0, z0), (x1, y1, z1) = a, b
    m.quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), color)  # top (+z)
    m.quad((x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1), color)  # south (+y)
    m.quad((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), color)  # north (-y)
    m.quad((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), color)  # east (+x)
    m.quad((x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1), color)  # west (-x)


def lathe(m, profile, n=8, cx=0.0, cy=0.0, phase=None, cap=True, color=None):
    """Surface of revolution about the vertical axis at (cx, cy). `profile` = [(r, z, color?)]
    ascending z; the band up to a point takes THAT point's color, else the `color` default.
    r may shrink to 0 at either end (an apex). `cap` tops a final r > 0 with a disc. Default
    `phase` centers one flat face due SOUTH (the face the camera reads), and an even `n` keeps
    the ring mirror-symmetric about x for the engine's flip."""
    if phase is None:
        phase = math.pi / 2 - math.pi / n
    ring = lambda r, z: [
        (cx + r * math.cos(phase + k * 2 * math.pi / n), cy + r * math.sin(phase + k * 2 * math.pi / n), z)
        for k in range(n)
    ]

    def col(i):
        if len(profile[i]) > 2:
            return profile[i][2]
        assert color is not None, "lathe: colorless profile point without a default color"
        return color

    for i in range(len(profile) - 1):
        r0, z0 = profile[i][:2]
        r1, z1 = profile[i + 1][:2]
        c = col(i + 1)
        lo, hi = ring(r0, z0), ring(r1, z1)
        for k in range(n):
            k1 = (k + 1) % n
            if r0 < 1e-6:  # rising from an apex
                m.tri(lo[k], hi[k1], hi[k], c)
            elif r1 < 1e-6:  # closing to an apex
                m.tri(lo[k], lo[k1], hi[k], c)
            else:
                m.quad(lo[k], lo[k1], hi[k1], hi[k], c)
    r, z = profile[-1][:2]
    if cap and r > 1e-6:
        top = ring(r, z)
        c = col(len(profile) - 1)
        for k in range(n):
            m.tri((cx, cy, z), top[k], top[(k + 1) % n], c)
