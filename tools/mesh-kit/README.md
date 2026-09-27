# Meshes

Volume props are 3D models in `datafiles/meshes/`. A model comes in two formats that share one name:

- `.vox` (MagicaVoxel): the runtime greedy-meshes it at load, so the editable file is the asset.
- `.mesh` (PMSH): a baked low-poly model. A `.mesh` shadows the `.vox` of the same name, and the
  `.vox` stays in place as the spare.

There is no code here. Build a model in MagicaVoxel or in a throwaway script kept outside the
repository. Check it in the game: place it, then `Screenshot.take()` (CLAUDE.md, Debugging).

## The contract

| | |
|---|---|
| Units | 1 model unit (1 voxel) = 1 world px, so a cell is 128 units. A model authored at another scale declares its `density` (model units per world px) in `contentMeshes`, e.g. `0.25` for 32 units per cell, as every committed model is; an undeclared model draws at density 1. |
| Axes | Author in MagicaVoxel's axes: x = east, y = south (+y is the face toward the camera), z = up, with the ground at z = 0. |
| Placement | The model is centered on its footprint with its feet at z = 0. For a `.vox`, the runtime centers the canvas, not the content, so content off the canvas center draws off its collider. Content above z = 0 floats. |
| Collider | Derived from the tight content extent w × d: `max(32, w / density − 8)` × `max(32, d / density − 8)` world px. |
| Faces | Top and four sides, never a bottom. The fixed-yaw camera sees the top and the south face. |
| Shading | Never authored. The shader lights the flat colour live, so a surface carries only its base tone. |
| Palette | AAP-64 RGB only (`tools/palette`). |
| Name | camelCase `<material><Object>[<Variant>]`, shared by the file and `Mesh.model` (`docs/NAMING.md`). |

## .vox

The runtime reads only the first `SIZE` + `XYZI` model and the `RGBA` palette, and ignores every
other chunk. A file with no palette logs an error and draws nothing. Palette indices are 1-based
(0 = empty), and `RGBA` entry i − 1 is the colour of index i. By convention, slots 1..64 are AAP-64
entries 0..63 (`tools/palette`, MagicaVoxel). Committed canvases, all at density 0.25, are
32×32×32 or 64×32×32.

A minimal file: `"VOX "`, int32 150, then a `MAIN` chunk with empty content whose children are
`SIZE` (3 × int32), `XYZI` (int32 count + count × u8 x, y, z, index) and `RGBA` (256 × u8 r, g, b, a).
A chunk is its id, int32 content size, int32 children size, content, then children. All integers
are little-endian.

## .mesh

All values are little-endian. The file is a triangle list.

- Header, 24 B: `"PMSH"`, u32 version 1, u32 vertex count, f32 content w, d, h (the tight extent).
- Vertex, 24 B: f32 x, y, z in game space; u8 r, g, b, 255; f32 nx, ny (the packed normal).

Game space is author space with z negated: `(x, y, −z)`, so up is −z.

The normal is one per face, taken from the winding, which is counter-clockwise seen from outside.
The shader recovers `nz = −sqrt(1 − nx² − ny²)` in game space, so a normal cannot point down:

- An underside normal (author nz < 0) clamps to horizontal, with (nx, ny) renormalized. The camera
  never sees one.
- A straight-down face cannot be represented, so never emit one.

## Registration

1. Put the file in `datafiles/meshes/`.
2. Register a new file once in `gems.yyp`'s `IncludedFiles`, as a hand-added sibling line in the
   array's order; resourcetool has no included-file command.
3. Declare it in `contentMeshes`.
4. Name it in a preset's `Mesh.model`.

Editing an existing model needs none of these steps.

## Before shipping

These must hold, or the runtime or the palette rule rejects the model:

- the file parses;
- it has a model and a palette;
- every colour is on AAP-64;
- every packed normal lies inside the unit disc;
- it has at most 1000 triangles (more means a runaway generator).

These draw wrong:

- a second model;
- the lowest voxel above z = 0;
- content more than 1 unit off center;
- parts not 6-connected to the grounded body;
- a header content that disagrees with the geometry;
- degenerate triangles.
