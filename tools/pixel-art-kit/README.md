# Pixel-Art Kit

A toolkit for drawing prototype sprites: draw in a throwaway script and write out PNG frames to
import into GameMaker by hand. Pure Python stdlib, nothing to install (`requirements.txt` is empty on
purpose).

It is not an asset pipeline. It does not regenerate the project's committed art; it is a box of
primitives you import from a script written for the sprite in front of you, and usually delete after.

## Layout

```
pixel-art-kit/
├── raster.py      drawing: Canvas (hard alpha) + Soft (anti-aliased)
├── pixlib.py      I/O: PNG encode/decode, animated GIF, compositing, quantize, paths
├── material.py    procedural tileable textures (noise / ripple / blades / grain) + decor stamps
├── tileset.py     synthesize an autotile set from one material (seamless by construction)
├── spritesize.py  measure a candidate's silhouette -> a grid-snapped frame size
├── quantize.py    remap a PNG/folder onto a palette
├── preview.py     nearest-neighbor previews + a contact sheet
├── palettes/      aap-64.gpl, the project palette
└── out/           everything generated (gitignored)
```

Flat on purpose: one `sys.path` entry imports the whole kit. The `.aseprite` sources under `art/` embed
the same palette as `palettes/aap-64.gpl`; when the two disagree, Aseprite's copy wins.

## The loop

```python
import sys, os; sys.path.insert(0, "tools/pixel-art-kit")
import raster as R, pixlib as P

def draw(s):
    s.rrect(6, 20, 26, 60, 4, (71, 125, 133))     # body
    s.ellipse(16, 14, 7, 8, (218, 224, 234))      # head

P.write_png(os.path.join(P.out_dir("scout"), "pixScout.png"), 32, 64, R.soft_frame(draw, 32, 64))
```

Draw frames, write them out as PNGs under `out/`. The kit has no engine binding.

### Two drawing idioms

`Canvas`: hard alpha, 1 unit = 1 pixel. Every pixel is fully opaque or fully clear, the classic
pixel-art constraint. Right for small cells (16–32 px) where a soft edge reads as mud.

```python
c = R.Canvas(16, 16)
c.rect(5, 6, 10, 15, (121, 103, 85, 255))
c.disc(8, 4, 3, (219, 164, 99, 255))
c.outline((34, 28, 26, 255))          # ink the silhouette — run last
P.write_png(os.path.join(P.out_dir("crate"), "pixCrate.png"), 16, 16, c.px)
```

`Soft`: shapes composited at 4× and box-downsampled, so curves and rotated quads come out
anti-aliased. `soft_frame(drawfn, w, h)` runs draw → outline → downsample in one call. The project's
32 px entity art was drawn this way.

Both finish as a flat list of `(r, g, b, a)` tuples, which is what `pixlib.write_png` takes.

### Anchors

The sprite origin is set in the IDE on import; which one a frame wants follows from its subject:

| anchor | origin | for |
|---|---|---|
| `foot` | bottom-center | entities that stand on the ground (the project default) |
| `center` | middle-center | item icons, drawn centered in a UI slot |
| `topleft` | 0,0 | tiles, wall/floor textures |

## Materials

`material.py` generates tileable texture patches — the input an autotile set is cut from. Four
recipes, each seamless by construction, colors chosen by the caller:

| recipe | look | for |
|---|---|---|
| `noise` | coarse value-noise thresholded dark / base / light | stone, mud, humus |
| `ripple` | warped sine bands over a tone ramp | water |
| `blades` | fine vertical strokes over a base | grass, fur |
| `grain` | isolated 1 px specks over a base | sand, gravel, plaster |

```python
import material as M
grass = M.blades(32, base=(50, 132, 100), dark=(35, 103, 78), light=(93, 175, 141), seed=7)
rolls = M.variants(lambda s: M.blades(32, base=..., dark=..., light=..., seed=s), 4, seed=7)
bloom = M.decorate(rolls[1], 32, "flowers", seed=99, petals=[(228, 210, 170)], core=(219, 164, 99))
```

`variants` re-rolls one recipe for full-tile alternates (a `ripple` must stay one tile — a phase jump
seams); `decorate` scatters `flowers` / `pebbles` stamps clear of the border so a decorated cell
still abuts plain neighbors. `python material.py [algo|all] [size]` writes a demo of each recipe.

## Autotile sets

`tileset.py` synthesizes a full autotile set from one material texture. Every piece is cut from the
same patch, so the edges match by construction; an autotile set assembled from independently drawn
cells never tiles.

```sh
python tileset.py <material.png> <cell> --mode dual|corner|both [--heal] [--palette F] [--variant V.png ...]
#   dual_strip16.png  = 16 corner-keyed frames     corner_strip13.png = 13 quarter pieces
#   dual_strip20.png  = the 16 + 4 --variant full tiles appended as frames 16..19
```

`--mode dual` → 16 corner-keyed frames (A-over-B transitions); `--mode corner` → 13 quarter-tile
pieces (the blob8 look; good for walls). `--variant` (dual only, repeatable) appends full-tile
alternates after the 16 masks so a runtime can vary a wide field per cell. Each mode also writes a
`preview_<mode>` and a `seamless_<mode>` tiling test (dual picks the alternates by position hash).
`--heal` forces tileability on a non-seamless input. Omit the input for the built-in procedural demo
material.

## Other tools

```sh
python quantize.py <in_dir> <out_dir> <pal.gpl>   # lock art onto a palette
python preview.py                                 # NN previews + contact sheet from out/
python spritesize.py <image.png> [foot|center]    # measure -> grid-snapped W x H
```

`spritesize.py` measures the silhouette, snaps it to the size menu (`16,32,48,64,80,96,128`), and
prints the `write` call to paste.

## Registration

None. The kit writes PNGs and stops; importing them as a `GMSprite` is a manual step in the IDE, which
is also where the origin, the collision mask, and the playback speed are set. Never register a
resource by hand-editing the yyp's Resources list; use `gm-cli` (see `docs/GMCLI.md`).
