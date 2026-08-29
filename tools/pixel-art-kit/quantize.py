#!/usr/bin/env python3
"""Remap a PNG (or folder of PNGs) onto a palette by nearest color (OKLab) — the style-match lever.
Use it to pull any generator's / externally-produced art onto AAP-64 so a sprite sits in the
existing set. Alpha becomes a hard cutout (a < threshold -> transparent).

Usage:
  python quantize.py in.png  out.png  [palette.gpl]     # default: the project's AAP-64
  python quantize.py in_dir  out_dir  [palette.gpl]     # all *.png (skips *_x16 / sheet)
"""
import sys, os
import pixlib as P
import palette as PAL


def quantize_file(inp, outp, palette, alpha_thresh=128):
    w, h, px = P.read_png(inp)
    out = P.quantize_to_palette(px, palette, alpha_thresh)
    os.makedirs(os.path.dirname(os.path.abspath(outp)), exist_ok=True)
    P.write_png(outp, w, h, out)


def main():
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        return
    src, dst = sys.argv[1], sys.argv[2]
    pal_path = sys.argv[3] if len(sys.argv) == 4 else PAL.GPL
    palette = P.load_palette(pal_path)
    if not palette:
        print(f"  ! no colors loaded from {pal_path} (expect a GIMP .gpl or hex-per-line rrggbb)")
        return
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        n = 0
        for f in sorted(os.listdir(src)):
            if f.endswith(".png") and "_x16" not in f and f != "sheet.png":
                quantize_file(os.path.join(src, f), os.path.join(dst, f), palette)
                n += 1
        print(f"quantized {n} PNGs -> {dst}  ({len(palette)} colors)")
    else:
        quantize_file(src, dst, palette)
        print(f"quantized -> {dst}  ({len(palette)} colors)")


if __name__ == "__main__":
    main()
