#!/usr/bin/env python3
"""Agent multi-state character: a 16x16 hero with idle / walk / attack.

All 9 frames derive from ONE base grid via simple ops (shift, leg-lift, weapon paint)
so coherence is free. Emits a combined strip (GameMaker-ready), per-state looping GIFs,
a states filmstrip to view here, and a manifest JSON mapping frame ranges -> states.

Outputs into anim/agent_hero/.
"""
import os, json
import pixlib as P

OUT = P.out_dir("anim", "agent_hero")

W = H = 16
PAL = {
    ".": (0, 0, 0, 0),
    "o": (26, 28, 44, 255),     # outline / eyes
    "h": (90, 56, 38, 255),     # hair
    "s": (224, 172, 105, 255),  # skin
    "b": (59, 93, 201, 255),    # shirt
    "p": (51, 57, 65, 255),     # pants
    "k": (122, 74, 49, 255),    # boots
    "w": (192, 203, 220, 255),  # blade
    "g": (255, 205, 117, 255),  # guard
}

BASE = [
    "................",
    ".....hhhhhh.....",
    ".....hhhhhh.....",
    ".....hssssh.....",
    ".....sossos.....",  # eyes at cols 6, 9
    ".....ssssss.....",
    ".....bbbbbb.....",
    "....sbbbbbbs....",  # hands at cols 4, 11
    "....sbbbbbbs....",
    ".....bbbbbb.....",
    ".....pppppp.....",
    ".....pp..pp.....",  # legs
    ".....pp..pp.....",
    ".....kk..kk.....",  # boots
    "................",
    "................",
]


def grid_copy(g):
    return [list(row) for row in g]


def to_str(g):
    return ["".join(row) for row in g]


def shift_down(g):
    out = [["."] * W] + [list(g[y]) for y in range(H - 1)]
    return out


def leg_lift(g, cols):
    """raise one foot: thigh gone, boot up one row (a walk contact pose)."""
    out = grid_copy(g)
    for x in cols:
        out[11][x] = "."
        out[12][x] = "k"
        out[13][x] = "."
    return out


def paint(g, ops):
    out = grid_copy(g)
    for (x, y, ch) in ops:
        out[y][x] = ch
    return out


# weapon paint ops (right side)
A0 = [(12, 1, "w"), (12, 2, "w"), (12, 3, "w"), (12, 4, "w"), (12, 5, "w"),
      (12, 6, "g"), (12, 7, "s"), (11, 7, "s")]            # windup: sword up
A1 = [(12, 7, "g"), (13, 7, "w"), (14, 7, "w"), (15, 7, "w")]  # swing: horizontal
A2 = [(11, 8, "s"), (12, 8, "g"), (13, 9, "w"), (14, 10, "w")]  # recover: down-right

base = grid_copy(BASE)
FRAMES = [
    to_str(base),                       # 0 idle A
    to_str(shift_down(base)),           # 1 idle B (bob)
    to_str(leg_lift(base, (9, 10))),    # 2 walk: right foot up
    to_str(base),                       # 3 walk: pass
    to_str(leg_lift(base, (5, 6))),     # 4 walk: left foot up
    to_str(base),                       # 5 walk: pass
    to_str(paint(base, A0)),            # 6 attack windup
    to_str(paint(base, A1)),            # 7 attack swing
    to_str(paint(base, A2)),            # 8 attack recover
]

STATES = [
    {"name": "idle", "from": 0, "to": 1, "fps": 2, "loop": True},
    {"name": "walk", "from": 2, "to": 5, "fps": 8, "loop": True},
    {"name": "attack", "from": 6, "to": 8, "fps": 12, "loop": False},
]

# validate
for i, f in enumerate(FRAMES):
    assert len(f) == 16, f"frame {i}: {len(f)} rows"
    for j, row in enumerate(f):
        assert len(row) == 16, f"frame {i} row {j}: {len(row)} cols -> {row!r}"
        for ch in row:
            assert ch in PAL, f"frame {i} row {j}: bad char {ch!r}"


def rgba(grid):
    return [PAL[grid[y][x]] for y in range(H) for x in range(W)]


# ---- combined strip (GameMaker-ready) --------------------------------------

n = len(FRAMES)
SW = W * n
strip = [(0, 0, 0, 0)] * (SW * H)
for f, grid in enumerate(FRAMES):
    for y in range(H):
        for x in range(W):
            strip[y * SW + f * W + x] = PAL[grid[y][x]]
P.write_png(os.path.join(OUT, f"hero_strip{n}.png"), SW, H, strip)  # GM _stripN auto-slice

# ---- individual frame PNGs (per-frame export for external tooling) ----

FRAMEDIR = P.out_dir("anim", "agent_hero", "frames")
for i, g in enumerate(FRAMES):
    P.write_png(os.path.join(FRAMEDIR, f"f{i}.png"), W, H, rgba(g))

# ---- per-state looping GIFs ------------------------------------------------

DELAY = {"idle": 40, "walk": 12, "attack": 8}  # 1/100 s
for st in STATES:
    frames = [rgba(FRAMES[i]) for i in range(st["from"], st["to"] + 1)]
    P.write_gif(os.path.join(OUT, st["name"] + ".gif"), frames, W, H, delay_cs=DELAY[st["name"]])

# ---- states filmstrip (rows = states, for viewing) -------------------------

scale, pad = 9, 8
cw = W * scale
maxcols = max(st["to"] - st["from"] + 1 for st in STATES)
FW = pad + maxcols * (cw + pad)
FH = pad + len(STATES) * (cw + pad)
film = [None] * (FW * FH)
for Y in range(FH):
    for X in range(FW):
        film[Y * FW + X] = P.checker(X, Y, 9)
for r, st in enumerate(STATES):
    for c, i in enumerate(range(st["from"], st["to"] + 1)):
        P.blit(film, FW, pad + c * (cw + pad), pad + r * (cw + pad), rgba(FRAMES[i]), W, H, scale, ck=9)
P.write_png(os.path.join(OUT, "hero_states.png"), FW, FH, film)

# ---- manifest (frame ranges -> states) -------------------------------------

manifest = {"image": f"hero_strip{n}.png", "frameWidth": W, "frameHeight": H,
            "frames": n, "states": STATES}
with open(os.path.join(OUT, "hero_states.json"), "w") as fh:
    json.dump(manifest, fh, indent=2)

print(f"agent hero: {n} frames, {len(STATES)} states -> hero_strip{n}.png ({SW}x{H}), "
      f"idle/walk/attack.gif, hero_states.png, hero_states.json")
