# vox-kit

The VOLUME furniture authoring guide: author boxy props in
[MagicaVoxel](https://ephtracy.github.io/) and commit the `.vox` straight to
`datafiles/meshes/<name>.vox` — the editable source IS the shipped asset. There is no bake
step and no committed derivatives: the runtime `Vox` script parses and greedy-meshes the file
on first use, `RenderMesh` draws it as real depth-writing geometry, and `RpgSpawn.footprint`
derives the prop collider from its tight voxel extent.

```
datafiles/meshes/<name>.vox  --Vox (runtime)-->  vertex buffer  --RenderMesh-->  screen
   (editable source = shipped asset)                                (Mesh { model })
```

A NEW model must be registered once in `gems.yyp` under `IncludedFiles`
(`filePath: "datafiles/meshes"`). Insert the entry in **alphabetical filePath order** —
GameMaker re-saves canonicalize the array and will DUPLICATE an out-of-place entry, after which
the yyp fails to load. Edits to an existing model need no re-registration.

Spawn side: `world.add(id, Mesh, { model: "<name>", width, depth, height })` — `RenderMesh`
meshes, freezes, and caches the model; the width/depth/height document the footprint (BBox
tuning) but the mesh itself replaces the analytic two-quad box.

## Conventions

- **1 voxel = 1 world px**; the mesh is centered on the footprint (`Position` = footprint
  center), feet at ground level.
- **MagicaVoxel +x = east (width), +y = south (the face toward the camera)**, z = up. Author
  furniture front along +y.
- The palette IS the texture: the vertex colour is the raw palette **albedo** (no bitmap
  assets), and shading is LIVE — `sh_meshlit` lights it per frame. First model per file only.
- The full format contract (vertex layout, emitted face orientations, packed normals, greedy
  meshing) is owned by `Vox`'s JSDoc — `scripts/Vox/Vox.js`.

## License & provenance

Everything here is under the repository's MIT license. The models in `datafiles/meshes/` are
**original works of this project** (MIT like the rest of the repo). MagicaVoxel is only the
recommended _editor_: a free tool (free for personal and commercial use) that claims no rights
over user-created content, with an openly published `.vox` format specification
([ephtracy/voxel-model](https://github.com/ephtracy/voxel-model), MIT). No MagicaVoxel code or
assets ship in this repository; the runtime parser `Vox` is an original implementation written
from the open spec.
