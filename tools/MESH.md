# Meshes

Volume props are low-poly 3D models in `datafiles/meshes/`, one `.mesh` (PMSH) file each.

There is no code here. Build a model in Blender or in a throwaway script kept outside the
repository. Check it in the game: place it, then `Screenshot.take()` (CLAUDE.md, Debugging).

## The contract

| | |
|---|---|
| Units | 1 model unit = 1 world px, so a cell is 32 units, as every committed model is. A model authored at another scale declares its `density` (model units per world px) in `contentMeshes`; an undeclared model draws at density 1. |
| Axes | x = east, y = south (+y is the face toward the camera), z = up, with the ground at z = 0. |
| Placement | The model is centered on its footprint with its feet at z = 0. Content above z = 0 floats. |
| Collider | Derived from the tight content extent w × d: `max(8, w / density − 2)` × `max(8, d / density − 2)` world px. |
| Faces | Top and four sides, never a bottom. The fixed-yaw camera sees the top and the south face. |
| Shading | Never authored. The shader lights the flat colour live, so a surface carries only its base tone. |
| Palette | AAP-64 RGB only (`tools/PALETTE.md`). |
| Name | camelCase `<material><Object>[<Variant>]`, shared by the file and `Mesh.model` (`docs/NAMING.md`). |

## .mesh

The byte layout is in the `Poly` script's header. A normal is one per face, taken from the winding,
which is counter-clockwise seen from outside. A normal cannot point down: an underside normal clamps
to horizontal, and a straight-down face cannot be represented, so never emit one.

## Registration

1. Put the file in `datafiles/meshes/`.
2. Register a new file once in `gems.yyp`'s `IncludedFiles`, as a hand-added sibling line in the
   array's order; resourcetool has no included-file command.
3. Declare it in `contentMeshes` if it is not authored at 32 units per cell.
4. Name it in a preset's `Mesh.model`.

Editing an existing model needs none of these steps.

## Before shipping

These must hold, or the runtime or the palette rule rejects the model:

- the file parses;
- every colour is on AAP-64;
- every packed normal lies inside the unit disc;
- it has at most 1000 triangles (more means a runaway generator).

These draw wrong:

- the lowest vertex above z = 0;
- content more than 1 unit off center;
- a part floating free of the grounded body;
- a header content that disagrees with the geometry;
- degenerate triangles.
