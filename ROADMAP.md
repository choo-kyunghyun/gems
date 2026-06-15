# Roadmap

## Core

- Particle system
- Sound
- IMGUI Debug panels

## RPG

- BUG: Claim build area isn't save status, allowing multiple times
- BUG: Rain and snow is static, check shader accept current_time via uniform
- New options on inventory: Temparature unit
- New rader type: Draw arrows around player
- Context-aware hotkey hint
- Better crafting ui
- Stamina and sprint
- Faction
- Terrain, Floor, and Structure
- Explosive
- Turrets
- Save and Load
- Inter-level interaction
- Wandering traders
- Companion benefits like increasing inventory

### Build Mode

- Buildable storage
- Lightsource

### Editor

- Prefabs
- Categorized menu

## GMRT 0.20 cleanup (retire fixed-quirk workarounds)

The default toolchain moved 0.19 → 0.20; a probe battery (2026-06-15) confirmed the runtime
now fixes the quirks below, so each workaround can be retired one by one. **Caveat:** every
one of these would regress on 0.19 — only do them if dropping 0.19 support. The big constraints
(50-method class crash #15065, `super`/inheritance, `JSON.stringify` nested, `for...of` over a
Map/Set, `toUpperCase`/`toLowerCase`, `asset_get_index` `>=0`, xorshift32) are **still broken on
0.20**, so the composition-over-inheritance + parallel-array + flat-JSON patterns stay mandatory.
Full matrix in CLAUDE.md → Build & Run.

- **flexpanel runtime style mutation** (drive live layout via `flexpanel_node_style_set_*` + recalc instead of draw-time offset/clip math)
  - `UIElement` — re-enable the commented-out setters (`setMargin`/`setPadding`/`setGrow`/`setShrink`/`setFlexDirection`/`setJustifyContent`/`setAlignItems`/`setDisplay`/…); `dragX`/`dragY`/`scrollY` in `getLayoutPosition` could become real position mutation
  - `UIText` / `UIRichText` — real runtime self-sizing (the `setWidth`-in-`onUpdate` path that currently runs at width 0 forever)
  - `GemsContainers` — drop the 0-height-label guard (~line 190)
  - `UIScroll` (`scrollY` offset), `UIDrag` (`dragX`/`dragY`), `UIInput` (clip/scroll offset), `UISlider` — candidates to move from offset math to flex mutation
- **`Math.PI` + trig (`cos`/`sin`/`atan2`/`sqrt`)** (trig is usable now — no more keyframe-lerp stand-ins / NaN coords)
  - `Temperature._DIURNAL`, `WorldClock.tint` — keyframe-lerp tables could become smooth cosine curves
  - `RenderWeather` — particle motion can use sin/cos (also unblocks the "rain/snow static" BUG under RPG)
  - unblocks the RPG "radar arrows around player" item (needs `atan2`)
- ~~**`draw_triangle_color` / `draw_line_width_color`**~~ — DONE: `UIAccordion` triangle chevron, `UICheckbox` checkmark, `UINav` debug lines now use the real primitives. (Optional polish remaining: `RenderWeather` rain / `RenderGrid` / `RenderZone` width lines.)
- **static getters** (LOW value — the existing method/plain-field form works fine; cosmetic only)
  - `VirtualKeyboard.isOpen()`, `SystemMenu.isOpen()`, `Dialogue.isOpen()`, `UITable.active`, `InputAction`/`UIInput.active` — could become `static get`
- **subclass field initializers** (PARTIAL FIX — a subclass `field = …` now runs, but the base constructor still does NOT fire / `super()` is not invoked; verify per case, don't assume full inheritance)
  - `Scene` subclasses (`sceneRpg`/`scenePlatformer`/`sceneRTS`) — `label` / `gameplay` could move from `create()` back to field initializers; but `SceneManager` still can't rely on a base-ctor-set field, so keep reading `label` from `SceneRegistry` unless verified
