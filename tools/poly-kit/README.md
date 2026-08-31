# Poly Kit

A toolkit for the low-poly props (the VOLUME category's CURVED members: barrels, pedestals,
domes — what a voxel grid can only stair-step) in the project's style: build a model in a
throwaway script, bake it to the stream the runtime draws, check it against the contract, and
see it under the game camera without a game run. Pure Python stdlib, nothing to install.

It is not an asset pipeline and there is no runtime meshing at all: the kit bakes
`datafiles/meshes/<name>.mesh` — the exact 24 B/vertex stream `RenderMesh`'s vertex format
declares — and the runtime `Poly` script hands it to a vertex buffer. A `.mesh` SHADOWS the
same name's `.vox` (RenderMesh and ColonySpawn.footprint try `Poly` first), so a migrated
prop keeps its vox file in place as the spare. Boxy props should STAY vox (`tools/vox-kit`) —
their greedy-meshed faces are already resolution-free.

## Layout

```
poly-kit/
├── polylib.py     Mesh (triangle soup) + the .mesh bake/parse + author->game transform
├── shape.py       building: box / lathe (surface of revolution) over a Mesh
├── lint.py        the runtime contract + the style, as one pass over a file or folder
├── preview.py     render bakes under the game camera (shMeshlit's sun) + a sheet
├── style.py       the reference board — one of everything, through the kit's own pipeline
└── out/           everything generated (gitignored)
```

Flat on purpose: one `sys.path` entry imports the whole kit (`polylib` puts `tools/palette` on
the path too, so `import palette` resolves). The palette is the project's, not the kit's.

## The contract

What `scripts/Poly` reads and how `RenderMesh` places it; `lint` checks all of it.

| | |
|---|---|
| **File** | `PMSH` v1: 24 B header (magic, version, vertex count, content w/d/h) + count × 24 B vertices (f32 x,y,z + u8 r,g,b,255 + f32 packed normal). Little-endian. |
| **Axes** | AUTHOR space in the kit: x = east, y = south, z = UP, feet at z = 0, footprint centered on the origin. The bake flips to game space (up = -z), like Vox. 1 unit = 1 world px. |
| **Normals** | Per FACE off the CCW-from-outside winding, packed as shMeshlit.vsh's (nx, ny) — the decode has no downward hemisphere, so an UNDERSIDE normal clamps to horizontal (the camera never sees one) and a straight-down face is an error. No bottom faces, like Vox. |
| **Palette** | AAP-64, nothing outside it — the bake refuses a foreign color. |
| **Facets** | Deliberately LOW `n` (default 8): the flat-shaded facet is the style, not an approximation error. `lathe`'s default phase centers one flat face due south — the face the camera reads — and an even `n` keeps the ring symmetric for the engine's mirror flip. |
| **Placement** | Same as Vox: content centered on the footprint, feet at z = 0; `ColonySpawn.footprint` derives the collider from the header's content dims. |
| **Name** | `<material>_<object>[_<variant>]`, the data key shared with the `.vox` spare it shadows (`docs/NAMING.md`). |

`python style.py` builds the reference board (`out/style/board.png`): a plywood crate, a wooden
drum and a pedestal — what a new prop is judged against.

## The loop

```python
import sys; sys.path.insert(0, "tools/poly-kit")
import polylib as P, shape as S, palette as PAL
import os

m = P.Mesh()
S.lathe(m, [(8.5, 0), (10, 4, PAL.tone("leather", 0)), (10, 20), (8.5, 24)],
        n=8, color=PAL.tone("leather", 2))          # drum: hoop band + staves
S.box(m, -1, 3, 10, 1, 8, 12, PAL.tone("steel", 1))  # a spout due south
m.write(os.path.join(P.MESHES, "steel_drum.mesh"))
```

`lathe` takes a profile of `(r, z[, color])` points ascending z — the band up to a point takes
that point's color, else the call's default; r may close to 0 at either end (an apex), and a
final r > 0 gets a top cap. `box` emits five faces (never a bottom). New included files are
registered in `gems.yyp`'s `IncludedFiles` (a hand-added sibling line — resourcetool has no
included-file command).

## Checking

```sh
python lint.py [file.mesh | dir ...]     # default datafiles/meshes; exit 1 on any error
python preview.py [file | dir ...] [--scale 4] [--pitch 50] [--yaw 0] [--out preview]
```

`lint` reports errors for what the runtime or the style rejects (bad header, a color outside
AAP-64, a packed normal off the unit disc, the triangle budget) and warnings for what draws
wrong (degenerate triangles, feet off the ground, content off the footprint center, a header
that disagrees with the geometry). `preview` renders under the colony camera's pitch with
shMeshlit's default sun over a checker of 32 px cells — size, grounding and facet shading read
at a glance.
