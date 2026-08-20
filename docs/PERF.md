# Performance

## Overview

GMRT runs JS on a VM, not a JIT: one operation costs 40–110x what V8 spends on it (Node as the
reference oracle, same source both sides). None of that is a bug — [GMRT.md](GMRT.md) owns what
BREAKS, this file owns what COSTS.

The consequence shapes the code: designs a JIT forgives — an allocation per call, a hash lookup per
access, a helper call per element — are what decide the frame here, and the fix is almost never a
better complexity class. At the entity counts this project runs (a generated colony map is ~500
entities), the CONSTANT is the problem, so the rules below are about the work done per element, not
about the number of elements.

Reading the numbers: every figure below was measured on **GMRT 0.21.0** (gm-cli 2.2.0, windows-vm
target) and is a same-run ratio or a per-op cost net of an empty-loop baseline. Absolute frame times
drift ~30% with machine state, so a before/after claim is only meaningful when both halves ran in
the same window — never compare a timing to one recorded in an earlier session. Re-measure every
table on a runtime upgrade, then work the Runtime-Contingent Costs list at the end: some figures
here are the runtime's youth rather than physics, and the designs resting on them expire with it.

## Measured Costs

Per operation, net of the enclosing loop (n=4000):

| operation | cost | the cheap form |
| --- | --- | --- |
| closure call, 1 arg / 3 args | 24 / 76 ns | cheap — a data-passing callback beats re-reading |
| `EntityID.index(id)` | 59 ns | `id & EntityID.INDEX_MASK` inline: 22 ns |
| `EntityStore.get(id, token)` | 255 ns | cached column + index: 38 ns |
| `AABB.edges` (allocating) | 586 ns | `AABB.edgesInto` a reused rect: 166 ns |
| `Map.get(string)` | 167 ns | resolve once per tick, not per entity |
| `Array.push` | 152 ns | write through a reused buffer + `length =` |

A static method call and an object literal are each worth roughly a hundred plain reads: those two
facts explain most of what the table says. What a single READ costs is Member Access, below.

## Native vs JS

A GML built-in called from JS costs ~35–57 ns whatever it does — that is the boundary, not the work.
It pays for itself only when it replaces MORE than ~40 ns of JS. Net of baseline (n=200,000):

| operation | native | inline JS |
| --- | --- | --- |
| `clamp` | 36 ns | 30 ns |
| `lerp` | 41 ns | 32 ns |
| `array_length` / `.length` | 37 ns | 15 ns |
| `floor` | 57 ns | 64 ns |
| `sin` | 52 ns | 65 ns |
| `abs` | 41 ns | 62 ns |
| `point_distance` | 38 ns | 71 ns |
| AABB overlap, `rectangle_in_rectangle` vs 4 compares with early-out | 147 ns | 78 ns |

The JS standard library is itself slow here — `Math.abs`/`Math.sin` LOSE to their GML twins — while a
property read or a comparison chain beats any call. `rectangle_in_rectangle` loses twice over: the
boundary, plus a contract that classifies 0/1/2 where the caller wants a boolean early-out. That is
why the collision path stays inline (`AABB`), and it is not a gap waiting to be closed.

A native that loops INSIDE one call wins outright, because the boundary amortises. Per element, raw
(these are whole-call costs, so no baseline to net):

| bulk operation | native | JS |
| --- | --- | --- |
| array fill — `array_create` vs a write loop | 5.5 ns | 66 ns |
| sort, same sign comparator — `array_sort` vs `Array.sort` | 457 ns | 1390 ns |
| string repeat | 73 ns | 188 ns |

So the split the code already runs is the right one: natives for bulk work (`draw_*`, `vertex_*`,
`shader_*`, `surface_*`, `buffer_*`, `flexpanel_*`), JS for per-element scalars. Two unclaimed wins,
neither on a hot path today: `array_sort` (3x over `Array.sort`, no call site large enough to matter)
and `point_distance` (1.8x over the `Math.sqrt` distance in `CombatAI`).

## Member Access

One read per iteration at a loop-VARIANT index, net of the index-mask floor. Measure this way or not
at all: a loop-invariant read is hoisted out and reports sub-nanosecond nonsense.

| access | cost |
| --- | --- |
| plain `Array` element | 7 ns |
| GM instance property, user-defined | 12 ns |
| JS object property | 13 ns |
| `variable_struct_get` / `variable_instance_get` | 61 / 65 ns |
| TYPED array element | 153 ns |

A USER-DEFINED GM instance property and a JS object property cost the SAME — GMRT resolves both to a
slot — so "a GM object carries more built-ins, therefore it reads slower" is false. Dynamic access by
name costs ~5x either, and is the price of any token-driven or reflective path.

The typed array is the outlier and the rule it forces: at ~21x a plain element it is the most
expensive read in the codebase, so a hot value stored in one gets MIRRORED into a plain array
(`EntityID.packed` over the `generations` table). A mature runtime inverts this — see
Runtime-Contingent Costs.

A BUILT-IN instance variable is NOT a slot: `x`/`y` and the `image_*` family go through accessors, so
they cost several times a user-defined one. Two fields per entity at a loop-variant index, 500
entities, net of the empty loop — the shape a per-tick system runs:

| two-field access per entity | read+write | read only |
| --- | --- | --- |
| JS object off a `ComponentStore` column | 45 ns | 35 ns |
| user-defined instance variable | 45 ns | — |
| built-in `x` / `y` | 215 ns | 100 ns |
| built-in `bbox_left` / `bbox_top` | — | 105 ns |
| built-in `image_angle` / `image_index` | 163 ns | — |

Same loop, same array read, same presence test in every row, so the difference IS the access: a
built-in read costs ~33 ns more than a JS property read, a read+write ~85 ns more. The rule that
follows: a component moved onto built-ins gets 3-4.5x SLOWER, and `Position` — ~100% selectivity,
read by movement, collision, the renderer and every spatial query — is the worst place to try it.
An instance is worth holding for what its scope unlocks (Data Layout), never as a home for data.

## Idioms

- Per-tick ECS iteration is `entities.forEach(tokens, fn)`, not `query` + `get` — no result
  array, and the callback is handed the component data the scan already resolved (~9x; contract at
  `ComponentStore.forEach`). `query` remains for the callers that need a materialised, stable id
  list — one that outlives the scan, or that a mid-iteration structural change would invalidate.
- A marker JOINS the query, never filters after it — `[NPC, Position]`, not `query(Position)`
  then `has(id, NPC)` per entity. The `has` costs a hash lookup on every candidate, and the rare
  column gates the scan when it leads the token list. This is the whole of `Query`'s 9.8x and
  `FactionSystem.nearestHostile`'s.
- One match wants `first(...)`, not `query(...)[0]` — no array, and the scan stops at the hit.
- A query emits ids from `EntityID.packed`, a plain-array mirror of the generation table, rather
  than recomposing `make(index, generation)` per match.
- Geometry in a pair sweep writes into a caller-owned rect (`AABB.edgesInto` / `AABB.ofInto`
  over `AABB.rect()`), held as scratch on the system. The allocation, not the arithmetic, is the
  cost. A rect is the caller's — never hand one to anything that outlives the call.
- Collect into a reused buffer: `buf[w++] = id` then `buf.length = w`, over a fresh array per
  tick.
- Hoist anything constant out of the element loop — a `Map` lookup, a `this.` chain, a class
  static.
- A GML built-in costs the boundary (~40 ns) whatever it does: reach for one only when it replaces
  more JS than that — bulk work inside a single call, never a scalar helper.

## Where The Frame Goes

The colony scene (~500 entities, generated 128x128 map) after the idioms above, measured with the
zone passes off and the fps cap lifted: ~4.2 ms/frame — sim ~1.3, renderer ~1.8, GUI ~0.2, the rest
present/driver. Against a 16.7 ms frame that is roughly 4x headroom.

The two zone render passes are excluded from that figure and are the largest single cost in the
scene when on (~6.2 ms/frame): both sweep the WHOLE zone grid (16,384 cells) every frame to find
~50 painted ones, because `ZoneMap` keeps no record of what is painted. Left alone pending the zone
refactor.

`SimClock` converts frame time into whole ticks, so a frame over budget runs MORE ticks and gets
slower still. Crossing 16.7 ms is therefore a cliff, not a slope: measure `ticks/frame` alongside
any timing, because a per-tick cost that looks flat can be a per-frame cost that is compounding.

The scene's query traffic, counted in `ComponentStore` over 40 frames: 46 scans, 21,686 slot-visits,
2,046 matches — **9.4% overall selectivity** over 474 entities and 43 columns. Only 4 columns sit at
>=50% (`Position`, `BBox`, `Collision`, `Name`); 39 are below and 21 of those at <=1.7%. Every
per-tick design decision below turns on that number.

## Data Layout: Columns vs Instances

Whether a component lives in a `ComponentStore` column or on one GM instance per entity — the
"hybrid ECS" shape, where systems walk `Entity` instances instead of columns. Per slot-visit, net of
baseline, 500 entities:

| iteration | 100% selectivity | 4/500 selectivity |
| --- | --- | --- |
| `forEach` over columns | 85 ns | 0.4 ns |
| raw column loop, no closure | 40 ns | — |
| cached instance handles + property | 45 ns | 50 ns |
| `instance_find` + property — the `with(Entity)` equivalent | 467 ns | 452 ns |

An instance loop costs the same whether the entity matches or not; a column scan is linear in
selectivity. They cross at ~58%: below it columns win, and the margin grows without bound as the
query gets rarer. At the scene's measured 9.4% the same traffic costs 0.18 ms/frame through columns,
1.08 through cached handles, and 9.83 through `instance_find` — against a ~4.2 ms budget.

Instances DO win where the store is weak, and none of it is on a hot path today: spawn 1542 vs 2262
ns/entity, despawn 128 vs 2234 ns/entity, and 2000 live empty instances cost 17 us/frame (9 ns each)
— GM's built-in variable load is NOT a reason to avoid them. The instance-scoped half of the API
(`place_meeting`, `skeleton_*`, `draw_self`) does NOT require walking instances either: a built-in
called through a stored handle — `inst.draw_self()`, `inst.skeleton_animation_set(…)` — runs in that
instance's scope, so one handle column buys the whole surface for an id-keyed store (Skeletal
Animation is the case that pays for it). What a handle does NOT buy is cheaper data: a built-in
instance variable costs 3-4.5x a column access (Member Access).

## Skeletal Animation (Spine)

Per character per frame, on a 7-bone / 6-slot / 8-channel skeleton with no meshes or IK. `draw_skeleton`
is the unit because it is the only path an id-keyed store could reach before handles; it costs ~2.8 us
raw per call, flat from n=50 to n=1000. The JS rows are a straight port of what Spine's runtime does —
keyframe search, curve easing, bone composition, then one `draw_sprite_ext` per attachment:

| path | vs `draw_skeleton` | posed? |
| --- | --- | --- |
| `inst.draw_self()` through a stored handle | 0.25x | yes, from the instance's skeleton state |
| + `inst.skeleton_animation_set_frame` (the clock the runtime won't run — GMRT.md) | 0.35x | yes |
| six `draw_sprite_ext` quads, no animation at all | 0.5x | no — the JS floor for a 6-part character |
| baked LUT (frame → 6x pos/angle) + those six quads | 0.85x | frame-quantised |
| `draw_skeleton(spr, anim, skin, frame, …)` | 1x | yes |
| `draw_sprite_ext` on the skeletal sprite | ~1x | NO — setup pose (GMRT.md) |
| JS poser: linear keys + hierarchy + six quads | 3.9x | yes |
| JS poser: bezier curves + hierarchy + six quads | 6.1x | yes |

Two results decide the design. Rolling the animation math in JS loses 4-6x to the native runtime —
interpolation is exactly the per-op work the VM taxes (Overview), and of the bezier poser's 6.1x, 4.1x
is curve evaluation alone. Worse, the JS floor is not the poser but the DRAWS: issuing six
`draw_sprite_ext` calls costs twice what `draw_self` spends posing AND drawing the whole skeleton, so
no JS implementation can win, however well written. Second, `draw_self` beats `draw_skeleton` ~3x and
is reachable through a handle column (Data Layout) — the instance carries no data, only the skeleton
state, and `RenderBillboard` already places entities by `matrix_world`, which `draw_self` honours along
with `image_xscale`/`_blend`/`_alpha`/`_angle`. Cheaper than every row above is baking the animation to
sprite frames at build time: one ordinary `draw_sprite_ext`, ~0.1x, at the cost of runtime bone control.

## Known Remaining Costs

Unfixed, in the order their size was measured:

- A query still scans the whole index space (`ids.next`), so a sparse component pays for every live
  entity. Measured ceiling if every non-matching slot-visit were free: ~1.5 ms/frame. The fix is a
  per-column dense id list, but only for the SPARSE tokens (the census is under Where The Frame
  Goes) — at ~100% selectivity a dense list is the same length plus an indirection and loses.
  Dense-list upkeep also costs ~75% more per component add/detach, so it must be opt-in, not
  blanket.
- `SolidSystem` scans `Collision, Position, BBox` twice per tick (the static-cache fingerprint, then
  the body loop with `Velocity`) and `SeparationSystem` scans it again; one shared pass would serve
  them.
- `ids.next` is a high-water mark that never shrinks, so a spawn spike permanently raises every
  query's cost for that map's lifetime. Latent today: the colony sits at `next == alive`, and
  nothing spawns in bulk.
- 14 `RenderTileMap` passes cost ~60 us each in submission overhead alone — a consequence of one
  pass per terrain material, not of anything per-entity.

## Runtime-Contingent Costs

Part of what this file measures is GMRT's youth rather than physics, and the designs resting on
those figures expire when it lifts. The trap is that a workaround does not BREAK when its defect is
fixed — it silently becomes dead weight, and nothing surfaces it but this list. So on a runtime
upgrade: re-measure every table above, then walk this one.

| when this changes | revisit |
| --- | --- |
| a TYPED array element read reaches plain-array cost (153 vs 7 ns today) | the `EntityID.packed` mirror stops paying for itself |
| a BUILT-IN instance variable reaches user-defined cost (3-4.5x today) | the rule that an instance holds no data, only scope (Member Access) |
| `Math.*` reaches its GML twins (`Math.abs` loses by 1.5x today) | drop the native detours; `Array.sort` over `array_sort` |
| the boundary falls below ~10 ns | re-test natives at scalar sites, and `tilemap_*` against `RenderTileMap`'s vertex buffers |
| GMRT gains a JIT (40–110x vs V8 today) | the Idioms list becomes advisory — re-rank it by clarity, since the constant would no longer decide the frame |

Two results are NOT on this list and will not move: the instance-scoped built-ins are an API
contract, not a gap, and the selectivity argument for columns is a property of the data layout.
[GMRT.md](GMRT.md) owns the defect list itself; this table owns only what a fix would let us undo.
