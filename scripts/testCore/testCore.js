// Core test cases, handed to sceneTest's runner. A case:
//   { id, frames?, setup(ctx), frame?(ctx, i, t), draw?(ctx, t), verify(ctx, t), teardown?(ctx) }
// setup fills ctx (a Level, a store, the ids); verify asserts through t.ok/eq/near — every miss
// is one `[CHECK] FAIL <id>` line — and times through t.measure, one `[BENCH]` line per measure;
// teardown frees what setup made. `frames` (default 1) spans a case over real
// frames for what only a frame boundary can catch. A case touches nothing but its own ctx: a
// singleton it needs (SolidSystem's cache) is reset by the runner between cases. Every case here
// references Core only — it must keep running with Game deleted.
//
// A `perf.*` case is one family of per-op costs — THE record of what an operation costs on the
// pinned runtime, and the rule each family decides sits on its case. Its rows share the case's
// setup, every loop reads at the loop-variant index i, and `base` is the same loop minus the op —
// a loop-invariant read is hoisted and reports sub-nanosecond nonsense. A loop returns its sink so
// the work is observable. A figure is a same-run ratio: absolute times drift ~30% with machine
// state, so a before/after is two Reruns in one session, never a figure from an earlier one. The
// runtime is a VM at ~40-110x V8's per-op cost, which is why per-element constants, not complexity
// class, decide the frame (docs/ARCHITECTURE.md → Hot-path idioms); on a runtime upgrade re-run
// the family and walk docs/GMRT.md → On a Runtime Upgrade. A per-op claim in a comment is a
// measure here.

const N = 4000; // the Measured Costs / Member Access loop length
const N_NATIVE = 20000; // the Native vs JS loop length — a ~40 ns boundary wants the resolution
const ENTITIES = 500; // the Data Layout store (the colony's size)

/** A 32 px-cell level with one empty-cost-1 tile layer, its own store. */
function _testLevel(cols, rows) {
  const grid = new LevelGrid({ cellWidth: 32, cellHeight: 32, cols, rows });
  const layer = new TileLayer(cols, rows, { emptyCost: 1 });
  grid.insert(layer);
  const level = new Level({ id: "test", grid, capacity: 64 });
  return { level, grid, layer, entities: level.entities };
}

/** Tile types built at setup, never at load: TileType sorts after testCore (docs/GMRT.md → load order). */
function _testTypes(ctx) {
  ctx.rock = new TileType({ id: "test_rock", pathCost: null }); // blocking
  ctx.mud = new TileType({ id: "test_mud", pathCost: 3 }); // weighted
}

/** A store of `count` entities carrying Position, plus an n-long cycling id list and its data. */
function _testStore(ctx, count, n) {
  const s = new EntityStore(count);
  ctx.entities = s;
  const ids = [];
  for (let i = 0; i < count; i++) {
    const id = s.create();
    s.add(id, Position, { x: i, y: 0, z: 0 });
    ids.push(id);
  }
  ctx.ids = new Array(n);
  ctx.objs = new Array(n);
  for (let i = 0; i < n; i++) {
    const id = ids[i % count];
    ctx.ids[i] = id;
    ctx.objs[i] = s.get(id, Position);
  }
  // the column and dense list a walk hoists once per tick — read off the store's private set
  const set = s.components._byToken.get(Position);
  ctx.col = set.column;
  ctx.dense = set.dense;
}

/** n floats in [-2, 2), no shared stream (docs/GMRT.md → Math.random). */
function _testVals(n) {
  const vals = new Array(n);
  for (let i = 0; i < n; i++) vals[i] = ((i * 7919) % 400) / 100 - 2;
  return vals;
}

/** The empty loop of n — the baseline of a row that reads nothing but its index. */
function _testEmpty(n) {
  return () => {
    let s = 0;
    for (let i = 0; i < n; i++) s += i;
    return s;
  };
}

/** The loop of n reading `arr[i]` — the baseline of a row that reads one element and applies an op to it. */
function _testRead(n, arr) {
  return () => {
    let s = 0;
    for (let i = 0; i < n; i++) s += arr[i];
    return s;
  };
}

globalThis.testCore = {
  CASES: [
    // ── Checks ─────────────────────────────────────────────────────────────────
    {
      id: "entity.generation",
      setup(ctx) {
        ctx.entities = new EntityStore(8);
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const a = s.create();
        s.add(a, Position, { x: 1, y: 2, z: 0 });
        s.remove(a);
        s.flush();
        t.ok(!s.isValid(a), "a freed id reads invalid");
        t.eq(s.count(), 0, "count after flush");
        const b = s.create();
        t.eq(
          EntityID.index(b),
          EntityID.index(a),
          "the freed index is recycled",
        );
        t.ok(b !== a, "the recycled id carries a new generation");
        t.eq(
          EntityID.generation(b),
          EntityID.generation(a) + 1,
          "generation bumps by one",
        );
        t.ok(s.isValid(b), "the new owner is valid");
        t.ok(!s.isValid(a), "the stale id stays invalid after recycling");
        t.eq(
          s.get(b, Position),
          undefined,
          "a recycled slot carries no old component",
        );
        const live = s.query();
        t.eq(live.length, 1, "token-less query lists every live id");
        t.eq(live[0], b, "the live id is the new owner");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "entity.flush",
      setup(ctx) {
        ctx.entities = new EntityStore(8);
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const id = s.create();
        s.add(id, Position, { x: 0, y: 0, z: 0 });
        s.remove(id);
        t.ok(s.isValid(id), "a queued removal is still valid before flush");
        t.eq(s.count(), 1, "a queued removal still counts");
        t.eq(s.query(Position).length, 1, "a queued removal still matches");
        s.flush();
        t.ok(!s.isValid(id), "flushed id is invalid");
        t.eq(s.query(Position).length, 0, "flushed id no longer matches");
        t.eq(s.has(id, Position), false, "flushed slot is cleared");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "entity.forEach",
      setup(ctx) {
        const s = new EntityStore(8);
        ctx.entities = s;
        ctx.a = s.create();
        s.add(ctx.a, Position, { x: 1, y: 0, z: 0 });
        s.add(ctx.a, Velocity, { x: 10, y: 0, z: 0 });
        ctx.b = s.create();
        s.add(ctx.b, Position, { x: 2, y: 0, z: 0 });
        ctx.c = s.create();
        s.add(ctx.c, Position, { x: 3, y: 0, z: 0 });
        s.add(ctx.c, Velocity, { x: 30, y: 0, z: 0 });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        let visits = 0;
        let sumVel = 0;
        let sumPos = 0;
        s.forEach([Velocity, Position], (id, vel, pos) => {
          visits += 1;
          sumVel += vel.x;
          sumPos += pos.x;
        });
        t.eq(visits, 2, "forEach visits the join");
        t.eq(sumVel, 40, "data arrives in token order (Velocity first)");
        t.eq(sumPos, 4, "data arrives in token order (Position second)");
        t.eq(s.first(Velocity), ctx.a, "first() is the earliest carrier");
        t.eq(
          s.first("TestNoSuch"),
          -1,
          "first() on an unregistered token is -1",
        );
        t.eq(s.query(Position).length, 3, "query counts every carrier");
        t.eq(
          s.query("TestNoSuch").length,
          0,
          "query on an unregistered token is empty",
        );
        s.detach(ctx.a, Velocity);
        t.eq(s.first(Velocity), ctx.c, "detach drops the entity from the join");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "entity.walk",
      setup(ctx) {
        const s = new EntityStore(16);
        ctx.entities = s;
        ctx.ids = [];
        for (let k = 0; k < 6; k++) {
          const id = s.create();
          s.add(id, "TestWalk", { k });
          ctx.ids.push(id);
        }
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const ids = ctx.ids;
        const set = s.components._byToken.get("TestWalk");
        // self-detach of the lead: every carrier visited once, the list compacted at the end
        let visits = 0;
        let seen = 0;
        s.forEach(["TestWalk"], (id, w) => {
          visits += 1;
          seen |= 1 << w.k;
          s.detach(id, "TestWalk");
          t.eq(s.has(id, "TestWalk"), false, "a detach reads absent inside the walk");
          t.eq(set.dense.length, 6, "the swap-remove waits for the walk to end");
        });
        t.eq(visits, 6, "self-detach visits every carrier once");
        t.eq(seen, 63, "self-detach visits each carrier");
        t.eq(set.dense.length, 0, "the walk's end compacts the list");
        t.eq(s.query("TestWalk").length, 0, "nothing is left carrying it");
        for (let k = 0; k < 6; k++) s.add(ids[k], "TestWalk", { k });
        // another carrier detached mid-walk is skipped, a re-add keeps its carrier, and a
        // mid-walk add waits for the next walk
        visits = 0;
        seen = 0;
        s.forEach(["TestWalk"], (id, w) => {
          visits += 1;
          seen |= 1 << w.k;
          if (w.k === 0) {
            s.detach(ids[5], "TestWalk"); // the last carrier, still ahead of the walk
            s.detach(ids[2], "TestWalk");
            s.detach(id, "TestWalk");
            s.add(id, "TestWalk", w);
            s.add(s.create(), "TestWalk", { k: 6 });
          }
        });
        t.eq(visits, 4, "a carrier detached ahead of the walk is skipped");
        t.eq(seen, 1 | 2 | 8 | 16, "the skipped carriers are the detached ones");
        t.eq(s.has(ids[0], "TestWalk"), true, "a re-add during the walk keeps its carrier");
        t.eq(s.query("TestWalk").length, 5, "the survivors plus the mid-walk add remain");
        visits = 0;
        s.forEach(["TestWalk"], () => {
          visits += 1;
        });
        t.eq(visits, 5, "a carrier added mid-walk is visited from the next walk");
        t.eq(set.dense.length, 5, "the dense list matches the query");
        // nested walks on one lead: the inner detach compacts when the OUTER walk ends
        visits = 0;
        s.forEach(["TestWalk"], (id) => {
          s.forEach(["TestWalk"], (oid) => {
            if (oid === id) s.detach(oid, "TestWalk");
          });
          visits += 1;
          t.eq(set.dense.length, 5, "an inner detach compacts at the outer walk's end");
        });
        t.eq(visits, 5, "the outer walk visits every carrier");
        t.eq(set.dense.length, 0, "the outer walk's end compacts");
        t.eq(set.walking, 0, "the walk depth returns to zero");
        // order: a removal swap-fills its hole from the tail, and the rest keep their places
        for (let k = 0; k < 3; k++) s.add(ids[k], "TestOrder", { k });
        s.detach(ids[0], "TestOrder");
        const q = s.query("TestOrder");
        t.eq(q[0], ids[2], "the last carrier takes the hole");
        t.eq(q[1], ids[1], "the rest keep their positions");
        t.eq(s.first("TestOrder"), ids[2], "first() reads the dense order");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "entity.snapshot",
      setup(ctx) {
        const s = new EntityStore(8);
        ctx.src = s;
        ctx.dst = new EntityStore(8);
        const gone = s.create();
        ctx.a = s.create();
        s.add(ctx.a, Position, { x: 5, y: 6, z: 7 });
        s.add(ctx.a, Velocity, { x: 1, y: 0, z: 0 });
        s.remove(gone);
        s.flush();
        ctx.gone = gone;
      },
      verify(ctx, t) {
        const snap = ctx.src.export();
        ctx.dst.import(snap);
        const d = ctx.dst;
        t.eq(d.count(), 1, "count survives the round trip");
        t.ok(d.isValid(ctx.a), "a live id survives with its generation");
        t.ok(!d.isValid(ctx.gone), "a freed id stays invalid");
        const pos = d.get(ctx.a, Position);
        t.ok(pos !== undefined, "component data restored");
        if (pos !== undefined) t.eq(pos.z, 7, "component fields restored");
        t.eq(d.query(Velocity).length, 1, "every column restored");
        let visits = 0;
        d.forEach([Position], () => {
          visits += 1;
        });
        t.eq(visits, 1, "a walk after import runs the rebuilt list");
        const again = d.create();
        t.eq(
          EntityID.index(again),
          EntityID.index(ctx.gone),
          "the free list survives",
        );
      },
      teardown(ctx) {
        ctx.src.destroy();
        ctx.dst.destroy();
      },
    },
    {
      id: "system.movement",
      setup(ctx) {
        const s = new EntityStore(8);
        ctx.entities = s;
        ctx.id = s.create();
        s.add(ctx.id, Position, { x: 0, y: 0, z: 0 });
        s.add(ctx.id, Velocity, { x: 60, y: -30, z: 6 });
      },
      verify(ctx, t) {
        for (let k = 0; k < 10; k++) MovementSystem.update(ctx.entities);
        const pos = ctx.entities.get(ctx.id, Position);
        const d = SimClock.tickDuration * 10;
        t.near(pos.x, 60 * d, 1e-6, "x integrates velocity per tick");
        t.near(pos.y, -30 * d, 1e-6, "y integrates velocity per tick");
        t.near(pos.z, 6 * d, 1e-6, "z integrates velocity per tick");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "system.lifetime",
      setup(ctx) {
        const s = new EntityStore(8);
        ctx.entities = s;
        ctx.id = s.create();
        s.add(ctx.id, Lifetime, { ticks: 3 });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        LifetimeSystem.update(s);
        s.flush();
        LifetimeSystem.update(s);
        s.flush();
        t.ok(s.isValid(ctx.id), "alive before the last tick");
        LifetimeSystem.update(s);
        t.ok(s.isValid(ctx.id), "expiry is deferred to flush");
        s.flush();
        t.ok(!s.isValid(ctx.id), "expired at flush");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "system.solid",
      setup(ctx) {
        const s = new EntityStore(8);
        ctx.entities = s;
        ctx.wall = SolidSystem.box(s, 100, 0, 32, 64);
        ctx.body = s.create();
        s.add(ctx.body, Position, { x: 50, y: 16, z: 0 });
        s.add(ctx.body, BBox, { x: 0, y: 0, width: 16, height: 16 });
        s.add(ctx.body, Collision, { solid: true });
        s.add(ctx.body, Velocity, { x: 600, y: 0, z: 0 }); // 10 px per tick
      },
      verify(ctx, t) {
        const s = ctx.entities;
        for (let k = 0; k < 20; k++) SolidSystem.update(s);
        const pos = s.get(ctx.body, Position);
        const vel = s.get(ctx.body, Velocity);
        t.ok(pos.x + 16 <= 100 + 1e-6, "body never enters the wall");
        t.ok(pos.x >= 80, "body reaches the wall");
        t.eq(vel.x, 0, "blocked axis zeroes velocity");
        const wallPos = s.get(ctx.wall, Position);
        t.eq(wallPos.x, 100, "kinematic solid never moves");
        t.eq(
          SolidSystem.statics(s).length,
          1,
          "static snapshot holds the wall",
        );
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "collision.aabb",
      setup(ctx) {
        const s = new EntityStore(8);
        ctx.entities = s;
        ctx.id = s.create();
        s.add(ctx.id, Position, { x: 10, y: 20, z: 0 });
        s.add(ctx.id, BBox, { x: -4, y: -8, width: 8, height: 16 });
      },
      verify(ctx, t) {
        const e = AABB.of(ctx.entities, ctx.id);
        t.eq(e.x1, 6, "x1 = pos + anchor");
        t.eq(e.y2, 28, "y2 = y1 + height");
        t.eq(e.cx, 10, "centre x");
        const into = AABB.ofInto(ctx.entities, ctx.id, AABB.rect());
        t.ok(
          into.x1 === e.x1 &&
            into.y1 === e.y1 &&
            into.x2 === e.x2 &&
            into.y2 === e.y2,
          "ofInto matches of",
        );
        const b = { x1: 14, y1: 0, x2: 30, y2: 30 };
        t.eq(AABB.overlap(e, b), false, "touching edges do not overlap");
        b.x1 = 13.9;
        t.eq(AABB.overlap(e, b), true, "crossing edges overlap");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "collision.query",
      setup(ctx) {
        const s = new EntityStore(8);
        ctx.entities = s;
        ctx.near = s.create();
        s.add(ctx.near, Position, { x: 10, y: 0, z: 0 });
        ctx.far = s.create();
        s.add(ctx.far, Position, { x: 100, y: 0, z: 0 });
        s.add(ctx.far, "TestMarker", { on: true });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        t.eq(Query.nearest(s, 0, 0), ctx.near, "nearest by distance");
        t.eq(
          Query.nearest(s, 0, 0, { has: "TestMarker" }),
          ctx.far,
          "has: joins the marker",
        );
        t.eq(
          Query.nearest(s, 0, 0, { maxDist: 5 }),
          -1,
          "maxDist caps the search",
        );
        t.eq(Query.farthest(s, 0, 0), ctx.far, "farthest by distance");
        t.eq(
          Query.inRadius(s, 0, 0, 50).length,
          1,
          "inRadius counts inside only",
        );
        t.eq(Query.inRect(s, 0, -1, 200, 1).length, 2, "inRect counts both");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "collision.raycast",
      setup(ctx) {
        const s = new EntityStore(8);
        ctx.entities = s;
        ctx.wall = SolidSystem.box(s, 100, 0, 32, 64);
        SolidSystem.update(s); // takes the static snapshot the cast walks
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const hit = Raycast.cast(s, 0, 16, 200, 16);
        t.ok(hit !== null, "a segment through the wall hits");
        if (hit !== null) {
          t.eq(hit.id, ctx.wall, "hit id is the wall");
          t.near(hit.x, 100, 1e-6, "hit lands on the near face");
          t.near(hit.t, 0.5, 1e-6, "t is the segment parameter");
          t.eq(hit.nx, -1, "normal points back along the ray");
        }
        t.eq(
          Raycast.cast(s, 0, 16, 90, 16),
          null,
          "a segment short of the wall misses",
        );
        t.eq(
          Raycast.cast(s, 0, 80, 200, 80),
          null,
          "a segment beside the wall misses",
        );
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "level.grid",
      setup(ctx) {
        ctx.grid = new LevelGrid({
          cellWidth: 32,
          cellHeight: 32,
          cols: 8,
          rows: 4,
        });
      },
      verify(ctx, t) {
        const g = ctx.grid;
        const w = g.gridToWorld(3, 2);
        t.eq(w.x, 112, "gridToWorld is the cell centre");
        const back = g.worldToGrid(w.x, w.y);
        t.ok(back.x === 3 && back.y === 2, "worldToGrid inverts gridToWorld");
        const edge = g.worldToGrid(31.9, 32);
        t.ok(
          edge.x === 0 && edge.y === 1,
          "a cell edge belongs to the next cell",
        );
        t.eq(g.costAt(0, 0), Infinity, "no layer → blocked");
      },
      teardown(ctx) {
        ctx.grid.destroy();
      },
    },
    {
      id: "level.navSync",
      setup(ctx) {
        Object.assign(ctx, _testLevel(8, 8));
        _testTypes(ctx);
        ctx.nav = new NavGrid(ctx.grid);
      },
      verify(ctx, t) {
        const nav = ctx.nav;
        t.eq(nav.sync(), true, "first sync resamples");
        t.eq(nav.grid.get(2, 2), 1, "empty cell costs the layer's emptyCost");
        t.eq(nav.sync(), false, "unchanged layers → no resample");
        ctx.layer.set(2, 2, ctx.rock);
        t.eq(nav.sync(), true, "a tile write resamples");
        t.eq(
          nav.grid.get(2, 2),
          Infinity,
          "a blocking tile mirrors as Infinity",
        );
        ctx.layer.set(2, 2, ctx.mud);
        nav.sync();
        t.eq(nav.grid.get(2, 2), 3, "a weighted tile mirrors its cost");
        nav.stamp([{ x1: 96, y1: 96, x2: 128, y2: 128 }]);
        t.eq(nav.grid.get(3, 3), Infinity, "a static stamps its cell");
        t.eq(nav.grid.get(4, 4), 1, "x2/y2 are exclusive");
        t.eq(nav.grid.get(2, 2), 3, "the base survives a stamp");
        ctx.layer.set(0, 0, ctx.rock);
        nav.sync();
        t.eq(nav.grid.get(3, 3), Infinity, "a resample re-applies the stamp");
      },
      teardown(ctx) {
        ctx.nav.destroy();
        ctx.level.destroy();
      },
    },
    {
      id: "level.remesh",
      setup(ctx) {
        Object.assign(ctx, _testLevel(4, 4));
        _testTypes(ctx);
        ctx.colliders = [];
      },
      verify(ctx, t) {
        const layer = ctx.layer;
        TileEdit.set(layer, 0, 0, ctx.rock);
        TileEdit.set(layer, 1, 0, ctx.rock);
        TileEdit.set(layer, 0, 1, ctx.rock);
        TileEdit.set(layer, 1, 1, ctx.rock);
        TileEdit.set(layer, 3, 3, ctx.rock);
        t.eq(TileEdit.occupied(layer, 1, 1), true, "occupied reads a set cell");
        t.eq(
          TileEdit.occupied(layer, 2, 2),
          false,
          "occupied reads an empty cell",
        );
        const rects = TileEdit.meshRects(ctx.grid, layer);
        t.eq(rects.length, 2, "greedy mesh joins the 2×2 block");
        const s = ctx.entities;
        TileEdit.remesh(s, ctx.grid, layer, ctx.colliders);
        t.eq(ctx.colliders.length, 2, "one collider per rect");
        t.eq(s.count(), 2, "the store holds the colliders");
        const col = s.get(ctx.colliders[0], Collision);
        t.ok(
          col !== undefined && col.kinematic === true,
          "a collider is a kinematic solid",
        );
        TileEdit.clear(layer, 3, 3);
        TileEdit.remesh(s, ctx.grid, layer, ctx.colliders);
        t.eq(ctx.colliders.length, 1, "remesh replaces the set");
        t.eq(s.count(), 1, "old colliders are flushed");
        const box = s.get(ctx.colliders[0], BBox);
        t.ok(
          box.width === 64 && box.height === 64,
          "the block's collider spans 2×2 cells",
        );
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      id: "id.pack",
      setup() {},
      verify(ctx, t) {
        const id = EntityID.make(5, 7);
        t.eq(EntityID.index(id), 5, "index unpacks");
        t.eq(EntityID.generation(id), 7, "generation unpacks");
        const top = EntityID.make(
          EntityID.INDEX_MASK,
          EntityID.GENERATION_MASK,
        );
        t.eq(EntityID.index(top), EntityID.INDEX_MASK, "index at its mask");
        t.eq(
          EntityID.generation(top),
          EntityID.GENERATION_MASK,
          "generation at its mask",
        );
      },
    },
    {
      id: "frame.count",
      frames: 3,
      setup(ctx) {
        ctx.seen = 0;
        ctx.frame0 = Time.frame;
      },
      frame(ctx) {
        ctx.seen += 1;
      },
      verify(ctx, t) {
        t.eq(ctx.seen, 3, "a case spans its frames");
        t.eq(Time.frame - ctx.frame0, 2, "one real frame per step");
      },
    },
    // ── perf.measured: the costs that decide the frame ─────────────────────────
    // A static-method call and an object literal each cost about a hundred plain reads, a hash
    // lookup a dozen: the rule for every hot loop is the cheap form in the paired row — the
    // inline mask over EntityID.index, a cached column over store.get, edgesInto over edges, a
    // reused buffer over push, and never a per-element reset of a level-sized scratch (the
    // generation stamp, MotionPlanner._stamp).
    {
      id: "perf.measured",
      setup(ctx) {
        const n = N;
        ctx.vals = _testVals(n);
        ctx.packed = new Array(n);
        for (let i = 0; i < n; i++) ctx.packed[i] = EntityID.make(i & 63, 3);
        _testStore(ctx, 64, n);
        ctx.pos = new Array(n);
        for (let i = 0; i < n; i++) ctx.pos[i] = { x: i, y: i, z: 0 };
        ctx.box = new Array(n);
        for (let i = 0; i < n; i++)
          ctx.box[i] = { x: -8, y: -8, width: 16, height: 16 };
        const map = new Map();
        const names = [];
        for (let k = 0; k < 43; k++) {
          // the colony's column count
          const name = "Component" + k;
          map.set(name, k);
          names.push(name);
        }
        ctx.map = map;
        ctx.keys = new Array(n);
        ctx.keyVals = new Array(n);
        for (let i = 0; i < n; i++) {
          ctx.keys[i] = names[i % names.length];
          ctx.keyVals[i] = i % names.length;
        }
        ctx.buf = [];
        ctx.fillArr = new Array(n).fill(0);
      },
      verify(ctx, t) {
        const n = N;
        const vals = ctx.vals;
        const readVals = _testRead(n, vals);
        const empty = _testEmpty(n);

        const f1 = (a) => a;
        t.measure("closure.call1", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += f1(vals[i]);
          return s;
        });
        const f3 = (a, b, c) => a + b + c;
        t.measure(
          "closure.call3",
          n,
          () => {
            let s = 0;
            for (let i = 0; i < n; i++) s += vals[i] + 1 + 2;
            return s;
          },
          () => {
            let s = 0;
            for (let i = 0; i < n; i++) s += f3(vals[i], 1, 2);
            return s;
          },
        );

        const packed = ctx.packed;
        const readPacked = _testRead(n, packed);
        t.measure("id.index", n, readPacked, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += EntityID.index(packed[i]);
          return s;
        });
        const mask = EntityID.INDEX_MASK;
        t.measure("id.index.inline", n, readPacked, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += packed[i] & mask;
          return s;
        });

        const store = ctx.entities;
        const ids = ctx.ids;
        const objs = ctx.objs;
        const col = ctx.col;
        const readObjs = () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const p = objs[i];
            s += p.x;
          }
          return s;
        };
        t.measure("store.get", n, readObjs, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const p = store.get(ids[i], Position);
            s += p.x;
          }
          return s;
        });
        t.measure("store.get.cached", n, readObjs, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const p = col[ids[i] & mask];
            s += p.x;
          }
          return s;
        });

        const pos = ctx.pos;
        const box = ctx.box;
        const readPosBox = () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += pos[i].x + box[i].x;
          return s;
        };
        t.measure("aabb.edges", n, readPosBox, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += AABB.edges(pos[i], box[i]).x1;
          return s;
        });
        const rect = AABB.rect();
        t.measure("aabb.edgesInto", n, readPosBox, () => {
          let s = 0;
          for (let i = 0; i < n; i++)
            s += AABB.edgesInto(pos[i], box[i], rect).x1;
          return s;
        });

        const map = ctx.map;
        const keys = ctx.keys;
        t.measure("map.get", n, _testRead(n, ctx.keyVals), () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += map.get(keys[i]);
          return s;
        });

        t.measure("array.push", n, empty, () => {
          const out = [];
          for (let i = 0; i < n; i++) out.push(i);
          return out.length;
        });
        const buf = ctx.buf;
        t.measure("array.reuse", n, empty, () => {
          let w = 0;
          for (let i = 0; i < n; i++) buf[w++] = i;
          buf.length = w;
          return w;
        });
        const fillArr = ctx.fillArr;
        t.measure(
          "array.fill",
          n,
          () => 0,
          () => {
            fillArr.fill(1);
            return fillArr[n - 1];
          },
        );
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    // ── perf.native: a GML built-in against its inline JS twin ──────────────────
    // The JS↔GML boundary costs ~35-57 ns whatever the call does, so a native pays only when it
    // replaces more JS than that: bulk work inside ONE call (draw_*, vertex_*, buffer_*, an
    // array_create fill, array_sort) wins outright, a scalar helper loses to a property read or
    // a comparison chain — and the JS standard library is itself slow here, so `Math.abs`/
    // `Math.sin` LOSE to their GML twins. That split is the one the code runs.
    {
      id: "perf.native",
      setup(ctx) {
        const n = N_NATIVE;
        ctx.vals = _testVals(n);
        // one loop per array: interleaving the allocations scatters each array's elements
        // through the others' and the read rows pay it back as cache misses (~3x)
        ctx.arrs = new Array(n);
        for (let i = 0; i < n; i++) ctx.arrs[i] = [i, i, i];
        ctx.a = new Array(n);
        for (let i = 0; i < n; i++) ctx.a[i] = { x1: 0, y1: 0, x2: 16, y2: 16 };
        ctx.b = new Array(n);
        for (let i = 0; i < n; i++)
          ctx.b[i] = { x1: (i % 3) * 8, y1: 0, x2: (i % 3) * 8 + 16, y2: 16 };
      },
      verify(ctx, t) {
        const n = N_NATIVE;
        const vals = ctx.vals;
        const readVals = _testRead(n, vals);
        const empty = _testEmpty(n);

        t.measure("native.clamp", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += clamp(vals[i], 0, 1);
          return s;
        });
        t.measure("js.clamp", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const v = vals[i];
            s += v < 0 ? 0 : v > 1 ? 1 : v;
          }
          return s;
        });
        t.measure("native.floor", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += floor(vals[i]);
          return s;
        });
        t.measure("js.floor", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += Math.floor(vals[i]);
          return s;
        });
        t.measure("native.sin", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += sin(vals[i]);
          return s;
        });
        t.measure("js.sin", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += Math.sin(vals[i]);
          return s;
        });
        t.measure("native.abs", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += abs(vals[i]);
          return s;
        });
        t.measure("js.abs", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += Math.abs(vals[i]);
          return s;
        });
        t.measure("native.pointDistance", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const v = vals[i];
            s += point_distance(0, 0, v, v);
          }
          return s;
        });
        t.measure("js.distance", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const v = vals[i];
            s += Math.sqrt(v * v + v * v);
          }
          return s;
        });

        const arrs = ctx.arrs;
        t.measure("native.arrayLength", n, empty, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += array_length(arrs[i]);
          return s;
        });
        t.measure("js.length", n, empty, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += arrs[i].length;
          return s;
        });

        const as = ctx.a;
        const bs = ctx.b;
        const readRects = () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const a = as[i];
            const b = bs[i];
            s += a.x1 + b.x1;
          }
          return s;
        };
        t.measure("native.rectOverlap", n, readRects, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const a = as[i];
            const b = bs[i];
            s +=
              rectangle_in_rectangle(
                a.x1,
                a.y1,
                a.x2,
                a.y2,
                b.x1,
                b.y1,
                b.x2,
                b.y2,
              ) !== 0
                ? 1
                : 0;
          }
          return s;
        });
        t.measure("js.rectOverlap", n, readRects, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const a = as[i];
            const b = bs[i];
            s +=
              a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1 ? 1 : 0;
          }
          return s;
        });
      },
    },
    // ── perf.access: one read at a loop-variant index ──────────────────────────
    // A JS property and a user-defined GM instance property cost the same (both a slot);
    // access by name (variable_struct_get) ~5x that, the price of any token-driven path; a TYPED
    // array element ~20x a plain one — the outlier, so a hot value stored in one is MIRRORED into
    // a plain array (EntityID.packed). A BUILT-IN instance variable (x/y, image_*) goes through
    // accessors at 3-4.5x a column read, which is why an instance holds scope, never data.
    {
      id: "perf.access",
      setup(ctx) {
        const n = N;
        ctx.vals = _testVals(n);
        ctx.objs = new Array(n);
        for (let i = 0; i < n; i++) ctx.objs[i] = { v: i };
        ctx.typed = new Float64Array(n);
        for (let i = 0; i < n; i++) ctx.typed[i] = i;
      },
      verify(ctx, t) {
        const n = N;
        const vals = ctx.vals;
        const readVals = _testRead(n, vals);
        const empty = _testEmpty(n);
        const objs = ctx.objs;
        const typed = ctx.typed;

        t.measure("read.array", n, empty, readVals);
        t.measure("read.object", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += objs[i].v;
          return s;
        });
        t.measure("read.structGet", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += variable_struct_get(objs[i], "v");
          return s;
        });
        t.measure("read.typed", n, empty, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += typed[i];
          return s;
        });
      },
    },
    // ── perf.layout: a walk costs per lead carrier, never per index ────────────
    // A walk runs down the lead token's dense list (ComponentStore), so its cost is the lead's
    // carrier count: at 100% (`forEach.full`) it is the column scan plus an indirection, below
    // that it is the slots never visited — `forEach.sparse` against `forEach.trail` is the same
    // four matches led by the rare token and by Position, the lead-order rule measured (both gross
    // per store entity — the loop they would net out IS the walk). forEach
    // hands the walk's data to the callback where query + get pays a hash lookup per entity;
    // `store.churn` is the upkeep a detach + add pair costs over two column writes.
    {
      id: "perf.layout",
      setup(ctx) {
        _testStore(ctx, ENTITIES, ENTITIES);
        const s = ctx.entities;
        for (let k = 0; k < 4; k++)
          s.add(ctx.ids[k * 100], "TestRare", { on: true });
        for (let i = 0; i < ENTITIES; i++)
          s.add(ctx.ids[i], "TestChurn", ctx.objs[i]);
        ctx.scratch = new Array(ENTITIES).fill(undefined);
      },
      verify(ctx, t) {
        const n = ENTITIES;
        const empty = _testEmpty(n);
        const store = ctx.entities;
        const col = ctx.col;
        const dense = ctx.dense;

        t.measure("forEach.full", n, empty, () => {
          let s = 0;
          store.forEach([Position], (id, p) => {
            s += p.x;
          });
          return s;
        });
        t.measure("forEach.sparse", n, () => 0, () => {
          let s = 0;
          store.forEach(["TestRare", Position], (id, r, p) => {
            s += p.x;
          });
          return s;
        });
        t.measure("forEach.trail", n, () => 0, () => {
          let s = 0;
          store.forEach([Position, "TestRare"], (id, p) => {
            s += p.x;
          });
          return s;
        });
        t.measure("query.get", n, empty, () => {
          const ids = store.query(Position);
          let s = 0;
          for (let k = 0; k < ids.length; k++)
            s += store.get(ids[k], Position).x;
          return s;
        });
        t.measure("column.loop", n, empty, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const d = col[i];
            if (d !== undefined) s += d.x;
          }
          return s;
        });
        t.measure("dense.loop", n, empty, () => {
          let s = 0;
          for (let k = 0; k < n; k++) {
            const d = col[dense[k]];
            if (d !== undefined) s += d.x;
          }
          return s;
        });

        const ids = ctx.ids;
        const objs = ctx.objs;
        const scratch = ctx.scratch;
        const mask = EntityID.INDEX_MASK;
        t.measure(
          "store.churn",
          n,
          () => {
            for (let i = 0; i < n; i++) {
              const k = ids[i] & mask;
              scratch[k] = undefined;
              scratch[k] = objs[i];
            }
            return scratch[0];
          },
          () => {
            for (let i = 0; i < n; i++) {
              store.detach(ids[i], "TestChurn");
              store.add(ids[i], "TestChurn", objs[i]);
            }
            return store.get(ids[0], "TestChurn");
          },
        );
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
  ],
};
