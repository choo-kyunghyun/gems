#!/usr/bin/env python3
"""spritesize — pick a grid-snapped frame size from a sprite's silhouette (style-agnostic, stdlib only).

Turns "what aspect ratio should this be?" into a calculation instead of a guess. The frame is a bounding
box; the rule is two steps: (1) MEASURE the subject's opaque alpha bbox, (2) SNAP each dimension UP to the
size MENU (multiples of the 16px half-unit) with a little margin so the outline + air fit. The result is
the smallest grid-friendly W x H that contains the subject — which naturally yields 1:2 for a standing
biped, ~1.5:1 for a pistol, ~3:1 for a long rifle, etc.

Carries NO project sizes — only the menu + the snap logic.

  python spritesize.py <image.png> [foot|center]   # prints the measured bbox + recommended W x H
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # so `import pixlib` resolves standalone
import pixlib as P

# Allowed frame dimensions: multiples of the 16px half-unit. Keeps origins on-grid and the texture page
# packing clean; restricting to a menu is what makes sizes consistent across a sprite set.
MENU = [16, 32, 48, 64, 80, 96, 128]


def snap_up(v):
    """Smallest MENU value >= v (clamped to the largest)."""
    for m in MENU:
        if m >= v:
            return m
    return MENU[-1]


def alpha_bbox(px, w, h, thresh=8):
    """(bw, bh) of the opaque content (alpha >= thresh) in a flat w*h RGBA list, or (0, 0) if empty."""
    x0 = y0 = 1 << 30
    x1 = y1 = -1
    for y in range(h):
        row = y * w
        for x in range(w):
            if px[row + x][3] >= thresh:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 < 0:
        return (0, 0)
    return (x1 - x0 + 1, y1 - y0 + 1)


def suggest(px, w, h, thresh=8, mx=2, my=2):
    """Recommend a frame size for the subject drawn in px (a w*h RGBA list). Trims to the opaque bbox,
    adds mx/my per-side margin, snaps each up to the MENU. Returns (W, H, bw, bh) — the snapped frame plus
    the measured content size. Empty input -> a default 32x32."""
    bw, bh = alpha_bbox(px, w, h, thresh)
    if bw == 0:
        return (32, 32, 0, 0)
    return (snap_up(bw + 2 * mx), snap_up(bh + 2 * my), bw, bh)


def suggest_file(path, **kw):
    """suggest() over a PNG path."""
    w, h, px = P.read_png(path)
    return suggest(px, w, h, **{k: v for k, v in kw.items() if k in ("thresh", "mx", "my")})


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python spritesize.py <image.png> [foot|center]")
        sys.exit(2)
    path = sys.argv[1]
    anchor = sys.argv[2] if len(sys.argv) > 2 else "foot"
    W, H, bw, bh = suggest_file(path)
    ratio = f"{W / H:.2f}:1" if W >= H else f"1:{H / W:.2f}"
    print(f"{os.path.basename(path)}: content {bw}x{bh} -> frame {W}x{H} "
          f"({anchor}-anchored, ratio {ratio})")
    print(f"  write_png call: write_png(path, {W}, {H}, frame)")
