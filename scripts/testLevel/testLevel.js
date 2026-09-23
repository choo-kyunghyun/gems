// Core/Level, World and Nav cases: a Level's own entity and its rebuild, the grid, the blob
// codec, the World pool, a ticker over the level (LifetimeSystem), the nav grid's sync and
// restamp, the remesh, and perf.plan, what one A* expansion costs. Every case here references
// Core only; the case contract and the perf.* rule are Test's.

const PLAN_COLS = 128; // the overworld's side, the size perf.plan's figure is about

Test.register(Test.CHECK, [
  {
    id: "level.self",
    // the level's own entity: a record is a component `of` seeds and a save carries, a derived
    // entry one `derive` mints and the store frees through its own destroy
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      ctx.freed = 0;
      ctx.makes = 0;
    },
    verify(ctx, t) {
      const level = ctx.level;
      const s = level.entities;
      const self = level.self;
      t.ok(s.isValid(self), "the level's own entity is live from construction");
      t.eq(Handle.index(self), 0, "it is index 0");
      const make = () => {
        ctx.makes++;
        return {
          destroy() {
            ctx.freed++;
          },
        };
      };
      const a = s.derive(self, "test_a", make);
      t.ok(s.derive(self, "test_a", make) === a, "derive returns the seeded entry");
      t.eq(ctx.makes, 1, "make runs once");
      t.ok(s.get(self, "test_a") === a, "get reads the entry");
      t.eq(s.get(self, "test_b"), undefined, "get reads undefined on a miss");
      t.ok(
        s.derive(self, "test_b", () => ({ plain: true })).plain,
        "an entry without destroy is fine",
      );
      const rec = s.of(self, "test_rec", () => ({ n: 1 }));
      t.ok(s.of(self, "test_rec", () => ({ n: 2 })) === rec, "of seeds once");
      const exp = s.export();
      t.eq(exp.components.test_a, undefined, "a derived entry is minted — no export carries it");
      t.eq(exp.components.test_b, undefined, "a plain derived entry neither");
      t.eq(exp.components.test_rec.length, 1, "a record rides the export");
      const twin = new Level({ id: "twin", capacity: 8 });
      twin.entities.import(exp);
      t.ok(twin.entities.isValid(twin.self), "self survives a store import");
      t.eq(twin.entities.get(twin.self, "test_rec").n, 1, "a record round-trips onto self");
      twin.destroy();
      s.detach(self, "test_a");
      t.eq(ctx.freed, 1, "detach called the entry's destroy");
      t.eq(s.get(self, "test_a"), undefined, "the slot is empty after the detach");
      t.ok(s.derive(self, "test_a", make) !== a, "derive reseeds after a detach");
      level.destroy();
      t.eq(ctx.freed, 2, "the level's destroy frees every derived entry");
      const g = new LevelGrid({ cellWidth: 32, cellHeight: 32, cols: 2, rows: 2 });
      const lg = new Level({ id: "g", grid: g, capacity: 4 });
      t.ok(lg.entities.get(lg.self, Level.GRID) === g, "the grid is the GRID component of self");
      t.ok(lg.grid === g, "grid reads that component");
      lg.grid = null;
      t.eq(lg.grid, null, "a grid-less level reads null");
      lg.grid = g;
      lg.destroy();
      t.eq(g.layers.length, 0, "the level's destroy frees its grid");
    },
  },
  {
    id: "level.grid.blob",
    // the grid's own pack/unpack: a blob names its shape, so a fresh grid unpacks it
    setup(ctx) {
      Object.assign(ctx, Test.level(3, 2));
      // numeric ids — what a blob's u16 cell holds (contentTiles); Test.types' are strings
      ctx.rock = new TileType({ id: 7, pathCost: null });
      ctx.mud = new TileType({ id: 9, pathCost: 3 });
    },
    verify(ctx, t) {
      const layer = ctx.layer;
      layer.set(1, 0, ctx.rock);
      layer.set(2, 1, ctx.mud);
      const buf = ctx.grid.pack();
      const shape = LevelGrid.shape(buf);
      t.eq(shape.cols, 3, "the header carries cols");
      t.eq(shape.rows, 2, "the header carries rows");
      t.eq(shape.cellWidth, 32, "the header carries the cell width");
      t.eq(shape.layers, 1, "the header carries the layer count");
      const grid = new LevelGrid({ cellWidth: shape.cellWidth, cellHeight: shape.cellHeight, cols: shape.cols, rows: shape.rows });
      const twin = new TileLayer(shape.cols, shape.rows, { emptyCost: 1 });
      grid.insert(twin);
      const types = [];
      types[ctx.rock.id] = ctx.rock;
      types[ctx.mud.id] = ctx.mud;
      t.ok(grid.unpack(buf, (_l, id) => types[id]), "the blob unpacks into the fresh grid");
      t.ok(twin.get(1, 0) === ctx.rock, "a cell comes back as its type");
      t.ok(twin.get(2, 1) === ctx.mud, "another cell too");
      t.ok(!twin.get(0, 0), "an empty cell stays empty");
      buffer_delete(buf);
      grid.destroy();
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    id: "world.pool",
    // the world's store: a pooled map is an entity carrying its id and its Level (minted, freed
    // with it), and the roster survives an import without the Levels
    setup(ctx) {
      World.reset();
    },
    verify(ctx, t) {
      const lv = new Level({ id: "test_a", capacity: 4 });
      World.add("test_a", lv);
      t.ok(World.get("test_a") === lv, "get resolves the pooled level");
      t.eq(World.get("test_b"), null, "a map not pooled reads null");
      t.eq(World.ids().join(","), "test_a", "ids lists the resident maps");
      World.activeId = "test_a";
      t.ok(World.active() === lv, "active resolves through the pool");
      const exp = World.table.export();
      t.eq(exp.components.level, undefined, "the Level is minted — no export carries it");
      t.eq(exp.components.map.length, 1, "the map entity rides the export");
      World.table.import(exp);
      t.ok(World.table.isValid(World.self), "self survives the import");
      t.eq(lv.entities.count(), 0, "the import released the pooled Level");
      t.eq(World.get("test_a"), null, "an imported map entity has no Level yet");
      t.eq(World.ids().length, 0, "ids lists none");
      const lv2 = new Level({ id: "test_a", capacity: 4 });
      World.add("test_a", lv2);
      t.ok(World.get("test_a") === lv2, "add hands the map entity its Level back");
      t.eq(World.table.count(), 2, "add re-used the imported map entity");
      World.reset();
      t.eq(lv2.entities.count(), 0, "reset destroyed the pooled level");
      t.eq(World.ids().length, 0, "the pool is empty after reset");
      t.eq(World.activeId, null, "no map is active after reset");
    },
  },
  {
    id: "level.self.rebuild",
    // the derived rule itself: every derived entry is rebuilt from the level's data, so a level
    // whose derived entries are all freed mid-run ends where its untouched twin does
    setup(ctx) {
      const mk = () => {
        const c = Test.level(8, 8);
        const s = c.entities;
        Colliders.box(s, 96, 0, 32, 224); // a wall down column 3, rows 0..6
        c.a = s.create();
        s.add(c.a, Position, { x: 40, y: 100, z: 0 });
        s.add(c.a, BBox, { x: -8, y: -8, width: 16, height: 16 });
        s.add(c.a, Collision, { solid: true });
        s.add(c.a, Velocity, { x: 600, y: 0, z: 0 });
        c.b = s.create();
        s.add(c.b, Position, { x: 48, y: 104, z: 0 });
        s.add(c.b, BBox, { x: -8, y: -8, width: 16, height: 16 });
        s.add(c.b, Collision, { solid: true });
        s.add(c.b, Velocity, { x: 0, y: 0, z: 0 });
        c.w = s.create();
        s.add(c.w, Position, { x: 16, y: 16, z: 0 });
        Cameras.create(s, { x: 100, y: 100 });
        return c;
      };
      ctx.p = mk();
      ctx.q = mk();
    },
    verify(ctx, t) {
      const step = (c) => {
        const s = c.entities;
        s.mint(c.w, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 });
        PathfindingSystem.update(c.level);
        // the twins share the room: only the stepping level's mirrors may answer (ColonyTravel's park)
        PuppetSystem.thaw(c.level);
        PuppetSystem.park(c === ctx.p ? ctx.q.level : ctx.p.level);
        PuppetSystem.update(c.level);
        SolidSystem.update(c.level);
        SeparationSystem.update(c.level);
        CameraSystem.apply(c.level);
      };
      for (let k = 0; k < 10; k++) {
        step(ctx.p);
        step(ctx.q);
        if (k === 4) {
          // solid, nav, separation and camera go
          const q = ctx.q;
          const keys = [PuppetSystem.KEY, PathfindingSystem.KEY, CameraSystem.KEY];
          for (let i = 0; i < keys.length; i++) q.entities.detach(q.level.self, keys[i]);
        }
      }
      const p = ctx.p;
      const q = ctx.q;
      const pa = p.entities.get(p.a, Position);
      const qa = q.entities.get(q.a, Position);
      const pb = p.entities.get(p.b, Position);
      const qb = q.entities.get(q.b, Position);
      t.near(qa.x, pa.x, 1e-6, "the mover lands where the twin's does");
      t.near(qa.y, pa.y, 1e-6, "the mover's y matches the twin's");
      t.near(qb.x, pb.x, 1e-6, "the pushed body lands where the twin's does");
      t.near(qb.y, pb.y, 1e-6, "the pushed body's y matches the twin's");
      t.eq(
        q.entities.get(q.w, PathResponse).path.length,
        p.entities.get(p.w, PathResponse).path.length,
        "the path re-plans to the twin's length",
      );
      t.eq(
        PuppetSystem.colliders(q.level).statics.length,
        PuppetSystem.colliders(p.level).statics.length,
        "the collider snapshot rebuilds whole",
      );
      t.eq(
        CameraSystem.view(q.level).width,
        CameraSystem.view(p.level).width,
        "the view record rebuilds to the twin's extent",
      );
    },
    teardown(ctx) {
      ctx.p.level.destroy();
      ctx.q.level.destroy();
    },
  },
  {
    id: "system.lifetime",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.id = s.create();
      s.add(ctx.id, Lifetime, { secs: Time.step * 2.5 });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      LifetimeSystem.update(ctx.level);
      s.flush();
      LifetimeSystem.update(ctx.level);
      s.flush();
      t.ok(s.isValid(ctx.id), "alive before the last step");
      LifetimeSystem.update(ctx.level);
      t.ok(s.isValid(ctx.id), "expiry is deferred to flush");
      s.flush();
      t.ok(!s.isValid(ctx.id), "expired at flush");
    },
    teardown(ctx) {
      ctx.level.destroy();
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
      Object.assign(ctx, Test.level(8, 8));
      Test.types(ctx);
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
    id: "nav.restamp",
    setup(ctx) {
      Object.assign(ctx, Test.level(8, 8));
      const s = ctx.entities;
      ctx.wall = Colliders.box(s, 96, 0, 32, 224); // column 3, rows 0..6: a detour through row 7
      ctx.walker = s.create();
      s.add(ctx.walker, Position, { x: 16, y: 16, z: 0 });
      s.mint(ctx.walker, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 });
      ctx.other = s.create();
      s.mint(ctx.other, PathResponse, { path: [{ x: 0, y: 0 }], index: 0 }); // a held path a restamp drops
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const level = ctx.level;
      const hold = () =>
        s.mint(ctx.other, PathResponse, { path: [{ x: 0, y: 0 }], index: 0 });
      const ask = () =>
        s.mint(ctx.walker, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 });
      PuppetSystem.update(level); // the tick's collider walk snapshots the wall
      PathfindingSystem.update(level); // seeds the nav grid, stamps the wall, serves the request
      const r1 = s.get(ctx.walker, PathResponse);
      t.ok(r1 !== undefined, "the request is served");
      t.ok(r1.path.length > 8, "the path detours around the stamped wall: " + r1.path.length);
      t.eq(s.get(ctx.other, PathResponse), undefined, "the first stamp drops every held path");
      // the wall goes: the next collider walk moves the generation, and the update after it
      // restamps with no hook and no call from the writer
      hold();
      s.remove(ctx.wall);
      s.flush();
      ask();
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      t.eq(s.get(ctx.walker, PathResponse).path.length, 8, "with the wall gone the path runs straight");
      t.eq(s.get(ctx.other, PathResponse), undefined, "a restamp drops every held path");
      // a body spawn never enters the fingerprint (kinematic carriers only): no restamp, paths stay
      hold();
      const body = s.create();
      s.add(body, Position, { x: 200, y: 200, z: 0 });
      s.add(body, BBox, { x: -8, y: -8, width: 16, height: 16 });
      s.add(body, Collision, { solid: true });
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      t.ok(s.get(ctx.other, PathResponse) !== undefined, "a body spawn keeps every held path");
      t.eq(PuppetSystem.colliders(level).gen, 2, "the generation counts the static set's changes");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    id: "level.remesh",
    setup(ctx) {
      Object.assign(ctx, Test.level(4, 4));
      Test.types(ctx);
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
      t.eq(s.count(), 3, "the store holds the colliders and the level's own entity");
      const col = s.get(ctx.colliders[0], Collision);
      t.ok(
        col !== undefined && col.kinematic === true,
        "a collider is a kinematic solid",
      );
      TileEdit.clear(layer, 3, 3);
      TileEdit.remesh(s, ctx.grid, layer, ctx.colliders);
      t.eq(ctx.colliders.length, 1, "remesh replaces the set");
      t.eq(s.count(), 2, "old colliders are flushed");
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
  // ── perf.plan: what one A* expansion costs ──────────────────────────────
  // THE record for what an expansion costs, measured on the shape a far plan has: a weighted
  // 128² field, corner to corner, where the unit heuristic is weak enough that most of the level
  // expands. `n` is the nav scratch's `iters`, so the row is ns per expansion and not per plan —
  // multiply by the iters in the log line for what one plan costs a frame.
  {
    id: "perf.plan",
    setup(ctx) {
      Object.assign(ctx, Test.level(PLAN_COLS, PLAN_COLS));
      Test.types(ctx);
      // a weighted field, not a maze: mud in a coarse checker so most cells stay reachable and
      // the cost spread is what defeats the heuristic
      for (let y = 0; y < PLAN_COLS; y++)
        for (let x = 0; x < PLAN_COLS; x++)
          if (((x >> 3) + (y >> 3)) % 2 === 0) ctx.layer.set(x, y, ctx.mud);
      ctx.nav = new NavGrid(ctx.grid);
      ctx.nav.sync();
    },
    verify(ctx, t) {
      const nav = ctx.nav;
      const a = { x: 0, y: 0 };
      const b = { x: PLAN_COLS - 1, y: PLAN_COLS - 1 };
      const opt = { allowDiag: true };
      const path = MotionPlanner.plan(nav, a, b, opt);
      const iters = nav.scratch.iters;
      t.ok(path.length > 0, "the corner-to-corner plan resolves");
      t.ok(
        iters > PLAN_COLS,
        "the plan expands more than a straight run of cells",
      );
      // the octile plan must be ADMISSIBLE: with diagonals costing only sqrt(2) it can never
      // come out dearer than the cardinal one over the same field. An octile search run on the
      // Manhattan heuristic overestimates and fails this while still returning a path, so the
      // row is what catches the heuristic losing its `allowDiag` (GMRT.md #15549).
      const walk = (pth) => {
        let cost = 0;
        let broken = 0;
        for (let i = 1; i < pth.length; i++) {
          const dx = pth[i].x - pth[i - 1].x;
          const dy = pth[i].y - pth[i - 1].y;
          const adx = dx > 0 ? dx : -dx;
          const ady = dy > 0 ? dy : -dy;
          if (adx > 1) broken += 1;
          if (ady > 1) broken += 1;
          const step = adx + ady === 2 ? MotionPlanner.SQRT_2 : 1;
          cost += ctx.nav.grid.get(pth[i].x, pth[i].y) * step;
        }
        return { cost, broken };
      };
      const diag = walk(path);
      const straight = walk(MotionPlanner.plan(nav, a, b, { allowDiag: false }));
      t.eq(diag.broken, 0, "every octile step lands on a neighbour cell");
      t.ok(
        path[0].x === 0 && path[path.length - 1].x === PLAN_COLS - 1,
        "the path spans corner to corner",
      );
      t.ok(
        diag.cost <= straight.cost + 1e-6,
        "the octile path costs no more than the cardinal one : " +
          diag.cost +
          " vs " +
          straight.cost,
      );
      t.measure(
        "plan.expansion",
        iters,
        () => 0,
        () => MotionPlanner.plan(nav, a, b, opt).length,
      );
      // the same plan with the heap and the grid reads left in but the neighbour scan cut to
      // cardinals: the row pairs with the one above to say how much of an expansion is the scan
      const cardinal = { allowDiag: false };
      MotionPlanner.plan(nav, a, b, cardinal);
      t.measure(
        "plan.expansion.cardinal",
        nav.scratch.iters,
        () => 0,
        () => MotionPlanner.plan(nav, a, b, cardinal).length,
      );
    },
    teardown(ctx) {
      ctx.nav.destroy();
      ctx.level.destroy();
    },
  },
]);
