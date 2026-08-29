# Palette

AAP-64 is the project palette — the one set of 64 colors every sprite, voxel mesh and `.aseprite`
source draws from, and nothing outside it. This directory owns it: `aap-64.gpl` is the palette
(the Aseprite exchange format; the `.aseprite` sources under `art/` embed the same 64 and win when
the two disagree) and `palette.py` names it by ramp so a script asks for a tone by role instead of
picking RGB. Pure Python stdlib, nothing to install.

It is a project constant, not a tool option: no script under `tools/` takes a palette parameter.
Each art kit puts this directory on `sys.path` and does `import palette as PAL`.

```
palette/
├── aap-64.gpl    the palette (GIMP/Aseprite format)
├── palette.py    ramps, tone lookup, OKLab matching, the swatch + MagicaVoxel exports
└── out/          generated (gitignored)
```

## Ramps

Each of the 64 entries belongs to exactly one ramp, listed dark -> light. AAP-64's ramps already
hue-shift (shadows lean violet / blue, highlights lean yellow), so stepping along a ramp shades the
modern way without picking colors: a highlight is `step(+1)`, a shadow `step(-1)`.

| ramp | tones | for |
|---|---|---|
| `void` | 1 | the one absolute black: vacuum, a cast shadow |
| `ink` | 1 | the outline |
| `blood` | 4 | red: flags, blood, red paint, a health bar |
| `hazard` | 4 | safety orange -> amber -> yellow: warning paint, fire, muzzle flash |
| `moss` | 7 | dark green -> lime: moss, grass, go-lights, acid |
| `sky` | 5 | navy -> blue -> cyan -> mint: thin sky, water, ice, holo, energy |
| `bone` | 3 | peach -> cream -> white: bone, paper, glare, skin highlight |
| `viol` | 6 | violet -> magenta -> salmon: illegal mods, the unnatural, neon |
| `leather` | 6 | warm brown -> tan -> sand: raider leather, wood, plywood, skin |
| `steel` | 6 | cold grey: Union steel, concrete, asphalt, basalt |
| `rust` | 5 | dusty red-brown: regolith, oxide, brick, dried blood |
| `slate` | 5 | teal -> periwinkle -> lavender: Union fatigues, painted panels, ice shadow |
| `bio` | 5 | sickly teal-green: lichen, the engineered ecology, medical, coolant |
| `ochre` | 6 | khaki -> bone: dust, sand, plaster, drab canvas |

```python
import palette as PAL
PAL.PALETTE                # the 64 (r, g, b), index = AAP-64 index
PAL.tone("rust", 2)        # one tone (0 = darkest)
PAL.base("steel")          # the middle tone — where a flat fill starts
PAL.step(color, -1)        # one tone darker within that color's ramp, clamped at the ends
PAL.dbl("moss", 2)         # {dark, base, light} around a tone — what the material recipes take
PAL.INK, PAL.VOID          # the outline ink and the absolute black
PAL.nearest(rgb)           # the entry nearest a foreign color
PAL.snap(pixels)           # a flat (r, g, b, a) list locked onto the palette, alpha a hard cutout
```

`nearest` matches in OKLab, so a dark red never lands on a dark green the way a nearest-RGB match
would; every quantize in the kits goes through it.

## Exports

```sh
python palette.py    # ramp table on stdout; out/aap-64.png (swatch), out/aap-64-magica.png
```

`aap-64-magica.png` is the 256×1 palette image MagicaVoxel imports (Palette > Open): pixel i fills
the editor's slot i+1, so slots 1..64 are AAP-64 entries 0..63. Start a hand-built model from it and
the saved `.vox` carries the palette in the same order `vox-kit` writes.
