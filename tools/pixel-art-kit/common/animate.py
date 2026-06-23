#!/usr/bin/env python3
"""Agent animation demo: an 8-frame spinning coin.

Shows the agent path can animate: deterministic per-frame pixels (so frame
coherence is free), packed into a GameMaker-ready horizontal strip, plus a
hand-rolled animated GIF (stdlib only) and an upscaled filmstrip to view here.

Outputs into anim/agent/:
  coin_strip8.png     native 128x16 horizontal strip (8 frames) -> GM _stripN auto-slice on import
  coin_spin.gif       animated GIF (loops), open to see motion
  coin_filmstrip.png  upscaled frames in a row on checker (static, to verify frames)
"""
import os
import pixlib as P  # PNG encode + GIF encode + checker + blit

OUT = P.out_dir("anim", "agent")

W = H = 16
# small palette: index 0 must be transparent (for GIF transparency)
PAL = {
    ".": (0, 0, 0, 0),
    "y": (255, 205, 117, 255),  # gold fill
    "o": (239, 125, 87, 255),   # rim
    "W": (244, 244, 244, 255),  # highlight
    "X": (26, 28, 44, 255),     # dark edge
}
# apparent half-width per frame as a coin spins about its vertical axis
# (|cos| over 8 steps): full -> narrow -> edge -> narrow -> full(back) -> ...
RX = [6.0, 4.2, 1.2, 4.2, 6.0, 4.2, 1.2, 4.2]
FRONT = [True, True, False, False, False, False, False, True]  # highlight only on the front face
RY = 6.0
CX = CY = 7.5


def frame(rx, front):
    g = [["."] * W for _ in range(H)]
    if rx < 2.0:  # edge-on: a thin 2px rim bar
        for y in range(2, 14):
            g[y][7] = "o"
            g[y][8] = "o"
        g[2][7] = g[2][8] = g[13][7] = g[13][8] = "X"
        return ["".join(r) for r in g]
    inner_rx, inner_ry = rx - 1.3, RY - 1.3
    for y in range(H):
        for x in range(W):
            dx, dy = x - CX, y - CY
            if (dx / rx) ** 2 + (dy / RY) ** 2 <= 1.0:
                inside_inner = (dx / inner_rx) ** 2 + (dy / inner_ry) ** 2 <= 1.0
                g[y][x] = "y" if inside_inner else "o"
    if front:  # upper-left glint
        for (hx, hy) in ((6, 4), (7, 4), (6, 5)):
            if g[hy][hx] != ".":
                g[hy][hx] = "W"
    return ["".join(r) for r in g]


FRAMES = [frame(RX[i], FRONT[i]) for i in range(8)]

# ---- native horizontal strip (GameMaker-ready) -----------------------------

strip = [(0, 0, 0, 0)] * (W * len(FRAMES) * H)
SW = W * len(FRAMES)
for f, grid in enumerate(FRAMES):
    for y in range(H):
        for x in range(W):
            strip[y * SW + f * W + x] = PAL[grid[y][x]]
P.write_png(os.path.join(OUT, f"coin_strip{len(FRAMES)}.png"), SW, H, strip)  # GM _stripN auto-slice

# ---- upscaled filmstrip (static, to verify) --------------------------------

scale, pad = 10, 8
cw = W * scale
FW = pad + len(FRAMES) * (cw + pad)
FH = pad * 2 + cw
film = [None] * (FW * FH)
for Y in range(FH):
    for X in range(FW):
        film[Y * FW + X] = P.checker(X, Y, 10)
for f, grid in enumerate(FRAMES):
    px = [PAL[grid[y][x]] for y in range(H) for x in range(W)]
    P.blit(film, FW, pad + f * (cw + pad), pad, px, W, H, scale, ck=10)
P.write_png(os.path.join(OUT, "coin_filmstrip.png"), FW, FH, film)

# ---- animated GIF (via the shared encoder in preview.py) -------------------

rgba_frames = [[PAL[g[y][x]] for y in range(H) for x in range(W)] for g in FRAMES]
P.write_gif(os.path.join(OUT, "coin_spin.gif"), rgba_frames, W, H, delay_cs=8)

print(f"agent anim: {len(FRAMES)} frames -> coin_strip{len(FRAMES)}.png ({SW}x{H}), coin_spin.gif, coin_filmstrip.png")
