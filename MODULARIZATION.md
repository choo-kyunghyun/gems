# Modularization Plan

A pre-milestone refactor pass (before **world events / in-game time / region events**). Goal: shrink the
overloaded files and isolate responsibilities so the new systems plug into a clean scene, **without changing
behavior**. Working plan — delete or archive once executed.

## Context & findings

- **183 scripts.** The #15065 **>50-method class crash is NOT a live risk** — the heaviest class is `UITable`
  at ~34 methods. So this pass is **maintainability + milestone-prep**, not crash-firefighting. (The two
  closest to the ceiling, `UITable` 34 / `UIInput` 31, are split candidates below — splitting buys margin too.)
- The large-file global-hoisting fault bites top-level `function` declarations in big files; the scene/widget
  files are single `class`/`globalThis` assignments, so the splits below are driven by readability, not that fault.
- **Scope decided with the user:** plan + execute groups **1–4** now (the RPG layer the milestone touches +
  the real UI-core debt). Groups **5–8** are stubbed at the bottom for a later pass.

## Conventions (how we split, GMRT-safe)

- **Composition, not inheritance** (no `super` on GMRT). Extract behavior as either:
  - a **free-function module** that takes the scene — `globalThis.RpgMap = { load(scene, …), … }` — exactly the
    existing `RpgScene` pattern (reads/writes `scene.world`/`scene.ctrl`/…); or
  - a **plain data/helper class** assigned `globalThis.X = class X { … }`.
- New script assets go through the gm-cli route (CLAUDE.md → Asset Creation); set each `.yy` `parent` to the
  right IDE folder.
- One commit per extraction, each with `gm-cli compile --errors-only` + a run-check; behavior must be identical.

## Execution order (refactor phase)

1. **Group 1** — `RpgMap`, `RpgHud`, `RpgSpawn` (milestone-critical, biggest readability win) — ✅ **DONE** (`c5e248f`, `1821852`, `16a9bd1`)
2. **Group 2** — `RpgContent` split + `RpgProgression` (cross-cuts Group 1) — ✅ **DONE** (`8732f69`, `b523def`)
3. **Group 3** — shared `InvTable` (kills RpgInventoryUI/StorageUI duplication) — ✅ **DONE** (`6e7dfa7`)
4. **Group 4** — `UITable` sort-stack + `UIInput` text-model (deep-read each first)

---

## Group 1 — RPG scene & world substrate  *(milestone-critical)* — ✅ DONE

The milestone's time/region/world-event systems will be new scripts dispatched from `sceneRpg.step()`; the work
here is making that scene a clean orchestration shell. **Result: `sceneRpg` 831 → 443 lines; `RpgLevel` 375 → 150.**

| # | Refactor | Move out of | Into (new) | ~Lines | Risk |
|---|----------|-------------|------------|-------:|------|
| 1 | **Map-graph engine** — `loadMap`, `_teardownMap`, `_checkPortals`, `_authoredReach` + the `_mapCache` save/restore | `sceneRpg` | `RpgMap` (free fns: `load(scene,id,entry)`, `teardown(scene)`, `checkPortals(scene)`) | ~270 | Med |
| 2 | **HUD construction** — `_buildHud`, `_buildDialogue`, `_buildMinimap` | `sceneRpg` | `RpgHud` (`build(scene)`, `buildMinimap(scene)`) | ~90 | Low |
| 3 | **Entity construction** — `spawn`, `spawnEntity` (118 lines), `spawnFollower`, `reachZone`, `_visual` | `RpgLevel` | `RpgSpawn` (shared by up-front spawn **and** `ChunkSource.spawn`) | ~150 | Med |

- **Net:** `sceneRpg` 831 → ~470; `RpgLevel` 375 → ~210 (keeps `mapFile`/`build`/`buildChunked`/`_resolveSpawn` = level/grid + map registry).
- **Leave `sceneRpg.step()`'s gameplay glue in place** — it's where the milestone *adds* dispatch lines; cluster it later if needed.
- **No action (cohesive, well-sized):** `ChunkManager` (258, focused engine), `ChunkSource`, `OverworldGen`,
  `Prefab`, `Interactable` (231), `BuildMode` (213), `RpgController` (187), `RpgScene` (151), `RpgPlayer`,
  `RpgWorldOverlay`, `Zone`/`ZoneMap`/`ZoneSystem`.
- **Milestone note:** `ZoneSystem.update(world, level, map, {onEnter,onExit})` already fires enter/exit edges —
  **region events build on it as-is, no change required.**

## Group 2 — RPG content & progression  *(high)* — ✅ DONE

| # | Refactor | Detail | Risk |
|---|----------|--------|------|
| 1 | **Split `RpgContent.register()`** (208 lines, one function) | Break into per-domain registration — `RpgItems` / `RpgRecipes` / `RpgPrefabs` (+ rarities), each with a `register()` called from `RpgContent.register()`. Keep the single entry point (called once at scene `create()`, not top-level — preserves load-order safety). | Low–Med |
| 2 | **Lift level-up/reward math** — `_applyReward` (XP, level-up, reward items) | `sceneRpg` → `RpgProgression.applyReward(scene, reward)` free fn. Cross-cuts Group 1; milestone-relevant (timed/event rewards will reuse it). ~25 lines. | Low |

- **No action (mature registry/system pattern):** `QuestLog`, `Achievement`, `Profile`, the `Item`/`Rarity`/
  `Recipe`/`Equippable`/… defs, and the component+system pairs (`InventorySystem`, `EquipmentSystem`,
  `CraftSystem`, `ConsumableSystem`, `EncumbranceSystem`, `SlimeAI`, `FollowerSystem`, `AnimationSystem`, `MeleeSystem`).
- **Cross-group:** `InventorySystem` owns `_category`/`_rarityRank`. The Group 3 `InvTable` extraction should
  **reuse these** (expose them as public) rather than duplicate — they're already copied into the UI today.

## Group 3 — RPG inventory UI  *(high value: kills duplication)* — ✅ DONE

`RpgInventoryUI` (599) and `StorageUI` (383) **both** build inventory tables with the same column set and carry
parallel copies of `_columns` / `_applyColumns` / `_rows`/`_rowModel` / `_category` / `_rarityColor` / `_lower`.

| # | Refactor | Detail | Risk |
|---|----------|--------|------|
| 1 | **Shared `InvTable` module** | Extract the inventory-table machinery used by both: `columns(opts)`, `rowModel(slot,it,worn)`, `applyColumns(tableEls)`, `rarityColor(itemId)`, `category(it)`, `lower(s)` (the ASCII-lowercase helper). Both windows consume it; `category`/rarity rank delegate to `InventorySystem` (Group 2 cross-link). De-dupes ~100+ lines across the two files. | Med |
| 2 | *(optional, after #1)* split `RpgInventoryUI` tab-builders | Once the table machinery is out, the file shrinks a lot; only split the 5 `_build*Tab` methods if it's still unwieldy. Likely unnecessary. | Low |

- **No action:** `CraftingUI` (104, small/cohesive).

## Group 4 — UI core widgets  *(real debt; deep-read each before splitting)*

| # | Refactor | Detail | Risk |
|---|----------|--------|------|
| 1 | **`UITable` (705, 34m)** — extract sort-stack | Pull the multi-key sort (`sortBy`/`_pushSort`/`_sortRank`/`_sortVal`/`_compareRows`/`_cycleSort`) into a standalone helper; consider the cell-draw helpers (`_cellText`/`_fit`) too. Keeps the immediate-mode live-layout recompute intact. Dual benefit: readability + pulls method count off the #15065 ceiling. | Med |
| 2 | **`UIInput` (540, 31m)** — extract text-edit model | Pull cursor/selection/word-nav/insert/delete/clipboard into a `TextBuffer` helper; `UIInput` becomes the GMRT draw/keyboard/focus shell over it. Same dual benefit. | Med |
| 3 | *(optional)* `UINav` (437) — extract debug overlay | `_drawDebug`/`_dottedLine` (~80 lines) are a diagnostic concern separable from the nav logic. | Low |

- **No action:** `UIElement` (510, 20m) — the cohesive tree-core foundation; splitting would fragment it.
- Both #1 and #2 **require a deep read first** (immediate-mode shared state) and a run-verify, since they're
  load-bearing widgets used across every scene.

---

## Groups 5–8 — deferred (stubs to expand in a later pass)

> Not planned in detail yet — members + a one-line hypothesis each. Deep-dive when we get to them.

### Group 5 — GemsUI kit
- `GemsContainers` (505), `GemsControls` (488), `GemsWidgets` (275), `GemsTheme`.
- Already split once for the hoisting fault. **Hypothesis:** check whether `GemsContainers`/`GemsControls` are
  creeping toward a further split (a `GemsForms`/`GemsTable` factory file?). Low priority.

### Group 6 — Global UI singletons / overlays
- `SystemMenu` (598), `Dialogue` (306), `VirtualKeyboard` (196), `Toast`, `Tooltip`, `SlotDrag`,
  `SceneTransition`, `FloatingText`.
- **Hypothesis:** `SystemMenu`'s four tab-builders (System / Settings / About / Debug) likely split into
  per-tab builders or a small `SystemMenuTabs` module. Rest are cohesive singletons. Low priority.

### Group 7 — Core ECS / systems / utilities / rendering
- `World` (171), `RenderTileMap` (255), `MotionPlanner` (189), `Level` (165) + built-in systems + utilities
  (`Camera`, `Color`, `I18n`, `Settings`, `Tween`, `AABB`, `Broadphase`, `Raycast`, `File`, `Log`, `Input*`,
  `SceneManager`, `Scene`, `Pipeline`, `EntityPreset`, `Query`).
- **Hypothesis:** mature, single-responsibility, well-sized — expect **mostly "no action."** Glance at
  `RenderTileMap` (255) and `MotionPlanner` (189) for any concern split. Low priority.

### Group 8 — Showcase scenes  *(milestone-irrelevant)*
- `sceneEditor` (816), `sceneUIKit` (792), `sceneLobby`, `scenePlatformer`, `sceneRTS`, `sceneMap`,
  `sceneTileInspect*` / `sceneTileTerrain` / `sceneTileAlpha`, `PlatformerController` (192), platformer
  `Enemy`/`EnemySystem`, RTS systems.
- **Hypothesis:** `sceneEditor` + `sceneUIKit` are large (~1,600 combined) but you won't touch them for this
  milestone — **pure hygiene split, do last (or never).**
