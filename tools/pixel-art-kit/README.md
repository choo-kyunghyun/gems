# Pixel-Art Kit

A small, **portable, zero-dependency** toolkit for generating pixel-art sprites with deterministic
Python (stdlib only — no PIL, no external services, no installs). It produces static icons,
animations, and autotile sets as an engine-agnostic **horizontal strip + JSON manifest** (PNG is the
bus).

---

## No built-in style — scan, then ask

This kit carries **no art style, palette, size, or project data of its own.** Before generating
anything for a project:

1. **Scan the target project** for its existing sprite conventions — cell size(s), the palette /
   colors already in use, the output format (strip + manifest vs individual frames vs sheet), file
   naming, directory layout, and any existing style/art doc.
2. **Report what you found and ask the user to confirm or specify** the target — canvas size,
   palette, look (flat / outlined / shaded), output format. If the project has no sprites yet, ask.
3. **Only then generate**, matching the confirmed conventions.

Never assume a palette, a resolution, or a look — derive them from the project and the user.

> In **this** repo the answers are already settled — see **[GEMS.md](GEMS.md)** (16×16, DB32). Follow
> it for G.E.M.S. sprites; the scan-then-ask flow above is for reusing the kit in another project.

---

## Layout

```
pixel-art-kit/
├── GEMS.md     THIS project's confirmed conventions (16x16, DB32) — the "scan/ask" answer
├── common/     engine-agnostic core (pure Python stdlib, no external deps)
│   ├── pixlib.py       shared lib: PNG/GIF encode+decode, NN compositing, quantize, paths
│   ├── draw.py         render templates/ statics -> icon PNGs + previews + sheet
│   ├── animate.py      render templates/anim/ frame data -> strip + GIFs + filmstrip + manifest
│   ├── quantize.py     remap a PNG/folder to a PROVIDED palette
│   ├── tileset.py      synthesize an autotile set (dual + corner/quarter) from ONE material
│   ├── terrain_materials.py  tileable terrain materials w/ selectable algos (ripple/grain/blades)
│   ├── preview.py      matched previews + a contact sheet
│   └── pack.py         assemble a rendered frames folder -> strip + GIFs + filmstrip + manifest
├── templates/  sprite INPUT data: .txt index grids + .json statics; anim/ = animation frame data
├── palettes/   palette library (.hex): db32 (default) + db16/arne16/aap64/endesga32/zughy32/nyx8
├── gm-import/  GameMaker adapter (engine-specific; imports common/)
│   ├── entity_sprites.py    draw this project's entities -> GameMaker sprites
│   └── terrain_sprites.py   cut dual-grid terrain frames -> GameMaker sprites
├── local/      GITIGNORED: machine/style-specific data + scratch experiments
└── out/        all generated artifacts (gitignored, shared by every script)
```

The `common/` core runs with no install and is **data-free** — palettes, sizes, and subjects are
supplied per project, not baked in.

> The engine-specific layer lives in the **`gm-import/`** subdir — it imports the core (`common/`) and
> writes sprites into a particular GameMaker project, kept in its own subdir so `common/` stays
> engine- and style-agnostic (see _Project bindings_ below).

---

## Method — programmatic, zero-dependency

Sprites are **char-grids mapped through a palette** (`.` = transparent), kept as **data files** in
`templates/` (input) and rendered to PNG by the generators (output) — art is never inlined in the
code. **Strengths:** no deps, deterministic, version-controllable, exact palette/size, and animation
coherence is *free* — every pixel is chosen each frame, so there's no flicker. **Weakness:**
organic/curved forms are fiddly and detail is capped, so it's at its best at small cells where detail
is naturally limited (the project's 32px sprites are a good fit).

### Sprite templates (input)

`draw.py` renders every template in `templates/`; `pixlib.load_template` accepts two formats:

- **`.txt` — index grid** (palette kept separate). Each cell is one character: `0`–`9` then `a`–`v`
  select palette entry 0–31, and `.` is transparent. Colors come from a **`palettes/*.hex`** (default
  `db32`; pass another to `draw.py`; one `rrggbb` per line, line N = index N), so many sprites share
  one palette. `#`-comment and blank lines are ignored. (Single-char cells address up to 32 colors;
  for a larger palette use `.json`.)
- **`.json` — self-contained** (palette embedded): `{"art": [<rows>], "palette": {"<char>":
  "rrggbb" | "rrggbbaa" | null}}` — `null` = transparent; use any chars you like.

Drop a new `.txt`/`.json` in `templates/` and it renders — no code change. The shipped templates
(`coin`/`sword`/`bed` as `.txt`, `potion` as `.json`) are **demo data**; replace per project.

### Palettes

`palettes/` is a small library of `.hex` palettes (one `rrggbb` per line; the `#`-comment header
carries attribution) — the single source for both the `.txt` index grids and `quantize.py`.
**`draw.py` keys the `.txt` demos to `palettes/db32.hex` by default** (DB32 / DawnBringer 32 — a solid
prototype sweetspot). To render against another, pass its name — `python draw.py endesga32` — but the
`.txt` cells are indexed to DB32's order, so re-index them for a different palette (or use `.json`
templates, which embed their own). Bundled (community palettes, converted from Aseprite — attribution
in each file): **db32** (default), db16, arne16, aap64, endesga32, zughy32, nyx8 (8–64 colors).

---

## Animation

`animate.py` renders multi-frame animation **data** (no hardcoded art) into a horizontal **strip** +
GIF(s) + a filmstrip + a **manifest**. `pixlib.load_frames` accepts either input form:

- **Numbered frames** — a directory of single-frame templates (`0.txt`, `1.txt`, … indexing a
  `palettes/*.hex`, or `.json`), sorted by trailing number; an optional `meta.json` in the dir sets
  `fps`/`loop`/`states`. (e.g. `templates/anim/coin_spin/`.)
- **Single multi-frame `.json`** — `{"palette": {…}, "frames": [[<rows>], …], "fps"?, "loop"?,
  "states"?}` (frames may instead be index-keyed: `{"0": [<rows>], "1": […], …}`). With `states`
  (`[{name, from, to, fps, loop}]`) it's multi-state → one GIF + manifest entry per state. (e.g.
  `templates/anim/hero.json`.)

`python animate.py` renders every animation under `templates/anim/`; or pass a dir/`.json` path (and
`--palette NAME` for `.txt` frames). **`pack.py`** is the sibling for *already-rendered* PNG frames
(`f*.png` → strip + GIFs + manifest).

---

## Autotile sets

`tileset.py` synthesizes a full **autotile set from ONE material texture**, cut deterministically so
the frames tile **by construction** (the edges match because every piece comes from the same patch):

- `--mode dual` → 16 corner-keyed tile-frames (RPG-Maker-style A-over-B terrain transitions).
- `--mode corner` → 13 quarter-tile pieces (the blob8 look from 13 half-cell pieces; good for walls).
- `--mode both` → emit both.

Each mode writes `<mode>_strip<N>.png` (GameMaker `_stripN` auto-slice), a `preview_<mode>`, and a
`seamless_<mode>` tiling test. `--heal` forces tileability on a non-seamless input; `--palette F`
locks colors to a palette file. Omit the input for the built-in procedural demo material.

---

## Requirements

- **Python 3, stdlib only** — no PIL; PNG encode+decode and the GIF writer are hand-rolled in
  `pixlib.py`. Nothing to install.

All generated output goes under **`out/`** (gitignored). Committed content is scripts + docs.

---

## Usage

```sh
python common/draw.py            # render templates/ statics -> out/agent/
python common/animate.py         # render templates/anim/ -> strips + GIFs + filmstrips + manifests
python common/preview.py         # nearest-neighbor previews + contact sheet
python common/quantize.py <in_dir> <out_dir> <pal.hex>   # lock onto a provided palette
python common/pack.py <frames> <out> <manifest.json>     # frames -> strip + manifest

# autotile: synthesize a set from ONE material (seamless by construction)
python common/tileset.py <material.png> <cell> --mode dual|corner|both [--heal] [--palette F]
#   dual_strip16.png  = 16 corner-keyed frames     corner_strip13.png = 13 quarter pieces
```

> The `templates/` sprites are demo placeholders (data, not code) — replace them with your project's;
> `draw.py` renders whatever templates are present.

---

## Conventions

- **Data-driven input**: sprite art lives in `templates/` (`.txt` index grids keyed to a
  `palettes/*.hex`, or self-contained `.json`), never inlined in the generators. The palette is
  **provided per project** — none is baked into the kit.
- **Nearest-exact previews**: `_x16.png` upscales are integer nearest-neighbor on a checker (so
  transparency reads); a common display box matches different cell sizes for fair comparison.
- **Strip + manifest output**: every horizontal strip (animations *and* autotile sets) is named
  **`<base>_strip<N>.png`** — the `_stripN` convention, so engines that read it (e.g. GameMaker)
  auto-slice into N frames. Animations also emit a `{name, from, to, fps, loop}` manifest.

---

## Gotchas

- **No PIL** — `pixlib` hand-rolls PNG encode+decode and an uncompressed-LZW animated-GIF writer.
- Autotile edge-matching is the whole reason `tileset.py` cuts pieces from one patch — never assemble
  an autotile set from independently-drawn cells; the seams won't line up.

---

## Project bindings — the `gm-import/` adapter

Engine- and project-specific code lives in the **`gm-import/`** subdir — it imports the core (via a
`sys.path` shim to the sibling `common/`) and writes finished sprites, in this project's DB32 /
foot-anchored / 32px style, straight into the GameMaker project's `sprites/`. Kept separate so the
`common/` core stays engine- and style-agnostic:

- `gm-import/entity_sprites.py` — draws this project's entities (hero/bandit/chest/torch/…, DB32,
  foot-anchored) as GameMaker sprites.
  `python tools/pixel-art-kit/gm-import/entity_sprites.py`
- `gm-import/terrain_sprites.py` — imports `terrain_materials` + `tileset` and writes GameMaker
  dual-grid `spr_terrain*` (run `common/terrain_materials.py` first).
  `python tools/pixel-art-kit/gm-import/terrain_sprites.py`

The target sprite resources must already be **registered** (IDE or `gm-cli resourcetool`); these only
fill frames. Frame/layer/keyframe UUIDs are deterministic (uuid5), so re-running is reproducible (no
churn).

The kit core is **palette-agnostic**: `pixlib` carries no palette (`load_palette` reads one from a
file), `quantize.py` takes a palette argument, and `tileset.py` takes an optional `--palette`. The
only built-in pixel *data* left is the example sprite **templates** in `templates/`, the **palette
library** in `palettes/` (community palettes, attributed), and the example terrains in
`terrain_materials.py` — all clearly data; replace/extend per project.
