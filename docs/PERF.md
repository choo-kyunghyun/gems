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

Reading the numbers: every figure is a same-run ratio or a per-op cost net of an empty-loop
baseline, measured on the pinned runtime. Absolute frame times drift ~30% with machine state, so a
before/after claim is only meaningful when both halves ran in the same window — never compare a
timing to one recorded in an earlier session. Re-measure the table on a runtime upgrade.

## Measured Costs

Per operation, net of the enclosing loop (n=4000, GMRT 0.21):

| operation | cost | the cheap form |
| --- | --- | --- |
| plain `Array` element read | 8 ns | — |
| TYPED array element read | 175 ns | mirror hot values in a plain array |
| closure call, 1 arg / 3 args | 24 / 76 ns | cheap — a data-passing callback beats re-reading |
| `EntityID.index(id)` | 59 ns | `id & EntityID.INDEX_MASK` inline: 22 ns |
| `EntityStore.get(id, token)` | 255 ns | cached column + index: 38 ns |
| `AABB.edges` (allocating) | 586 ns | `AABB.edgesInto` a reused rect: 166 ns |
| `Map.get(string)` | 167 ns | resolve once per tick, not per entity |
| `Array.push` | 152 ns | write through a reused buffer + `length =` |

A static method call and an object literal are each worth roughly a hundred plain reads: those two
facts explain most of what the table says.

## Idioms

- **Per-tick ECS iteration is `entities.forEach(tokens, fn)`, not `query` + `get`** — no result
  array, and the callback is handed the component data the scan already resolved (~9x; contract at
  `ComponentStore.forEach`). `query` remains for the callers that need a materialised, stable id
  list — one that outlives the scan, or that a mid-iteration structural change would invalidate.
- **A marker JOINS the query, never filters after it** — `[NPC, Position]`, not `query(Position)`
  then `has(id, NPC)` per entity. The `has` costs a hash lookup on every candidate, and the rare
  column gates the scan when it leads the token list. This is the whole of `Query`'s 9.8x and
  `FactionSystem.nearestHostile`'s.
- **One match wants `first(...)`, not `query(...)[0]`** — no array, and the scan stops at the hit.
- **A query emits ids from `EntityID.packed`**, a plain-array mirror of the generation table, rather
  than recomposing `make(index, generation)` per match.
- **Geometry in a pair sweep writes into a caller-owned rect** (`AABB.edgesInto` / `AABB.ofInto`
  over `AABB.rect()`), held as scratch on the system. The allocation, not the arithmetic, is the
  cost. A rect is the caller's — never hand one to anything that outlives the call.
- **Collect into a reused buffer**: `buf[w++] = id` then `buf.length = w`, over a fresh array per
  tick.
- **Hoist anything constant out of the element loop** — a `Map` lookup, a `this.` chain, a class
  static.

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

## Known Remaining Costs

Unfixed, in the order their size was measured:

- A query still scans the whole index space (`ids.next`), so a sparse component pays for every live
  entity. Measured ceiling if every non-matching slot-visit were free: ~1.5 ms/frame. The fix is a
  per-column dense id list, but only for SPARSE tokens — `Position`/`BBox`/`Collision` sit at ~100%
  selectivity, where a dense list is the same length plus an indirection and loses. Dense-list
  upkeep also costs ~75% more per component add/detach, so it must be opt-in, not blanket.
- `SolidSystem`, `SeparationSystem` and `TriggerSystem` each scan `Collision, Position, BBox`
  separately every tick; one shared pass would serve all three.
- `ids.next` is a high-water mark that never shrinks, so a spawn spike permanently raises every
  query's cost for that map's lifetime. Latent today: the colony sits at `next == alive`, and
  nothing spawns in bulk.
- 14 `RenderTileMap` passes cost ~60 us each in submission overhead alone — a consequence of one
  pass per terrain material, not of anything per-entity.
