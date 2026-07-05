# vox-kit

The VOLUME furniture pipeline (see ROADMAP.md — Art Rework): author boxy props in
[MagicaVoxel](https://ephtracy.github.io/), commit the `.vox` as editable source, bake it to a
GameMaker vertex-buffer binary the engine draws as real depth-writing geometry.

```
templates/<name>.vox  --vox2vbuf.py-->  datafiles/meshes/<name>.vbuf  --RenderMesh-->  screen
   (editable source)                        (committed asset)             (Mesh { model })
```

Zero dependencies (Python stdlib only), deterministic output — same shape as the other kits
(author → render → import).

## Usage

```sh
python tools/vox-kit/vox2vbuf.py tools/vox-kit/templates/workbench.vox datafiles/meshes/workbench.vbuf
```

A NEW model's `.vbuf` must be registered once in `gems.yyp` under `IncludedFiles`
(`filePath: "datafiles/meshes"`). ⚠️ Insert the entry in **alphabetical filePath order** —
GameMaker re-saves canonicalize the array and will DUPLICATE an out-of-place entry, after which
the yyp fails to load. Re-bakes need no registration (churn-free).

Spawn side: `world.add(id, Mesh, { model: "<name>", width, depth, height })` — `RenderMesh`
loads, freezes, and caches the mesh; the width/depth/height document the footprint (BBox tuning)
but the mesh itself replaces the analytic two-quad box.

## Conventions

- **1 voxel = 1 world px**; the mesh is centered on the footprint (`Position` = footprint
  center), feet at ground level.
- **MagicaVoxel +x = east (width), +y = south (the face toward the camera)**, z = up. Author
  furniture front along +y.
- Only the two face orientations the fixed-yaw pitched camera can see are emitted (**top +
  south**), with the one-sun shading baked into vertex colors (top ×1.00, south ×0.80) — the
  palette IS the texture; no bitmap assets involved.
- The emitted vertex layout (`position 3×f32 | colour RGBA u8 | texcoord 2×f32`, 24 B/vertex)
  and `RenderMesh`'s declared vertex format are a **lockstep pair** — change both or neither.

## License & provenance

Everything here is under the repository's MIT license. The models in `templates/` are
**original works of this project** (MIT like the rest of the repo). MagicaVoxel is only the
recommended *editor*: a free tool (free for personal and commercial use) that claims no rights
over user-created content, with an openly published `.vox` format specification
([ephtracy/voxel-model](https://github.com/ephtracy/voxel-model), MIT). No MagicaVoxel code or
assets ship in this repository; `vox2vbuf.py` is an original parser written from the open spec.
