# common/ — no external dependencies

Pure Python 3 (stdlib only, **no PIL**). Runs anywhere; nothing to install. The kit ships **no
built-in palette** — provide the project's (`pixlib.load_palette` / `quantize.py` / `tileset --palette`).

- **`pixlib.py`** — the shared library: PNG decode/encode, animated-GIF writer, nearest-neighbor
  compositing (`blit`/`checker`/`over`), palette quantize (`quantize_to_palette`/`nearest_color`),
  `load_palette` (hex-per-line file → RGB list), and the `KIT`/`OUT`/`out_dir()` path helpers
  (resolve the toolkit root → shared `../out/`).
- **`draw.py`** — static 16×16 demo icons (placeholder subjects + own inline palette).
- **`animate.py`** — single-state animation → strip + GIF.
- **`animate2.py`** — multi-state character → strip + per-state GIFs + manifest.
- **`quantize.py`** — remap a PNG/folder to a **provided** palette file (style-match lever).
- **`tileset.py`** — synthesize an **autotile set** from ONE material texture, for either engine
  mode: `--mode dual` (16 tile-frames) / `--mode corner` (13 quarter-tile pieces) / `both`. Cuts the
  frames from one patch deterministically so they tile *by construction* (a generator can't honor
  autotile edge-matching). Feed a seamless material patch, or omit input for the built-in procedural
  demo grass. Per mode → `<mode>_strip<N>.png` (GM `_stripN` auto-slice), `preview_<mode>`,
  `seamless_<mode>`. `--heal` forces tileability; `--palette F` locks colors to a palette file.
- **`terrain_materials.py`** — generate tileable terrain material patches (selectable algorithms;
  example terrains, colors inline).
- **`pack.py`** — assemble an externally-produced `f*.png` frames folder → strip + GIFs + manifest.
- **`preview.py`** — turn any `out/<method>/*.png` into matched previews + a compare sheet.

Run from anywhere, e.g. `python common/draw.py`. All output → the shared `../out/`.
