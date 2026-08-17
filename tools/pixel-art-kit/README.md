# Pixel-Art Kit

A small, **zero-dependency** toolkit for making sprites for **quick prototypes** — draw in a throwaway
script, push the result straight into GameMaker. Pure Python stdlib: no PIL, no installs.

This kit is **not an asset pipeline.** It does not regenerate the project's committed art and does not
try to. It is a box of primitives you import from a script you write for the sprite in front of you,
and then usually delete.

---

## Layout

```
pixel-art-kit/
├── raster.py      drawing: Canvas (hard alpha) + Soft (anti-aliased)
├── pixlib.py      I/O: PNG encode/decode, animated GIF, compositing, quantize, paths
├── gmsprite.py    the one engine binding: frames -> a GameMaker sprite asset
├── tileset.py     synthesize an autotile set from ONE material (seamless by construction)
├── spritesize.py  measure a candidate's silhouette -> a grid-snapped frame size
├── quantize.py    remap a PNG/folder onto a provided palette
├── preview.py     nearest-neighbor previews + a contact sheet
├── palettes/      palette library (.hex): db32 (default) + db16/arne16/aap64/endesga32/zughy32/nyx8
└── out/           everything generated (gitignored)
```

Flat on purpose — one `sys.path` entry and a scratch script can import the whole kit.

---

## The loop

```python
import sys; sys.path.insert(0, "tools/pixel-art-kit")
import raster as R, gmsprite as G

def draw(s):
    s.rrect(6, 20, 26, 60, 4, (93, 138, 134))     # body
    s.ellipse(16, 14, 7, 8, (216, 210, 196))      # head

G.write("spr_scout", [R.soft_frame(draw, 32, 64)], 32, 64, anchor="foot")
```

That is the whole workflow: draw frames, hand them to `gmsprite.write`. The sprite appears in
`sprites/spr_scout/` filed under its IDE folder, with the origin already set.

### Two drawing idioms

**`Canvas`** — hard alpha, 1 unit = 1 pixel. Every pixel is fully opaque or fully clear, the classic
pixel-art constraint. Right for small cells (16–32 px) where a soft edge just reads as mud.

```python
c = R.Canvas(16, 16)
c.rect(5, 6, 10, 15, (122, 96, 62, 255))
c.disc(8, 4, 3, (200, 170, 90, 255))
c.outline((38, 34, 24, 255))          # ink the silhouette — run last
G.write("spr_crate", [c.px], 16, 16, anchor="foot")
```

**`Soft`** — shapes composited at 4× and box-downsampled, so curves and rotated quads come out
anti-aliased. `soft_frame(drawfn, w, h)` runs draw → outline → downsample in one call. This is what
the project's committed 32 px entity art was drawn with.

Both finish as a flat list of `(r, g, b, a)` tuples, which is what `pixlib.write_png` and
`gmsprite.write` take.

### Anchors

`gmsprite.write(..., anchor=)` sets the sprite origin — the thing the IDE makes tedious by hand:

| anchor | origin | for |
|---|---|---|
| `foot` | bottom-center | entities that stand on the ground (the project default) |
| `center` | middle-center | item icons, drawn centered in a UI slot |
| `topleft` | 0,0 | tiles, wall/floor textures |

Unsure of the frame size? `python spritesize.py <candidate.png>` measures the silhouette and snaps it
to the size menu (`16,32,48,64,80,96,128`), printing the `write` call to paste.

---

## Autotile sets

`tileset.py` synthesizes a full autotile set from **one** material texture, cut so the frames tile by
construction — the edges match because every piece comes from the same patch:

```sh
python tileset.py <material.png> <cell> --mode dual|corner|both [--heal] [--palette F]
#   dual_strip16.png  = 16 corner-keyed frames     corner_strip13.png = 13 quarter pieces
```

`--mode dual` → 16 corner-keyed frames (RPG-Maker-style A-over-B transitions); `--mode corner` → 13
quarter-tile pieces (the blob8 look; good for walls). Each mode also writes a `preview_<mode>` and a
`seamless_<mode>` tiling test. `--heal` forces tileability on a non-seamless input. Omit the input for
the built-in procedural demo material.

Never assemble an autotile set from independently drawn cells — the seams won't line up. Cutting from
one patch is the whole point.

---

## Other tools

```sh
python quantize.py <in_dir> <out_dir> <pal.hex>   # lock art onto a provided palette
python preview.py                                 # NN previews + contact sheet from out/
python spritesize.py <image.png> [foot|center]    # measure -> grid-snapped W x H
```

`palettes/` is a small library of `.hex` files (one `rrggbb` per line; the `#`-comment header carries
attribution). **db32** (DawnBringer 32) is this project's standard — see [GEMS.md](GEMS.md).

---

## Registration

`gmsprite.write` registers the resource in `gems.yyp` through `gm-cli` when it isn't there yet, so a
new sprite is one call. It never hand-edits the yyp's Resources list — that corrupts the project (see
`docs/GMCLI.md`). If `gm-cli` isn't on PATH it says so and tells you the command to run.

Frame and layer uuids are uuid5-derived from the sprite name, so re-running a script rewrites the same
ids instead of churning the `.yy`. That is free, and unrelated to whether the art itself is
reproducible — it isn't, and doesn't need to be.

---

## Requirements

**Python 3, stdlib only.** PNG encode+decode and the animated-GIF writer are hand-rolled in `pixlib`.
Nothing to install; `requirements.txt` is empty and says so deliberately. All output goes under `out/`
(gitignored).
