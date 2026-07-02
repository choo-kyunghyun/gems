#!/usr/bin/env python3
"""human_sprites — animate the Rayman-style humanoid template into the paper-doll base strip.

The SOURCE is the hand-authored white tintable template `templates/human/base.png` (48x48,
foot-anchored, hard alpha): a floating-limb body — head, torso, two hands, two feet as
DISCONNECTED blobs — so animation is per-part offsets, no redraw. This script segments the
blobs, applies the per-frame offset table below, and imports:

  spr_human        the canonical humanoid strip (frames 0-1 walk contact poses, 2-3 attack
                   windup/punch), pure white -> tinted per entity via Visual.color (skin).
  spr_wear_vest    the reference worn overlay (Appearance): a torso-shaped garment that tracks
                   the torso's per-frame offsets, so it can never desync from the body.
  spr_held_pipe    held-WEAPON overlays: the weapon drawn at the RIGHT hand's per-frame
  spr_held_blaster position (hand blob center + FRAMES offsets), so an equipped weapon rides
                   the hand through walk/punch. Wired via Equippable.worn like the vest.

The cell is the template WIDENED by PADX per side (48x48 -> 64x48, content centered, foot
anchor unchanged) so the punch-thrust hand + a held weapon never clip the frame.

Same deterministic-uuid5 import contract as flat_sprites (resources must be REGISTERED;
re-runs are churn-free). Every overlay sheet must mirror spr_human's strip layout — generate
them HERE from the same parts/offsets, never freehand.

Usage:  python tools/pixel-art-kit/gm-import/human_sprites.py [project_root]
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
import pixlib as P
import flat_sprites as F  # reuse the .yy emitter/build machinery (PARENT overridden below)

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(P.KIT))
F.ROOT = ROOT
F.PARENT = ("Pending Sprite", "folders/Media/Pending Sprite.yy")  # next to the other entity art

TEMPLATE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "templates", "human", "base.png")

PADX = 8                # cell widening per side (see module doc — held weapons need the room)
VEST = (198, 116, 54)   # garment base — burnt orange
TRIM = (140, 78, 36)    # garment lower trim
NECK = 2                # torso rows left uncovered at the top (skin shows at the neckline)
PIPE = (112, 118, 124)  # lead pipe steel
PIPE_D = (76, 82, 88)   # pipe grip-end shade
GUN = (56, 60, 68)      # blaster gunmetal
GUN_L = (146, 154, 164) # blaster slide accent


def segment(w, h, px):
    """4-neighbor connected components of opaque pixels -> {part: [(x, y), ...]}."""
    seen = [False] * (w * h)
    blobs = []
    for i in range(w * h):
        if seen[i] or px[i][3] < 128:
            continue
        stack = [i]
        seen[i] = True
        cells = []
        while stack:
            j = stack.pop()
            cells.append((j % w, j // w))
            x, y = j % w, j // w
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    k = ny * w + nx
                    if not seen[k] and px[k][3] >= 128:
                        seen[k] = True
                        stack.append(k)
        cy = sum(y for _, y in cells) / len(cells)
        cx = sum(x for x, _ in cells) / len(cells)
        blobs.append((len(cells), cx, cy, cells))
    assert len(blobs) == 6, f"expected 6 floating parts, got {len(blobs)}"
    blobs.sort(reverse=True, key=lambda b: b[0])          # by size: head, torso, then limbs
    head, torso = blobs[0], blobs[1]
    if head[2] > torso[2]:                                # head is the higher of the two big blobs
        head, torso = torso, head
    limbs = sorted(blobs[2:], key=lambda b: b[2])         # by center y: hands above feet
    hands = sorted(limbs[:2], key=lambda b: b[1])         # by center x: left, right
    feet = sorted(limbs[2:], key=lambda b: b[1])
    return {
        "head": head[3], "torso": torso[3],
        "handL": hands[0][3], "handR": hands[1][3],
        "footL": feet[0][3], "footR": feet[1][3],
    }


# Canonical strip: per-part (dx, dy) offsets per frame. Frames 0-1 = walk contact poses
# (feet alternate, hands counter-swing, 1px body bob); 2-3 = attack windup -> right-hand punch
# (the template faces slightly right; xscale flips for left). Keep offsets small — the parts
# must stay inside the 48x48 cell at every frame.
FRAMES = [
    {"head": (0, 1), "torso": (0, 1), "handL": (0, -2), "handR": (0, 1), "footL": (0, -3), "footR": (0, 0)},
    {"head": (0, 1), "torso": (0, 1), "handL": (0, 1), "handR": (0, -2), "footL": (0, 0), "footR": (0, -3)},
    {"head": (-1, 0), "torso": (-1, 0), "handL": (1, 0), "handR": (-3, -1), "footL": (0, 0), "footR": (0, 0)},
    {"head": (2, 0), "torso": (1, 0), "handL": (0, 1), "handR": (8, -2), "footL": (0, 0), "footR": (0, 0)},
]


def compose(w, h, px, parts, frame, only=None, recolor=None, skip_top=0):
    """One frame: each part's template pixels shifted by its offset. `only` limits to some
    parts (overlay sheets); `recolor(x, y, part_bbox)` maps a pixel color; `skip_top` drops
    the part's top rows (neckline)."""
    out = [(0, 0, 0, 0)] * (w * h)
    for name, cells in parts.items():
        if only is not None and name not in only:
            continue
        dx, dy = frame[name]
        top = min(y for _, y in cells)
        bot = max(y for _, y in cells)
        for x, y in cells:
            if y - top < skip_top:
                continue
            nx, ny = x + dx, y + dy
            assert 0 <= nx < w and 0 <= ny < h, f"{name} leaves the cell at ({nx},{ny})"
            col = recolor(x, y, top, bot) if recolor is not None else px[y * w + x]
            out[ny * w + nx] = col
    return out


def stamp(buf, w, h, x, y, col):
    if 0 <= x < w and 0 <= y < h:
        buf[y * w + x] = (col[0], col[1], col[2], 255)


def stamp_line(buf, w, h, x0, y0, x1, y1, thick, col):
    """integer line with a square `thick` pen (weapon rods/slabs at this scale)."""
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    i = 0
    while i <= steps:
        cx = round(x0 + (x1 - x0) * i / steps)
        cy = round(y0 + (y1 - y0) * i / steps)
        for oy in range(thick):
            for ox in range(thick):
                stamp(buf, w, h, cx + ox, cy + oy, col)
        i += 1


def draw_pipe(buf, w, h, gx, gy, fi):
    """lead pipe gripped at (gx, gy): rested diagonal on walk frames, pulled back on the
    windup, thrust flat on the punch."""
    if fi == 3:                                   # punch — horizontal thrust
        stamp_line(buf, w, h, gx - 2, gy - 1, gx + 9, gy - 1, 2, PIPE)
        stamp_line(buf, w, h, gx - 2, gy - 1, gx - 1, gy - 1, 2, PIPE_D)
    elif fi == 2:                                 # windup — steep, pulled in
        stamp_line(buf, w, h, gx - 1, gy + 2, gx + 3, gy - 6, 2, PIPE)
        stamp_line(buf, w, h, gx - 1, gy + 2, gx, gy, 2, PIPE_D)
    else:                                         # rest — diagonal up-forward
        stamp_line(buf, w, h, gx - 2, gy + 2, gx + 5, gy - 5, 2, PIPE)
        stamp_line(buf, w, h, gx - 2, gy + 2, gx - 1, gy + 1, 2, PIPE_D)


def draw_blaster(buf, w, h, gx, gy, fi):
    """compact pistol pointing +x, gripped at (gx, gy); same silhouette every frame (the
    hand offsets carry the recoil/thrust motion)."""
    stamp_line(buf, w, h, gx - 1, gy - 3, gx + 5, gy - 3, 2, GUN)   # body slab
    stamp_line(buf, w, h, gx + 5, gy - 3, gx + 7, gy - 3, 1, GUN)   # muzzle
    stamp_line(buf, w, h, gx - 1, gy - 4, gx + 5, gy - 4, 1, GUN_L) # slide accent
    stamp_line(buf, w, h, gx - 1, gy - 1, gx, gy + 1, 2, GUN)       # grip (into the hand)


def held_frames(w, h, parts, draw_fn):
    """one strip frame per FRAMES entry: the weapon drawn at the right hand's frame position."""
    cells = parts["handR"]
    hx = round(sum(c[0] for c in cells) / len(cells))
    hy = round(sum(c[1] for c in cells) / len(cells))
    out = []
    for fi in range(len(FRAMES)):
        buf = [(0, 0, 0, 0)] * (w * h)
        off = FRAMES[fi]["handR"]
        draw_fn(buf, w, h, hx + off[0], hy + off[1], fi)
        out.append(buf)
    return out


def main():
    w0, h, px0 = P.read_png(TEMPLATE)
    # widen the cell (content centered, foot anchor preserved) — punch hand + weapon need room
    w = w0 + PADX * 2
    px = [(0, 0, 0, 0)] * (w * h)
    for y in range(h):
        for x in range(w0):
            px[y * w + x + PADX] = px0[y * w0 + x]
    parts = segment(w, h, px)

    body = [compose(w, h, px, parts, f) for f in FRAMES]

    def garment(x, y, top, bot):  # torso-shaped, darker lower trim, hard alpha
        col = TRIM if (y - top) > (bot - top) * 0.62 else VEST
        return (col[0], col[1], col[2], 255)

    vest = [compose(w, h, px, parts, f, only=("torso",), recolor=garment, skip_top=NECK)
            for f in FRAMES]
    pipe = held_frames(w, h, parts, draw_pipe)
    blaster = held_frames(w, h, parts, draw_blaster)

    F.build("spr_human", body, 8.0, w, h)
    F.build("spr_wear_vest", vest, 8.0, w, h)
    F.build("spr_held_pipe", pipe, 8.0, w, h)
    F.build("spr_held_blaster", blaster, 8.0, w, h)
    print(f"wrote spr_human + spr_wear_vest + spr_held_pipe/blaster ({len(FRAMES)} frames, {w}x{h})")

    # contact sheet: body / +vest+pipe / +vest+blaster rows (4x) -> out/entities/human_sheet.png
    sc, pad = 4, 6
    sw = pad + len(FRAMES) * (w * sc + pad)
    sh = pad + 3 * (h * sc + pad)
    sheet = [(46, 52, 46, 255)] * (sw * sh)
    for i in range(len(FRAMES)):
        skin = [(232, 184, 144, p[3]) if p[3] else p for p in body[i]]  # preview-only tint
        dressed = [P.over(vest[i][j], skin[j]) for j in range(w * h)]
        armed = [P.over(pipe[i][j], dressed[j]) for j in range(w * h)]
        gunned = [P.over(blaster[i][j], dressed[j]) for j in range(w * h)]
        P.blit(sheet, sw, pad + i * (w * sc + pad), pad, skin, w, h, sc)
        P.blit(sheet, sw, pad + i * (w * sc + pad), pad * 2 + h * sc, armed, w, h, sc)
        P.blit(sheet, sw, pad + i * (w * sc + pad), pad * 3 + 2 * (h * sc), gunned, w, h, sc)
    od = P.out_dir("entities")
    P.write_png(os.path.join(od, "human_sheet.png"), sw, sh, sheet)
    print("preview:", os.path.join(od, "human_sheet.png"))


if __name__ == "__main__":
    main()
