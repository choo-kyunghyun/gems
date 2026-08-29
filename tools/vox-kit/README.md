# Vox Kit

A toolkit for the voxel props (the VOLUME category: furniture, machines, rocks, flora, ruins) in the
project's style: build a model in a throwaway script or MagicaVoxel, lock it onto AAP-64, check it
against the runtime's contract, and see it under the game camera without a game run. Pure Python
stdlib, nothing to install.

It is not an asset pipeline. The game reads `datafiles/meshes/<name>.vox` directly (`Vox` parses and
greedy-meshes it at load), so there is nothing to bake; the kit reads and writes that same file.

## Layout

```
vox-kit/
├── voxlib.py      .vox read/write (the three chunks the runtime reads), the AAP slot layout, paths
├── volume.py      building: Volume — box / cyl / sphere / mirror_x / speckle in palette tones
├── lint.py        the runtime contract + the style, as one pass over a file or folder
├── quantize.py    lock a .vox / folder onto the palette
├── preview.py     render models under the game camera (top + south face, shMeshlit's sun) + a sheet
├── style.py       the reference board — one of everything, through the kit's own pipeline
└── out/           everything generated (gitignored)
```

Flat on purpose: one `sys.path` entry imports the whole kit (`voxlib` puts `tools/palette` on the
path too, so `import palette` resolves). The palette is the project's, not the kit's — see
`tools/palette/README.md`.

## The contract

What `scripts/Vox` reads and how `RenderMesh` places it; `lint` checks all of it.

| | |
|---|---|
| **File** | The FIRST `SIZE` + `XYZI` model and the `RGBA` palette; every other chunk is ignored. No palette → the runtime logs an error and draws nothing. |
| **Axes** | MagicaVoxel's: x = east (width), y = south (+y is the face toward the camera), z = UP, z = 0 the ground. 1 voxel = 1 world px; a 32 px cell is a 32-voxel span. |
| **Placement** | The CANVAS is centered on the footprint, feet at z = 0 — content off the canvas center draws off its collider, content above z = 0 floats. |
| **Collider** | `ColonySpawn.footprint`: `max(8, w - 2)` × `max(8, d - 2)` of the tight voxel extent. |
| **Faces** | Top + four sides; never a bottom. The fixed-yaw camera sees the top and the south face. |
| **Palette** | AAP-64, nothing outside it. The kit writes slots 1..64 = entries 0..63 (`palette.magica` exports the same order for MagicaVoxel); `quantize` snaps anything foreign. |
| **Shading** | Live, never authored: `shMeshlit` lights the flat albedo per frame (sun + torches). A voxel carries its base tone; `speckle` is the one surface treatment. |
| **Name** | `<material>_<object>[_<variant>]`, a data key shared by the file and `Mesh.model` (`docs/NAMING.md`). |

`python style.py` builds the reference board (`out/style/board.png`): a plywood crate, a steel drum and
a basalt boulder — what a new prop is judged against.

## The loop

```python
import sys, os; sys.path.insert(0, "tools/vox-kit")
import voxlib as V, volume as VOL, palette as PAL

v = VOL.Volume(32, 32, 32)
v.box(4, 4, 0, 27, 27, 23, PAL.tone("leather", 3))       # body (inclusive corners)
v.box(4, 4, 10, 27, 27, 11, PAL.tone("steel", 2))         # strapping band
v.box(12, 27, 14, 19, 27, 17, PAL.tone("hazard", 1))      # label on the south face
v.speckle(PAL.tone("leather", 3), 0.06, seed=7)           # plywood grain, a step darker
v.write(os.path.join(V.out_dir("crate"), "plywood_crate.vox"))
```

`Volume` is a 3D canvas of palette tones: `box`, `cyl` (vertical, center + radius in voxel units),
`sphere`, `set`/`clear`, `mirror_x` (draw the west half, mirror it), `speckle` (re-tone a share of the
exposed voxels of a color one ramp step — grain, oxide, lichen). `model()` snaps every color onto the
palette and returns a `voxlib.Model`; `write` does that and saves. Hand-built models come from
MagicaVoxel started on `tools/palette/out/aap-64-magica.png`, and go through `quantize` if not.

## Checking

```sh
python lint.py [file.vox | dir ...]                 # default datafiles/meshes; exit 1 on any error
python quantize.py <in.vox | in_dir> <out>          # lock onto AAP-64 (remaps voxels, merges twins)
python preview.py [file | dir ...] [--scale 4] [--pitch 50] [--yaw 0|90|180|270] [--out preview]
```

`lint` reports errors for what the runtime or the style rejects (no model, no palette, a color
outside AAP-64) and warnings for what draws wrong (a second model, floating voxels, content off the
canvas center, detached parts), plus the size / content / footprint line.

`preview` renders the two faces the camera sees at the pitch the colony camera runs (42°–58°),
lit as `shMeshlit` lights them under `RenderMesh`'s default sun, over a checker of 32 px cells
centered on the footprint — size and grounding read at a glance. `--yaw` turns the model a quarter
at a time, the way a runtime `Mesh.yaw` does. A folder run also writes `sheet.png`.

`quantize` writes the minimal three-chunk file, so a MagicaVoxel model loses its scene and material
chunks on the way — nothing the runtime reads. MagicaVoxel opens the result.

## Registration

A `.vox` is an included file, not a GM resource: drop it in `datafiles/meshes/` and name it in a
preset's `Mesh.model`. A NEW file is registered once in `gems.yyp`'s `IncludedFiles` (the IDE does it
on Add Existing; by hand, keep the array's order as the other entries). Editing an existing model
needs nothing.
