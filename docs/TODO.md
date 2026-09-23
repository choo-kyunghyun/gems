# TODO

## Issues

- [#15998] Foot rotation for Spine sprites is broken
- [#15999] Mix is ​​not applied to single-key Spine animations like down

## Planned

- Runtime upgrade: re-audit every GMRT.md and SPINE.md entry — a fixed defect leaves its workaround as silent dead weight — and re-run `GEMS_TEST=1 gm-cli run gems.yyp` on the candidate; a `perf.*` ratio that moved names the `TODO` at the site citing it, a `testGame` case that flipped names its retirement in its FAIL line, and a JIT (the absolute ns/op collapsing toward V8) makes every hot-path idiom advisory (docs/ARCHITECTURE.md)
- Separating Pathfinding into a different thread using C#
- Modular turret (the built turret auto-fires a hardcoded hitscan today)
    - Auto turrets fire mounted weapons
    - Mountable turrets
- Explosives — the grenade is in (G / LT lobs a `Fuse` charge through `Combat.lob`; unlimited, no item yet); remaining: a grenade item with a `Throwable` capability gating the throw on the bag, and the mine
- Minify furnitures
- Settlement and outpost — foundation done (`Settlement`: a level is one settlement with Name/Faction — the authored colony hub, or an outpost the player founds at a wild site's Survey Post; build mode gated to allied maps); settlement-management UI remains
- Farming and fishing — the flora foundation is in (`FloraSystem` over `Growth`: biome pools, season-weighted growth and spread, built crops, harvest); remaining: fishing, seeds and soil as inputs, a farm plot tied to the settlement's `farm` component
- Raid event: defend the settlement (`musAmbientEmergency` is the reserved BGM)
- Gacha capsule with new UI
- Gamepad reloading
- World map — a trip costs in-game hours but no survival needs; a site's extraction point is its arrival beacon (a separate extraction site is the extraction-shooter tension knob); site codenames from word pools (WORLD_KO) instead of fixed i18n names
- Killfeed UI
- Click cue on non-button widgets — only `UIButton`/`UINav` activation cues today, so a click on a slider/checkbox/list is silent
- Blueprint UI — stamp a captured or registered plan (`Blueprint.stamp`) for its wood
- Markers in the DEV capture — `entry`/`reach` placed in-game instead of hand-added to the exported literal
- Collision on the runtime's instance collision — `testCore` perf.builtin has the record (`raycast.cast` 331 µs vs `collision_line_list` + slab 3.8 µs, `broadphase.pairs` 2856 vs `instance_place_list` 768 ns/body, `solid.resolve.step` 2806 vs `move_and_collide` 1200 ns/body, the per-body x/y sync 120 ns), the fractional bbox and the array-truthiness death are in GMRT.md, and a touching edge or an area-over-point query counting differently is accepted; `AABB` stays (arithmetic, the hit normal, `Melee`, the debug pass), `Query.inRect`/`inRadius` stay for the non-collider sweeps (`Flora.canRoot`, `RadarArrows`), and every step lands with its `testCore` case and the `stress.pathfind` samples before the next
    - Masks: a Core unit mask sprite plus two invisible Core objects, `Solid` (kinematic) and `Body` (dynamic) — the object IS the query filter — each carrying `eid`; a minted `Mask` component (release hook destroys the instance, a deactivated one activated first) attached by a `MaskSystem` ticker at the sim head that mints the mask every `Collision` carrier lacks off `AABB.of` (`image_xscale` = width/32), writes a Body's x/y from `Position` each tick (a Solid never moves — the static-is-static premise holds), mirrors a `solid` flip (door, corpse, trunk) as deactivate/activate, and parks a level's masks on `ColonyTravel.suspend` / thaws them on `resume` since the built-ins are room-global; the Puppet keeps its (0,0) draw scope (`RenderBillboard`'s matrix) and is never the mask; spikes first, each a case or a test-gmrt probe: deactivation excluding an instance from every `collision_*` and `instance_destroy` on a deactivated one, `inst.eid = id` from JS against `variable_instance_set`, `move_and_collide`'s iterations argument, and the cost of minting a map's ~2000 statics at build and on `TileEdit.remesh` (the tile-edit storm scenario)
    - Raycast: `cast`/`castAll` become one `collision_line_list` over `[Solid, Body]` from a parked probe instance, each hit's bbox through `Raycast._segmentAABB` for the point, normal and `t` (`ProjectileSystem` lands on `nx`/`ny`), `ignore` and the nearest on `eid`/`t`; the hit shape, the sign-comparator sort and `collision.raycast` stay, the DDA `walk`, `_seen` and the body scan go
    - SolidSystem: a solid body moves by `inst.move_and_collide(vel·dt, Solid, iterations = ceil(step / maxStep))` and reads `Position` back off the instance — sliding along a wall replaces the axis zeroing (the return is a GML array: `array_length` only, GMRT.md); the bake shrinks to what NavGrid polls (the kinematic fingerprint, `statics` rects, `gen`) and its buckets, `walk` and body arrays retire; `solid.bake.door` keeps the flip → gen → restamp chain
    - SeparationSystem: per solid body one `instance_place_list(Body)`, the MTV half-push off each hit's bbox written to `Position` and the instance (each side pushes itself, the pair's total unchanged); `Broadphase` retires with it
    - Query: `Combat.explode`'s radius (`has: Health`) and `Door._blocked`'s frame move to `collision_circle_list`/`collision_rectangle_list` over `Body` with the component filter on `eid`; `TestSolid` retires once perf.builtin rows `Solid`/`Body`
- More `testStress` scenarios over the same shape as `stress.pathfind`: a raycast storm (hitscan volleys over the static buckets), a spawn/despawn churn (the free list, the flush cost), a tile-edit storm (remesh + `NavGrid.sync` + a collider-generation restamp per frame)
- A `DEV_MODE` section timer around `sceneColony.update`'s phases, logging the colony frame profile (sim, renderer, GUI) as a `[BENCH]` line in place of the hand probe
- ECS: `Columns.get`/`has`/`require`/`add`/`detach` reach the index through `Handle.index` — inline `id & INDEX_MASK` (perf.measured: `id.index` 48 vs `id.index.inline` 13 ns/op, on every random access)
- ECS: a walk's callback pays a `Map.get` plus the static call per `has`/`get` (`store.get` 226 vs `store.get.cached` 23 ns/op) — a column handle (`entities.column(token)`) or a NOT token in `forEach` for the exclusion filter the standard view has; the sites are `FollowerSystem` (`Downed`), `ColonyCombat` (`Mesh`), `WorldOverlay` (`Fuse`), `ParticleEmitterSystem` (`ParticleEmitter`)
- ECS: every `Table` accessor is a second dispatch into `Columns` (one method call per access, `closure.call1` 17 ns/op)
- ECS: no lead-order guard — a `DEV_MODE` warn in `forEach` when a trailing token's `dense.length` is below the lead's (perf.layout: `forEach.trail` 96 vs `forEach.sparse` 6 ns/op)
- ECS: `Table.flush` mid-walk is unguarded — throw when any set's `walking > 0`, since a recycled index is visited by the same walk
- ECS: `forEach`/`query`/`first` allocate `new Array(n)` per call — a reused scratch (`array.push` 86 ns/op, per walk not per entity)
- ECS: presence is encoded twice (`column[i]` undefined and `sparse[i]` -1) and data sits by index, not by dense position — the standard packs data beside `dense`; kept for the one-read `get` (`dense.loop` 36 vs `column.loop` 22 ns/op), at `capacity × 2` slots per token
- ECS: 12-bit generation over a LIFO free list — a slot reused 4096 times revalidates a stale handle; every held id passes `isValid`, so no fix yet

## Assets

- More hair sprites for `spineHuman`
