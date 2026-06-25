#!/usr/bin/env python3
"""terrain_materials — generate tileable terrain MATERIAL patches with selectable algorithms.

Stage 1 of the terrain-tile pipeline (terrain_materials -> terrain_sprites). Each terrain picks
the texture algorithm suited to it — extend ALGOS and select via cfg["algo"]:

  noise  — coarse value-noise, base-dominant thresholding (general; calm blobs)
  ripple — horizontal sine bands over a blue ramp (water: smooth surface, seamless)
  blades — dense fine vertical strokes over a base (grass: fluffy)
  grain  — fine 1px speckle over a base (sand: grainy)

All algorithms are TILEABLE by construction (wrapping sines / wrapping strokes / isolated specks)
and emit their colors directly (inline per terrain; no external palette dependency). `variants` per terrain
feed TerrainStream's per-cell variant pick: water=1 (a continuous ripple must stay ONE seamless
tile — per-variant phase jumps would seam), sand/grass=4 (blobby/grainy: variants break the grid).

Usage:  python common/terrain_materials.py        # -> out/materials/<terrain>_<i>.png
"""
import os, math, random
import pixlib as P

S = 16  # material/tile size in px (G.E.M.S. convention; see GEMS.md)


# ---- algorithm: coarse value-noise (general) -------------------------------

def _smooth(t):
    return t * t * (3 - 2 * t)


def _coarse_noise(S, L, seed):
    """Tileable value noise: an LxL random lattice, smoothstep-bilinear up to SxS, wrapping the
    lattice so opposite edges match. Smaller L = bigger blobs."""
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


def algo_noise(S, cfg, seed):
    n = _coarse_noise(S, cfg.get("L", 8), seed)
    lo, hi = min(n), max(n); span = (hi - lo) or 1.0
    base, dark, light = cfg["base"], cfg["dark"], cfg["light"]
    dt, lt = cfg.get("dark_t", 0.15), cfg.get("light_t", 0.85)
    out = []
    for v in n:
        t = (v - lo) / span
        out.append((dark if t < dt else light if t > lt else base) + (255,))
    return out


# ---- algorithm: horizontal ripple bands (water) ----------------------------

def algo_ripple(S, cfg, seed):
    """A vertical sine (cyc_y waves) gently warped by a horizontal sine (cyc_x), mapped through a
    dark->light blue ramp -> a rippled surface, not flat cardboard. Sparse cyan crest glints.
    Integer cycle counts => wraps seamlessly in both axes."""
    rng = random.Random(seed)
    ph_y, ph_x = rng.random(), rng.random()
    tones = cfg["tones"]; crest = tones[-1]
    cyc_y, cyc_x, warp = cfg.get("cyc_y", 3), cfg.get("cyc_x", 2), cfg.get("warp", 0.06)
    glint = cfg.get("glint", 0.04)
    out = []
    for y in range(S):
        fy = y / S
        for x in range(S):
            fx = x / S
            w = warp * math.sin(2 * math.pi * (cyc_x * fx + ph_x))
            v = 0.5 + 0.5 * math.sin(2 * math.pi * (cyc_y * (fy + w) + ph_y))
            idx = min(len(tones) - 1, int(v * len(tones)))
            c = crest if (v > 0.86 and rng.random() < glint * 6) else tones[idx]
            out.append(c + (255,))
    return out


# ---- algorithm: dense vertical blades (grass) ------------------------------

def algo_blades(S, cfg, seed):
    """Base fill + many fine vertical strokes (1px wide, 1-2px tall, wrapping vertically) in a
    darker + lighter tone => a dense, fluffy texture. Sparse horizontally, so it tiles."""
    rng = random.Random(seed)
    base, dark, light = cfg["base"], cfg["dark"], cfg["light"]
    px = [base + (255,)] * (S * S)
    for _ in range(int(S * S * cfg.get("density", 0.26))):
        x = rng.randrange(S); y = rng.randrange(S)
        col = dark if rng.random() < 0.6 else light
        for dy in range(2 if rng.random() < 0.5 else 1):
            px[((y + dy) % S) * S + x] = col + (255,)
    return px


# ---- algorithm: fine grain speckle (sand) ----------------------------------

def algo_grain(S, cfg, seed):
    """Base fill + isolated 1px specks (mostly light, few dark) => fine grain. Single pixels never
    span a seam, so it tiles trivially."""
    rng = random.Random(seed)
    base, dark, light = cfg["base"], cfg["dark"], cfg["light"]
    px = [base + (255,)] * (S * S)
    for _ in range(int(S * S * cfg.get("density", 0.16))):
        # two lines on purpose: `px[rng.randrange(..)] = (.. rng.random() ..)` would evaluate the
        # RHS (random) BEFORE the subscript (randrange), reversing RNG order -> a different pattern.
        i = rng.randrange(S * S)
        px[i] = (dark if rng.random() < 0.30 else light) + (255,)
    return px


ALGOS = {"noise": algo_noise, "ripple": algo_ripple, "blades": algo_blades, "grain": algo_grain}

# Per-terrain algorithm selection + params (example terrains; colors inline). `variants` overrides the default count.
TERRAINS = {
    "water": {"algo": "ripple", "seed": 11, "variants": 1,
              # RimWorld-earthy: muted steel blue-grey (desaturated from the old bright blue) + a soft
              # lighter crest. No dark trough stripe.
              "tones": [(86, 116, 140), (86, 116, 140), (86, 116, 140), (120, 150, 165)],
              "cyc_y": 2, "cyc_x": 2, "warp": 0.06, "glint": 0.04},
    "sand":  {"algo": "grain", "seed": 23, "variants": 4,
              # RimWorld-earthy + calm: muted tan, sparse low-contrast specks (a clean backdrop, not
              # grainy static). See grass note below.
              "base": (168, 148, 106), "dark": (150, 132, 92), "light": (185, 166, 124),
              "density": 0.09},
    "grass": {"algo": "blades", "seed": 7, "variants": 4,
              # RimWorld-earthy + calm: desaturated OLIVE (not bright green), sparse low-contrast
              # strokes so grass reads as a calm serious backdrop the muted entities sit on rather than
              # salt-and-pepper static. (Was bright (106,190,48) + dense = candy noise.)
              "base": (121, 130, 90), "dark": (107, 116, 80), "light": (138, 148, 104),
              "density": 0.10},
}
VARIANTS = 4  # default if a terrain omits "variants"


def generate():
    """Write every terrain's variant materials; return {terrain: variant_count}. Clears stale
    variant PNGs first so a reduced count leaves no orphans."""
    out = P.out_dir("materials")
    for fn in os.listdir(out):
        if fn.endswith(".png") and "_" in fn:
            os.remove(os.path.join(out, fn))
    counts = {}
    for name, cfg in TERRAINS.items():
        fn = ALGOS[cfg["algo"]]
        nv = cfg.get("variants", VARIANTS)
        for i in range(nv):
            px = fn(S, cfg, cfg["seed"] + i * 1009)  # distinct seed per variant
            P.write_png(os.path.join(out, f"{name}_{i}.png"), S, S, px)
        counts[name] = nv
    return counts


if __name__ == "__main__":
    for name, nv in generate().items():
        print(f"{name}: algo={TERRAINS[name]['algo']}, {nv} variant(s) -> out/materials/{name}_0..{nv - 1}.png")
