# Roadmap

Where the project is going: what is being worked on now, what is known broken, and what is planned. Contracts live in the code (CLAUDE.md → Comments law 2); this file holds only intent.

## Current Works

One concern per pass: each pass applies a single mechanical rule across all of `scripts/`, sized so one session can finish and verify it — never every rule on one file. A file touched by several passes is accepted churn. A pass too large for one session splits by pillar (Core → Gameplay → GemsUI → Demo), never by mixing concerns. Order: Rename Passes first (everything after reads the final vocabulary), Comment Refactor second, Code Review last.

### Rename Passes

The three renames left by the two-layer ECS restructure, each a full-project sweep. GMRT codegen is name-sensitive (GMRT.md → Differences from ES2020, the `var` built-in-name collision): run the game after every rename pass, never compile alone — the same applies to any API Naming rename (CLAUDE.md → API Naming). Mark Done as passes land.

| #   | Pass                 | Rule                                                                                                                                                               | Done |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| R1  | `world` → `entities` | The legacy store identifiers (system params, `this.world` bindings) become `entities` — the canonical handle for a level's `Entity` store.                         | Yes  |
| R2  | `.level` → `.grid`   | A scene's `LevelGrid` handle `.level` — which now misreads as "the Level" — becomes `.grid`. Must land before R3: renaming `scene` first would read `level.level`. | Yes  |
| R3  | `scene` → `level`    | One word per concept — split into the sub-passes below, one session each, in order.                                                                                |      |

R3 sub-passes:

- **R3a** — the ubiquitous `scene` handle for a `Level` instance (locals, params, fields).
- **R3b** — `openScene`/`teardownScene`/`SceneRegistry`/`SCENES` take their `level` forms.
- **R3c** — `SceneTransition` becomes `LevelTransition` (a script asset — CLAUDE.md → Resourcetool).
- **R3d** — the obj_game `scenes` alias drops for direct `World.levels` reads; CLAUDE.md's `game.scenes.current.entities` debugging example updates with it.
- **R3e** — `RpgScene` gets a name for what it holds; `RpgLevel` is taken by the grid builder, itself misreading once `.level` is `.grid` — settle the pair in one session.

The `scene*` script-asset prefix stays (CLAUDE.md → Script Naming).

### Comment Refactor

Bring pre-rule comments up to the CLAUDE.md → Comments laws (measured: 6,360 comment-only lines = 18% of `scripts/`; 192 GMRT re-explanations, `Time.raw` re-taught ×24, subclassing ×13). One sweep per rule — each is greppable and mechanical. Mark Done as sweeps land.

| #   | Sweep     | Rule                                                                                                                                                                                             | Done |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| C1  | Citations | Replace every quirk/invariant re-explanation with the one-line citation form (law 5); strip date/verification stamps on the way (law 1) — a fact keeps its version/ticket pin, loses its "when". |      |
| C2  | Headers   | Collapse to ≤2 lines + pointer (law 3). Priority (largest narratives): `RpgMap`, `ChunkManager`, `RpgSpawn`, `sceneRpg`, `SaveGame`, `RpgInventoryUI`, `BuildMode`.                              |      |
| C3  | JSDoc     | Keep `@typedef`s/typed `@param`s and owning contract blocks, cut identifier-restating prose (law 4); opts-struct factories to one prose block.                                                   |      |

Two laws bind every sweep:

- **Relocate before deleting**: a comment that fails a law but states a real contract moves to its owning declaration's JSDoc first (law 2; GMRT.md for a quirk, ARCHITECTURE.md if cross-cutting), then shrinks to a citation elsewhere — never delete a fact that has no home.
- **Keep**: quirk anchors (GMRT.md requires them), unit/why trailing comments, component `@typedef` files (they ARE the type system — tighten prose, never remove fields).

### Code Review (file-by-file)

Review batches from the coupling analysis (270 scripts, ~35.4k LOC; reference graph of `globalThis` exports vs. usages). Ordered bottom-up so each batch depends only on already-reviewed code; each batch is review-only — the renames and comment sweeps land first. Mark Done as batches finish.

| #   | Batch                  | Folders                                                                                                | Files |    LOC | Watch for                                                                                         | Done |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------ | ----: | -----: | ------------------------------------------------------------------------------------------------- | ---- |
| 1   | Core utilities         | Core/Util                                                                                              |    28 |  2,807 | Highest fan-in in the project (`Log`, `Color`, `Time`, `AABB`, `File`) — everything sits on these |      |
| 2   | ECS heart              | Core/Component, Core/Entity, Core/World                                                                |    24 |  1,083 | `World.update` → `WorldClock` (Gameplay) upward edge; `LevelManager` → `SceneRegistry` (Demo)     |      |
| 3   | Systems + levels       | Core/System, Core/Level                                                                                |    25 |  2,398 | Built-in systems, `LevelGrid`/`TileEdit`/zones                                                    |      |
| 4   | Camera + input         | Core/Camera, Core/Input                                                                                |    10 |  1,072 | Small, self-contained                                                                             |      |
| 5   | Renderer               | Core/Render                                                                                            |    16 |  2,009 | `RenderMesh` queries the `Light` token (Gameplay)                                                 |      |
| 6   | UI infra               | Core/UI                                                                                                |    13 |  1,549 | `UIElement` base, `I18n` (28 dependents), `UIPointer`; `VirtualKeyboard` → GemsUI upward edge     |      |
| 7   | UI widgets             | Core/UI/Element (plain widgets)                                                                        |   ~14 | ~2,800 | Half of the biggest folder                                                                        |      |
| 8   | UI singletons          | Core/UI/Element (heavy singletons)                                                                     |   ~14 | ~2,850 | `SystemMenu` → GemsUI + `sceneLobby` upward edges                                                 |      |
| 9   | GemsUI kit             | GemsUI                                                                                                 |     4 |  1,588 | Theme + the three factory buckets                                                                 |      |
| 10  | Gameplay: economy      | Items, Inventory, Equipment, Crafting, Trade                                                           |   ~26 | ~1,390 | `Item`/`Inventory` are 18–21-fan-in hubs; `EquipmentSystem` → `StatModel` (Demo) upward edge      |      |
| 11  | Gameplay: simulation   | Combat, Status, Survival, Environment, Settlement, Squad, Animation, Lighting, Interaction, NPC, Quest |   ~39 | ~1,870 | `ConsumableSystem`/`StaminaSystem`/`StatusSystem` reference Demo's `Stats` token directly         |      |
| 12  | Demo systems + content | Demo/System, Demo/Content, Demo/Component                                                              |    29 |  4,285 | `RpgScene`, `SaveGame`, `PlayerSystem`, `CombatAI`, content registries                            |      |
| 13  | Demo scenes            | Demo/Scene, Demo/Editor, Demo/Platformer, Demo/Lobby + `obj_game`                                      |    19 |  6,073 | Highest fan-out (`sceneRpg` 88 deps, `RpgMap` 62) — review last-ish                               |      |
| 14  | Demo UI                | Demo/UI                                                                                                |     9 |  3,822 | `RpgInventoryUI` (41 deps), HUD, Trade/Storage/Crafting/WeaponMod UIs                             |      |

`tools/` is self-contained (never imported by the game) — review separately if at all.

### Media Rename

Media names predating CLAUDE.md → Media Asset Naming are grandfathered — never rename as a sweep; migrate one only when already touching it (mechanics: CLAUDE.md → Resourcetool). The set: the UI glyphs/lobby art (`spr_check`/`spr_play`/`spr_uibox`/…), unused spare icons (`spr_apple`), the `spr_fenceSquare`/`spr_fenceRound` sheets, and the `spr_tile16`/`spr_tilecornerRough` autotile sets.

## Known Issues

Pre-existing issues noticed in passing and deliberately left untouched:

- **`UITable._fit` truncation is O(n²)**: it re-measures the whole string per removed character (`string_width` in a shrink loop). Harmless at current cell lengths; switch to a binary search / incremental measure if long text cells ever land in a table.
- **`tools/audio-kit` docs still describe the removed audio groups**: `gm-import/gm_sound.py` (the `group` arg comment) and `GEMS.md` (the Audio group row) say the importer assigns `bgm`/`sfx` GMAudioGroups with live volume via `audio_group_set_gain`. Groups are gone — volume is hand-folded now (see `scripts/Audio` JSDoc). Update both docs, and check the importer isn't still stamping dead group metadata onto `snd_*`/`mus_*`. Same pass: `GEMS.md`'s playback line names gone methods — SFX is now a single `Audio.playSfx(params)` (a thin alias of `audio_play_sound_ext`; `play`/`playAt` merged), and BGM is `Music.play`, not `Audio.bgm`.

## Planned Features

### Media

- Redraw the 16 px fence sheet at 32 (hand-drawn, no generator; `SpriteMeta density: 0.5` carries it meanwhile). `spr_fenceRound`, `stand`, `wooden_bed_simple` remain unwired spares.
- A dedicated plan-view TOP pattern per wall material if the shared face texture ever reads wrong.

### UI

- Killfeed UI
- Click cue on non-button widgets (only `UIButton`/`UINav` activation cues today — a mouse click on a slider/checkbox/list is silent)
- UI concept: Smart HUD

### Gameplay

- Modular turret
  - Auto turrets fire mounted weapons
  - Mountable turrets
- Explosive like grenade and mine (`snd_explosion_large` is its reserved SFX)
- Minify furnitures
- Settlement and outpost (foundation done — Gameplay `Settlement`: player-owned territory zone with Name/Faction, build mode gated to owned land; outpost variant + settlement-management UI remain)
- Farming and fishing (Farming layers on a settlement's lands)
- Gamepad reloading
- More role-playing optional components
  - Biological sex (display as XX and XY)
  - Entity age
- Gacha capsule with new UI
- Raid event: Defend the settlement (`mus_ambient_emergency` is its reserved BGM)
- Radio

### Build Mode

- Blueprint UI
- Drag to select

### Editor

- Prefabs

### Engine

Deferred chunk-streaming work (engine is `ChunkManager`):

- Per-chunk build persistence (player builds inside streamed chunks)
- On-disk chunk saves (beyond the in-session cache + save-game delta)
- Throttled distant ticks (LOAD-ring entities simulate at low rate)
