# G.E.M.S. Architecture

## Overview

This file carries the placement rule and the cross-cutting invariants — and nothing per-module: a
module's contract lives in JSDoc at its owning declaration, and the project folder tree in
`gems.yyp` is the layer map.

Routing rule: the code is the primary reference. Before designing or modifying an area, read its
owning files' JSDoc contracts, the invariants here, the quirks in GMRT.md, and — for anything on a
per-tick or per-entity path — the hot-path idioms below and the costs `testCore`'s `perf.*` cases
measure. An area is located through the folder tree and the `globalThis.X =` declaration that owns
a name, never through a list here; a new contract goes to its owner.

Doc laws — what this file may contain:

1. Only cross-cutting facts: the placement rule and the invariants binding every area. A
   single-module contract lives in that module's JSDoc, never here, and no index of areas or owning
   files — the folder tree and the JSDoc headers are that index.
2. No history. What a design replaced, when, and why lives in git — never in docs.
3. One owner per fact: GMRT quirks in GMRT.md, cross-cutting invariants here, a module contract at
   its owning declaration. Everyone else cites.
4. No API inventories, content catalogs, or tutorials — signatures and contracts live in JSDoc,
   content in its registry, GameMaker in the manual.
5. Dead or unwired code gets a clause, not a paragraph.

## Placement

Two top-level pillars (project folders), Core reusable without Game:

- `Core` — the engine, and only the engine: the ECS, the `Level`/`Scene`/`World` triad, the
  level-generation frame (a pass runner that ships no stage), the renderer passes, sprite playback,
  the UI system, input, utilities. Every area references only engine concepts — space, time,
  presentation, entity lifecycle — and never a gameplay rule. Core never references Game (Game
  could be deleted and Core still builds).
- `Game` — the integrated showcase consuming Core: the app shell (`objects/Game/`), the scenes, the
  gameplay model as data in `Game/Component` and behaviour + content registries in `Game/System`,
  the item vocabulary in `Game/Item` over the capability classes in `Game/Item/Component`, content
  tables in `Game/Content`, worldgen stages in `Game/Level`, the Facet UI kit in `Game/UI/Facet`
  (the showcase's design system over the Core UI system, so it wears a name of its own), and the
  media assets in `Game/Media`.

Placement rule for new code:

- References only engine concepts (space/time/presentation/entity lifecycle) → Core. A data
  structure that knows no layer — the id-keyed store (`Table`, `Columns`, `Handle`, `Row`), the
  1-D `Grid`, the def `Registry`, the asset-keyed `AssetMeta` — or the serialization of one
  (`Json`, `File`, `Snapshot`) → `Core/Data`.
- States a gameplay rule — damage, needs, economy, progression — or names specific
  content/scenes/`Colony*` → Game: data to `Game/Component`, behaviour and registries to
  `Game/System`, item definitions to `Game/Item`, an item capability class to
  `Game/Item/Component`, a content data table to `Game/Content` (`content*`, authored as JS —
  content is code, never a shipped JSON datafile), a level-generation stage to `Game/Level` (the
  runner is Core; what it runs is content policy).
- Read it through the consumers, which is what settles the near calls: `Animation` is Core because
  Core draw passes call it and `WorldClock` because `World` drives it, while
  `Combat`/`Faction`/`Interaction` are Game because every consumer is.

## Cross-Cutting Invariants

Rules that apply in every area (the GMRT quirks in [GMRT.md](GMRT.md) additionally always apply,
and are cited from here, never restated):

- ECS shape:
    - Components are string tokens (`globalThis.Position = "Position"`), each script carrying the
      `@typedef` that is the only definition of its data shape (they ARE the type system — the
      checker consumes them).
        - Systems are TICKERS: plain objects `{ update(level) }` — plus a draw-phase `apply`/`draw`
      where the frame's other clock needs one (`CameraSystem.apply`, `ParticleEmitterSystem.draw`)
      — the level in hand is the whole context (its store, its grid, its own entity), a system
      never takes the scene, and its only other member is the accessor of its own derived entry
      (`PuppetSystem.colliders`, `PathfindingSystem.nav`, `CameraSystem.view`). What a caller
      invokes on demand — a verb over a component (`Effects.apply`, `Trade.buy`, `Companions.hire`,
      `Needs.restore`, `Rig.set`, `Flora.harvest`), a pure read (`Shelter.tempAt`), an entity
      factory (`Cameras.create`, `Colliders.box`), input lifecycle (`ColonyKeymap.bind`) — lives in
      an affix-less namespace beside the ticker (NAMING.md), never on it: the two share a
      component, not a module, so a component write never needs a system call to be seen.
    - Each `Level` owns its `Table`, one sparse set per token, whose walks run down the LEAD
      token's carriers in an order that is never by index (contract at `Columns`). A
      component the caller's contract requires is read with `entities.require`, which throws on a
      miss; `entities.get` and its `undefined` guard are for a component whose absence is a state
      (an opt-in `Skeleton`, a lazily seeded `StatusEffects`, a window target that may have gone).
    - Nothing auto-runs systems — the active scene's `update()` dispatches them explicitly. (Store
      handles are canonically `entities`, level handles `level`.)
- The four homes of state (data and logic apart): every mutable fact lives in exactly one of four
  places, each keyed by the consumer that owns its shape, and logic — a system, a namespace, a UI
  module — holds none.
    - ENTITY data is a component in a store. A LEVEL is an entity of its own store (`Level.self`,
      index 0, never removed) and the WORLD one of its own (`World.self` in `World.table`), so
      what is the map's or the world's as a whole is a component of that entity under the owner's
      `KEY` — `Settlement.KEY`, `RoomSystem.KEY`, `ColonyMap.KEY` on a level; `WorldClock.KEY`,
      `Weather.KEY`, `Tracker.KEY` on the world — read through the owner's accessor
      (`Settlement.of(level)`, `WorldClock.state()`), which seeds the record blank on a miss
      (`entities.of(self, KEY, make)`), so a fresh level or world starts every record blank. The
      grid is that entity's `Level.GRID` component (the `grid` accessor), and a pooled map is an
      entity of the world's store (`World.MAP` + a minted `World.LEVEL`). A save holds a Level's
      store and the world's store and nothing else, so a new per-level or per-world fact rides
      along unlisted; what is dense (the grid) crosses as a blob through the store's codec
      channel (`entities.codec` — pack/unpack per token, the sink and source the save's).
    - SCENE data is a field of the live scene instance (or a handle it holds — `hud`, `window`,
      `build`) and dies with it.
    - APP data is the run's own — the device, the session, the settings — held by the app
      singletons the `Game` object drives from its events (`Input`'s keymap, claims and rebinds,
      `InputContext`'s stack, `UI.roots`, `Music`'s handle, `Time`, `Settings`,
      `SaveGame`'s index and the load bundle a scene hands the next) plus the GUI overlays that draw
      over every scene (`GameOverlay`, `Toast`, `Tooltip`, `Dialogue`, `VirtualKeyboard`,
      `SlotDrag`); a scene may push into it but never owns it, so the switch (`Game._apply`,
      Create_0) sweeps every app member a scene can touch in ONE list — a scene's `destroy` drops
      only what that scene itself wired (its UI root, its injected hooks, the colony's `World`), and
      a new app member a scene can dirty gets its line in the sweep, not in a scene.
        - Anything DERIVED from a level's data and kept between frames — a collider bake, a nav
      grid, a room mirror, a broadphase, a pass stack, a camera's view record — is a DERIVED entry:
      a component of the level's own entity that its owner alone reaches through
      `entities.derive(level.self, Owner.KEY, make)`, seeded on a miss (a miss is never an error:
      a level whose derived entries are all freed mid-run ends where its untouched twin does,
      testCore `level.self.rebuild`), MINTED so no export carries it, and freed as it leaves its
      slot through its own `destroy` (a detach, the level's teardown). The token is the owner —
      two modules on one KEY share one entry, as two on one component token would — so an owner
      with both a record and a derived entry keys them apart (`ColonyMap.KEY`/`RUNTIME`,
      `RoomSystem.KEY`/`MIRROR`). An entry is a class of its own that owns the queries over it
      (`Colliders`, `View`, `NavGrid`, `Rooms`); a mirror of another entry refreshes
      off a GENERATION it polls by number (`NavGrid.stamp` off `Colliders.gen`), never a hook the
      scene wires; and a writer of the data an entry derives from calls nothing — the entry's
      fingerprint sees the change (`Colliders` fingerprints each kinematic collider's `solid`).
    - A singleton keeps only what is none of these — content registries, config, injected hooks,
            and per-tick SCRATCH that holds nothing between ticks (a reused rect, a collector buffer) —
      so a map switch is a pointer swap and nothing of one level or one world survives in a
      module; a level-sized scratch or a fairness cursor is the level's and rides its derived entry
      (`NavGrid.scratch`, `NavGrid.cursor`). Asset-derived tables (`Vox`, `Poly`, `Rig._info`) are
      run-lifetime and immutable, not state.
- Level / Scene / World: a `Level` is one map — its store, whose own entity (`self`) carries the
  grid, the map's records and its derived entries — and nothing behavioural (it never updates or
  draws). A `Scene` is the behaviour: it composes the active level, systems, renderer, camera and
  UI, and owns `update()`/`draw()`. `World` is the store one layer up: its records on `self`, and
  each pooled map an entity carrying its id and its Level; a visited map stays pooled with its
  derived entries, so a park is a camera unassign and a resume a pointer swap, and `World.reset`
  blanks the store, the pool with it. There is no scene manager: the `Game` object holds the one
  active scene pointer and drives it from its own events (its Create_0 owns the switch/pause
  contract). Exactly one scene is live and a switch destroys it — a scene is never frozen, so it
  carries no state across a swap.
- Composition over inheritance — GMRT breaks subclassing (#15067, GMRT.md): "kinds of X" are a flat
  class plus a `components: []` queried by `instanceof` (`Item`, `UIElement`); scene screens are
  standalone classes satisfying the duck-typed `Scene` contract, never `extends Scene`.
- Singleton shape: a global with one live instance is a plain object (`globalThis.World = { … }`),
  its properties config, hooks and scratch (its DATA lives in one of the four homes above) and
  self-reference through the global name (`World.get` inside `World`), never `this`, so a method
  handed out as a hook or callback keeps its owner — the form the systems and namespaces already use
  (`World`, `Log`, `Combat`, every `*System`).
    - A static-only class buys nothing here (no instances, no `instanceof`, inheritance broken
      regardless) and takes on two class-only GMRT defects (#15065 and the `static` initializer
      trap, GMRT.md): write no new ones. A class with one live instance that owns a lifecycle is
      NOT a singleton — `LevelGen` is an instance class, shaped and named as such.
    - A family of singletons stays FLAT, grouped by a name prefix and composed by its head at
      boot/reset (`Audio`/`AudioListener`/`Music`, `World`/`WorldClock`/`WorldEvents`,
      `Render*`), and callers reach the leaf directly; a member mirroring a singleton
      (`X.sub = Sub`) is a second name for one object plus a boot-wiring dependency, so a member
      only ever holds data (`World.levels`, the level pool).
- The clock split (pause/dilation rule): `Time.delta` is `Time.raw` scaled by `Time.scale` and
  `Time.tempo`, both the active scene's to set (`Time` owns the contract; what drives the colony's
  tempo is `Radio`'s), so anything on it freezes/slows with the sim — gameplay motion wants exactly
  that, but UI timers/easing must use `Time.raw` (hover/press fades, caret blink, key-repeat, toggle
  easing — `UIButton`/`UIInput`/`UICheckbox`; likewise the GUI singletons
  `Toast`/`SceneTransition`/`Dialogue`), else menus freeze while the game is paused. World-space
  effects deliberately stay on `Time.delta` so slow-mo slows them too (`FloatingText`, `Weather`).
  The entity sim integrates `Time.step` — `delta` capped at `Time.maxStep` — once per frame: a
  system takes one step whatever the refresh rate, a cooldown or fuse is seconds it decrements
  by `step`, and nothing runs more than once a frame, so a slow frame takes a bigger step, never
  more steps. The world clocks (`WorldClock`, `Weather`) consume the whole `delta`, which is what
  lets the bed fast-forward skip hours while bodies still move one bounded step a frame.
- Hot-path idioms: the runtime is a VM, so per-element constants decide the frame, not complexity
  class — a call, an allocation or a hash lookup per element is what costs, and the fix is the
  cheap form, never a better complexity class. The costs are measured, not remembered: `testCore`'s
  `perf.*` cases are the record (one `[BENCH]` line per op through `sceneTest`), a same-run ratio
  only; a per-op claim in a comment is a measure there, and the ratio that would retire an idiom is
  a `TODO` at the idiom's site citing its measure, walked on a runtime upgrade (TODO.md → Planned).
  The idioms:
    - A per-tick system iterates with `entities.forEach(tokens, fn)` and reads its components off
      the callback, never `query` + a `get` per entity (`query` stays for a materialised id list
      that outlives the scan).
    - The RAREST token LEADS the token list, since the lead's carrier list is what a walk visits (a
      marker joins the query, never a `has` filter after it).
    - One match wants `first(...)`, not `query(...)[0]`.
    - Geometry in a pair sweep writes into a caller-owned `AABB.rect()` scratch through
      `edgesInto`/`ofInto` rather than allocating per test.
    - A collector writes through a reused buffer (`buf[w++] = id`, then `length = w`), never a
      fresh array per tick.
    - Anything loop-invariant (a `Map` lookup, a `this.` chain, a class static) is hoisted out of
      the element loop.
        - A level-sized scratch is never reset per use — a generation stamp marks what is live
      (`MotionPlanner.scratch`'s `stamp`).
    - A GML built-in costs the boundary crossing whatever it does, so it is reached for only where
      it replaces more JS than the crossing — bulk work inside one call, never a scalar helper.
    - A hot value in a typed array is mirrored into a plain array (`Handle.packed`) and an
      instance holds scope plus a DERIVED mirror of its entity's Position, BBox and `solid` (`Instance`, kept by `PuppetSystem`; the components stay the truth and nothing reads a position off the instance) — the two layout decisions that carry such a
      `TODO`.
    - A render pass mirroring a grid never sweeps it per frame — it bakes (a `VertexBuffer`, a
      centroid list) and re-sweeps only when the source's `edits` moves (`NavGrid.sync`'s signal
      shape).
- Live queries over stored handles: an entity id is a generational handle (`Handle`), not an
  identity. A consumer re-derives the entity it wants by component-presence query at use
  (`scene.playerId` from `Playable`, the camera target and the audio listener's body from
  `CameraFocus`, NPCs/beacons/enemies by `entities.query`/`Query`); one that must hold an id across
  frames (a built entity in `BuildMode`'s build record, a `Window` page's `target`) validates it
  through `entities.isValid` before every use, and no id ever crosses a map — it names a slot in
  one store. Markers are components, not tag strings.
- AABB convention: every collision/geometry consumer derives world-space edges through
  `AABB.edges(pos, box)` / `AABB.of(entities, id)` — never inline `pos.x + box.x` (the non-uniform
  BBox anchor lives in one place). The overlap test is `AABB.overlap`, except in a per-candidate
  loop, which inlines it — the call is about twice the test (testCore perf.measured
  `aabb.overlap`). The collision itself is the runtime's, over each collider's mirror instance
  (`PuppetSystem`): a query, a cast or a move goes through `Puppet`/`Solid`, never a JS sweep.
- Injection idiom: a module stays model-agnostic by exposing a hook its consumer wires at scene
  setup — Core to Game (`RenderLighting`'s `ambient`, `UIQuestTracker`'s `source`) and, inside
  Game, a system to the scene that owns the stat model (`Combat.mitigate`,
  `Effects.onStatsChanged`, `Consumption.grantAttr`, all wired in `sceneColony.create`).
  Extend through the seam; never make Core reach down into Game.
- The view rule (a UI module holds no rule, as a system holds no state): a `*UI` page, a HUD
  module or a panel-handle module (`Hud`, `Interactable`, `BuildMode`) takes the scene for its
  seams — the level in hand, the player id, the shell it lives in (`window`, `ui`) — and states no
  gameplay rule of its own.
    - Every mutation it makes is ONE call into the owning system (`Bag.transfer`,
      `Trade.buy`, `Crafting.craft`, `Loadout.reconcile`), so a refusal is the system's to
      state and the view's to show, and what the view keeps is the gesture, the rows and the guard
      it composes from queries.
    - A shape two screens share is a Facet factory (`facetColumn`, `facetListDetail`,
      `facetClear`) or the family's shared module (`InvTable`), never re-implemented per screen;
      and what a screen offers is a `content*` table it reads (`contentBuild`), never a literal in
      the module.
    - Its own state is the page or handle it returns (SCENE data, above), and a mutation signals
      through the shell's `dirty`, never by reaching into another page.
- Registry pattern: content is data registered into flat registries keyed by string id
  (`Item`/`Rarity`/`Manufacturer`/`Status`/`Recipe`/`Prefab`/`InteractAction`/`EntityPreset`/
  `StateSystem`) — adding content is a data entry, not an engine edit. Registration runs from
  `create()`-time calls (`content.register()`), never at script top level (top-level code runs in
  resource order — GMRT.md). The id-keyed, insertion-ordered ones are thin facades over the shared
  `Registry` ops, which own that store's contract; the one keyed by asset ref (`AssetMeta`) is its
  own store, since a Map can't hold a ref key (GMRT.md).
- Input distribution: one manager, `Input`, polls every device once at the head of the frame and
  hands it out — no consumer reads a device built-in
  (`mouse_*`/`keyboard_*`/`gamepad_*`/`device_mouse_*`); every read is an `Input` query or an
  `InputAction` over them, and the consumers' frame order is the priority, enforced through claims.
  The contract — the poll-once rule, the claims, pointer ownership, the UI tree's raw-record
  exception — lives at `Input`.
- Serialization-safe data: persisted blobs (Settings/InputPreset, `entities.export`/
  `Row`) may nest — serialize them with GML `json_stringify` or, when the data carries
  sprite refs or can cycle, the `Json` codec, never JS `JSON.stringify` (#15565, GMRT.md). A
  serialized field holds plain arrays/objects only — no `Set`/`Map` (both cross the boundary empty
  — GMRT.md) and no asset ref outside the codec's tagging. Dense/large arrays still go to binary
  blobs, not JSON — a store token with a codec (`entities.codec`) crosses its export as buffers the
  save hands to the Snapshot bundle (`File` moves the bytes). A runtime-rebuilt component (a diff baseline, a
  path, a live handle) is minted — `entities.mint` at the system that rebuilds it — so no export
  or whole-entity snapshot carries it, and a save pass or a transfer names no component. One
  that holds a native handle (`Instance`, `ParticleStream`) mints with its RELEASE hook, which
  the store runs as the datum leaves its slot (a detach, the entity's flush, a level's teardown),
  so no module keeps a roster of ids to reap.
