# Roadmap

## Core

- Particle system
- Sound
- IMGUI Debug panels

## RPG

- BUG: Claim build area isn't save status, allowing multiple times
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

- **flexpanel runtime style mutation** — PARTLY DONE (the self-sizing slice landed; the rest is deliberately deferred):
  - ~~`UIText` / `UIRichText` real runtime self-sizing~~ — DONE: `setWidth`/`setHeight` in `onUpdate` now apply on 0.20, so labels self-size for real (no code change — the path was always there). Screenshot-verified.
  - ~~`GemsContainers` 0-height-label guard~~ — DONE: the fixed-height label-wrapper rows in `gemsModal` (title + body, dropped `bodyHeight`) and `gemsSection` (title) are retired — labels are inserted directly and self-size. `gemsRow` was already correct (its fixed-_width_ cell is a layout choice, not a height workaround); comment corrected.
  - `UIElement` re-enable the commented-out setters — **deferred by design**: the full set is ~45 methods and uncommenting it would push the class past the 50-method ceiling (#15065, still live on 0.20). Enable an individual setter only when a consumer needs it, watching the count.
  - `UIScroll`/`UIDrag`/`UIInput`/`UISlider` offset→flex migration — **deferred by design**: the offset/clip math works, so migrating is pure churn with regression risk and no user-visible gain.
  - _Optional sweep remaining:_ scene-level fixed-height label rows that no longer need to be (`SystemMenu._stat`, `sceneEditor` `labelRow`, `sceneUIKit` `_richRow`) — harmless/deliberate now, but their "0.19 no-op" comments are stale.
- **`Math.PI` + trig (`cos`/`sin`/`atan2`/`sqrt`)** — PARTLY DONE:
  - ~~`Temperature._DIURNAL`~~ — DONE: the keyframe table + bracket-lerp are now a single cosine day-curve (`diurnal()`), peaking at `DIURNAL_PEAK`.
  - ~~`RenderWeather` particle motion + "rain/snow static" BUG~~ — DONE: the static bug was multiplying `Time.raw` (a per-frame _delta_) by the fall speed, so every particle sat at a near-constant offset — now scrolled by a cumulative wall-clock (`current_time`); snow also weaves with a `Math.sin` sway. Screenshot-verified (flakes move frame-to-frame).
  - `WorldClock.tint`/`_KF` — **kept by design**: it's a hand-authored day/night _color_ script (deep-blue → dawn-orange → clear → dusk → blue), not a trig stand-in; a cosine can't express the color sequence.
  - still open: the RPG "radar arrows around player" item (a gameplay feature; `atan2` is now available for it).
- ~~**`draw_triangle_color` / `draw_line_width_color`**~~ — DONE: all arrow/chevron/step/sort affordances (`UIAccordion`/`UISelect`/`UIStepper`/`UIDropdown`/`UITable` + `Dialogue` advance) use the shared `drawUIArrow` triangle helper; checkmark/dash markers (`UICheckbox` tick, `UIQuestTracker` objective marker) use the shared `drawUICheck` + `draw_line_width_color`; `UINav` debug lines use `draw_line_width_color` (helpers in `scripts/utils`). (Optional polish remaining: `RenderWeather` rain / `RenderGrid` / `RenderZone` width lines.)
- **static getters** — INVESTIGATED, NOT converted (and won't be): tried `SystemMenu`/`Dialogue`/`VirtualKeyboard` `isOpen()` → `static get`, but a `static get` with a comparison body (`return _modal !== null`) **miscompiles to a constant on GMRT 0.20** — verified, the getter read `false` while the field held a live object (the inline comparison read `true` the same frame), which would have broken the pause gate + virtual-keyboard typing. The proven method form stays; the new quirk is recorded in CLAUDE.md. (The `.active` fields the old note listed were never candidates — read-write state can't be a getter.)
- **subclass field initializers** — WON'T DO: a subclass `field = …` reportedly runs on 0.20, but the core inheritance machinery (`super()` / the base-constructor chain) is **still broken**, so moving `Scene` subclasses' `label`/`gameplay` from `create()` back to field initializers buys nothing safe — `SceneManager` still can't rely on a base-ctor-set field (it reads `label` from `SceneRegistry`). The `create()`-set form stays and the composition-over-inheritance model is unchanged. (Given the static-getter probe over-claimed, the "field initializers now run" probe result is treated as unverified for our purposes — no reason to lean on it.)
