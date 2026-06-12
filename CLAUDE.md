# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**G.E.M.S.** (GameMaker Entity & Map System) is a UI and entity management library for GameMaker 2026.0.0.16 on the GMRT runtime (0.19.0). All game logic is JavaScript, not GML. Assets live in four IDE folders: **Core** (ECS, systems, level, render, UI, input, utilities), **Templates** (genre templates — `Platformer`, `TopDown`, `RTS`, `Map` — each holding that genre's scene plus its controllers, gameplay systems, and components), **Benchmarks & Tests** (`sceneBenchmark` and the `sceneTileInspect*` validation scenes), and **Demo** (the app shell — `obj_game`, `rm_game`, the `demo` UI helpers, `sceneLobby`, shared sprites). Lobby categories (`SCENE_CAT_*`) are independent of IDE folders — e.g. `sceneTopDown` lives in `Templates/TopDown` but registers under `SCENE_CAT_RPG`.

The entire demo runs in a single room (`rm_game`) with `obj_game` as the unified controller — no room transitions.

## Working Guidelines

Bias toward caution over speed; for trivial tasks, use judgment.

- **Think first.** State assumptions; if uncertain or a request is ambiguous, ask rather than guess silently. Push back when a simpler approach exists.
- **Simplicity first (KISS).** Minimum code that solves the problem — no speculative features, single-use abstractions, unrequested configurability, or error handling for impossible cases. Fail fast rather than hiding errors.
- **Surgical changes.** Touch only what the task requires; match existing style; don't refactor or reformat unrelated code. Mention pre-existing dead code rather than deleting it; remove only what your own change made unused.
- **Verify by running.** There are no tests — confirm behavior by running the game (see Build & Run). For multi-step work, state a brief plan with a verification check per step.

## Build & Run

The project uses `gm-cli` (experimental GameMaker CLI) with the GMRT 0.19 toolchain. The project file is `gems.yyp`; the IDE (GameMaker 2026.0.0.16) can also build and run.

```sh
gm-cli run     --toolchain GMRT@0.19 gems.yyp                 # run
gm-cli compile --toolchain GMRT@0.19 gems.yyp                 # compile only
gm-cli compile --toolchain GMRT@0.19 --errors-only gems.yyp  # compile, errors only
```

**Stale-cache reset.** Two ignored, regenerable dirs hold build state: `.gmcache/` (incremental compile cache — `gm-cli cache info`/`gm-cli cache clean`) and `Build/` (build _output_, not "cache", so `cache clean` won't touch it — remove it manually). When a build behaves as if an asset still has its old state (renamed/deleted asset still "present", or a compile/runtime error that doesn't match the source), wipe them and rebuild: `gm-cli cache clean` (also re-downloads the shared GMRT runtime under `%LOCALAPPDATA%\GameMakerCLI\cache`, so the next build is slower) and/or delete `Build/`. The next `gm-cli run`/`compile` does a full clean rebuild. Both dirs are git-ignored (`.gmcache` via its own auto-generated `.gmcache/.gitignore`), so this is safe.

**Visual verification (screenshot review).** To _see_ the rendered screen, add a temporary auto-capture (the agent can't press F5 in the live window): in `obj_game/Draw_75.js` add a frame counter on `this`, call `screen_save("auto.png")` at ~frame 150 and `game_end()` at ~152 so the run self-terminates. Then `gm-cli run` (it blocks until `game_end`), `Read` the PNG, and **revert the temp code**. Gotchas: `screen_save` does **not** create missing dirs (`screen_save("screenshots/x.png")` fails unless the folder exists — use a bare filename); a **bare** filename lands in the run/build dir `.gmcache/build-gmrt-windows-vm/build/auto.png`, _not_ the `%LOCALAPPDATA%\gems\` save dir (where `game.log`/`settings.json`/`save.json` live).

## Asset Creation

**Never create GameMaker assets (scripts, objects, rooms, sprites) by hand-writing files/folders or editing the `Resources` list in `gems.yyp`.** GameMaker manages asset metadata strictly — manual edits corrupt the project or are silently ignored. Two valid routes:

**A. GameMaker IDE** — right-click a folder in the Asset Browser → Add Script / Add Object / etc.

**B. `gm-cli resourcetool`** (no IDE) — for a new script `<name>`:

```sh
gm-cli resourcetool eval "RESOURCE CREATE TYPE=Script NAME=<name>"                # registers it in gems.yyp
gm-cli resourcetool eval "RESOURCE SET EXPR=<name>.scriptSource VALUE=<name>.js"  # point at .js, not the .gml stub
```

Then delete the generated `scripts/<name>/<name>.gml` stub and `Write` `scripts/<name>/<name>.js`. To file the asset under an IDE folder, **edit the asset's own `.yy`** `parent` (`path: folders/<Folder>.yy`, `name: <Folder>`) to match a sibling — this is safe local metadata. New IDE folders: `gm-cli resourcetool eval "FOLDER CREATE FOLDER=Parent/Child"`; its name validator rejects spaces/`&` (over-strict — the IDE allows them, e.g. `UI Sprites`, `Benchmarks & Tests`), so for such names hand-add a `GMFolder` line to the `Folders` array in `gems.yyp` (this array — unlike `resources` — is safe to hand-edit; that's also how empty folders are deleted, as resourcetool has no FOLDER DELETE). Do **not** `RESOURCE SET` `.parent` (it mis-writes the path); left unset, the asset stays at the project root. Verify with `gm-cli resourcetool eval "CHECK PROJECTPATH=gems.yyp"`, then `gm-cli compile`.

After the asset exists, edit its `.js`/`.yy` freely. **Renaming or deleting** an asset must also go through the IDE or `resourcetool`, never by moving/removing files manually — to delete: `gm-cli resourcetool eval "RESOURCE DELETE NAME=<name> TYPE=Script"` (removes it from `gems.yyp` and deletes its `scripts/<name>/` folder).

## Code Style & Conventions

- **Language**: JavaScript (GMRT JS runtime), not GML. All scripts in `scripts/` use `.js`.
- **Script naming**: PascalCase directory and filename matching the global the script exposes (e.g. `scripts/World/World.js`). Intentional exceptions: the `cameraFollow`/`cameraFollow2d` factories (camelCase functions) and the `utils` grab-bag.
- **Global exposure**: Scripts expose globals via `globalThis.Name = ...`. Components are string tokens; systems and classes use the forms below.
- **ECS bootstrap**: Each scene owns its `World` (`this.world = new World(maxEntities, tickrate, opts)`). There is no `WORLD`/`MAX_ENTITIES` global.
- **Formatter**: [Prettier](https://prettier.io/) with `{ "bracketSameLine": true }` (MDN config). Working tree is CRLF (`core.autocrlf=true`); run `prettier --end-of-line crlf`. `.d.js` stubs and `Build/`/`.gmcache/` are in `.prettierignore`.

## GMRT-Safe Idioms

The GMRT JS runtime/compiler miscompiles or chokes on several standard JS forms. These have each caused real, hard-to-diagnose breakage — avoid them, don't "clean up" code back into them, and prefer the listed idiom:

- **No `for...of` over a Map/Set iterator** (`map.values()`/`.keys()`/`.entries()`, or a `Set`) — it _breaks_ the runtime. Keep parallel arrays and index-loop them (see `World._keys`/`_storages`). `for...of` over a plain **array** or string is fine; `for...in` over a plain **object** is fine. (Probed 2026-06-12: now hard-crashes the run rather than the original _hang_ — either way, never use it.)
- **No array destructuring in `for...of`** (`for (const [a, b] of arr)`) — `ReferenceError` at runtime (probe-confirmed 2026-06-12). Use index access (`arr[i][0]`). (Object destructuring `const {x,y} = o` and destructuring in a `.forEach(([a,b]) => …)` callback param _are_ fine — see `Input.import`.)
- **No empty `for` initializer** (`for (; c < n; c++)`) — _crashes the compiler_ (`NullReferenceException` in `jsc.Parser.ASTVisitor.VisitFor`; probe-confirmed 2026-06-12). Use a `while` loop.
- **Don't cache a primitive boolean in a local across a function** — it can get clobbered mid-function (a `const` flips `true`→`false` in one call). Cache the **component object** and read the property live each use (see `PlatformerController.update` reading `groundedComp.isGrounded`).
- **Top-level bare `const` is not visible to other scripts** — share via `globalThis.Name`. Bare top-level `function` declarations are _mostly_ global, **but past a certain file size GMRT stops hoisting some of them into global scope and faults at startup** (`cannot coerce undefined or null value into object`). Assign factories/helpers explicitly — `globalThis.X = function X(…)` — and keep files small (the GemsUI kit was split into `GemsTheme`/`GemsContainers`/`GemsWidgets`/`GemsControls` for this reason).
- **Class getters/setters DO work** — a `get x()`/`set x()` accessor fires correctly on GMRT 0.19 (verified by probe: getter returns its computed value, setter mutates and reads back; `UISelect` ships with `get index/value/name` and works). The earlier "getters never fire" claim was a misdiagnosis — the `UIStepper` failure it was pinned on was the **large-file global-hoisting fault** (above), not the getter. Use getters freely; the only reason to inline (as `UIStepper` does) is style, not a runtime constraint. **But `static get`/`static set` do NOT fire** — a static getter silently yields `undefined` (hit on `VirtualKeyboard.active`, which always read falsy so typing bailed). Expose static state as a plain field or a `static` method (`VirtualKeyboard.isOpen()`), not a static accessor.
- **Guard `!(pos.width > 0)` before drawing filled geometry/sprites in a UI component** — on the first frame after a scene transition the flexpanel layout isn't computed yet, so `getLayoutPosition()` returns NaN width/height; drawing roundrects/sprites with NaN coords faults. Test `> 0`, not `<= 0` (`NaN <= 0` is `false`, so the naive guard misses it) — see `UIStepper`/`UISlider`/`UIProgress`/`UISelect`/`UICheckbox`/`UIInput`. **Do NOT add this guard to text-drawing components** (`UIText`, or anything that self-sizes its element via `setWidth` in `onUpdate`): runtime `flexpanel` mutation is a no-op on 0.19, so such elements legitimately run at width 0 forever, and the guard would suppress their draw permanently. `draw_text` tolerates a 0/NaN width (it draws at `pos.left/top`; width only affects centering), so text drawers need no guard.
- **`String.prototype.toUpperCase()`/`toLowerCase()` return garbage Unicode** — probe-confirmed: `"q".toUpperCase()` yields `"ଊ"` (an Oriya glyph), not `"Q"`, so case-mapped text comes out as unrenderable characters. Map case yourself via char codes — `String.fromCharCode(ch.charCodeAt(0) - 32)` for a-z→A-Z (`fromCharCode`/`charCodeAt` both work). See `VirtualKeyboard._upper` (Shift key).
- **`JSON.stringify` faults on nested objects/arrays** — `JSON.stringify(["a","b"])` and a flat `{key: scalar}` object are fine (see `Settings`), but an object whose value is an object/array _hard-faults_. Persist only flat `{key: scalar}` blobs; serialize structure to a scalar string yourself (`ids.join(",")`, `"k=v;k=v"`) — see `SaveData`/`Profile`/`Achievement`. (`LevelSerializer.save`'s `JSON.stringify(data, null, 2)` is dead code — don't trust it as proof.)
- **GMRT 0.19 does not support SVG sprites** (e.g. `spr_choo`, `spr_play`, `spr_hana`) — `sprite_get_number()` returns `0`, so frame math can go negative and `draw_sprite_ext` throws _"Trying to draw negative subimage index on a non-instance"_. Use raster sprites; clamp any computed frame count to `≥ 1` and `subimg` to `≥ 0` (see `AnimationSystem`).
- **`asset_get_index(name)` returns an opaque asset _ref_, not a numeric index** — so a `>= 0` validity test is always `false` for a found sprite (a ref object compared with `>= 0` is `NaN`-false) and silently suppresses the draw, while `sprite_exists(ref)` is `true`. Validate a name-resolved sprite with `sprite_exists()`, never `>= 0` (a not-found name returns `-1`, which `sprite_exists` also rejects). See `UISlots`/`SlotDrag` (correct) and `UIRichText._icon` (the inline-icon resolver).
- **`view_camera[]` is not exposed in the GMRT JS runtime** — indexing it faults (probe-confirmed 2026-06-12: throws catchable `Error: unhandled type (13) for JS_ToObject`). Hold the `Camera` instance and read `camera_get_view_*(camera.id)` (see `sceneTopDown.draw`).
- **`gpu_set_scissor`/`gpu_get_scissor` leaks globally** — the clip state set for one element bleeds onto every subsequent UI draw, so a wrong/missed restore makes the _whole scene_ go invisible (hit while clipping `UIInput`'s text). Don't use it to clip; clip by computing the visible substring/offset yourself and drawing only what fits (see `UIInput.onDraw`).
- **`draw_text` loses the world matrix inside a NESTED clip surface** — `UIElement._drawClipped` (the `clip`/`UIScroll` path) renders children into an off-screen surface under a `matrix_world` translate that maps gui-absolute coords into surface space. `draw_roundrect_*`/`draw_sprite_*` honor that translate, and so does `draw_text` for a _single_ surface — but when an immediate-mode text widget sits inside **two** clip surfaces (a `gemsScroll` within a `gemsScroll`), the inner translate isn't applied to `draw_text`, so the text draws at its absolute position, lands outside the inner surface, and is clipped away (the widget's panel/roundrect still moves correctly, so only the text vanishes). Hit on `UIQuestTracker` nested in its own `gemsScroll` inside the sceneUIKit Widgets-tab scroll. Don't double-nest an immediate-mode text widget in two surfaces; one enclosing scroll is enough (a long list scrolls fine through a single surface). `UIText`/`UIButton` labels are unaffected (they don't double-nest in the kit's layouts).
- **A `UIComponent` must resolve `I18n.font(key)` at DRAW time, not cache the handle at construction** — `I18n.font(key)` falls back to `draw_get_font()` for an undeclared key (e.g. every key under en-US), so a handle captured in a component constructor (which runs in a Create event) freezes whatever font happened to be active then; `draw_set_font(thatHandle)` later silently renders **nothing**. Store the font _key_ (a string) on the component and call `I18n.font(key)` inside `onDraw`. Hit on `UIQuestTracker` (passed `I18n.font("default")` at construction → blank text); fixed by passing `titleFontKey`/`bodyFontKey`.
- **`draw_triangle_color` and `draw_line_width_color` render NOTHING** — probe-confirmed in UI `onDraw`: a filled `draw_triangle_color` and a 6px `draw_line_width_color` at valid on-screen coords both drew nothing, while `draw_roundrect_color_ext` and `draw_text` in the _same_ `onDraw` drew fine. This silently made the `UIAccordion` chevron (a triangle), the `UICheckbox` "check"-style tick (`draw_line_width_color`, lines 127/136), and the `UINav` debug direction lines invisible. For arrows/ticks use a **`draw_text` glyph** (`UIAccordion` draws `">"`/`"v"` like `UISelect`'s `"<"`/`">"`), or `draw_rectangle`/sprites — not triangles or width-lines. Also note GML `pi`/`degtorad` **and** `Math.PI` are all `undefined` in the GMRT JS runtime (any arithmetic with them → `NaN` coords → nothing draws), so avoid trig; interpolate vertices or precompute angles as literals.
- **UI timers/easing must use `Time.raw`, not `Time.delta`** — `Time.delta` is scaled by `Time.scale`, so UI on it freezes/slows when a sim dilates or pauses time. Use `Time.raw` (wall-clock) for hover/press fades, caret blink, key-repeat, toggle easing (see `UIButton`, `UIInput`, `UICheckbox`).
- **`mouse_check_button*` are sampled realtime, NOT latched per frame** — calling the _same_ query (`mouse_check_button`, `_pressed`, or `_released`) more than once in a frame can return _different values each call_ (log-confirmed 2026-06-12: on the release frame the drop path read `mouse_check_button_released` as `0` while the cancel path, a few lines later the same frame, read `1`, so the drop silently lost to the cancel). Calling each **once** per frame is reliable — that's why `UISelect`/`UIStepper`/`UIButton` work. But when several consumers need the _same_ edge in one frame (e.g. multiple `UISlots` grids + the drag resolver all deciding on the release), call each edge query **once** at frame start and share the result; don't re-query, and don't derive edges from the `mouse_check_button` _level_ (it flickers frame-to-frame even held). See `SlotDrag.poll()` (called in `Step_0` before `UI.update`), which calls `mouse_check_button_pressed`/`_released` once and exposes `SlotDrag.pressed`/`released` for `UISlots` and `SlotDrag` to read.
- **`keyboard_lastkey` lags `keyboard_check_pressed(vk_anykey)` by a frame** — on the frame a key's pressed-edge fires (`vk_anykey` true), `keyboard_lastkey` still holds the _previous_ key, so a "press a key to bind" handler that reads `keyboard_lastkey` on the anykey edge binds the stale key on the first press and only works on the second (user-confirmed). Don't trust `keyboard_lastkey` for edge-synced capture; instead scan the keycode range for the one whose `keyboard_check_pressed(code)` is live this frame — that stays in sync with the edge. See `UIRebind._scanKey` (scans `8..255`, skipping nokey/anykey/Esc).
- **A `static` field initializer can't reference the class's own name** — `static x = ClassName.y` throws `ReferenceError: ClassName is not defined` at **load** (not compile), because the class binding isn't live while its own static fields are being evaluated. Hit on `Dialogue` (`static speed = Dialogue.speedDefault`) — the whole script faulted at startup. Initialize such fields with a **literal** and read `ClassName.y` from _methods_ instead (methods run post-load, where the `globalThis.ClassName` binding exists). Referencing _another, already-loaded_ class in a static initializer is fine (e.g. `static panelColor = Color.parse("#…")`); only self-reference breaks.
- **Class inheritance / `super` is broken** (probe-confirmed 2026-06-12) — `super.method()` is a **compile error** (`Unsupported expression [R_SUPER]`), not a runtime fault; don't design with subclassing. Model "kinds of X" as **composition**: a flat base class carrying a `components: []` array of standalone data classes queried by `instanceof` (the `UIElement` `addComponent`/`getComponent(Class)` pattern, also `Item` → `Equippable`/`Weapon`). `instanceof` against a _flat_ class works fine; only inheritance breaks. W3 used a free `teardownScene(this)` helper instead of a `GameScene` base for this reason.

When a quirk forces an unusual idiom, leave a one-line comment so it isn't "fixed" back. New quirks discovered during work should be added here.

> **Probe coverage (2026-06-12):** the bullets above were isolated-tested via a throwaway probe (battery in `obj_game/Create_0` + a temp script for module-scope/cross-unit cases) and all reproduced. Five earlier claims could _not_ be reproduced and were removed — regex `.replace()`, `clipboard_has_text()` "always false", a static method calling a sibling static, nested-function locals inside a top-level IIFE, and multi-declarator `const` — all worked correctly in event **and** script context; re-add them only if they resurface. Not isolated-probed (design rules / need game state, left as-is): boolean-local clobber, large-file global-hoisting fault, NaN-width UI guard, `gpu_set_scissor` leak, `Time.raw` UI-timer rule.

## Architecture

The full architecture reference — every layer, system, component, renderer pass, and UI widget — lives in **[ARCHITECTURE.md](ARCHITECTURE.md)**. High-level map:

- **Demo shell** (`obj_game`, `Scene`, `SceneRegistry`, the GemsUI factory kit) — the single-room app and its UI scaffolding.
- **ECS Core** (`World`, `IdPool`, string-token components, plain-object systems) — instance-based ECS with a fixed-rate tick and render interpolation.
- **Built-in systems** (gravity, movement, solid/separation/trigger collision, projectiles, state machine, lifetime, pathfinding) — genre-agnostic, dispatched explicitly from a scene's `step()` (often via a `Pipeline`).
- **Genre Templates** (`scripts/<genre>/` under the **Templates** IDE folder) — a genre **controller** (`PlatformerController`/`TopDownController`) plus **gameplay systems** layered over Core. The platformer/top-down templates are action-RPGs (see the RPG layer below).
- **RPG / gameplay layer** (Templates) — items & inventory (`Item`, `Inventory`, `Equipment`, `Consumable`, `Container`, `Encumbrance` + their systems), combat (`Health`, `Stats`, `MeleeSystem`, `ProjectileSystem`, `Enemy`/`SlimeAI`), progression (`QuestLog`, `NPC`, `Dialogue`), loot (`ItemDrop`, `Rarity`), and sprite animation (`Animator`/`AnimationSystem`). Per-genre content registries: `PlatformerContent`/`TopDownContent`.
- **Genre UI** — `PauseMenu`, `StorageUI`, and the world-space overlays `PlatformerUI`/`TopDownUI`; HUD + draggable inventory windows are real UI panels built by each scene and drawn on the GUI layer.
- **Renderer** (`Renderer` + `RenderPass`es: `RenderEntity`, `RenderDebugBox`, `RenderTileMap` with blob/dual-grid autotiling, debug passes) — hardware-accelerated tiles via `VertexBuffer`.
- **UI system** (`UIElement`/`UI` over `flexpanel`, the `UIComponent` widgets, plus standalone singletons `Tooltip`/`Toast`/`SlotDrag`/`UINav`/`VirtualKeyboard`/`SceneTransition`/`FloatingText`) — Flexbox-backed, keyboard/gamepad navigable.
- **Input** (`Input`/`InputAction`, rebindable keymaps) and **utilities** (`Settings`, `Color`, `I18n`, `Camera`/`cameraFollow*`/`cameraPan`, `Query`, `AABB`, `Broadphase`, `Raycast`, `Tween`, `EntityPreset`, `Level`/`TileLayer`, `File`, `Log`).

`obj_game` is the unified controller — it drives both global system ticks and scene lifecycle:

```
Create_0 → display/GPU setup; Log.clear/info; Settings defaults + load; I18n.load for `Settings.language`; opens SCENES.title
Draw_0   → draw_clear(background), scene.draw()
Step_0   → Time.update(), SlotDrag.poll(), UI.update(), SlotDrag.update(), UINav.update(), Dialogue.update(), pending scene → SceneTransition.start, SceneTransition.update(), scene.step(), Log.flush()
Draw_75  → UI.draw(), UINav.draw(), SlotDrag.draw(), Tooltip.draw(), Toast.draw(), Dialogue.draw(), SceneTransition.draw(), F5 screenshot
CleanUp  → scene.destroy(), UI/Input/I18n cleanup
```
