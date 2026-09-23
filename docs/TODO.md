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
- Collision on the runtime's instance collision — the mirror is in (`PuppetSystem`: one `Puppet` per collider, a kinematic a `Solid`, x/y off Position, the mask `pixMaskUnit` under the image scale, `solid` as `pixMaskNone`, `eid`, `park`/`thaw` on travel; the rig's draw scale rides `RenderBillboard`'s matrix; `stress.pathfind.puppet` samples its tick) `Raycast` rides `collision_line_list` from `Puppets.probe` (a cast 5.7 µs where the body scan cost 331), `SolidSystem` moves a body by `move_and_collide` against `Solid` one axis at a time (the perpendicular try capped off, the realized displacement written back as Velocity), and `SeparationSystem` sums each body's half-pushes off one `instance_place_list` and moves it the same way (`Broadphase`, the bake's buckets and the push-out retired; the stress separation pass 2434 → 577 µs), `testCore` perf.builtin has the record, GMRT.md has what the runtime keeps (a fractional bbox, no runtime-shaped mask, deactivation, the inert per-instance activate), and a touching edge, an area-over-point query and a body sliding along a wall are accepted; `AABB` stays (arithmetic, the hit normal, `Melee`, the debug pass), `Query.inRect`/`inRadius` stay for the non-collider sweeps (`Flora.canRoot`, `RadarArrows`), and every step lands with its `testCore` case and the `stress.pathfind` samples before the next
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
