#!/usr/bin/env python3
"""draw — agent static 16x16 icons (pixlib-based, stdlib only).

Sprites are char-grids mapped through PALETTE ('.' = transparent).
Outputs to out/agent/: <name>.png (native 16x16) + <name>_x16.png (NN preview) + sheet.png.
"""
import os
import pixlib as P

OUT = P.out_dir("agent")


def hx(h):
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


# Custom 16-color RPG palette (Sweetie16-ish, plus browns/skin which Sweetie16 lacks).
PALETTE = {
    ".": (0, 0, 0, 0),       # transparent
    "X": hx("1a1c2c"),       # outline / near-black
    "W": hx("f4f4f4"),       # white
    "L": hx("c0cbdc"),       # light gray
    "N": hx("8b9bb4"),       # gray
    "S": hx("3a4466"),       # slate shadow
    "R": hx("b13e53"),       # red
    "o": hx("ef7d57"),       # orange
    "y": hx("ffcd75"),       # yellow / gold
    "G": hx("38b764"),       # green
    "g": hx("a7f070"),       # light green
    "B": hx("3b5dc9"),       # blue
    "b": hx("41a6f6"),       # light blue
    "c": hx("73eff7"),       # cyan
    "p": hx("5d275d"),       # purple
    "k": hx("7a4a31"),       # wood brown
    "K": hx("a86b46"),       # light wood
    "m": hx("5a3826"),       # dark wood
}

# ---- sprites (16x16) -------------------------------------------------------

POTION = [
    "................",
    "......yyyy......",
    "......yWWy......",
    "......XWWX......",
    "......XWWX......",
    ".....XWWWWX.....",
    "....XWWooWWX....",
    "...XWoRRRRoWX...",
    "..XWoRRRRRRoWX..",
    "..XWRRcRRRRRWX..",
    "..XWRRRRRRRRWX..",
    "..XWRRRRRRRRWX..",
    "..XWRRRRRRRRWX..",
    "...XWRRRRRRWX...",
    "....XWWWWWWX....",
    ".....XXXXXX.....",
]

COIN = [
    "................",
    ".....XXXXXX.....",
    "...XXoooooXX...."[:16],
    "..XoyyyyyyoX....",
    ".XoyWyyyyyyoX...",
    ".XoWWyyyyyyyoX.."[:16],
    "XoyWyyyyyyyyyoX.",
    "XoyyyyyyyyyyyoX.",
    "XoyyyyyyyyyyyoX.",
    "XoyyyyyyyyyyyoX.",
    ".XoyyyyyyyyyoX..",
    ".XoyyyyyyyyyoX..",
    "..XoyyyyyyyoX...",
    "...XXoooooXX....",
    ".....XXXXXX.....",
    "................",
]

SWORD = [
    "................",
    ".......WX.......",
    "......XWLX......",
    "......XWLX......",
    "......XWLX......",
    "......XWLX......",
    "......XWLX......",
    "......XWLX......",
    "......XWLX......",
    "....yyyyyyyy....",
    "....yXyyyyXy....",
    ".......kk.......",
    ".......kk.......",
    ".......kk.......",
    "......XyyX......",
    "................",
]

BED = [
    "XXXXXXXXXXXXXXXX",
    "XkkkkkkkkkkkkkkX",
    "XkWWWWWWWWWWWWkX",
    "XkWLLLLLLLLLLWkX",
    "XkWWWWWWWWWWWWkX",
    "XkBBBBBBBBBBBBkX",
    "XkBbbBBBBBBBBBkX",
    "XkBBBBBBBBBBBBkX",
    "XkBBBBBBBBBBBBkX",
    "XkBBBBBBBBBBBBkX",
    "XkBBBBBBBBBBBBkX",
    "XkBBBBBBBBBBBBkX",
    "XkBBBBBBBBBBBBkX",
    "XkBBBBBBBBBBBBkX",
    "XkkkkkkkkkkkkkkX",
    "XXXXXXXXXXXXXXXX",
]

SPRITES = {"potion": POTION, "coin": COIN, "sword": SWORD, "bed": BED}

for name, s in SPRITES.items():
    assert len(s) == 16, f"{name}: {len(s)} rows (need 16)"
    for i, row in enumerate(s):
        assert len(row) == 16, f"{name} row {i}: {len(row)} cols (need 16) -> {row!r}"
        for ch in row:
            assert ch in PALETTE, f"{name} row {i}: unknown char {ch!r}"


def native(sprite):
    return [PALETTE[ch] for row in sprite for ch in row]


# ---- emit ------------------------------------------------------------------

for name, s in SPRITES.items():
    P.write_png(os.path.join(OUT, f"{name}.png"), 16, 16, native(s))
    buf = [None] * (256 * 256)
    P.blit(buf, 256, 0, 0, native(s), 16, 16, 16, ck=16)
    P.write_png(os.path.join(OUT, f"{name}_x16.png"), 256, 256, buf)

# 2x2 contact sheet at 12x on a checker
SCALE, PAD, cell = 12, 12, 16 * 12
SW = SH = PAD + 2 * (cell + PAD)
sheet = [None] * (SW * SH)
for Y in range(SH):
    for X in range(SW):
        sheet[Y * SW + X] = P.checker(X, Y, 12)
for idx, name in enumerate(["potion", "coin", "sword", "bed"]):
    gx, gy = idx % 2, idx // 2
    P.blit(sheet, SW, PAD + gx * (cell + PAD), PAD + gy * (cell + PAD),
           native(SPRITES[name]), 16, 16, SCALE, ck=12)
P.write_png(os.path.join(OUT, "sheet.png"), SW, SH, sheet)

print(f"wrote {len(SPRITES)} sprites (+previews +sheet) to {OUT}")
