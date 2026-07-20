# Roadmap

Where the project is going: what is being worked on now, what is known broken, and what is planned. Contracts live in the code (CLAUDE.md → Comments law 2); this file holds only intent.

## Current Works

One pass over `scripts/`, file by file, applying two rule sets at once: the **Code Review** batches below are the vehicle, and each file's slice of the **Comment Refactor** rides along with it. No standalone comment sweep — a file is touched once.

### Code Review (file-by-file)

Review batches from the coupling analysis (270 scripts, ~35.4k LOC; reference graph of `globalThis` exports vs. usages). Ordered bottom-up so each batch depends only on already-reviewed code. Mark **Done** as batches finish.

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

**Two deferred renames** ride these batches, both left by the two-layer ECS restructure: the legacy `world` store identifiers (system params, `this.world` bindings) become `entities` (rule: CLAUDE.md → ECS Bootstrap), and a scene's `LevelGrid` handle `.level` — which now misreads as "the Level" — becomes `.grid`. Rename in whichever batch owns the call sites. GMRT codegen is name-sensitive (GMRT.md → Quirks, the `.sort` crash), so **run the game after a rename batch, not just compile**; the same applies to any API Naming rename (CLAUDE.md → API Naming).

### Comment Refactor

Bring pre-rule comments up to the CLAUDE.md → Comments laws (measured: 6,360 comment-only lines = 18% of `scripts/`; 192 GMRT re-explanations, `Time.raw` re-taught ×24, subclassing ×13). Per file:

1. **Relocate before deleting.** A comment that fails a law but states a real contract moves to its owning declaration's JSDoc first (law 2; GMRT.md for a quirk, ARCHITECTURE.md if cross-cutting), then shrinks to a citation elsewhere — never delete a fact that has no home.
2. **Headers**: collapse to ≤2 lines + pointer. Priority (largest narratives): `RpgMap`, `ChunkManager`, `RpgSpawn`, `sceneRpg`, `SaveGame`, `RpgInventoryUI`, `BuildMode`.
3. **Invariants**: replace every re-explanation with the one-line citation form (law 3); strip date/verification stamps on the way (law 1) — a fact keeps its version/ticket pin, loses its "when".
4. **JSDoc**: keep `@typedef`s/typed `@param`s and owning contract blocks, cut identifier-restating prose; opts-struct factories to one prose block.
5. **Keep**: quirk anchors (GMRT.md requires them), unit/why trailing comments, component `@typedef` files (they ARE the type system — tighten prose, never remove fields).

## Known Issues

Pre-existing issues noticed in passing and deliberately left untouched:

- **`obj_game/Draw_75.js` F5 screenshot block is likely broken**: it builds the filename with regex `.replace()` (documented as faulting on GMRT — see the `UIInput._paste` note). Manual-key path only, so the regex has never been exercised. The `screenshots/` subdir is NOT a defect (`screen_save` creates missing dirs), but the shot lands in the build tree rather than the save dir (GMRT.md → `working_directory`). Fix: assemble the timestamp without regex.
- **`UITable._fit` truncation is O(n²)**: it re-measures the whole string per removed character (`string_width` in a shrink loop). Harmless at current cell lengths; switch to a binary search / incremental measure if long text cells ever land in a table.
- **`tools/audio-kit` docs still describe the removed audio groups**: `gm-import/gm_sound.py` (the `group` arg comment) and `GEMS.md` (the _Audio group_ row) say the importer assigns `bgm`/`sfx` GMAudioGroups with live volume via `audio_group_set_gain`. Groups are gone — volume is hand-folded now (see `scripts/Audio` JSDoc). Update both docs, and check the importer isn't still stamping dead group metadata onto `snd_*`/`mus_*`. Same pass: `GEMS.md`'s playback line names gone methods — SFX is now a single `Audio.playSfx(params)` (a thin alias of `audio_play_sound_ext`; `play`/`playAt` merged), and BGM is `Music.play`, not `Audio.bgm`.

### gm-cli issue #231

**`manual read`/`manual open` die on every query** (gm-cli 2.2.0, open upstream — reported independently, so it is not machine-local). Both commands resolve queries through the hosted search service `https://gx.mcp.opr.gg/ask`, which answers HTTP 500 ("Error searching the manual."); the CLI `JSON.parse`s the body without checking `response.ok`, so it dies with `SyntaxError: Unexpected token 'E'` instead of a clean error. The manual sites themselves (`manual.gamemaker.io/monthly/` and `/lts/`) are up — only the search backend is down. The missing `response.ok` check is worth fixing upstream regardless of the outage.

**Local patch** (npm global — machine state, not repo code; **wiped by any gm-cli reinstall or upgrade**, so re-check this entry then, and drop it once upstream ships a fix): `dist/chunk-YRXPR43G.js` (the bundled `searchManual`, shared by both commands, under `%APPDATA%\npm\node_modules\@gamemaker\gm-cli\`) is replaced with a version that tries the service first (self-healing if it returns), then falls back locally — page-name index from the `YoYoGames/GameMaker-Manual` tree (branch `2026.1.0-main`, cached beside the chunk as `manual-pages.json`; delete to refresh after a manual release), fuzzy name match, fetch from `manual.gamemaker.io/monthly/` (`/lts/` on 404), HTML-to-Markdown. The original chunk is kept beside it as `chunk-YRXPR43G.js.orig` — restore to revert. Limit: the fallback matches page names only (exact function names best; a section-title query lands on its owning page, e.g. "Flex Panel Struct Members" → `Flex_Panels.htm`) — no semantic search.

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

- Per-chunk _build_ persistence (player builds inside streamed chunks)
- On-disk chunk saves (beyond the in-session cache + save-game delta)
- Throttled distant ticks (LOAD-ring entities simulate at low rate)
