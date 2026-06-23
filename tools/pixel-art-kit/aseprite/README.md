# aseprite/ — LOCAL DEPENDENCY: Aseprite

Requires **Aseprite 1.3+** installed. Set the **`ASEPRITE`** env var to the exe (default is
the Steam path). The `.lua` are headless scripts; each takes its output dir (and `states`
its input strip) via `--script-param`.

- **`run.py`** — Python wrapper so Aseprite steps compose into a workflow:
  `python aseprite/run.py draw|anim|states` (or `<name> k=v` to pass params).
- **`aseprite_draw.lua`** — static icons (clean ellipse-tool coin).
- **`aseprite_anim.lua`** — single-state coin-spin → GIF + sheet + `.aseprite`.
- **`aseprite_states.lua`** — import a strip, **tag** state ranges, export sheet + tagged JSON.

Notes: `.lua` must stay **BOM-free**; paths want **forward slashes**; Aseprite stdout is
unreliable under non-interactive shells (write results to a file to read them back).
Output → the shared `../out/`.
