# G.E.M.S. Architecture

The always-loaded **core** of the architecture reference, imported into context by [CLAUDE.md](../CLAUDE.md) (via its `@docs/ARCHITECTURE.md` line) alongside [GMRT.md](GMRT.md) (the runtime quirks). This file carries the layer map, the cross-cutting invariants, and the index of the per-area reference files under [docs/architecture/](architecture/).

**Routing rule: Read the area's reference file before designing or modifying anything in it.** The index summaries below exist to route you to the right file — they name what exists, not the contracts. Never implement against a summary alone.

**Doc laws** — what this file and the area files may contain:

1. A doc records contracts: invariants, conventions, and cross-module coupling an agent must not break. Not what the code does — read the source.
2. No history. What a design replaced, when, and why lives in git and the source header — never in docs.
3. One owner per fact: GMRT quirks in GMRT.md, cross-cutting invariants here, an area fact once in its area file. Everyone else cites.
4. No API inventories, content catalogs, or tutorials — signatures live in JSDoc, content in its registry, GameMaker in the manual.
5. Dead or unwired code gets a clause, not a paragraph.

## Layers & Placement

Four top-level pillars (project folders), each reusable without the ones after it:

- **`Core`** — the pure engine: ECS (the `Entity` store + the `World` manager singleton), levels/zones, renderer passes, the UI system, input, utilities. References only engine concepts.
- **`Gameplay`** — the genre-agnostic gameplay kit (`Combat`/`Items`/`Inventory`/`Equipment`/`Animation`/`Lighting`/`Quest`/`Crafting`/`Squad`/`NPC`/`Status`/`Survival`/`Trade`/`Interaction`). Imposes a gameplay model but names **no** specific content; every kit module depends only on Core + sibling kit modules — **never on Demo** (the demo could be deleted and the kit still builds).
- **`GemsUI`** — the themed UI factory kit (`GemsTheme`/`GemsContainers`/`GemsWidgets`/`GemsControls`) over the Core UI system.
- **`Demo`** — the integrated showcase consuming the other three: the app shell, the scenes (RPG / platformer / editor / lobby), and all content- or model-specific glue (`Rpg*`, `Stats`, `CombatAI`, the world-sim).

**Placement rule** for new code: references only engine concepts → **Core**; imposes a gameplay model but names no specific content → **Gameplay**; names specific content/scenes/`Rpg*` → **Demo**.

## Cross-Cutting Invariants

Rules that apply in every area (the per-area files assume them; the GMRT quirks in [GMRT.md](GMRT.md) additionally always apply):

- **ECS shape**: components are **string tokens** (`globalThis.Position = "Position"`) with the data shape defined at the call site; systems are **plain objects** `{ update(entities) }` (or stateless objects with named query/resolve methods); each level owns its `Entity` store, and `World` is the world-manager singleton over it (`World.sim` fixed-step clock, `World.levels` level registry) — it holds no entity data and never auto-runs systems; the level's `step()` dispatches them explicitly. (Store handles are canonically `entities`; the ubiquitous legacy `world` name is grandfathered — naming rule: CLAUDE.md → ECS Bootstrap.)
- **Composition over inheritance** — GMRT breaks subclassing (`super` faults, base-class field initializers don't run — see GMRT.md): "kinds of X" are a flat class plus a `components: []` queried by `instanceof` (`Item`, `UIElement`); scene screens are standalone classes satisfying the duck-typed `Level` contract, never `extends Level`.
- **The clock split (pause/dilation rule)**: `Time.delta` is scaled by `Time.scale`, so anything on it freezes/slows with the sim — gameplay motion wants exactly that, but **UI timers/easing must use `Time.raw`** (hover/press fades, caret blink, key-repeat, toggle easing — `UIButton`/`UIInput`/`UICheckbox`; likewise the GUI singletons `Toast`/`SceneTransition`/`Dialogue`), else menus freeze while the game is paused. World-space effects deliberately stay on `Time.delta` so slow-mo slows them too (`FloatingText`, `Weather`).
- **Live queries over stored handles**: entity ids are never held across frames/maps — consumers re-derive them by component-presence query each use (`scene.playerId` from `Playable`, the camera target from `CameraFocus`, NPCs/portals/enemies by `world.query`/`Query`). Markers are components, not tag strings.
- **AABB convention**: every collision/geometry consumer derives world-space edges through `AABB.edges(pos, box)` / `AABB.of(entities, id)` — never inline `pos.x + box.x` (the non-uniform BBox anchor lives in one place).
- **Injection idiom**: a Core/kit module stays model-agnostic by exposing a hook the Demo wires at scene setup (`Combat.mitigate`, `StatusSystem.onStatsChanged`, `ConsumableSystem.grantAttr`, `RenderLighting`'s `ambient`, `UIQuestTracker`'s `source`). Extend through the seam; never make the kit reach down into Demo.
- **Registry pattern**: content is data registered into flat registries keyed by string id (`Item`/`Rarity`/`Manufacturer`/`Status`/`Recipe`/`Prefab`/`InteractAction`/`EntityPreset`/`StateSystem`) — adding content is a data entry, not an engine edit. Registration runs from `create()`-time calls (`RpgContent.register()`), never at script top level (load order).
- **Serialization-safe data**: component/def data stays flat scalars — no nested objects in persisted blobs, no `Set` in serialized fields (the `JSON.stringify` fault, see GMRT.md); `world.export`/`EntitySnapshot` ride on that.

## Reference Index (docs/architecture/)

- **[demo.md](architecture/demo.md)** — the app shell: `obj_game` event wiring (Create/Step/Draw/Draw GUI/Async), the duck-typed `Level` screen contract, `LevelManager` (flat level collection, keep-switch guest minigames, the resident-map registry), `SceneRegistry` + the lobby boot scene, `teardownScene`, and the **GemsUI factory kit** (containers `gemsRoot`/`gemsWindow`/`gemsCatBar`/…, widgets `gemsButton`/`gemsTable`/`gemsKeyHints`/…, tooltips).
- **[ecs.md](architecture/ecs.md)** — the `Entity` store API (create/remove/add/get/query/export), `EntitySnapshot`, `EntityID`, the component/system patterns, fixed-rate simulation (`World.sim`/`SimClock` ticks + `alpha`, `Pipeline`, `Time`), the built-in system table (`Gravity`/`Movement`/`Solid`/`Separation`/`Trigger`/`State`/`Lifetime`/`Interpolation`/`Pathfinding`), and the pathfinding flow (`PathRequest`→`PathResponse`, `PathFollow`, `NavGrid`).
- **[gameplay.md](architecture/gameplay.md)** — how a genre layers a player brain over Core (`PlayerSystem` + `Playable` vs the platformer's `PlatformerController`), template gameplay systems, lobby categories, and the **Gameplay kit membership list** (each module's one-line contract + the kit→Core dependency rule).
- **[rpg.md](architecture/rpg.md)** — the action-RPG reference consumer (by far the largest file): items/weapons/guns/attachments, attributes & `StatModel`, combat & hitscan, statuses/survival/death (`Mortal`), paper-doll appearance, interactions, the genre UI managers (`SystemMenu`/`StorageUI`/`TradeUI`/`CraftingUI`/`WeaponModUI`/`BuildMode`/`RpgInventoryUI`), the world-sim (`WorldClock`/`Weather`/`Temperature`/climate zones), the map graph + session persistence + squad, and chunk streaming & worldgen (`ChunkManager`/`OverworldGen`/`Prefab`/`TerrainField`).
- **[levels.md](architecture/levels.md)** — `LevelGrid`/`TileLayer`/`TileType`, the `TileEdit` collider-sync service (greedy-meshed solid colliders), and zones (`Zone`/`ZoneMap`/`ZoneSystem`).
- **[renderer.md](architecture/renderer.md)** — `Renderer` + every `RenderPass` (`RenderEntity`/`RenderBillboard`/`RenderMesh`/`RenderWalls`/`RenderTileMap` + its autotile modes/`RenderChunks`/`RenderCloudShadow`/`RenderWeather`/`RenderLighting`/zone + debug passes), `VertexBuffer`, ground lighting.
- **[ui.md](architecture/ui.md)** — the Core UI system: `UIElement`/`UI` over flexpanel, the fixed 1920×1080 GUI design resolution + `uiScale`, every `UIComponent` widget, the standalone singletons (`Tooltip`/`Toast`/`UIPointer`/`SlotDrag`/`VirtualKeyboard`/`UINav`/`SceneTransition`/`Dialogue`/`FloatingText`), and the input system (`Input`/`InputAction`/`InputContext`).
- **[utilities.md](architecture/utilities.md)** — `EntityPreset` (declarative spawning, variant inheritance, the `scale`×`size`/density bake), `Query` (spatial lookup), and the utility modules (`Settings`/`Color`/`Rand`/`SpriteMeta`/`I18n`/`Camera`/`Audio`/`Tween`/`MotionPlanner`/`AABB`/`Broadphase`/`Raycast`/`File`/`Log`/`Debug`/`DebugInspector`/`Utils`).
