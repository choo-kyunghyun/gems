"""Render `.mesh` files (or in-memory polylib.Mesh) under the game camera + shMeshlit's
default sun, over a checker of 32 px cells — the vox-kit preview's twin for triangles.

  python preview.py [file | dir ...] [--scale 4] [--pitch 50] [--yaw 0] [--out preview]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polylib as P

SUN = (0.0, 0.33, -0.94)  # RenderMesh.SUN_DEFAULT: toward the sun, up = -z
STRENGTH = 0.5
AMBIENT = 1 - 0.9 * STRENGTH  # RenderMesh.setupLights: the sun's complement
CELL = 32
MARGIN = CELL
GROUND = ((90, 90, 100, 255), (60, 60, 70, 255))
BACK = (30, 30, 36, 255)


def render(source, scale=4, pitch=50, yaw=0):
    """(w, h, pixels RGBA) — a .mesh path or a polylib.Mesh, over its ground checker."""
    if isinstance(source, str):
        (cw, cd, ch), tris = P.read(source)
    else:
        cw, cd, ch = source.content()
        tris = [t for t in P.game_tris(source) if t is not None]
    if yaw % 360 != 0:
        a = math.radians(yaw)
        ca, sa = math.cos(a), math.sin(a)
        rot = lambda p: (p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca, p[2])
        tris = [(tuple(rot(p) for p in pts), c, rot((nu, nv, 0))[:2]) for pts, c, (nu, nv) in tris]
        cw = cd = max(cw, cd)
    t = math.radians(pitch)
    c, s = math.cos(t), math.sin(t)
    x_min, x_max = -cw / 2 - MARGIN, cw / 2 + MARGIN
    y_min, y_max = (-cd / 2 - MARGIN) * c - ch * s, (cd / 2 + MARGIN) * c
    W, H = math.ceil((x_max - x_min) * scale), math.ceil((y_max - y_min) * scale)

    px = [BACK] * (W * H)
    for Y in range(H):
        gy = ((Y + 0.5) / scale + y_min) / c
        if not (-cd / 2 - MARGIN <= gy <= cd / 2 + MARGIN):
            continue
        for X in range(W):
            gx = (X + 0.5) / scale + x_min
            px[Y * W + X] = GROUND[(math.floor((gx + CELL / 2) / CELL) + math.floor((gy + CELL / 2) / CELL)) % 2]

    zbuf = [-1e30] * (W * H)
    for pts, (r, g, b), (nu, nv) in tris:
        nz = -math.sqrt(max(0.0, 1 - nu * nu - nv * nv))  # the shader's decode
        ndl = max(0.0, nu * SUN[0] + nv * SUN[1] + nz * SUN[2])
        L = AMBIENT + STRENGTH * ndl
        rgba = (min(255, round(r * L)), min(255, round(g * L)), min(255, round(b * L)), 255)
        # project: X = x, Y = y cos + z sin, depth = y sin - z cos (bigger = nearer)
        sp = [((p[0] - x_min) * scale, (p[1] * c + p[2] * s - y_min) * scale, p[1] * s - p[2] * c) for p in pts]
        (x1, y1, d1), (x2, y2, d2), (x3, y3, d3) = sp
        det = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1)
        if abs(det) < 1e-9:
            continue
        for Y in range(max(0, math.floor(min(y1, y2, y3))), min(H, math.ceil(max(y1, y2, y3)))):
            for X in range(max(0, math.floor(min(x1, x2, x3))), min(W, math.ceil(max(x1, x2, x3)))):
                dx, dy = X + 0.5 - x1, Y + 0.5 - y1
                u = (dx * (y3 - y1) - dy * (x3 - x1)) / det
                v = ((x2 - x1) * dy - (y2 - y1) * dx) / det
                if u < 0 or v < 0 or u + v > 1:
                    continue
                i = Y * W + X
                dep = d1 + u * (d2 - d1) + v * (d3 - d1)
                if dep > zbuf[i]:
                    zbuf[i] = dep
                    px[i] = rgba
    return W, H, px


def sheet(images, cols=6, gap=8):
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
            for x in range(w):
                out[(oy + y) * W + ox + x] = src[y * w + x]
    return W, H, out


def write_png(path, w, h, px):
    sys.path.insert(0, os.path.join(os.path.dirname(P.KIT), "pixel-art-kit"))
    import pixlib
    pixlib.write_png(path, w, h, px)


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    opt = {a.split("=")[0][2:]: a.split("=")[1] for a in argv if a.startswith("--") and "=" in a}
    for i, a in enumerate(argv):  # --flag value form
        if a.startswith("--") and "=" not in a and i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            opt[a[2:]] = argv[i + 1]
            if argv[i + 1] in args:
                args.remove(argv[i + 1])
    paths = []
    for a in args or [P.MESHES]:
        if os.path.isdir(a):
            paths += [os.path.join(a, f) for f in sorted(os.listdir(a)) if f.endswith(".mesh")]
        else:
            paths.append(a)
    scale = int(opt.get("scale", 4))
    pitch = float(opt.get("pitch", 50))
    yaw = float(opt.get("yaw", 0))
    out = P.out_dir(opt.get("out", "preview"))
    images = []
    for p in paths:
        img = render(p, scale, pitch, yaw)
        name = os.path.splitext(os.path.basename(p))[0]
        write_png(os.path.join(out, name + ".png"), *img)
        images.append(img)
    if images:
        write_png(os.path.join(out, "sheet.png"), *sheet(images))
        print(f"{os.path.join(out, 'sheet.png')}: {len(images)} model(s)")


if __name__ == "__main__":
    main(sys.argv[1:])
