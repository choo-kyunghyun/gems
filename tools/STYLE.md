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
| Calm surfaces | Flat planes in two or three tones. No noise, grime, rust streaks, scratches or texture. |
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

AAP-64 only, used by role. The role says which ramps an object may draw from.

| role | ramps | used for |
|---|---|---|
| Structure | `steel` `slate` `bone` `ochre` | hulls, panels, walls, furniture, uniforms |
| Nature | `moss` `leather` `rust` `ochre` | ground, flora, wood, cloth; `rust` is the bare planet |
| Interact / caution | `hazard` | handles, hazard bands, pickups that must be found |
| Tech / power / water | `sky` `bio` | lights, screens, energy, water, medical |
| Harm | `blood` | wounds, damage, health |
| Anomaly | `viol` | overgrowth, mutation, the unknown; nowhere else |
| Line | `void` `ink` | holes, openings, deepest shadow |

- Split an object about 60 / 30 / 10: a structure or nature base, a secondary material, and at most
  one signal feature (one stripe, one light, one handle) from a signal role.
- Large areas use the middle of a ramp. The two lightest entries of `hazard`, `moss`, `sky` and
  `bio` are accents only, never a fill.
- Mood is not baked. Time of day, weather and season tint everything in the shader, so an asset
  carries its daylight colours.

### Value bands

Measured in OKLab L (`PALETTE.md`, Matching):

| layer | L | why |
|---|---|---|
| Terrain | 0.35 – 0.70, low chroma | the stage; everything above it must separate from it |
| Structures, props, flora | 0.45 – 0.90 | light planes, separated by value alone |
| Characters, creatures, items | outline ≤ 0.26 and one plane ≥ 0.75 | spans the terrain band on both sides, so it reads on any ground |
| Signal features | the highest chroma in view | the eye goes to them first |

## Light and Shade

- Baked shading is vertical only: the top plane lightest, a shade band along the bottom (about a
  quarter of the height), optionally one light row on the top edge. It echoes the shader lighting a
  mesh's top brighter than its sides; directional light itself comes from the shader, so nothing is
  lit from one side and every sprite survives a horizontal flip.
- A material has at most three tones: shade, base, light. No dithering, gradients or anti-aliasing.
- A specular is optional, one per object, on glass, metal or wet surfaces, in the upper half and
  never on one side.
- No cast or drop shadows; the renderer draws ground contact.
- Meshes carry no shading at all: one flat colour per face (`MESH.md`).

## Outline

The outline marks what acts or can be carried: characters, creatures, and items, gear and weapons
included. Everything else — terrain, walls, flora and every mesh — has none and separates by value
and by the shader's face light, so the 2D and 3D world share one flat language and the line stays a
signal.

| | |
|---|---|
| Silhouette | 1 px: one screen pixel at the start zoom, two at 1. It breaks up at 0.25 and below, where the silhouette carries the read. |
| Inner seams | 1 px, and only where two parts overlap or a material changes. Two parts that differ enough in value need no seam. |
| Rig parts | Each part is outlined on its own, so where parts overlap the upper part's outline is the seam. |
| Colour | The dark of the object's dominant ramp group, below. |
| Tinted rigs | `void`. A body tinted per skin darkens its colour but not its outline, so the line stays tint-proof. |

| ramps | outline |
|---|---|
| `blood` | `blood 2` |
| `moss` `bio` | `moss 16` |
| `steel` `slate` `sky` `viol` | `viol 30` |
| `leather` `ochre` `rust` `bone` `hazard` | `leather 31` |

## Shape

| family | shape language |
|---|---|
| Manufactured | Rectangles with 45° chamfers, one corner radius per object, panel seams on an even grid, bilateral symmetry. On a mesh, a chamfer is one 45° face and a curve a few flat faces, never smoothed. |
| Designed ecosystem | Rounded, uniform and repeated: the flora was engineered, so it looks regular. Lobes, not ragged edges. |
| Threat | Points and triangles belong to weapons, spikes and hazard signs only. |
| Anomaly | Swollen, off-axis, bulbous growth on an otherwise normal form, with a `viol` accent. It reads only beside the normal. |

## Frontier Motifs

The space-opera layer is quiet and functional, never glowing or ornate:

- Stenciled codes and numbers as simple blocks, one step off the base colour.
- A single livery stripe per manufactured object.
- Rounded-rectangle viewports and hatches.
- Status lights as a 2–4 px `sky` or `bio` cluster, one per machine.
- Hazard bands (`hazard` on `void`, 45°) only on machinery that moves or harms.

## UI

- Panels are flat and dark with no bevel, gradient or glow. A bar's colour is its meaning and is not
  reused for anything else on the screen.

## Checks

Before an asset ships:

1. Nearest-neighbour downscale it to each zoom stop below 1: every px survives at 0.5, and at 0.125
   the silhouette still names the thing.
2. Convert it to greyscale over its biome's ground: it separates.
3. Flip it horizontally: the lighting still reads the same.
4. Every colour is on AAP-64 and every colour's ramp fits the asset's roles.
5. In the game at the start zoom, beside three shipped assets of its category, it matches their
   outline, tone count and detail size.
