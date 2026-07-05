#!/usr/bin/env python3
"""terrain_materials — generate tileable terrain MATERIAL patches with selectable algorithms.

Stage 1 of the terrain-tile pipeline (terrain_materials -> terrain_sprites). Each terrain picks
the texture algorithm suited to it — extend ALGOS and select via cfg["algo"]:

  noise  — coarse value-noise, base-dominant thresholding (general; calm blobs)
  ripple — horizontal sine bands over a blue ramp (water: smooth surface, seamless)
  blades — dense fine vertical strokes over a base (grass: fluffy)
  grain  — fine 1px speckle over a base (sand: grainy)

All algorithms are TILEABLE by construction (wrapping sines / wrapping strokes / isolated specks)
and emit their colors directly (inline per terrain; no external palette dependency). Full-tile
variants feed TerrainStream's per-cell variant pick: `variants` plain texture re-rolls (water=1 —
a continuous ripple must stay ONE seamless tile; per-variant phase jumps would seam) plus optional
`decor` entries — DECORATED variants (a fresh texture roll stamped with flowers/pebbles/...) at a
low `weight` vs `plain_weight`, so decorations are occasional accents by probability. The weighted
table is `variant_plan(name)` — the single source of truth terrain_sprites.py turns into the
sheet's SpriteMeta manifest (the engine picks per cell by deterministic hash).

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


# ---- decorations (stamped over a variant patch) ------------------------------

def _scatter(rng, S, count, margin, sep=5):
    """`count` stamp anchors, each >=`margin` from the border and >=`sep` (Chebyshev) apart —
    adjacent stamps would merge into one odd blob. Rejection-sampled; a crowded tile just gets
    fewer stamps."""
    pts = []
    for _ in range(count):
        for _try in range(12):
            x = rng.randrange(margin, S - margin)
            y = rng.randrange(margin, S - margin)
            if all(max(abs(x - ox), abs(y - oy)) >= sep for ox, oy in pts):
                pts.append((x, y))
                break
    return pts


def _decor_flowers(px, S, rng):
    """2-3 small blooms: a 1px warm core + 4 muted petals (plus shape). Colors stay low-contrast
    against the olive grass so blooms read as accents, not confetti."""
    petals = [(196, 190, 172), (172, 152, 174)]  # dusty white / soft lilac
    core = (190, 172, 128)
    for x, y in _scatter(rng, S, rng.randint(2, 3), 3):
        pet = petals[rng.randrange(len(petals))] + (255,)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            px[(y + dy) * S + (x + dx)] = pet
        px[y * S + x] = core + (255,)


def _decor_pebbles(px, S, rng, lit=(146, 142, 132), dark=(108, 104, 96)):
    """2-3 small stones: a 2x2 lit block with a 2px darker shadow row below."""
    for x, y in _scatter(rng, S, rng.randint(2, 3), 3):
        for dy in range(2):
            for dx in range(2):
                px[(y + dy) * S + (x + dx)] = lit + (255,)
        for dx in range(2):
            px[(y + 2) * S + (x + dx)] = dark + (255,)


def _decor_stones(px, S, rng):
    """pebbles in warmer greys — stones on sand."""
    _decor_pebbles(px, S, rng, lit=(158, 150, 132), dark=(128, 120, 104))


DECOR = {"flowers": _decor_flowers, "pebbles": _decor_pebbles, "stones": _decor_stones}


def decorate(patch, S, kind, seed):
    """A decorated FULL-TILE variant: copy of `patch` with sparse decoration stamps. Shapes keep
    clear of the tile border so a decorated cell abuts plain neighbors seamlessly (the base
    texture is statistically continuous; only a decoration clipped mid-shape would seam)."""
    px = list(patch)
    DECOR[kind](px, S, random.Random(seed))
    return px

# Per-terrain algorithm selection + params (example terrains; colors inline). `variants` overrides the default count.
TERRAINS = {
    "water": {"algo": "ripple", "seed": 11, "variants": 1,
              # style-spec GROUND band (S<=35%, V 40-70% — ROADMAP -> Style spec): muted steel
              # blue-grey + a soft lighter crest. No dark trough stripe.
              "tones": [(95, 120, 140), (95, 120, 140), (95, 120, 140), (120, 150, 165)],
              "cyc_y": 2, "cyc_x": 2, "warp": 0.06, "glint": 0.04},
    "deepwater": {"algo": "ripple", "seed": 31, "variants": 1,
              # water's darker sibling (lake/sea centers); crest = water's base so the two read as one
              # body. variants=1 like water — a continuous ripple must stay ONE seamless tile.
              "tones": [(76, 95, 112), (76, 95, 112), (76, 95, 112), (95, 120, 140)],
              "cyc_y": 2, "cyc_x": 2, "warp": 0.06, "glint": 0.02},
    "sand":  {"algo": "grain", "seed": 23, "variants": 4,
              # muted tan, sparse low-contrast specks (a clean backdrop, not grainy static);
              # spec ground band. See grass note below.
              "base": (168, 150, 113), "dark": (150, 135, 102), "light": (185, 167, 126),
              "density": 0.09,
              "decor": [{"kind": "stones", "n": 1, "weight": 1}]},
    "mud":   {"algo": "noise", "seed": 41, "variants": 4,
              # wet dark grey-brown; big low-contrast blobs (L=4) read as damp puddled ground
              "base": (103, 90, 73), "dark": (90, 79, 64), "light": (117, 103, 83),
              "L": 4},
    "soil":  {"algo": "grain", "seed": 43, "variants": 4,
              # plain dry earth between sand and grass in tone; fine crumb speckle
              "base": (140, 120, 94), "dark": (125, 107, 84), "light": (155, 133, 104),
              "density": 0.10},
    "richsoil": {"algo": "noise", "seed": 47, "variants": 4,
              # dark fertile humus — deeper + warmer than soil, mottled organic blobs
              "base": (110, 92, 73), "dark": (97, 81, 64), "light": (124, 104, 82),
              "L": 6},
    "grass": {"algo": "blades", "seed": 7, "variants": 4,
              # RimWorld-earthy + calm: desaturated OLIVE (not bright green), sparse low-contrast
              # strokes so grass reads as a calm serious backdrop the muted entities sit on rather than
              # salt-and-pepper static. (Was bright (106,190,48) + dense = candy noise.)
              "base": (121, 130, 90), "dark": (107, 116, 80), "light": (138, 148, 104),
              "density": 0.10,
              "decor": [{"kind": "flowers", "n": 2, "weight": 1},
                        {"kind": "pebbles", "n": 1, "weight": 1}]},
    "gravel": {"algo": "grain", "seed": 59, "variants": 4,
              # loose grey pebbles — denser speckle than sand so it reads coarse, not sandy
              "base": (133, 129, 120), "dark": (112, 108, 100), "light": (152, 148, 138),
              "density": 0.22},
    "rocky": {"algo": "noise", "seed": 53, "variants": 4,
              # bare stone — cooler + darker than gravel, wider thresholds for patchy rock faces
              "base": (118, 116, 110), "dark": (100, 98, 93), "light": (136, 134, 127),
              "L": 6, "dark_t": 0.28, "light_t": 0.74},
}
VARIANTS = 4      # default plain variant count if a terrain omits "variants"
PLAIN_WEIGHT = 8  # pick weight per plain variant (a decor entry defaults to weight 1)


def variant_plan(name):
    """[(index, weight), ...] over every full-tile variant of a terrain, in the material-file /
    sprite-frame order generate() writes: plain variants 0..nv-1 (index 0 is the base the 16 dual
    frames are cut from), then each decor entry's frames. Single source of truth shared by
    generate() and terrain_sprites.py's SpriteMeta manifest."""
    cfg = TERRAINS[name]
    pw = cfg.get("plain_weight", PLAIN_WEIGHT)
    plan = [(i, pw) for i in range(cfg.get("variants", VARIANTS))]
    idx = len(plan)
    for d in cfg.get("decor", ()):
        for _ in range(d.get("n", 1)):
            plan.append((idx, d.get("weight", 1)))
            idx += 1
    return plan


def generate():
    """Write every terrain's variant materials (plain re-rolls, then decorated); return
    {terrain: variant_count}. Clears stale variant PNGs first so a reduced count leaves no
    orphans."""
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
        idx = nv
        for d in cfg.get("decor", ()):
            for k in range(d.get("n", 1)):
                seed = cfg["seed"] + idx * 1009
                px = decorate(fn(S, cfg, seed), S, d["kind"], seed * 31 + k)
                P.write_png(os.path.join(out, f"{name}_{idx}.png"), S, S, px)
                idx += 1
        counts[name] = idx
    return counts


if __name__ == "__main__":
    for name, nv in generate().items():
        print(f"{name}: algo={TERRAINS[name]['algo']}, {nv} variant(s) -> out/materials/{name}_0..{nv - 1}.png")
