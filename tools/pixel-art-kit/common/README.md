# common/ — no external dependencies

Pure Python 3 (stdlib only, **no PIL**). Runs anywhere; nothing to install.

- **`pixlib.py`** — the shared library: PNG decode/encode, animated-GIF writer,
  nearest-neighbor compositing (`blit`/`checker`/`over`), palette quantize, the canonical
  **`DB32`** palette, and the `KIT`/`OUT`/`out_dir()` path helpers (resolve the toolkit
  root → shared `../out/`).
- **`draw.py`** — static 16×16 icons.
- **`animate.py`** — single-state animation (coin spin) → strip + GIF.
- **`animate2.py`** — multi-state character (idle/walk/attack) → strip + per-state GIFs + manifest.
- **`quantize.py`** — remap a PNG/folder to a fixed palette (style-match lever; edit `PALETTE`).
- **`tileset.py`** — synthesize an **autotile set** from ONE material texture, for either
  engine mode: `--mode dual` (16 tile-frames) or `--mode corner` (13 half-cell quarter-tile
  pieces) or `both`. Cuts the frames from one patch deterministically so they tile *by
  construction* (diffusion can't honor autotile edge-matching); the `corner` mode also
  replicates `RenderTileMap`'s selectors to verify assembly. Feed a seamless ComfyUI fill /
  Aseprite patch, or omit input for built-in procedural DB32 grass. Per mode → `<mode>_strip<N>.png`
  (runtime sprite, GM `_stripN` auto-slice — `dual_strip16`/`corner_strip13`), `preview_<mode>`,
  `seamless_<mode>` (blob render). `--heal` forces tileability; `--raw` skips DB32.
- **`pack.py`** — assemble an externally-produced `f*.png` frames folder → strip + GIFs + filmstrip.
- **`preview.py`** — turn any `out/<method>/*.png` into matched previews + `out/compare.png`.

Run from anywhere, e.g. `python common/draw.py`. All output → the shared `../out/`.
