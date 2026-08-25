#!/usr/bin/env python3
"""Remap a PNG (or folder of PNGs) to a PROVIDED palette by nearest RGB — the style-match lever.
Use it to pull any generator's / externally-produced art onto the project's palette so a sprite
sits in the existing set.

Pass a palette file — `palettes/aap-64.gpl` for the project, or any GIMP `.gpl` / bare hex-per-line
file. Alpha is preserved as a hard cutout (a < threshold -> transparent).

Usage:
  python quantize.py in.png  out.png  palette.gpl
  python quantize.py in_dir  out_dir  palette.gpl        # all *.png (skips *_x16 / sheet)
"""
import sys, os
import pixlib as P


def quantize_file(inp, outp, palette, alpha_thresh=128):
    w, h, px = P.read_png(inp)
    out = P.quantize_to_palette(px, palette, alpha_thresh)
    os.makedirs(os.path.dirname(os.path.abspath(outp)), exist_ok=True)
    P.write_png(outp, w, h, out)


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return
    src, dst, pal_path = sys.argv[1], sys.argv[2], sys.argv[3]
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
