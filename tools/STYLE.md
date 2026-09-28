# Style

This is how every asset has to look to belong to the same world. The contracts (palette, sizes,
alpha, file formats) are in `PALETTE.md`, `SPRITE.md` and `MESH.md`; this guide is the look. Assets
drawn before it converge on it as they are redrawn.

The world is a calm, near-future frontier: humanity's best hardware left behind on a failed planet,
still standing and precise. The art records hardship plainly. It never dramatizes it.

## Pillars

| | |
|---|---|
| Read first | A thing is identified by silhouette and value at the start zoom, before colour or detail. |
| Calm surfaces | Flat planes. No noise, grime, rust streaks, scratches or texture. |
| Authored once | An asset is drawn new and neutral. Age, wear and faction colouring are variations the shader applies over it, never separate art or a separate palette. |

## Scale

The renderer point-samples, and the camera stops at zoom 0.125, 0.25, 0.5 and 1 — powers of two, so
a texel always covers whole screen pixels. The colony starts at 0.5.

- All 2D art is drawn at 64 px per cell: one px is one screen pixel at the start zoom and two at 1.
  Tile sets, which the runtime draws unscaled, are scaled up after drawing (`SPRITE.md`).
- A detail meant to read at the start zoom is at least 1 px; at 0.25, 2 px. At 0.125 only the
  silhouette and the large value areas carry the read.
- Proportions favour readability: a character's head is about a third of its height, a held item
  is drawn thicker than true (`SPRITE.md`, Item).

## 2D and 3D

The world mixes standing sprites and meshes under one lit shader.

| form | used for |
|---|---|
| Standing sprite | characters, creatures, items, flora: anything organic, carried or animated |
| Low-poly mesh | manufactured volumes: furniture, machines, containers, structures |
| Tiles | terrain and walls |

There are no voxel models: a voxel's stepped faces spend the triangle budget (`MESH.md`) on
edges instead of form.

## Colour

AAP-64 only (`PALETTE.md`).

## Light and Shade

- Baked shading is vertical only. It echoes the shader lighting a mesh's top brighter than its
  sides; directional light itself comes from the shader, so nothing is lit from one side and every
  sprite survives a horizontal flip.
- No dithering, gradients or anti-aliasing.
- A specular is optional, one per object, on glass, metal or wet surfaces, in the upper half and
  never on one side.
- No cast or drop shadows; the renderer draws ground contact.
- Meshes carry no shading at all: one flat colour per face (`MESH.md`).

## Outline

An outline is 1 px: one screen pixel at the start zoom, two at 1.

## Shape

| family | shape language |
|---|---|
| Manufactured | Rectangles with 45° chamfers, one corner radius per object, panel seams on an even grid, bilateral symmetry. On a mesh, a chamfer is one 45° face and a curve a few flat faces, never smoothed. |
| Designed ecosystem | Rounded, uniform and repeated: the flora was engineered, so it looks regular. Lobes, not ragged edges. |
| Threat | Points and triangles belong to weapons, spikes and hazard signs only. |
| Anomaly | Swollen, off-axis, bulbous growth on an otherwise normal form. It reads only beside the normal. |

## Frontier Motifs

The space-opera layer is quiet and functional, never glowing or ornate:

- Stenciled codes and numbers as simple blocks.
- A single livery stripe per manufactured object.
- Rounded-rectangle viewports and hatches.
- Status lights as a 2–4 px cluster, one per machine.
- Hazard bands at 45°, only on machinery that moves or harms.

## UI

- Panels are flat, with no bevel, gradient or glow.

## Checks

Before an asset ships:

1. Nearest-neighbour downscale it to each zoom stop below 1: every px survives at 0.5, and at 0.125
   the silhouette still names the thing.
2. Convert it to greyscale over its biome's ground: it separates.
3. Flip it horizontally: the lighting still reads the same.
4. Every colour is on AAP-64.
5. In the game at the start zoom, beside three shipped assets of its category, it matches their
   outline and detail size.
