#!/usr/bin/env python3
"""preview — render .vox models the way the game shows them, without a game run (stdlib only).

The colony camera is a fixed-yaw ortho view from the south, pitched 42° (zoomed out) to 58°
(zoomed in) off the ground plane, so of a model's faces only the TOP and the SOUTH ever show — the
same two the runtime's analytic box has. Each is lit as shMeshlit lights it under RenderMesh's
default sun (ambient = the sun's complement): tops read a step brighter than the front. The model
stands on a checker of 32 px cells centered on its footprint, one cell of margin around the canvas,
so its size and grounding read at a glance. `--yaw` turns the model a quarter at a time (what a
runtime `Mesh.yaw` shows: doors, oblong furniture).

Outputs (under out/preview/ or `--out`):
  <name>.png     one model at `--scale` (default 4) and `--pitch` (default 50)
  sheet.png      every model of the run in a grid, alphabetical — the order is printed

Usage:  python preview.py [file.vox | dir ...] [--scale N] [--pitch DEG] [--yaw 0|90|180|270] [--out SUB]
        (default: datafiles/meshes)
"""
import os, sys, math, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voxlib as V
import palette as PAL

MESHES = os.path.join(os.path.dirname(os.path.dirname(V.KIT)), "datafiles", "meshes")
SUN = (0.0, 0.33, -0.94)          # RenderMesh.SUN_DEFAULT: toward the sun, up = -z
STRENGTH = 0.5
AMBIENT = 1 - 0.9 * STRENGTH      # RenderMesh.setupLights: the sun's complement
CELL = 32
MARGIN = CELL
GROUND = ((90, 90, 100, 255), (60, 60, 70, 255))
BACK = (30, 30, 36, 255)

FACES = (  # (neighbor offset, origin offset, edge A, edge B, normal) in game coords (gz = -z)
    ((0, 0, 1), (0, 0, -1), (1, 0, 0), (0, 1, 0), (0, 0, -1)),    # TOP: lies at -(z+1)
    ((0, 1, 0), (0, 1, 0), (1, 0, 0), (0, 0, -1), (0, 1, 0)),     # SOUTH: at y+1, rising
)


def yawed(m, yaw):
    """The model turned `yaw` degrees (a multiple of 90) about the canvas center."""
    for _ in range((yaw // 90) % 4):
        sx, sy, sz = m.size
        m = V.Model((sy, sx, sz), {(y, sx - 1 - x, z): i for (x, y, z), i in m.vox.items()}, m.pal)
    return m


def render(m, scale=4, pitch=50, yaw=0):
    """(w, h, pixels) — the model over its ground checker, RGBA."""
    m = yawed(m, yaw)
    sx, sy, sz = m.size
    t = math.radians(pitch)
    c, s = math.cos(t), math.sin(t)
    x_min, x_max = -sx / 2 - MARGIN, sx / 2 + MARGIN
    y_min, y_max = (-sy / 2 - MARGIN) * c - sz * s, (sy / 2 + MARGIN) * c
    W, H = math.ceil((x_max - x_min) * scale), math.ceil((y_max - y_min) * scale)

    px = [BACK] * (W * H)
    for Y in range(H):                      # the ground: every pixel maps to one point of the plane
        gy = ((Y + 0.5) / scale + y_min) / c
        if not (-sy / 2 - MARGIN <= gy <= sy / 2 + MARGIN):
            continue
        for X in range(W):
            gx = (X + 0.5) / scale + x_min
            px[Y * W + X] = GROUND[(math.floor((gx + CELL / 2) / CELL) + math.floor((gy + CELL / 2) / CELL)) % 2]

    zbuf = [-1e30] * (W * H)
    lit = []
    for _, _, _, _, n in FACES:
        ndl = max(0.0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2])
        lit.append(AMBIENT + STRENGTH * ndl)

    def paint(p0, A, B, rgba, d0, da, db):
        ax, ay = A[0] * scale, (A[1] * c + A[2] * s) * scale
        bx, by = B[0] * scale, (B[1] * c + B[2] * s) * scale
        det = ax * by - ay * bx
        if abs(det) < 1e-9:
            return
        xs = (p0[0], p0[0] + ax, p0[0] + bx, p0[0] + ax + bx)
        ys = (p0[1], p0[1] + ay, p0[1] + by, p0[1] + ay + by)
        for Y in range(max(0, math.floor(min(ys))), min(H, math.ceil(max(ys)))):
            dy = Y + 0.5 - p0[1]
            for X in range(max(0, math.floor(min(xs))), min(W, math.ceil(max(xs)))):
                dx = X + 0.5 - p0[0]
                u = (dx * by - dy * bx) / det
                if u < 0 or u >= 1:
                    continue
                v = (ax * dy - ay * dx) / det
                if v < 0 or v >= 1:
                    continue
                i = Y * W + X
                dep = d0 + u * da + v * db
                if dep > zbuf[i]:
                    zbuf[i] = dep
                    px[i] = rgba

    for (x, y, z), idx in m.vox.items():
        r, g, b = m.color(idx)
        for f, (nb, o, A, B, n) in enumerate(FACES):
            if (x + nb[0], y + nb[1], z + nb[2]) in m.vox:
                continue
            gx, gy, gz = x - sx / 2 + o[0], y - sy / 2 + o[1], -z + o[2]
            L = lit[f]
            rgba = (min(255, round(r * L)), min(255, round(g * L)), min(255, round(b * L)), 255)
            paint(((gx - x_min) * scale, (gy * c + gz * s - y_min) * scale), A, B, rgba,
                  gy * s - gz * c, A[1] * s - A[2] * c, B[1] * s - B[2] * c)
    return W, H, px


def sheet(images, cols=6, gap=8):
    """Grid of (w, h, px) renders, bottom-left aligned in equal cells, on the background."""
    cols = min(cols, len(images))
    cw = max(w for w, h, _ in images)
    ch = max(h for w, h, _ in images)
    rows = (len(images) + cols - 1) // cols
    W, H = gap + cols * (cw + gap), gap + rows * (ch + gap)
    out = [BACK] * (W * H)
    for k, (w, h, src) in enumerate(images):
        ox = gap + (k % cols) * (cw + gap)
        oy = gap + (k // cols) * (ch + gap) + (ch - h)
        for y in range(h):
            out[(oy + y) * W + ox:(oy + y) * W + ox + w] = src[y * w:(y + 1) * w]
    return W, H, out


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--pitch", type=float, default=50)
    ap.add_argument("--yaw", type=int, default=0, choices=(0, 90, 180, 270))
    ap.add_argument("--out", default="preview")
    ap.add_argument("--chroma", type=float, default=1.0,
                    help="scale every palette color's OKLab chroma — the runtime's atmosphere dial (0.55 = a dusty noon)")
    a = ap.parse_args()
    paths = V.files(a.paths, MESHES)
    out = V.out_dir(a.out)
    images, names = [], []
    for p in paths:
        name = os.path.splitext(os.path.basename(p))[0]
        m = V.read(p)
        if a.chroma != 1.0 and m.pal is not None:
            m = V.Model(m.size, m.vox, [PAL.chroma(c, a.chroma) for c in m.pal])
        w, h, px = render(m, a.scale, a.pitch, a.yaw)
        V.write_png(os.path.join(out, name + ".png"), w, h, px)
        images.append((w, h, px))
        names.append(name)
    if len(images) > 1:
        w, h, px = sheet(images)
        V.write_png(os.path.join(out, "sheet.png"), w, h, px)
        print(f"out/{a.out}/sheet.png: " + ", ".join(names))
    else:
        print(f"out/{a.out}/{names[0]}.png")


if __name__ == "__main__":
    main()
