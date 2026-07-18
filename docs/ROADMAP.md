# Roadmap

## Media

- Redraw the 16 px fence sheet at 32 (hand-drawn, no generator; `SpriteMeta density: 0.5` carries it meanwhile). `spr_fenceRound`, `stand`, `wooden_bed_simple` remain unwired spares.
- A dedicated plan-view TOP pattern per wall material if the shared face texture ever reads wrong.

## UI

- Killfeed UI
- Click cue on non-button widgets (only `UIButton`/`UINav` activation cues today — a mouse click on a slider/checkbox/list is silent)

## Gameplay

- Modular turret
  - Auto turrets fire mounted weapons
  - Mountable turrets
- Explosive like grenade and mine (`snd_explosion_large` is its reserved SFX)
- Minify furnitures
- Settlement and outpost (foundation done — Gameplay `Settlement`: player-owned territory zone with Name/Faction, build mode gated to owned land; outpost variant + settlement-management UI remain)
- Farming and fishing (Farming layers on a settlement's lands)
- Gamepad reloading
- More role-playing optional components
  - Biological sex(Display as XX and XY)
  - Entity age
- Gacha capsule with new UI
- Raid event: Defend the settlement (`mus_ambient_emergency` is its reserved BGM)
- Radio
- UI Concept: Smart HUD

### Build Mode

- Blueprint UI
- Drag to select

## Editor

- Prefabs

## Engine

Deferred chunk-streaming work (moved from docs/architecture/rpg.md):

- Per-chunk _build_ persistence (player builds inside streamed chunks)
- On-disk chunk saves (beyond the in-session cache + save-game delta)
- Throttled distant ticks (LOAD-ring entities simulate at low rate)

## Known Issues & Deferred Cleanups

Pre-existing issues noticed in passing and deliberately left untouched:

- **`obj_game/Draw_75.js` F5 screenshot block is likely broken**: it builds the filename with regex `.replace()` (documented as faulting on GMRT — see the `UIInput._paste` note) and saves into a `screenshots/` subdir that `screen_save` does not create. Manual-key path only. Fix: assemble the timestamp without regex and use a bare filename.
- **`UITable._fit` truncation is O(n²)**: it re-measures the whole string per removed character (`string_width` in a shrink loop). Harmless at current cell lengths; switch to a binary search / incremental measure if long text cells ever land in a table.
- **`tools/audio-kit` docs still describe the removed audio groups**: `gm-import/gm_sound.py` (the `group` arg comment) and `GEMS.md` (the _Audio group_ row) say the importer assigns `bgm`/`sfx` GMAudioGroups with live volume via `audio_group_set_gain`. Groups are gone — volume is hand-folded now (see `scripts/Audio` JSDoc). Update both docs, and check the importer isn't still stamping dead group metadata onto `snd_*`/`mus_*`. Same pass: `GEMS.md`'s playback line names gone methods — SFX is now a single `Audio.playSfx(params)` (a thin alias of `audio_play_sound_ext`; `play`/`playAt` merged), and BGM is `Music.play`, not `Audio.bgm`.

## Comment Refactor

Bring pre-rule comments up to the CLAUDE.md → Comments laws (measured: 6,360 comment-only lines = 18% of `scripts/`; 192 GMRT re-explanations, `Time.raw` re-taught ×24, subclassing ×13). **No standalone sweep** — fold into the Code Review batches below and into files already being touched. Per file:

1. **Relocate before deleting.** A comment that fails a law but states a real contract moves to its owning declaration's JSDoc first (law 2; GMRT.md for a quirk, ARCHITECTURE.md if cross-cutting), then shrinks to a citation elsewhere — never delete a fact that has no home.
2. **Headers**: collapse to ≤2 lines + pointer. Priority (largest narratives): `UIElement`, `RpgMap`, `ChunkManager`, `RpgSpawn`, `sceneRpg`, `SaveGame`, `RpgInventoryUI`, `BuildMode`.
3. **Invariants**: replace every re-explanation with the one-line citation form (law 3); strip date/verification stamps on the way (law 1) — a fact keeps its version/ticket pin, loses its "when".
4. **JSDoc**: keep `@typedef`s/typed `@param`s and owning contract blocks, cut identifier-restating prose; opts-struct factories to one prose block.
5. **Keep**: quirk anchors (GMRT.md requires them), unit/why trailing comments, component `@typedef` files (they ARE the type system — tighten prose, never remove fields).

## JSDoc Contract Migration

Dissolve the frozen `docs/architecture/*.md` ledgers into JSDoc contract blocks at owning declarations (rules: CLAUDE.md → Comments law 2 + the ARCHITECTURE.md routing rule); ARCHITECTURE.md stays the single doc (layer map, cross-cutting invariants, area index). **No standalone sweep** — migrate an area's ledger in the Code Review batch covering its files (`levels.md` is the small dry-run candidate; `rpg.md` the stress test, spanning batches 10–14). Per ledger claim, in order:

1. **Verify against the code first** — the ledgers are known to drift; the code is truth. A wrong claim is dropped and reported, never migrated.
2. **Already evident in code/JSDoc** (restated API shape, naming, behavior) → delete.
3. **Single-owner contract** → a JSDoc contract block at the owning declaration (a cross-file mechanism owns to its enforcing/orchestrating site); other sites cite.
4. **Cross-cutting invariant** → ARCHITECTURE.md; **runtime quirk** → GMRT.md (most already live there — cite, don't copy).
5. When a ledger empties, delete the file and replace its ARCHITECTURE.md index entry with the area's owning-file list.

## Code Review (file-by-file)

Review batches from the coupling analysis (270 scripts, ~35.4k LOC; reference graph of `globalThis` exports vs. usages). Ordered bottom-up so each batch depends only on already-reviewed code. Mark **Done** as batches finish.

Each batch also renames its files' legacy `world` store identifiers (system params, `this.world` bindings) to `entities` — the two-layer restructure's deferred rename (rule: CLAUDE.md → ECS Bootstrap). GMRT codegen is name-sensitive (GMRT.md §2, the `.sort` crash), so run the game after a rename batch, not just compile. Each batch additionally applies its files' slice of the Comment Refactor, the JSDoc Contract Migration (sections above), and the CLAUDE.md API Naming rule — an identifier rename follows the same run-after rule.

| #   | Batch                  | Folders                                                                                                | Files |    LOC | Watch for                                                                                                 | Done |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------ | ----: | -----: | --------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Core utilities         | Core/Util                                                                                              |    28 |  2,807 | Highest fan-in in the project (`Log`, `Color`, `Time`, `Rand`, `AABB`, `File`) — everything sits on these |      |
| 2   | ECS heart              | Core/Component, Core/Entity, Core/World                                                                |    24 |  1,083 | `World.update` → `WorldClock` (Gameplay) upward edge; `LevelManager` → `SceneRegistry` (Demo)             |      |
| 3   | Systems + levels       | Core/System, Core/Level                                                                                |    25 |  2,398 | Built-in systems, `LevelGrid`/`TileEdit`/zones                                                            |      |
| 4   | Camera + input         | Core/Camera, Core/Input                                                                                |    10 |  1,072 | Small, self-contained                                                                                     |      |
| 5   | Renderer               | Core/Render                                                                                            |    16 |  2,009 | `RenderMesh` queries the `Light` token (Gameplay)                                                         |      |
| 6   | UI infra               | Core/UI                                                                                                |    13 |  1,549 | `UIElement` base, `I18n` (28 dependents), `UIPointer`; `VirtualKeyboard` → GemsUI upward edge             |      |
| 7   | UI widgets             | Core/UI/Element (plain widgets)                                                                        |   ~14 | ~2,800 | Half of the biggest folder                                                                                |      |
| 8   | UI singletons          | Core/UI/Element (heavy singletons)                                                                     |   ~14 | ~2,850 | `SystemMenu` → GemsUI + `sceneLobby` upward edges                                                         |      |
| 9   | GemsUI kit             | GemsUI                                                                                                 |     4 |  1,588 | Theme + the three factory buckets                                                                         |      |
| 10  | Gameplay: economy      | Items, Inventory, Equipment, Crafting, Trade                                                           |   ~26 | ~1,390 | `Item`/`Inventory` are 18–21-fan-in hubs; `EquipmentSystem` → `StatModel` (Demo) upward edge              |      |
| 11  | Gameplay: simulation   | Combat, Status, Survival, Environment, Settlement, Squad, Animation, Lighting, Interaction, NPC, Quest |   ~39 | ~1,870 | `ConsumableSystem`/`StaminaSystem`/`StatusSystem` reference Demo's `Stats` token directly                 |      |
| 12  | Demo systems + content | Demo/System, Demo/Content, Demo/Component                                                              |    29 |  4,285 | `RpgScene`, `SaveGame`, `PlayerSystem`, `CombatAI`, content registries                                    |      |
| 13  | Demo scenes            | Demo/Scene, Demo/Editor, Demo/Platformer, Demo/Lobby + `obj_game`                                      |    19 |  6,073 | Highest fan-out (`sceneRpg` 88 deps, `RpgMap` 62) — review last-ish                                       |      |
| 14  | Demo UI                | Demo/UI                                                                                                |     9 |  3,822 | `RpgInventoryUI` (41 deps), HUD, Trade/Storage/Crafting/WeaponMod UIs                                     |      |

`tools/` is self-contained (never imported by the game) — review separately if at all.
