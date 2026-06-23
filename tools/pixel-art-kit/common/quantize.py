#!/usr/bin/env python3
"""Remap any PNG (or folder of PNGs) to a fixed palette by nearest RGB — the
style-match lever for the hybrid pipeline. Use it to pull ComfyUI/img2img output
(DB32) onto the project's palette so a generated sprite sits in the existing set.

Alpha is preserved as a hard cutout (a < threshold -> transparent, else opaque).
Swap PALETTE for your game's actual sprite palette when wiring for real.

Usage:
  python quantize.py in.png out.png
  python quantize.py in_dir out_dir        # all *.png (skips *_x16 / sheet)
"""
import sys, os
import pixlib as P

# kit standard palette (Sweetie16-ish + browns) — same hexes the agent generators use.
# Swap for your game's actual sprite palette when wiring for real.
PALETTE = [
    (0x1a, 0x1c, 0x2c), (0xf4, 0xf4, 0xf4), (0xc0, 0xcb, 0xdc), (0x8b, 0x9b, 0xb4),
    (0x3a, 0x44, 0x66), (0xb1, 0x3e, 0x53), (0xef, 0x7d, 0x57), (0xff, 0xcd, 0x75),
    (0x38, 0xb7, 0x64), (0xa7, 0xf0, 0x70), (0x3b, 0x5d, 0xc9), (0x41, 0xa6, 0xf6),
    (0x73, 0xef, 0xf7), (0x5d, 0x27, 0x5d), (0x7a, 0x4a, 0x31), (0xa8, 0x6b, 0x46),
]


def quantize_file(inp, outp, alpha_thresh=128):
    w, h, px = P.read_png(inp)
    out = P.quantize_to_palette(px, PALETTE, alpha_thresh)
    os.makedirs(os.path.dirname(os.path.abspath(outp)), exist_ok=True)
    P.write_png(outp, w, h, out)


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
