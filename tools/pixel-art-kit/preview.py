#!/usr/bin/env python3
"""preview — turn any out/<dir>/*.png set into matched previews + a comparison.

Every set is judged through the SAME nearest-neighbor + checker treatment, so the comparison is
fair (pass several out/ subdirs to compare variants side by side). Pure CLI over pixlib.

Outputs (under out/):
  out/<dir>/<name>_x16.png   nearest-neighbor preview on checker (per sprite)
  out/<dir>/sheet.png        contact sheet of that set's sprites
  out/compare.png            rows = subjects, cols = sets (matched display size)

Usage:  python preview.py [dir ...]   (default: style)
"""
import os, sys
import pixlib as P

SKIP = ("_x16", "sheet", "board", "palette", "compare", "preview_", "seamless_")   # the kit's own outputs


def load_method(method):
    """name -> (w,h,pixels) for every sprite PNG in out/<method>/ (the kit's own previews skipped)."""
    folder = os.path.join(P.OUT, method)
    got = {}
    for f in sorted(os.listdir(folder)):
        name, ext = os.path.splitext(f)
        if ext == ".png" and not any(s in name for s in SKIP):
            got[name] = P.read_png(os.path.join(folder, f))
    return got


def per_method(method, sprites):
    folder = P.out_dir(method)
    for name, (w, h, px) in sprites.items():
        W, H = w * 16, h * 16
        buf = [None] * (W * H)
        P.blit(buf, W, 0, 0, px, w, h, 16, ck=16)
        P.write_png(os.path.join(folder, name + "_x16.png"), W, H, buf)
    # contact sheet (BOX-based so 16px and 32px both fit)
    BOX, PAD, cols = 192, 12, 4
    rows = (len(sprites) + cols - 1) // cols
    SW, SH = PAD + cols * (BOX + PAD), PAD + rows * (BOX + PAD)
    buf = [P.checker(0, 0)] * (SW * SH)
    for Y in range(SH):
        for X in range(SW):
            buf[Y * SW + X] = P.checker(X, Y, 12)
    for idx, name in enumerate(sorted(sprites)):
        gx, gy = idx % cols, idx // cols
        w, h, px = sprites[name]
        scale = max(1, BOX // max(w, h))
        ox = PAD + gx * (BOX + PAD) + (BOX - w * scale) // 2
        oy = PAD + gy * (BOX + PAD) + (BOX - h * scale) // 2
        P.blit(buf, SW, ox, oy, px, w, h, scale)
    P.write_png(os.path.join(folder, "sheet.png"), SW, SH, buf)


def compare(methods, loaded):
    """rows = subjects, cols = methods. BOX is a common display size so 16px and 32px
    sprites render at matched on-screen size (192 = 12x for 16, 6x for 32)."""
    subjects = sorted({n for m in methods for n in loaded[m]})
    BOX, PAD = 192, 14
    SW = PAD + len(methods) * (BOX + PAD)
    SH = PAD + len(subjects) * (BOX + PAD)
    buf = [None] * (SW * SH)
    for Y in range(SH):
        for X in range(SW):
            buf[Y * SW + X] = P.checker(X, Y, 10)
    for r, name in enumerate(subjects):
        for c, m in enumerate(methods):
            sprites = loaded[m]
            if name not in sprites:
                continue
            w, h, px = sprites[name]
            scale = max(1, BOX // max(w, h))
            ox = PAD + c * (BOX + PAD) + (BOX - w * scale) // 2
            oy = PAD + r * (BOX + PAD) + (BOX - h * scale) // 2
            P.blit(buf, SW, ox, oy, px, w, h, scale, ck=10)
    os.makedirs(P.OUT, exist_ok=True)
    P.write_png(os.path.join(P.OUT, "compare.png"), SW, SH, buf)
    print("out/compare.png:", " | ".join(methods), "(cols) x", ", ".join(subjects), "(rows)")


def main():
    methods = sys.argv[1:] or ["style"]
    methods = [m for m in methods if os.path.isdir(os.path.join(P.OUT, m))]
    loaded = {}
    for m in methods:
        sprites = load_method(m)
        loaded[m] = sprites
        per_method(m, sprites)
        print(f"{m}: {len(sprites)} sprites ->", ", ".join(sorted(sprites)))
    if methods:
        compare(methods, loaded)


if __name__ == "__main__":
    main()
