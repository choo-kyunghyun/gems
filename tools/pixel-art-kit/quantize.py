#!/usr/bin/env python3
"""Lock a PNG (or folder of PNGs) onto AAP-64 by nearest color (OKLab) — the style-match lever.
Use it to pull any generator's / externally-produced art onto the palette so a sprite sits in the
existing set. Alpha becomes a hard cutout (a < threshold -> transparent).

Usage:
  python quantize.py in.png  out.png
  python quantize.py in_dir  out_dir     # all *.png (skips *_x16 / sheet)
"""
import sys, os
import pixlib as P
import palette as PAL


def quantize_file(inp, outp, alpha_thresh=128):
    w, h, px = P.read_png(inp)
    os.makedirs(os.path.dirname(os.path.abspath(outp)), exist_ok=True)
    P.write_png(outp, w, h, PAL.snap(px, alpha_thresh))


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return
    src, dst = sys.argv[1], sys.argv[2]
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        n = 0
        for f in sorted(os.listdir(src)):
            if f.endswith(".png") and "_x16" not in f and f != "sheet.png":
                quantize_file(os.path.join(src, f), os.path.join(dst, f))
                n += 1
        print(f"quantized {n} PNGs -> {dst}")
    else:
        quantize_file(src, dst)
        print(f"quantized -> {dst}")


if __name__ == "__main__":
    main()
