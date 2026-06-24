#!/usr/bin/env python3
"""tileset — synthesize an autotile set from ONE material texture, for either engine
autotile mode: `"dual"` (dual-grid) or `"corner"` (quarter / sub-tile).

Diffusion (or any generator) can't honor autotile edge/corner matching across frames, so we
DON'T generate the tileset — we take a single material patch and CUT the frames from it
deterministically. Because every frame is masked from the same patch, the set tiles seamlessly
BY CONSTRUCTION. Both modes are the *same* machinery: a frame's coverage is the bilinear
interpolation of 4 sub-corner bits (TL=1, TR=2, BR=4, BL=8) thresholded at 0.5 — which is
C0-continuous across a shared edge, so adjacent display tiles connect with no seam.

  dual   : 16 frames, tile-sized (size×size). Frame index == corner mask. Stack one TileLayer
           per terrain (water<sand<grass) for free A-over-B transitions.
  corner : 13 pieces, half-cell-sized (size/2 each), in the engine's frame order
           [0 fill · 1-4 outer TL/TR/BR/BL · 5-8 edge T/B/L/R · 9-12 inner TL/TR/BR/BL].
           A tile is assembled from 4 pieces picked by the 3 neighbors touching each corner
           (this script replicates a runtime's corner selectors for the seamless check). 13 pieces
           cover all 256 masks; material necessarily repeats every half-cell (inherent to the
           method — pieces are shared across quadrant positions).

Outputs (under out/<subdir>/), per mode:
  <mode>_strip<N>.png   the runtime sprite, N = frame count (GameMaker `_stripN` auto-slices it
                        into N frames on import: dual_strip16, corner_strip13)
  preview_<mode>.png    upscaled frames on a checker, to eyeball
  seamless_<mode>.png   a demo blob rendered through the tiles — proves it tiles

Usage:
  python tileset.py [material.png] [size] [out_subdir] [--mode dual|corner|both] [--heal] [--raw]
    material.png  texture (absolute, cwd-relative, or under out/). Omit -> procedural demo grass.
    size          tile pixels (default 32). corner pieces are size/2.
    out_subdir    under out/ (default tiles/<material-stem>).
    --mode        which set(s) to emit (default both).
    --heal        wrap-offset + seam-blur the patch to force tileability (a real tiling node
                  upstream is better; this is the stdlib safety net).
    --palette F   lock the output to the palette in file F (hex-per-line); omit = keep source colors.
"""
import os, sys, random
import pixlib as P

TRANSPARENT = (0, 0, 0, 0)

# corner frame order -> the sub-corner mask that synthesizes each piece (bits TL=1,TR=2,BR=4,BL=8).
# outer = only the cell-interior sub-corner on; edge = the two interior-side on; inner = the one
# cell-corner sub-corner off; fill = all on. (Derived to match a standard corner-autotile selector set.)
CORNER_MASKS = [15,           # 0  fill
                4, 8, 1, 2,   # 1-4  outer  TL, TR, BR, BL
                12, 3, 6, 9,  # 5-8  edge   top, bottom, left, right
                14, 13, 11, 7]  # 9-12 inner TL, TR, BR, BL


# ---- material patch ---------------------------------------------------------


def demo_material(S, seed=7):
    """Procedural tileable demo grass: seeded noise, wrap box-blurred to smooth blobs (tileable
    by construction), banded into a few greens. Lets the pipeline run with no ComfyUI/Aseprite."""
    rng = random.Random(seed)
    field = [rng.random() for _ in range(S * S)]
    for _ in range(3):
        nxt = [0.0] * (S * S)
        for y in range(S):
            for x in range(S):
                acc = 0.0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        acc += field[((y + dy) % S) * S + ((x + dx) % S)]
                nxt[y * S + x] = acc / 9.0
        field = nxt
    lo, hi = min(field), max(field)
    span = (hi - lo) or 1.0
    greens = [(75, 105, 47), (55, 148, 110), (106, 190, 48), (153, 229, 80)]  # demo greens
    return [greens[min(len(greens) - 1, int((v - lo) / span * len(greens)))] + (255,) for v in field]


def load_patch(path, S):
    """Sample an SxS patch from a texture of any size (wrap-tile: smaller repeats, exact is
    identity, larger is top-left cropped)."""
    w, h, px = P.read_png(path)
    return [px[(y % h) * w + (x % w)] for y in range(S) for x in range(S)]


def make_tileable(patch, S, band=3):
    """Force tileability: wrap-offset by half (so the unmatched source edges move to a central
    cross and the new edges are interior-adjacent = matching), then wrap box-blur only the cross
    band to heal it. A later palette quantize (if any) snaps the blur afterward."""
    rolled = [patch[((y - S // 2) % S) * S + ((x - S // 2) % S)] for y in range(S) for x in range(S)]
    c = S // 2
    out = list(rolled)
    for y in range(S):
        for x in range(S):
            if abs(x - c) > band and abs(y - c) > band:
                continue
            r = g = b = a = n = 0
            for dy in range(-band, band + 1):
                for dx in range(-band, band + 1):
                    pr, pg, pb, pa = rolled[((y + dy) % S) * S + ((x + dx) % S)]
                    r += pr; g += pg; b += pb; a += pa; n += 1
            out[y * S + x] = (r // n, g // n, b // n, a // n)
    return out


def prep_patch(material, S, heal=False, palette=None):
    if material:
        src = resolve(material)
        if not src:
            return None, None
        patch, label = load_patch(src, S), src
    else:
        patch, label = demo_material(S), "procedural grass"
    if heal:
        patch = make_tileable(patch, S)
    if palette:
        patch = P.quantize_to_palette(patch, palette)
    return patch, label


# ---- coverage + frame synthesis --------------------------------------------


def coverage(mask, S):
    """Boolean SxS coverage = bilinear interp of the 4 sub-corner bits, thresholded at 0.5."""
    tl = 1.0 if mask & 1 else 0.0
    tr = 1.0 if mask & 2 else 0.0
    br = 1.0 if mask & 4 else 0.0
    bl = 1.0 if mask & 8 else 0.0
    cov = [False] * (S * S)
    for y in range(S):
        w = (y + 0.5) / S
        for x in range(S):
            u = (x + 0.5) / S
            top = tl * (1 - u) + tr * u
            bot = bl * (1 - u) + br * u
            cov[y * S + x] = (top * (1 - w) + bot * w) >= 0.5
    return cov


def synth(patch, S, masks):
    """One frame per mask: the patch where the mask's coverage is set, else transparent."""
    return [[patch[i] if cov[i] else TRANSPARENT for i in range(S * S)]
            for cov in (coverage(m, S) for m in masks)]


# ---- engine corner selectors (standard corner-autotile selectors) ----------
# neighbor bits: N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128


def _ctl(m):
    if not (m & 1) and not (m & 8): return 1
    if (m & 1) and not (m & 8): return 7
    if not (m & 1) and (m & 8): return 5
    return 0 if (m & 128) else 9


def _ctr(m):
    if not (m & 1) and not (m & 2): return 2
    if (m & 1) and not (m & 2): return 8
    if not (m & 1) and (m & 2): return 5
    return 0 if (m & 16) else 10


def _cbr(m):
    if not (m & 4) and not (m & 2): return 3
    if (m & 4) and not (m & 2): return 8
    if not (m & 4) and (m & 2): return 6
    return 0 if (m & 32) else 11


def _cbl(m):
    if not (m & 4) and not (m & 8): return 4
    if (m & 4) and not (m & 8): return 7
    if not (m & 4) and (m & 8): return 6
    return 0 if (m & 64) else 12


# ---- outputs ----------------------------------------------------------------


def write_strip(out, mode, frames, S):
    n = len(frames)
    sw = n * S
    strip = [TRANSPARENT] * (sw * S)
    for f, fr in enumerate(frames):
        for y in range(S):
            for x in range(S):
                strip[y * sw + f * S + x] = fr[y * S + x]
    P.write_png(os.path.join(out, f"{mode}_strip{n}.png"), sw, S, strip)  # GM _stripN auto-slice


def write_preview(out, mode, frames, S, cols, scale=6, pad=6):
    cw = S * scale
    rows = (len(frames) + cols - 1) // cols
    fw = pad + cols * (cw + pad)
    fh = pad + rows * (cw + pad)
    img = [P.checker(X, Y, scale) for Y in range(fh) for X in range(fw)]
    for i, fr in enumerate(frames):
        ox = pad + (i % cols) * (cw + pad)
        oy = pad + (i // cols) * (cw + pad)
        P.blit(img, fw, ox, oy, fr, S, S, scale, ck=scale)
    P.write_png(os.path.join(out, f"preview_{mode}.png"), fw, fh, img)


def _demo_data(cols, rows):
    """A blob (disc + a rectangular peninsula) to exercise edges, corners and saddles."""
    grid = [[0] * cols for _ in range(rows)]
    ccx, ccy, rad = cols * 0.5, rows * 0.5, min(cols, rows) * 0.33
    for r in range(rows):
        for c in range(cols):
            if (c + 0.5 - ccx) ** 2 + (r + 0.5 - ccy) ** 2 <= rad * rad:
                grid[r][c] = 1
    for r in range(rows // 2, rows // 2 + 2):
        for c in range(cols - 3, cols):
            grid[r][c] = 1
    return grid


def _blit_flat(img, w, ox, oy, fr, S):
    for y in range(S):
        for x in range(S):
            px = fr[y * S + x]
            if px[3]:
                img[(oy + y) * w + (ox + x)] = (px[0], px[1], px[2], 255)


def _upscale(img, w, h, scale):
    uw, uh = w * scale, h * scale
    return uw, uh, [img[(Y // scale) * w + (X // scale)] for Y in range(uh) for X in range(uw)]


def write_seamless_dual(out, frames, S, scale=3):
    cols, rows = 12, 9
    grid = _demo_data(cols, rows)
    txn, tyn = cols - 1, rows - 1
    w, h = txn * S, tyn * S
    img = [(40, 44, 52, 255)] * (w * h)
    for ty in range(tyn):
        for tx in range(txn):
            mask = (grid[ty][tx] + grid[ty][tx + 1] * 2
                    + grid[ty + 1][tx + 1] * 4 + grid[ty + 1][tx] * 8)
            _blit_flat(img, w, tx * S, ty * S, frames[mask], S)
    uw, uh, up = _upscale(img, w, h, scale)
    P.write_png(os.path.join(out, "seamless_dual.png"), uw, uh, up)


def write_seamless_corner(out, pieces, Q, scale=3):
    cols, rows = 12, 9
    grid = _demo_data(cols, rows)

    def solid(c, r):
        return 1 if (0 <= r < rows and 0 <= c < cols and grid[r][c]) else 0

    w, h = cols * Q * 2, rows * Q * 2
    img = [(40, 44, 52, 255)] * (w * h)
    for r in range(rows):
        for c in range(cols):
            if not grid[r][c]:
                continue
            m = (solid(c, r - 1) | solid(c + 1, r) << 1 | solid(c, r + 1) << 2 | solid(c - 1, r) << 3
                 | solid(c + 1, r - 1) << 4 | solid(c + 1, r + 1) << 5
                 | solid(c - 1, r + 1) << 6 | solid(c - 1, r - 1) << 7)
            cx, cy = c * Q * 2, r * Q * 2
            _blit_flat(img, w, cx, cy, pieces[_ctl(m)], Q)
            _blit_flat(img, w, cx + Q, cy, pieces[_ctr(m)], Q)
            _blit_flat(img, w, cx + Q, cy + Q, pieces[_cbr(m)], Q)
            _blit_flat(img, w, cx, cy + Q, pieces[_cbl(m)], Q)
    uw, uh, up = _upscale(img, w, h, scale)
    P.write_png(os.path.join(out, "seamless_corner.png"), uw, uh, up)


# ---- cli --------------------------------------------------------------------


def resolve(path):
    for cand in (path, os.path.join(P.OUT, path)):
        if os.path.isfile(cand):
            return cand
    return None


def main():
    args = sys.argv[1:]
    heal = "--heal" in args
    mode = args[args.index("--mode") + 1] if "--mode" in args else "both"
    pal_val = args[args.index("--palette") + 1] if "--palette" in args else None
    palette = P.load_palette(pal_val) if pal_val else None
    pos = [a for a in args if not a.startswith("--")
           and a not in ("dual", "corner", "both") and a != pal_val]

    material = pos[0] if pos else None
    S = int(pos[1]) if len(pos) > 1 else 32
    Q = S // 2
    if len(pos) > 2:
        sub = pos[2]
    else:
        stem = os.path.splitext(os.path.basename(material))[0] if material else "grass"
        sub = os.path.join("tiles", stem)
    out = P.out_dir(sub)

    did = []
    if mode in ("dual", "both"):
        patch, label = prep_patch(material, S, heal, palette)
        if patch is None:
            print(f"  ! material not found: {material} (also tried under out/)"); return
        frames = synth(patch, S, range(16))
        write_strip(out, "dual", frames, S)
        write_preview(out, "dual", frames, S, cols=4)
        write_seamless_dual(out, frames, S)
        did.append(f"dual (16x{S})")
    if mode in ("corner", "both"):
        patch, label = prep_patch(material, Q, heal, palette)
        if patch is None:
            print(f"  ! material not found: {material} (also tried under out/)"); return
        pieces = synth(patch, Q, CORNER_MASKS)
        write_strip(out, "corner", pieces, Q)
        write_preview(out, "corner", pieces, Q, cols=5)
        write_seamless_corner(out, pieces, Q)
        did.append(f"corner (13x{Q})")

    tag = "palette" if palette else "raw"
    print(f"tileset from {label} ({tag}{', healed' if heal else ''}) -> out/{sub}")
    print(f"  modes: {', '.join(did)}  (<mode>_strip<N>.png + preview_/seamless_ per mode)")


if __name__ == "__main__":
    main()
