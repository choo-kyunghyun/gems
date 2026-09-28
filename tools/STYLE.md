# Style

This is how every asset has to look to belong to the same world. The contracts (palette, sizes,
alpha, file formats) are in `PALETTE.md`, `SPRITE.md` and `MESH.md`.

The world is a calm, near-future frontier: humanity's best hardware left behind on a failed planet,
still standing and precise. The art records hardship plainly. It never dramatizes it.

## Scale

The renderer point-samples, and the camera stops at zoom 0.125, 0.25, 0.5 and 1 — powers of two, so
a texel always covers whole screen pixels. The colony starts at 0.5. All 2D art is drawn at 64 px
per cell: one px is one screen pixel at the start zoom and two at 1.

## 2D and 3D

The world mixes standing sprites and meshes under one lit shader, which supplies the directional
light.

| form | used for |
|---|---|
| Standing sprite | characters, creatures, items, flora: anything organic, carried or animated |
| Low-poly mesh | manufactured volumes: furniture, machines, containers, structures |
| Tiles | terrain and walls |

## Matching

A new asset is judged in the game at the start zoom, beside shipped assets of its category.
