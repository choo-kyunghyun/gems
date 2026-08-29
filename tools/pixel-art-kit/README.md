# Pixel-Art Kit

A toolkit for drawing prototype sprites in the project's style: draw in a throwaway script and
write out PNG frames to import into GameMaker by hand. Pure Python stdlib, nothing to install
(`requirements.txt` is empty on purpose).

It is not an asset pipeline. It does not regenerate the project's committed art; it is a box of
primitives you import from a script written for the sprite in front of you, and usually delete after.

## Layout

```
pixel-art-kit/
├── palette.py     AAP-64 indexed by ramp: tone / base / step / dbl
├── raster.py      drawing: Canvas (hard alpha) + Soft (supersampled, hardened on the way out)
├── pixlib.py      I/O: PNG encode/decode, animated GIF, compositing, OKLab, quantize, paths
├── material.py    procedural tileable textures (noise / ripple / blades / grain) + decor stamps
├── tileset.py     synthesize an autotile set from one material (seamless by construction)
├── style.py       the reference board — one of everything, through the kit's own pipeline
├── spritesize.py  measure a candidate's silhouette -> a grid-snapped frame size
├── quantize.py    remap a PNG/folder onto the palette
├── preview.py     nearest-neighbor previews + a contact sheet
├── palettes/      aap-64.gpl, the project palette
└── out/           everything generated (gitignored)
```

Flat on purpose: one `sys.path` entry imports the whole kit. The `.aseprite` sources under `art/`
embed the same palette as `palettes/aap-64.gpl`; when the two disagree, Aseprite's copy wins.

## The style

What a sprite has to be to sit next to the committed set. The kit's defaults produce it; the
rules are here so a script knows what it is aiming at.

| | |
|---|---|
| **Cell** | 32 world px. Terrain and textures author 1:1 at 32 px; frames are multiples of the 16 px half-unit. |
| **Alpha** | Binary. Entities are alpha-tested billboards, so every pixel is fully opaque or fully clear — no soft edges, no partial alpha. |
| **Outline** | 1 px, `palette.INK` (AAP-64 `#141013`), around every silhouette. Not on a side flush with the frame edge. |
| **Palette** | AAP-64, nothing outside it. Reach for tones by ramp (below); `quantize` snaps anything foreign. |
| **Shading** | Along the ramp: a highlight is `step(+1)`, a shadow `step(-1)`. AAP-64's ramps already hue-shift (shadows lean violet / blue, highlights lean yellow), so stepping shades the modern way without picking colors. `Canvas.shade` does the lit-from-above rim in one call. |
| **Anchor** | Entities foot (bottom-center), items center, tiles top-left — set in the IDE on import. |

`python style.py` draws the reference board (`out/style/board.png`): the palette swatch, a crate
(Canvas), a Union trooper (Soft, hardened) and the four material recipes — what new art is judged
against.

### Ramps

`palette.py` names AAP-64 as 14 ramps, dark -> light, each of the 64 entries in exactly one:

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
PAL.tone("rust", 2)        # one tone (0 = darkest)
PAL.base("steel")          # the middle tone — where a flat fill starts
PAL.step(color, -1)        # one tone darker within that color's ramp, clamped at the ends
PAL.dbl("moss", 2)         # {dark, base, light} around a tone — what the material recipes take
```

## The loop

```python
import sys, os; sys.path.insert(0, "tools/pixel-art-kit")
import raster as R, pixlib as P, palette as PAL

c = R.Canvas(32, 32)
c.rect(4, 12, 27, 31, PAL.tone("leather", 3))    # body
c.disc(16, 8, 5, PAL.tone("steel", 3))            # lid
c.shade()                                         # rim: top a tone lighter, bottom a tone darker
c.outline()                                       # ink the silhouette — run last
P.write_png(os.path.join(P.out_dir("drum"), "pixDrum.png"), 32, 32, c.px)
```

Draw frames, write them out as PNGs under `out/`. The kit has no engine binding.

### Two drawing idioms

`Canvas`: hard alpha, 1 unit = 1 pixel. `rect` / `hline` / `vline` / `disc` / `paste` in palette
tones, then `shade`, then `outline`. The native idiom for 16–32 px cells.

`Soft`: shapes composited at 4× and box-downsampled — for curves, ellipses and rotated quads
(`rrect`, `ellipse`, `tri`, `thickline`) that are a pain to place by hand. It never leaves the
kit soft: `harden()` thresholds the alpha to binary and snaps every color to the palette,
returning a `Canvas` to shade and outline like any other.

```python
def draw(s):
    s.rrect(9, 22, 23, 42, 3, PAL.tone("slate", 2))     # torso
    s.ellipse(16, 14, 7, 8, PAL.tone("steel", 4))       # helmet

c = R.soft_canvas(draw, 32, 64)     # hardened Canvas
c.shade(); c.outline()
P.write_png(os.path.join(P.out_dir("trooper"), "pixTrooper.png"), 32, 64, c.px)
# or, without the detailing step:  R.soft_frame(draw, 32, 64)  ->  draw -> harden -> outline
```

Both finish as a flat list of `(r, g, b, a)` tuples, which is what `pixlib.write_png` takes.

## Materials

`material.py` generates tileable texture patches — the input an autotile set is cut from. Four
recipes, each seamless by construction, colors from the ramps:

| recipe | look | for |
|---|---|---|
| `noise` | coarse value-noise thresholded dark / base / light | basalt, mud, humus |
| `ripple` | warped sine bands over a tone ramp | water, ice sheets |
| `blades` | fine vertical strokes over a base | moss, grass, fur |
| `grain` | isolated 1 px specks over a base | regolith, dust, gravel, plaster |

```python
import material as M
regolith = M.grain(32, **PAL.dbl("rust", 2), seed=7)
water = M.ripple(32, [PAL.tone("sky", 1)] * 2 + [PAL.tone("sky", 2), PAL.tone("sky", 3)], seed=7)
rolls = M.variants(lambda s: M.grain(32, **PAL.dbl("rust", 2), seed=s), 4, seed=7)
stony = M.decorate(rolls[1], 32, "pebbles", seed=99, lit=PAL.tone("steel", 3), dark=PAL.tone("steel", 1))
```

`variants` re-rolls one recipe for full-tile alternates (a `ripple` must stay one tile — a phase jump
seams); `decorate` scatters `flowers` / `pebbles` stamps clear of the border so a decorated cell
still abuts plain neighbors. `python material.py [algo|all] [size]` writes a demo of each recipe.

## Autotile sets

`tileset.py` synthesizes a full autotile set from one material texture. Every piece is cut from the
same patch, so the edges match by construction; an autotile set assembled from independently drawn
cells never tiles.

```sh
python tileset.py <material.png> <cell> --mode dual|corner|both [--heal] [--palette F | --raw] [--variant V.png ...]
#   dual_strip16.png  = 16 corner-keyed frames     corner_strip13.png = 13 quarter pieces
#   dual_strip20.png  = the 16 + 4 --variant full tiles appended as frames 16..19
```

`--mode dual` → 16 corner-keyed frames (A-over-B transitions); `--mode corner` → 13 quarter-tile
pieces (the blob8 look; good for walls). `--variant` (dual only, repeatable) appends full-tile
alternates after the 16 masks so a runtime can vary a wide field per cell. Each mode also writes a
`preview_<mode>` and a `seamless_<mode>` tiling test (dual picks the alternates by position hash).
Output is locked to AAP-64 unless `--raw`; `--heal` forces tileability on a non-seamless input.
`corner` cuts its pieces from a half-cell patch, so author a wall material at `cell/2` (a larger
one is cropped, and a crop of a seamless patch is not seamless). Omit the input for the built-in
procedural regolith.

## Other tools

```sh
python quantize.py <in> <out> [pal.gpl]           # lock art onto the palette (default AAP-64)
python preview.py [dir ...]                       # NN previews + contact sheet from out/<dir> (default style)
python spritesize.py <image.png> [foot|center]    # measure -> grid-snapped W x H
```

`spritesize.py` measures the silhouette, snaps it to the size menu (`16,32,48,64,80,96,128`), and
prints the `write` call to paste. `quantize` and every palette snap in the kit match in OKLab, so a
dark red does not land on a dark green the way a nearest-RGB match would.

## Registration

None. The kit writes PNGs and stops; importing them as a `GMSprite` is a manual step in the IDE, which
is also where the origin, the collision mask, and the playback speed are set. Never register a
resource by hand-editing the yyp's Resources list; use `gm-cli` (see `docs/GMCLI.md`).
