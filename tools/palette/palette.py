#!/usr/bin/env python3
"""palette — AAP-64, the project palette, indexed by ramp (pure Python stdlib).

`aap-64.gpl` beside this file IS the palette (Adigun Polack's AAP-64; the `.aseprite` sources under
`art/` embed the same 64 — when the two disagree, Aseprite's copy wins). This module names it: every
one of the 64 entries belongs to exactly one ramp, listed dark -> light, so a script asks for a tone
by role and steps along the ramp to shade instead of picking RGB. AAP-64's ramps already carry the
modern hue shift (shadows lean violet / blue, highlights lean yellow), so `step` shades the way the
palette was drawn to be shaded.

Every art tool under tools/ (pixel-art-kit, vox-kit) imports this one module: sprites, voxel meshes
and the Aseprite sources all draw from these 64 and nothing else, so the palette is a project
constant, not a kit's option — no script takes a palette parameter. `nearest` / `snap` lock a foreign
color onto it, matched in OKLab so a dark red never lands on a dark green the way nearest-RGB would.

  void     the one absolute black: vacuum, a cast shadow, the void behind a doorway
  ink      the outline
  blood    red: flags, blood, red paint, a health bar
  hazard   safety orange -> amber -> yellow: warning paint, fire, muzzle flash
  moss     dark green -> lime: moss, grass, go-lights, acid
  sky      navy -> blue -> sky -> cyan -> mint: thin sky, water, ice, holo, energy
  bone     peach -> cream -> white: bone, paper, teeth, glare, skin highlight
  viol     violet -> magenta -> salmon: illegal mods, the unnatural, neon
  leather  warm brown -> tan -> sand: raider leather, wood, plywood, skin
  steel    cold grey: Union steel, concrete, asphalt, basalt
  rust     dusty red-brown: regolith, oxide, brick, dried blood
  slate    teal -> periwinkle -> lavender: Union fatigues, painted panels, ice shadow
  bio      sickly teal-green: lichen, the engineered ecology, medical, coolant
  ochre    khaki -> bone: dust, sand, plaster, drab canvas

    import palette as PAL
    PAL.PALETTE               # the 64 (r, g, b), index = AAP-64 index
    PAL.RAMP["rust"]          # the 5 regolith tones, dark -> light
    PAL.tone("steel", 2)      # one tone; PAL.base(name) is the middle one
    PAL.step(color, +1)       # one tone lighter within that color's ramp (clamped at the ends)
    PAL.dbl("moss", 2)        # {dark, base, light} around a tone — what the material recipes take
    PAL.INK, PAL.VOID         # the outline ink and the absolute black
    PAL.nearest(rgb)          # the entry nearest a foreign color (OKLab)
    PAL.snap(pixels)          # a flat (r, g, b, a) list locked onto the palette, alpha a hard cutout

Usage:  python palette.py   # prints the ramp table; writes out/aap-64.png (the swatch) and
                            # out/aap-64-magica.png (the 256x1 palette image MagicaVoxel imports:
                            # its slot i+1 = AAP-64 entry i, the mapping vox-kit relies on)
"""
import os, struct, zlib

_HERE = os.path.dirname(os.path.abspath(__file__))
GPL = os.path.join(_HERE, "aap-64.gpl")
OUT = os.path.join(_HERE, "out")


def _load(path):
    """The `R G B [name]` lines of a GIMP `.gpl` (the form Aseprite ships and exports palettes in);
    entry N (0-based) = palette index N."""
    pal = []
    for line in open(path, encoding="utf-8"):
        f = line.split()
        if len(f) >= 3 and all(t.isdigit() for t in f[:3]):
            pal.append((int(f[0]), int(f[1]), int(f[2])))
    return pal


PALETTE = _load(GPL)

# (name, AAP-64 indices dark -> light). Together the rows use each of the 64 entries exactly once.
RAMPS = [
    ("void",    [0]),
    ("ink",     [1]),
    ("blood",   [2, 3, 4, 5]),
    ("hazard",  [6, 7, 8, 9]),
    ("moss",    [16, 15, 14, 13, 12, 11, 10]),
    ("sky",     [17, 18, 19, 20, 21]),
    ("bone",    [24, 23, 22]),
    ("viol",    [30, 29, 28, 27, 26, 25]),
    ("leather", [31, 32, 33, 34, 35, 36]),
    ("steel",   [42, 41, 40, 39, 38, 37]),
    ("rust",    [43, 44, 45, 46, 47]),
    ("slate",   [52, 51, 50, 49, 48]),
    ("bio",     [53, 54, 55, 56, 57]),
    ("ochre",   [63, 62, 61, 60, 59, 58]),
]

_used = sorted(i for _, idx in RAMPS for i in idx)
assert len(PALETTE) == 64 and _used == list(range(64)), "RAMPS must use each AAP-64 entry once"

RAMP = {name: [PALETTE[i] for i in idx] for name, idx in RAMPS}
INDEX = {c: (name, i) for name, tones in RAMP.items() for i, c in enumerate(tones)}
INK = RAMP["ink"][0]
VOID = RAMP["void"][0]


# ---- OKLab matching --------------------------------------------------------


def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def oklab(rgb):
    """sRGB (0-255) -> (L, a, b): the perceptual space every palette match is measured in."""
    r, g, b = (_lin(c) for c in rgb[:3])
    l_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m_ = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s_ = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_)


def _unlin(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def srgb(lab):
    """(L, a, b) -> sRGB (0-255): the inverse of oklab."""
    L, a, b = lab
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return tuple(int(round(255 * _unlin(c))) for c in (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s))


def chroma(rgb, k):
    """`rgb` with its OKLab chroma scaled by k, lightness and hue kept — the runtime's atmosphere
    dial (shMeshlit's u_chroma) reproduced for a preview; k = 1 is the color itself."""
    L, a, b = oklab(rgb)
    return srgb((L, a * k, b * k))


_LAB = [oklab(c) for c in PALETTE]
_NEAR = {c: c for c in PALETTE}   # memo: foreign rgb -> palette entry (a palette color is its own)


def nearest(rgb):
    """The palette entry nearest to rgb in OKLab (alpha, if any, is ignored)."""
    key = tuple(rgb[:3])
    hit = _NEAR.get(key)
    if hit is None:
        L, a, b = oklab(key)
        best, bd = PALETTE[0], 1e30
        for p, (pL, pa, pb) in zip(PALETTE, _LAB):
            d = (L - pL) ** 2 + (a - pa) ** 2 + (b - pb) ** 2
            if d < bd:
                bd, best = d, p
        hit = _NEAR[key] = best
    return hit


def snap(pixels, alpha_thresh=128):
    """Every pixel of a flat (r, g, b, a) list onto its nearest entry; alpha becomes a hard cutout."""
    return [(0, 0, 0, 0) if a < alpha_thresh else nearest((r, g, b)) + (255,) for (r, g, b, a) in pixels]


# ---- ramps -----------------------------------------------------------------


def tone(name, i):
    return RAMP[name][i]


def base(name):
    """The middle tone of a ramp — the color a flat fill starts from."""
    tones = RAMP[name]
    return tones[len(tones) // 2]


def locate(color):
    """(ramp name, index) of a color; a non-palette color snaps to its nearest entry first."""
    return INDEX[nearest(color)]


def step(color, n):
    """The tone n steps lighter (n < 0: darker) within the color's ramp, clamped to its ends.
    A one-tone ramp (ink, void) never changes."""
    name, i = locate(color)
    tones = RAMP[name]
    return tones[min(len(tones) - 1, max(0, i + n))]


def dbl(name, i):
    """`dark`, `base`, `light` = the tones around `i` in a ramp (clamped), as keyword arguments:
    `M.grain(32, **PAL.dbl("rust", 2), seed=7)`."""
    tones = RAMP[name]
    return dict(dark=tones[max(0, i - 1)], base=tones[i], light=tones[min(len(tones) - 1, i + 1)])


# ---- images ----------------------------------------------------------------


def _png(path, w, h, px):
    """Minimal RGB PNG writer (px: a flat (r, g, b) list) — keeps this module free of the kits' I/O."""
    raw = b"".join(b"\x00" + bytes(c for p in px[y * w:(y + 1) * w] for c in p[:3]) for y in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9))
                + chunk(b"IEND", b""))


def swatch(path, cell=16, gap=2):
    """One row per ramp in RAMPS order, dark -> light, each tone a cell, ruled in ink."""
    cols = max(len(t) for t in RAMP.values())
    w = gap + cols * (cell + gap)
    h = gap + len(RAMPS) * (cell + gap)
    img = [INK] * (w * h)
    for r, (name, _) in enumerate(RAMPS):
        for c, col in enumerate(RAMP[name]):
            for y in range(cell):
                for x in range(cell):
                    img[(gap + r * (cell + gap) + y) * w + gap + c * (cell + gap) + x] = col
    _png(path, w, h, img)


def magica(path):
    """The 256x1 palette image MagicaVoxel imports (Palette > Open): pixel i fills slot i+1, so the
    editor's slots 1..64 are AAP-64 entries 0..63 and the rest stay black — a .vox saved from it
    carries the palette in the same order vox-kit writes."""
    _png(path, 256, 1, PALETTE + [(0, 0, 0)] * (256 - len(PALETTE)))


def main():
    os.makedirs(OUT, exist_ok=True)
    swatch(os.path.join(OUT, "aap-64.png"))
    magica(os.path.join(OUT, "aap-64-magica.png"))
    print(f"AAP-64: {len(RAMPS)} ramps -> out/aap-64.png, out/aap-64-magica.png")
    for name, idx in RAMPS:
        print(f"  {name:8s} " + " ".join("#%02x%02x%02x" % PALETTE[i] for i in idx))


if __name__ == "__main__":
    main()
