#!/usr/bin/env python3
"""palette — AAP-64 as the project palette, indexed by ramp.

`palettes/aap-64.gpl` IS the palette (Adigun Polack's AAP-64; the `.aseprite` sources under `art/`
embed the same 64). This module only names it: every one of the 64 entries belongs to exactly one
ramp, listed dark -> light, so a script asks for a tone by role and steps along the ramp to shade
instead of picking RGB. AAP-64's ramps already carry the modern hue shift (shadows lean violet /
blue, highlights lean yellow), so `step` shades the way the palette was drawn to be shaded.

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
    PAL.RAMP["rust"]          # the 5 regolith tones, dark -> light
    PAL.tone("steel", 2)      # one tone; PAL.base(name) is the middle one
    PAL.step(color, +1)       # one tone lighter within that color's ramp (clamped at the ends)
    PAL.dbl("moss", 2)        # {dark, base, light} around a tone — what the material recipes take
    PAL.INK, PAL.VOID         # the outline ink and the absolute black

Usage:  python palette.py   # prints the ramp table, writes out/style/palette.png
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixlib as P

GPL = os.path.join(P.KIT, "palettes", "aap-64.gpl")
PALETTE = P.load_palette(GPL)

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


def tone(name, i):
    return RAMP[name][i]


def base(name):
    """The middle tone of a ramp — the color a flat fill starts from."""
    tones = RAMP[name]
    return tones[len(tones) // 2]


def locate(color):
    """(ramp name, index) of a color; a non-palette color snaps to its nearest entry (OKLab)."""
    key = tuple(color[:3])
    hit = INDEX.get(key)
    if hit is None:
        hit = INDEX[P.nearest_color(key, PALETTE)]
    return hit


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


def swatch(path, cell=16, gap=2):
    """One row per ramp in RAMPS order, dark -> light, each tone a cell, ruled in ink."""
    cols = max(len(t) for t in RAMP.values())
    w = gap + cols * (cell + gap)
    h = gap + len(RAMPS) * (cell + gap)
    img = [INK + (255,)] * (w * h)
    for r, (name, _) in enumerate(RAMPS):
        for c, col in enumerate(RAMP[name]):
            for y in range(cell):
                for x in range(cell):
                    img[(gap + r * (cell + gap) + y) * w + gap + c * (cell + gap) + x] = col + (255,)
    P.write_png(path, w, h, img)


def main():
    swatch(os.path.join(P.out_dir("style"), "palette.png"))
    print(f"AAP-64: {len(RAMPS)} ramps -> out/style/palette.png")
    for name, idx in RAMPS:
        print(f"  {name:8s} " + " ".join("#%02x%02x%02x" % PALETTE[i] for i in idx))


if __name__ == "__main__":
    main()
