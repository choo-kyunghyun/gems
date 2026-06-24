#!/usr/bin/env python3
"""animate — render multi-frame animation DATA to a strip + GIF(s) + filmstrip + manifest.

Data-driven, no hardcoded art (pixlib.load_frames): each animation is either a DIRECTORY of numbered
single-frame templates (`0.txt`, `1.txt`, ... indexing a palettes/*.hex; optional `meta.json` for
fps/loop/states) or a single self-contained `.json` ({"palette": {...}, "frames": [[rows], ...],
"fps"?, "loop"?, "states"?}). With `states` it's multi-state -> one GIF + manifest entry per state.

  python animate.py [path ...] [--palette NAME]
    path = a dir of numbered frames or a .json; default: every animation under templates/anim/.
    --palette NAME selects palettes/NAME.hex for .txt frames (default db32).

Per animation -> out/anim/<name>/: <name>_strip<N>.png (GM _stripN), frames/f*.png, <name>.gif (or one
GIF per state), <name>_filmstrip.png, <name>.json (manifest).
"""
import os, sys, json
import pixlib as P

ANIM_DIR = os.path.join(P.KIT, "templates", "anim")
PALETTES = os.path.join(P.KIT, "palettes")
DEFAULT_PALETTE = "db32"


def render(path, palette_name):
    pal = P.load_palette(os.path.join(PALETTES, palette_name + ".hex"))
    frames, charmap, meta = P.load_frames(path, pal)
    name = os.path.splitext(os.path.basename(path.rstrip("/\\")))[0]
    out = P.out_dir("anim", name)
    n = len(frames)
    H, W = len(frames[0]), len(frames[0][0])
    fps, loop = meta.get("fps", 8), meta.get("loop", True)
    states = meta.get("states")

    def rgba(g):
        return [charmap[g[y][x]] for y in range(H) for x in range(W)]

    # horizontal strip (GameMaker _stripN auto-slice)
    SW = W * n
    strip = [(0, 0, 0, 0)] * (SW * H)
    for f, g in enumerate(frames):
        for y in range(H):
            for x in range(W):
                strip[y * SW + f * W + x] = charmap[g[y][x]]
    P.write_png(os.path.join(out, f"{name}_strip{n}.png"), SW, H, strip)

    # per-frame PNGs (for external tooling / pack.py)
    fdir = P.out_dir("anim", name, "frames")
    for i, g in enumerate(frames):
        P.write_png(os.path.join(fdir, f"f{i}.png"), W, H, rgba(g))

    # GIF(s): one per state, else one for the whole sequence
    def delay(f):
        return max(2, round(100 / f))
    if states:
        for st in states:
            clip = [rgba(frames[i]) for i in range(st["from"], st["to"] + 1)]
            P.write_gif(os.path.join(out, st["name"] + ".gif"), clip, W, H,
                        delay_cs=delay(st.get("fps", fps)))
    else:
        P.write_gif(os.path.join(out, f"{name}.gif"), [rgba(g) for g in frames], W, H, delay_cs=delay(fps))

    # filmstrip preview (rows = states, else one row)
    rows = ([(st["name"], list(range(st["from"], st["to"] + 1))) for st in states]
            if states else [(name, list(range(n)))])
    scale, pad = 9, 8
    cw = W * scale
    maxcols = max(len(idxs) for _, idxs in rows)
    FW, FH = pad + maxcols * (cw + pad), pad + len(rows) * (cw + pad)
    film = [None] * (FW * FH)
    for Y in range(FH):
        for X in range(FW):
            film[Y * FW + X] = P.checker(X, Y, 9)
    for r, (_, idxs) in enumerate(rows):
        for c, i in enumerate(idxs):
            P.blit(film, FW, pad + c * (cw + pad), pad + r * (cw + pad), rgba(frames[i]), W, H, scale, ck=9)
    P.write_png(os.path.join(out, f"{name}_filmstrip.png"), FW, FH, film)

    # manifest
    manifest = {"image": f"{name}_strip{n}.png", "frameWidth": W, "frameHeight": H, "frames": n}
    if states:
        manifest["states"] = states
    else:
        manifest.update({"fps": fps, "loop": loop})
    json.dump(manifest, open(os.path.join(out, f"{name}.json"), "w", encoding="utf-8"), indent=2)

    tag = f", {len(states)} states" if states else ""
    print(f"  {name}: {n} frames ({W}x{H}){tag} -> out/anim/{name}/")


def main(argv):
    palette, paths = DEFAULT_PALETTE, []
    i = 0
    while i < len(argv):
        if argv[i] == "--palette" and i + 1 < len(argv):
            palette = argv[i + 1]
            i += 2
        else:
            paths.append(argv[i])
            i += 1
    if not paths:
        if not os.path.isdir(ANIM_DIR):
            print(f"no {ANIM_DIR} — add an animation (a dir of numbered frames or a .json)")
            return
        for fn in sorted(os.listdir(ANIM_DIR)):
            p = os.path.join(ANIM_DIR, fn)
            if os.path.isdir(p) or fn.lower().endswith(".json"):
                paths.append(p)
    if not paths:
        print(f"no animations under {ANIM_DIR}")
        return
    for p in paths:
        render(p, palette)


if __name__ == "__main__":
    main(sys.argv[1:])
