# TODO

Intent only — contracts live in the code. A sweep applies one mechanical rule across all of `scripts/`, sized so one session can finish and verify it; a sweep too large splits by pillar (Core → Game), never by mixing concerns.

## Chores

- Remove unused levels in datafiles
- Consider adopting Spine2d and removing SpriteMeta

## Dead Code

Noticed in passing, deliberately left unfixed until scheduled. Each: wire a consumer, or drop.

- Caller-less members: `Query.farthest`, `Color.alpha`, `TileLayer.from`, `Status.all`, `FactionSystem.all`, `SettlementComponent.all`, `Recipe.has`
    - the `all`/`has` group is `Registry` facade parity, kept whole without a reader
- `World.update` is unwired scaffolding — `sceneColony` drives `WorldClock`/`WorldEvents` directly (it does call `World.reset`), and `update` carries the engine → gameplay-kit edge. Wire the phase-2 routing (clock injected, not named) or drop it.
- `EntityStore.import`/`register` — saves store `entities.export()` but restore reads entities out, and `add` auto-registers. `ComponentStore.import` also silently drops snapshot tokens the store never registered — keep the pair only with that guard.
- `InputPreset` — `save`/`load` are never invoked, so the keymap and `Input.deadzone` only ever hold hardcoded defaults and `input.json` is never written. Load at boot, or drop the module.
- `InputAction.unbindButton`/`unbindAxis` — `UIRebind` remaps by assigning `action.buttons[0]` directly.
- `UIMinimap`/`gemsMinimap` — `RadarArrows` is the shipped radar, and the factory is `UIMinimap`'s only constructor site. If kept as a spare, its fixed `target` id also predates the live-queries invariant (take a getter, or resolve `CameraFocus`).
- `gemsWindow` and the `UIDrag`/`UIResize` pair it is the sole constructor of — the colony windows use `gemsOverlay`. A three-module spare chain like `UIMinimap`/`gemsMinimap`.
- `Projectile`/`ProjectileSystem` run with zero spawn sites, yet `sceneColony` ticks the system and `WorldOverlay` queries bullets every frame. Unregister the pair until a spawner exists, or accept the idle queries explicitly at the tick-loop site.
- The settlement inhabitant/capability layer — `SettlementSystem` is caller-less (`ColonySpawn` attaches `Resident` directly), the `SettlementComponent` registry has no reader, and `Settlement.addComponent`/`removeComponent`/`expand` are seeds for Farming/raid. Route `ColonySpawn` through `SettlementSystem.assign` so the seam is real; keep the rest as deliberate spares. The lands half (`found`/`at`/`ownerAt`/`all`/`centroidWorld`) is live.

## API Shape

- `File.saveAsync`/`loadAsync` break the verb family — rename to `writeBufferAsync`/`readBufferAsync` beside `read`/`readBuffer`. Both are caller-free (parked on GMRT #15223), so the rename is free. `writeBuffer` also returns an unconditional `true` it never verifies.
- Drop `Query.hasCollision` (duplicates `has: Collision`) and migrate its one caller, `contentInteractions`.
- `MotionPlanner.plan` — fold the speculative `MP_ALGORITHM` selector to `plan(start, goal, opt)` until a second algorithm exists. Planning with no grid bound should `Log.error`, not return the `[]` that also means unreachable.
- `World`'s transfer family returns three shapes — `take` a snapshot or null, `put` an id or -1, `transfer` all three. One family, three failure signals a caller must know apart.
- `UIInput.get focused()` is the kit's lone getter where `UISelect`/`UIDropdown`/`UITable` document "methods, not accessors" — convert it or soften the note.
- `SpriteMeta.fit(scale, sprite)` inverts the sprite-first parameter order of its siblings `density`/`anchor`; four call sites to swap.
- Singleton method style is split in Core/Util: `Log`/`Settings`/`Tracker` self-reference via `this`, the rest via their global name — normalize as a mechanical pass.
- `gemsDropdown` ignores the `opts.onChange` its sibling `gemsSelect` fires after `Settings.set`, and has zero callers; `SystemMenu` hand-rolls the same binding over `gemsDropdownCustom` because it needs the apply hook. Pass `onChange` through and the hand-roll folds into the factory.
- `gemsSlider(key, min, max, step, opts)` is the kit's only positional signature, forcing live callers to pass a placeholder; fold min/max/step into the opts bag like `gemsStepper`.
- `gemsRoot` monkey-patches `insertChild` to the inner column instead of exposing it as a named content property (`gemsScroll.scrollBody`, `gemsOverlay.body`) — `removeChild` stays un-redirected, so a remove targets the wrapper and silently misses, and the assigned `.content` has no reader.
- `gemsSelectCustom` lost its doc line and its sizing: the header sits stranded above `gemsFieldPanel`, and it builds `gemsFieldPanel({})` where every sibling field control forwards `height`/`width` (latent — callers pass only `tooltip`).

## Gameplay

- Modular turret (the built turret auto-fires a hardcoded hitscan today)
    - Auto turrets fire mounted weapons
    - Mountable turrets
- Explosives: grenade and mine (`snd_explosion_large` is the reserved SFX)
- Minify furnitures
- Settlement and outpost — foundation done (`Settlement`: player-owned territory with Name/Faction, build mode gated to owned land); outpost variant + settlement-management UI remain
- Farming and fishing (farming layers on a settlement's lands)
- Raid event: defend the settlement (`mus_ambient_emergency` is the reserved BGM)
- Gacha capsule with new UI
- Radio
- Gamepad reloading
- More role-playing optional components
    - Biological sex (display as XX and XY)
    - Entity age

## UI

- Killfeed
- Click cue on non-button widgets — only `UIButton`/`UINav` activation cues today, so a click on a slider/checkbox/list is silent
- Smart HUD (concept)

## Build Mode

- Blueprint UI
- Drag to select

## Editor

The level file, a `Prefab`, and a generator's output are now one shape (`LevelData`); the editor is the half still on its own parallel model.

- Paint the real `contentTiles` stack instead of the editor's two hardcoded layers, so the brush palette comes from `LAYERS` (+ the wall materials) and an entry the editor can't model stops being parked and re-emitted blind (`sceneEditor._loadTiles`).
- Author `meta.entries` (named spawn points) — only the legacy `playerSpawn` is editable today, so an edited level can't be a portal target.
- Draw with the real render passes instead of `RenderDebugTileMap` + hand-drawn markers, so what the editor shows is what plays. Whole-level residency is what makes this affordable.
- Prefabs: capture a selected rect into a `PrefabDef`, stamp a registered one back. Both are plain `LevelData` ops, so only the export is new — a JS literal for `contentPrefabs`, mirroring the level export → `datafiles/levels/` workflow.
- Zone authoring, if it earns its way back: the editor edits no channel at all now, so a level's `settlement`/`climate` regions are only reachable by hand-editing `meta`.

## Media

Names predating the naming rules are grandfathered — never rename as a sweep; migrate one only when already touching it.

- Grandfathered: the UI glyphs/lobby art (`spr_check`/`spr_play`/`spr_uibox`/…), spare icons (`spr_apple`), the `spr_fenceSquare`/`spr_fenceRound` sheets, and the `spr_tile16`/`spr_tilecornerRough` autotile sets
- Redraw the 16 px fence sheet at 32 (hand-drawn, no generator; `SpriteMeta density: 0.5` carries it meanwhile)
- Unwired spares: `spr_fenceRound`, `wooden_bed_simple`
- A dedicated plan-view TOP pattern per wall material, if the shared face texture ever reads wrong

## Verification

- Test scenes for fast debugging
- Cover what only a running frame can catch (system ordering, grid/collider sync); leave one-off probes on the existing `Log`/`Screenshot`/`entities.dump` harness
