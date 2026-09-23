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
- Collision on the runtime's instance collision — `testCore` perf.builtin has the record (`raycast.cast` 331 µs vs `collision_line_list` + slab 3.8 µs, `broadphase.pairs` 2856 vs `instance_place_list` 768 ns/body, `solid.resolve.step` 2806 vs `move_and_collide` 1200 ns/body, the per-body x/y sync 120 ns), GMRT.md has what the runtime keeps (a fractional bbox, no runtime-shaped mask, deactivation), and a touching edge, an area-over-point query and a body sliding along a wall are accepted; `AABB` stays (arithmetic, the hit normal, `Melee`, the debug pass), `Query.inRect`/`inRadius` stay for the non-collider sweeps (`Flora.canRoot`, `RadarArrows`), and every step lands with its `testCore` case and the `stress.pathfind` samples before the next
    - The puppet as the entity's mirror: ONE `Puppet` per entity that collides or is rigged, minted and kept by a `PuppetSystem` ticker at the sim head (the `Puppets` namespace stays the lifetime owner; `SkeletonSystem` stops minting) — `x`/`y` from `Position` every tick for a mover and once for a kinematic, `mask_index` a Core 32 px centre-origin unit mask sprite (`pixMaskUnit`) with `image_xscale`/`image_yscale` = BBox / 32 (a body's box is centred, so the mask's flip under a negative scale is harmless), `sprite_index` the rig's (Rig keeps it), `eid` written from JS, and a `solid` flip mirrored as `mask_index = pixMaskNone` (a transparent precise sprite, so a corpse still draws); a kinematic collider mints `Solid`, a CHILD object of `Puppet`, so `Puppet` names every mirror and `Solid` the statics alone; the rig's draw scale moves off `image_xscale` (now the mask's) into `RenderBillboard`'s world matrix, T(-p)·S·R·T(p) with `draw_self` at the instance's own x/y; a level's mirrors deactivate on `ColonyTravel.suspend` and activate on `resume` since the built-ins are room-global, and the release hook activates before it destroys; spikes first: a Spine rig under a scaled world matrix drawing as before (a `testGame` screenshot pair), `pixMaskNone` answering no query, and minting a map's ~2000 statics at build and on `TileEdit.remesh` (the tile-edit storm scenario)
    - Raycast: `cast`/`castAll` become one `collision_line_list` over `Puppet` from a parked probe, each hit's bbox through `Raycast._segmentAABB` for the point, normal and `t` (`ProjectileSystem` lands on `nx`/`ny`), `ignore` and the nearest on `eid`/`t`; the hit shape, the sign-comparator sort and `collision.raycast` stay, the DDA `walk`, `_seen` and the body scan go
    - SolidSystem: a solid body moves by `inst.move_and_collide(vel·dt, Solid, iterations = ceil(step / maxStep))` and reads `Position` back off the instance — sliding along a wall replaces the axis zeroing (the return is a GML array: `array_length` only, GMRT.md); the bake shrinks to what NavGrid polls (the kinematic fingerprint, `statics` rects, `gen`) and its buckets, `walk` and body arrays retire; `solid.bake.door` keeps the flip → gen → restamp chain
    - SeparationSystem: per solid body one `instance_place_list(Puppet)` less the `Solid` hits, the MTV half-push off each hit's bbox written to `Position` and the instance (each side pushes itself, the pair's total unchanged); `Broadphase` retires with it
    - Query: `Combat.explode`'s radius (`has: Health`) and `Door._blocked`'s frame move to `collision_circle_list`/`collision_rectangle_list` over `Puppet` with the component filter on `eid`; `TestSolid` retires once perf.builtin rows `Solid`/`Puppet`
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
