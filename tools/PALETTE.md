# Palette

AAP-64 is the project palette. Every sprite, mesh and `.aseprite` source uses these 64 colors and
nothing else. `aap-64.gpl` is the palette in GIMP/Aseprite format: its `R G B` lines are entries 0..63
in order. The `.aseprite` sources under `art/` embed the same 64 colors, and they win when the two
disagree.

## Ramps

Each entry belongs to exactly one ramp. The table lists every ramp's indices from dark to light.

| ramp | indices, dark → light |
|---|---|
| `void` | 0 |
| `ink` | 1 |
| `blood` | 2 3 4 5 |
| `hazard` | 6 7 8 9 |
| `moss` | 16 15 14 13 12 11 10 |
| `sky` | 17 18 19 20 21 |
| `bone` | 24 23 22 |
| `viol` | 30 29 28 27 26 25 |
| `leather` | 31 32 33 34 35 36 |
| `steel` | 42 41 40 39 38 37 |
| `rust` | 43 44 45 46 47 |
| `slate` | 52 51 50 49 48 |
| `bio` | 53 54 55 56 57 |
| `ochre` | 63 62 61 60 59 58 |

## Matching

To bring a foreign color onto the palette, use the entry nearest to it in OKLab, measured as
squared distance. Never match on raw RGB: it sends a dark red to a dark green. When snapping an
image, alpha becomes a hard cutout at 128.

## MagicaVoxel

MagicaVoxel imports a palette from a 256×1 PNG (Palette > Open). Pixel i of that image is entry i,
and every pixel past 63 is black. The editor puts pixel i in slot i+1, so its slots 1..64 hold
AAP-64 entries 0..63. Project `.vox` files use the same slot order.
