#!/usr/bin/env python3
"""material — procedural TILEABLE texture patches (pure Python stdlib).

Stage 1 of the tile loop (material -> tileset): a generator here writes an SxS patch, tileset.py
cuts an autotile set from it. Every algorithm wraps by construction (wrapping lattice / integer
wave cycles / strokes that wrap / specks that never span a seam), so nothing needs healing.

  noise   coarse value-noise thresholded into dark/base/light — calm blobs (stone, mud, humus)
  ripple  a vertical sine warped by a horizontal one, over a tone ramp — water surfaces
  blades  fine vertical strokes over a base — grass, fur, straw
  grain   isolated 1 px specks over a base — sand, gravel, plaster

Colors are (r, g, b) tuples the caller picks (a palette entry, typically); output is the flat
(r, g, b, a) list `pixlib.write_png` takes. The same seed always yields the same patch, so a
material is reproducible from its call.

    import os, material as M, pixlib as P

    px = M.blades(32, base=(50, 132, 100), dark=(35, 103, 78), light=(93, 175, 141), seed=7)
    P.write_png(os.path.join(P.out_dir("materials"), "grass_0.png"), 32, 32, px)

Variants: `variants(draw, n, seed)` re-rolls one recipe n times (frame 0 is the one an autotile
set is cut from; the rest become full-tile alternates — see tileset.py `--variant`). A `ripple`
must stay ONE tile: per-variant phase jumps seam.

Decor: `decorate(patch, S, stamp, seed, **kw)` copies a patch and scatters small shapes over it
(`flowers`, `pebbles`), kept off the border so a decorated cell abuts plain neighbors seamlessly.
Stamps are shaped in units of `unit` (default S // 16) so a bump of S keeps the world-space look.

Usage:  python material.py [algo|all] [size]   # -> out/materials/demo_<algo>.png (demo colors)
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixlib as P


def _rgba(c):
    return (c[0], c[1], c[2], 255)


def _unit(S, unit):
    return unit if unit is not None else max(1, S // 16)


# ---- noise -----------------------------------------------------------------

def _smooth(t):
    return t * t * (3 - 2 * t)


def value_noise(S, L, seed):
    """SxS floats in [0, 1): an LxL random lattice, smoothstep-bilinear upsampled with wraparound
    so opposite edges match. Smaller L = bigger blobs."""
    rng = random.Random(seed)
    lat = [rng.random() for _ in range(L * L)]
    out = [0.0] * (S * S)
    for y in range(S):
        fy = (y / S) * L; iy = int(fy) % L; ny = (iy + 1) % L; ty = _smooth(fy - int(fy))
        for x in range(S):
            fx = (x / S) * L; ix = int(fx) % L; nx = (ix + 1) % L; tx = _smooth(fx - int(fx))
            v00, v10 = lat[iy * L + ix], lat[iy * L + nx]
            v01, v11 = lat[ny * L + ix], lat[ny * L + nx]
            a = v00 + (v10 - v00) * tx; b = v01 + (v11 - v01) * tx
            out[y * S + x] = a + (b - a) * ty
    return out


def noise(S, base, dark, light, L=8, dark_t=0.15, light_t=0.85, seed=0):
    """Value noise normalized to its own range, then thresholded: below `dark_t` -> dark, above
    `light_t` -> light, else base. Narrow bands keep it base-dominant (calm)."""
    n = value_noise(S, L, seed)
    lo, hi = min(n), max(n); span = (hi - lo) or 1.0
    out = []
    for v in n:
        t = (v - lo) / span
        out.append(_rgba(dark if t < dark_t else light if t > light_t else base))
    return out


# ---- ripple ----------------------------------------------------------------

def ripple(S, tones, cyc_y=3, cyc_x=2, warp=0.06, glint=0.04, seed=0):
    """A vertical sine (`cyc_y` waves) gently warped by a horizontal sine (`cyc_x`), mapped
    through `tones` dark->light; sparse crest glints in the last tone. Integer cycle counts wrap
    in both axes. Repeating a tone in the ramp widens its band (e.g. [b, b, b, crest])."""
    rng = random.Random(seed)
    ph_y, ph_x = rng.random(), rng.random()
    crest = tones[-1]
    out = []
    for y in range(S):
        fy = y / S
        for x in range(S):
            fx = x / S
            w = warp * math.sin(2 * math.pi * (cyc_x * fx + ph_x))
            v = 0.5 + 0.5 * math.sin(2 * math.pi * (cyc_y * (fy + w) + ph_y))
            idx = min(len(tones) - 1, int(v * len(tones)))
            c = crest if (v > 0.86 and rng.random() < glint * 6) else tones[idx]
            out.append(_rgba(c))
    return out


# ---- blades ----------------------------------------------------------------

def blades(S, base, dark, light, density=0.26, unit=None, seed=0):
    """Base fill + `density * S*S` strokes, 1 px wide and `unit` or `2*unit` tall (wrapping
    vertically), 60/40 dark/light. Sparse horizontally, so it tiles; the 1 px width is the
    crispness a native-resolution sheet buys."""
    K = _unit(S, unit)
    rng = random.Random(seed)
    px = [_rgba(base)] * (S * S)
    for _ in range(int(S * S * density)):
        x = rng.randrange(S); y = rng.randrange(S)
        col = dark if rng.random() < 0.6 else light
        for dy in range(K * (2 if rng.random() < 0.5 else 1)):
            px[((y + dy) % S) * S + x] = _rgba(col)
    return px


# ---- grain -----------------------------------------------------------------

def grain(S, base, dark, light, density=0.16, seed=0):
    """Base fill + `density * S*S` isolated 1 px specks, 30/70 dark/light. Single pixels never
    span a seam, so it tiles trivially."""
    rng = random.Random(seed)
    px = [_rgba(base)] * (S * S)
    for _ in range(int(S * S * density)):
        # two statements on purpose: `px[rng.randrange(..)] = (.. rng.random() ..)` evaluates the
        # RHS before the subscript, reversing the RNG draw order -> a different pattern
        i = rng.randrange(S * S)
        px[i] = _rgba(dark if rng.random() < 0.30 else light)
    return px


ALGOS = {"noise": noise, "ripple": ripple, "blades": blades, "grain": grain}


def variants(draw, n, seed, step=1009):
    """n re-rolls of one recipe: `draw(seed)` -> patch, called with seed, seed+step, ..."""
    return [draw(seed + i * step) for i in range(n)]


# ---- decor stamps ----------------------------------------------------------

def scatter(rng, S, count, margin, sep):
    """`count` anchors, each >= `margin` from the border and >= `sep` (Chebyshev) apart — adjacent
    stamps would merge into one odd blob. Rejection-sampled; a crowded tile just gets fewer."""
    pts = []
    for _ in range(count):
        for _try in range(12):
            x = rng.randrange(margin, S - margin)
            y = rng.randrange(margin, S - margin)
            if all(max(abs(x - ox), abs(y - oy)) >= sep for ox, oy in pts):
                pts.append((x, y))
                break
    return pts


def stamp(px, S, x, y, w, h, color):
    """Fill a w x h block at (x, y) — the unit block the stamps are built from."""
    c = _rgba(color)
    for dy in range(h):
        for dx in range(w):
            px[(y + dy) * S + (x + dx)] = c


def flowers(px, S, rng, petals, core, unit=None, count=(2, 3)):
    """Small blooms: a unit-square core + 4 petals in a plus, each petal color drawn from `petals`."""
    K = _unit(S, unit)
    for x, y in scatter(rng, S, rng.randint(*count), 3 * K, 5 * K):
        pet = petals[rng.randrange(len(petals))]
        for dx, dy in ((-K, 0), (K, 0), (0, -K), (0, K)):
            stamp(px, S, x + dx, y + dy, K, K, pet)
        stamp(px, S, x, y, K, K, core)


def pebbles(px, S, rng, lit, dark, unit=None, count=(2, 3)):
    """Small stones: a 2x2-unit lit block with a 1-unit darker shadow row below."""
    K = _unit(S, unit)
    for x, y in scatter(rng, S, rng.randint(*count), 3 * K, 5 * K):
        stamp(px, S, x, y, 2 * K, 2 * K, lit)
        stamp(px, S, x, y + 2 * K, 2 * K, K, dark)


STAMPS = {"flowers": flowers, "pebbles": pebbles}


def decorate(patch, S, stamp_fn, seed, **kw):
    """A decorated copy of `patch`: `stamp_fn(px, S, rng, **kw)` over a fresh RNG."""
    px = list(patch)
    (STAMPS[stamp_fn] if isinstance(stamp_fn, str) else stamp_fn)(px, S, random.Random(seed), **kw)
    return px


# ---- cli --------------------------------------------------------------------

DEMO = {  # one recipe per algorithm, in demo colors
    "noise":  dict(base=(109, 117, 141), dark=(74, 84, 98), light=(139, 147, 175), L=6),
    "ripple": dict(tones=[(71, 125, 133)] * 3 + [(88, 141, 190)], cyc_y=2, cyc_x=2),
    "blades": dict(base=(50, 132, 100), dark=(35, 103, 78), light=(93, 175, 141), density=0.10),
    "grain":  dict(base=(199, 176, 139), dark=(160, 134, 98), light=(228, 210, 170), density=0.09),
}


def main():
    args = sys.argv[1:]
    which = args[0] if args else "all"
    S = int(args[1]) if len(args) > 1 else 32
    names = list(ALGOS) if which == "all" else [which]
    out = P.out_dir("materials")
    for name in names:
        px = ALGOS[name](S, seed=7, **DEMO[name])
        P.write_png(os.path.join(out, f"demo_{name}.png"), S, S, px)
        print(f"{name}: {S}x{S} -> out/materials/demo_{name}.png")


if __name__ == "__main__":
    main()
