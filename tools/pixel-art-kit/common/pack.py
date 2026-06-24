#!/usr/bin/env python3
"""pack — assemble a folder of frame PNGs (f0.png, f1.png, ...) into a horizontal strip,
a looping GIF, optional per-state GIFs (from a manifest), and an upscaled filmstrip.

Counterpart to the generators for externally-produced frames. All frames must share dimensions.

Usage:
  python pack.py <frames_subdir> [out_subdir] [manifest.json]
    frames_subdir / out_subdir are relative to out/; out_subdir defaults to frames_subdir.
"""
import os, sys, json, re
import pixlib as P


def load_frames(d):
    fs = sorted([f for f in os.listdir(d) if re.match(r"f\d+\.png$", f)],
                key=lambda s: int(s[1:-4]))
    return [P.read_png(os.path.join(d, f)) for f in fs]


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    src = os.path.join(P.OUT, args[0])
    frames = load_frames(src)
    if not frames:
        print("no f*.png frames in", src)
        return
    w, h, _ = frames[0]
    n = len(frames)
    out = P.out_dir(args[1]) if len(args) > 1 else src
    base = os.path.basename(out)
    if base == "frames":                       # …/<name>/frames -> name the strip after <name>
        base = os.path.basename(os.path.dirname(out)) or "sheet"

    # horizontal strip (GameMaker-ready; <base>_strip<N> auto-slices into N frames on import)
    SW = w * n
    strip = [(0, 0, 0, 0)] * (SW * h)
    for i, (fw, fh, px) in enumerate(frames):
        for y in range(h):
            for x in range(w):
                strip[y * SW + i * w + x] = px[y * fw + x]
    P.write_png(os.path.join(out, f"{base}_strip{n}.png"), SW, h, strip)  # GM _stripN auto-slice

    # full-loop GIF
    P.write_gif(os.path.join(out, "all.gif"), [px for _, _, px in frames], w, h, delay_cs=12)

    # per-state GIFs from a manifest, if given
    if len(args) > 2 and os.path.isfile(args[2]):
        man = json.load(open(args[2]))
        for st in man.get("states", []):
            seq = [frames[i][2] for i in range(st["from"], st["to"] + 1)]
            delay = int(round(100 / st.get("fps", 8)))
            P.write_gif(os.path.join(out, st["name"] + ".gif"), seq, w, h, delay_cs=delay)

    # upscaled filmstrip (~160px box per frame)
    scale = max(1, 160 // max(w, h))
    pad, cw = 8, w * scale
    FW, FH = pad + n * (cw + pad), pad * 2 + h * scale
    film = [None] * (FW * FH)
    for Y in range(FH):
        for X in range(FW):
            film[Y * FW + X] = P.checker(X, Y, 8)
    for i, (fw, fh, px) in enumerate(frames):
        P.blit(film, FW, pad + i * (cw + pad), pad, px, fw, fh, scale, ck=8)
    P.write_png(os.path.join(out, "filmstrip.png"), FW, FH, film)

    print(f"packed {n} frames ({w}x{h}) -> {out}  ({base}_strip{n}.png, all.gif, filmstrip.png)")


if __name__ == "__main__":
    main()
