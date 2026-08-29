#!/usr/bin/env python3
"""style — the reference board: one of everything, drawn through the kit's own pipeline.

A crate (Canvas), a Union trooper (Soft, hardened), and the four material recipes, all in AAP-64
with the 1 px ink outline, next to the palette swatch — what a new sprite should sit beside.
The sprites also land as plain PNGs in out/style/ so `preview.py` picks them up.

Usage:  python style.py   # -> out/style/board.png + pixCrate.png, pixTrooper.png, mat_*.png
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixlib as P, raster as R, material as M, palette as PAL


def crate():
    """32x32 supply crate, foot-anchored: plywood planks, a steel band, a hazard label."""
    c = R.Canvas(32, 32)
    c.rect(4, 10, 27, 31, PAL.tone("leather", 3))
    for y in (17, 24):                                   # plank seams
        c.hline(4, 27, y, PAL.tone("leather", 2))
    c.rect(4, 20, 27, 21, PAL.tone("steel", 2))          # strapping band
    c.rect(14, 12, 25, 15, PAL.tone("hazard", 1))        # label
    c.hline(16, 23, 13, PAL.tone("ink", 0))
    c.shade()
    c.outline()
    return c


def trooper():
    """32x64 Union trooper, foot-anchored: helmet, visor, plated torso, fatigues, boots."""
    def draw(s):
        s.rrect(10, 40, 14.5, 62, 1.5, PAL.tone("slate", 1))     # legs
        s.rrect(17.5, 40, 22, 62, 1.5, PAL.tone("slate", 1))
        s.rrect(9, 58, 15, 63, 1, PAL.tone("leather", 1))        # boots
        s.rrect(17, 58, 23, 63, 1, PAL.tone("leather", 1))
        s.rrect(9, 22, 23, 42, 3, PAL.tone("slate", 2))          # torso
        s.rrect(11, 24, 21, 34, 2, PAL.tone("steel", 3))         # chest plate
        s.thickline(8, 26, 7, 40, 4, PAL.tone("slate", 1))       # arms
        s.thickline(24, 26, 25, 40, 4, PAL.tone("slate", 1))
        s.ellipse(16, 14, 7, 8, PAL.tone("steel", 4))            # helmet
        s.rrect(10.5, 13, 21.5, 17, 1.5, PAL.tone("sky", 2))     # visor
        s.rrect(13, 21, 19, 23, 1, PAL.tone("steel", 1))         # collar
    c = R.soft_canvas(draw, 32, 64)
    c.shade()
    c.outline()
    return c


MATERIALS = {  # name -> patch, in palette tones
    "regolith": lambda: M.grain(32, **PAL.dbl("rust", 2), density=0.12, seed=7),
    "basalt":   lambda: M.noise(32, **PAL.dbl("steel", 1), L=6, seed=7),
    "lichen":   lambda: M.blades(32, **PAL.dbl("bio", 1), density=0.10, seed=7),
    "water":    lambda: M.ripple(32, [PAL.tone("sky", 1)] * 2 + [PAL.tone("sky", 2), PAL.tone("sky", 3)],
                                 cyc_y=2, cyc_x=2, seed=7),
}


def board(out, sprites, mats, scale=4, pad=8):
    """palette swatch | sprites at `scale` | the materials tiled 2x2 at `scale`/2, on a checker."""
    PAL.swatch(os.path.join(out, "palette.png"))
    pw, ph, ppx = P.read_png(os.path.join(out, "palette.png"))
    cols = [(pw, ph, ppx, 1)]
    for c in sprites:
        cols.append((c.w, c.h, c.px, scale))
    for px in mats:
        tiled = [px[(y % 32) * 32 + (x % 32)] for y in range(64) for x in range(64)]
        cols.append((64, 64, tiled, scale // 2))
    W = pad + sum(w * s + pad for w, h, px, s in cols)
    H = pad + max(h * s for w, h, px, s in cols) + pad
    img = [P.checker(X, Y, 8) for Y in range(H) for X in range(W)]
    x = pad
    for w, h, px, s in cols:
        P.blit(img, W, x, H - pad - h * s, px, w, h, s, ck=8)
        x += w * s + pad
    P.write_png(os.path.join(out, "board.png"), W, H, img)


def main():
    out = P.out_dir("style")
    cr, tr = crate(), trooper()
    P.write_png(os.path.join(out, "pixCrate.png"), 32, 32, cr.px)
    P.write_png(os.path.join(out, "pixTrooper.png"), 32, 64, tr.px)
    mats = []
    for name, draw in MATERIALS.items():
        px = draw()
        mats.append(px)
        P.write_png(os.path.join(out, f"mat_{name}.png"), 32, 32, px)
    board(out, [cr, tr], mats)
    print("out/style: board.png, palette.png, pixCrate.png, pixTrooper.png, " + ", ".join(f"mat_{n}.png" for n in MATERIALS))


if __name__ == "__main__":
    main()
