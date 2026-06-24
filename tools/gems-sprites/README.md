# gems-sprites — GameMaker sprite generators for G.E.M.S.

Project-specific **consumers** of the generic [pixel-art kit](../pixel-art-kit). They import the
kit's `common/` (PNG / draw / tileset primitives) and write finished sprites — in this project's
DB32 style, foot-anchored, 32px — straight into the GameMaker project's `sprites/`. They live here,
not in the kit, so the kit stays style- and engine-agnostic.

- **`entity_sprites.py`** — draws each entity (hero / bandit / chest / torch / …) into a 32×32 DB32
  buffer and writes a multi-frame GMSprite into `sprites/spr_*/`.
  `python tools/gems-sprites/entity_sprites.py`
- **`terrain_sprites.py`** — cuts dual-grid frames from `terrain_materials` output (run
  `common/terrain_materials.py` first) and writes `spr_terrain*`.
  `python tools/gems-sprites/terrain_sprites.py`

The sprite resources must already be **registered** (IDE or `gm-cli resourcetool`); these only fill
frames. Frame/layer/keyframe UUIDs are deterministic (uuid5), so re-running is reproducible. Each
adds the kit's `common/` to `sys.path` at startup, so they run from anywhere as long as
`tools/pixel-art-kit/` sits beside this folder.
