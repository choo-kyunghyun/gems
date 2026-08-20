# G.E.M.S. — pixel-art conventions

What a new sprite has to match to sit next to the committed set. The kit itself is style-agnostic
(see [README](README.md)); this is the project's filled-in style.

## Core convention

| | |
|---|---|
| **World cell** | **32 world px** (`ColonyLevel` `CELL = 32`). Terrain and textures author 1:1 at 32 px. |
| **Palette** | **DB32** (DawnBringer 32) — `palettes/db32.hex`. No other palette. |
| **Color style** | Flat color + **one dark outline** around each silhouette. Use `raster.INK` (a warm dark brown), not cold near-black. |
| **Entity origin** | **Foot-anchored** — `RenderEntity` draws at the entity `Position`, so the sprite stands up from its feet. Items and icons are centered; tiles and textures are top-left. |
| **GM naming** | Owned by `docs/NAMING.md` — read it before naming anything the kit writes. What the kit needs from it: the **family** tag names the consumer (icons, garment overlays, textures, terrain sets), and a **bare subject** is reserved for entity strips. |
| **IDE folder** | `Game/Media/Bitmap Sprites/…` — `gmsprite.SPRITES_FOLDER` is the default; pass `folder=` for a subfolder (`Icons`, `Terrains`, `Textures`, `Entities/Human`). |

## Frame size

The cell is the *world grid* unit, **not** a size cap. A frame can be any W×H — the engine draws at the
entity `Position` by the sprite's origin, and collision is the entity's own `BBox` component,
independent of the sprite. So a taller sprite needs no gameplay change.

Sizes come from the menu `16, 32, 48, 64, 80, 96, 128` (multiples of the 16 px half-unit), which keeps
origins on-grid and texture packing clean. Measure rather than guess —
`python spritesize.py <candidate.png>` trims the alpha bbox, snaps to the menu, and prints the
`gmsprite.write` call.

| Subject | Anchor | W×H |
|---|---|---|
| Humanoid / NPC | foot | 32×64 (1:2) |
| Small critter, slime | foot | 32×32 |
| Tall prop (torch, doorway) | foot | 32×48 / 32×64 |
| Compact item (potion, gem, mod) | center | 32×32 |
| Pistol / SMG | center | 48×32 |
| Rifle / shotgun | center | 64×32 |
| Sniper / long rifle | center | 96×32 |

Item icons render **aspect-fit** in `UISlots`, so a wide gun icon keeps its shape in the square slot.

## Motion

Keep it **bold** — whole-limb swings, body bob, spins. At these sizes readable motion beats subtle
detail (no blinks, no finger work). Typical clips: idle 2f, walk 4f, attack 3f.

## The committed set

**107 sprites, authored and frozen.** The generators that produced them are gone — this kit no longer
regenerates the project's art, and changing a committed sprite means editing it or drawing a new one.

- `pixTerrain*` — 9 materials (deep water, water, sand, mud, soil, rich soil, grass, gravel, rocky), **32 px**
- `pixTex*` — wall/floor textures, 32 px
- `spr_item_*`, `pixWear*` — icons and garment overlays
- the entity sprites are **16 px** legacy: tiles are UV-stretched over the cell, and a 16 px entity
  sprite draws at ×2 (declare `SpriteMeta density: 0.5`, as the fence does)

**`SpriteMeta` manifests are now hand-maintained.** `datafiles/spritemeta/human.json` and `terrain.json`
(kind / density / cell per sheet, plus a tileset's weighted `variants` table) used to be emitted
alongside the art; with the emitters gone they are ordinary committed data. Editing a sheet means
editing its manifest in the same commit — nothing checks this for you any more.

Not covered by any tool: the lobby/editor UI icons `vecBack` / `vecExit` / `vecRevert` and
`vecChoo` / `vecPlay` (32 px debug-box art, currently unused).
