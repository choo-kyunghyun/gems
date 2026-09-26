// Level, world and nav cases: a level's own entity and its rebuild, the grid and its blob, the
// world pool, a ticker over a level, the nav grid's sync and restamp, a wall cell's replan, the
// zone map's labeling, the generator's salted seeds, level data's footprint and copies, and
// perf.plan, what one A* expansion costs. Every case references Core only.

const PLAN_COLS = 128; // an overworld's side

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
      // numeric ids: a blob's cell holds a u16
      ctx.rock = new TileType({ id: 7, pathCost: null });
      ctx.mud = new TileType({ id: 9, pathCost: 3 });
    },
    verify(ctx, t) {
      const layer = ctx.layer;
      layer.set(1, 0, ctx.rock);
      layer.set(2, 1, ctx.mud);
      layer.set(0, 1, ctx.rock);
      t.ok(layer.ids.data[1] === 7 && layer.ids.data[3] === 7, "a cell holds its type's id");
      t.eq(layer.ids.data[5], 9, "another type's cell holds its own id");
      let taken = "";
      try {
        layer.bind(new TileType({ id: 7 }));
      } catch (e) {
        taken = e.message;
      }
      t.ok(taken !== "", "a second type on a held id throws");
      let range = "";
      try {
        layer.bind(new TileType({ id: "rock" }));
      } catch (e) {
        range = e.message;
      }
      t.ok(range !== "", "an id that is no u16 above 0 throws");
      const buf = ctx.grid.pack();
      buffer_seek(buf, buffer_seek_start, 20 + 2 * 1);
      t.eq(buffer_read(buf, buffer_u16), 7, "the blob names a cell by its type's id");
      const shape = LevelGrid.shape(buf);
      t.eq(shape.cols, 3, "the header carries cols");
      t.eq(shape.rows, 2, "the header carries rows");
      t.eq(shape.cellWidth, 32, "the header carries the cell width");
      t.eq(shape.layers, 1, "the header carries the layer count");
      const grid = new LevelGrid({ cellWidth: shape.cellWidth, cellHeight: shape.cellHeight, cols: shape.cols, rows: shape.rows });
      const twin = new TileLayer(grid, { emptyCost: 1 });
      grid.insert(twin);
      twin.bind(ctx.rock);
      t.ok(grid.unpack(buf), "the blob unpacks into the fresh grid");
      t.ok(twin.get(1, 0) === ctx.rock, "a cell comes back as its type");
      t.ok(twin.get(0, 1) === ctx.rock, "another cell too");
      t.ok(!twin.get(2, 1), "a cell whose id the layer holds no type for comes back empty");
      t.ok(!twin.get(0, 0), "an empty cell stays empty");
      t.ok(twin.edits > 0 && twin.since(0) < 0, "an unpack marks every cell edited");
      buffer_delete(buf);
      grid.destroy();
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    id: "world.pool",
    // the world's store: a pooled level is an entity carrying its map id and the Level (minted,
    // freed with it), and the roster survives an import without the Levels
    setup(ctx) {
      World.reset();
    },
    verify(ctx, t) {
      const lv = new Level({ id: "test_a", capacity: 4 });
      World.add("test_a", lv);
      t.ok(World.get("test_a") === lv, "get resolves the pooled level");
      t.eq(World.get("test_b"), null, "a map not pooled reads null");
      t.eq(World.ids().join(","), "test_a", "ids lists the resident maps");
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
      World.remove("test_a");
      t.eq(lv2.entities.count(), 0, "remove destroyed the pooled level");
      t.eq(World.get("test_a"), null, "a removed map reads null");
      t.eq(World.table.count(), 1, "remove took the map entity with it");
      World.remove("test_a"); // a map not pooled is a no-op
      const lv3 = new Level({ id: "test_a", capacity: 4 });
      World.add("test_a", lv3);
      World.reset();
      t.eq(lv3.entities.count(), 0, "reset destroyed the pooled level");
      t.eq(World.ids().length, 0, "the pool is empty after reset");
    },
  },
  {
    id: "world.carry",
    // an entity in no level rides a queued event's payload through the save codec into a level
    setup(ctx) {
      World.reset();
      World.add("test_a", new Level({ id: "test_a", capacity: 4 }));
    },
    verify(ctx, t) {
      const a = World.get("test_a");
      const id = a.entities.create();
      a.entities.add(id, Position, { x: 3, y: 4, z: 0 });
      WorldEvents.schedule(1, "test_carry", { rec: World.take("test_a", id) });
      a.entities.flush();
      t.eq(a.entities.count(), 1, "the take left only the level's own entity");
      World.table.import(Json.decode(Json.encode(World.table.export())));
      const b = new Level({ id: "test_b", capacity: 4 });
      World.add("test_b", b);
      const held = WorldEvents.queued("test_carry");
      t.eq(held.length, 1, "the event rides the save");
      const p = b.entities.get(World.put("test_b", held[0].rec), Position);
      t.ok(p !== undefined, "the carried entity lands");
      if (p !== undefined) t.ok(p.x === 3 && p.y === 4, "with its components whole");
    },
    teardown(ctx) {
      World.reset();
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
        Test.box(s, 96, 0, 32, 224); // a wall down column 3, rows 0..6
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
        s.add(c.w, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 }, { mint: true });
        PathfindingSystem.update(c.level);
        // the twins share the room: only the stepping level's mirrors may answer
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
          const q = ctx.q;
          const keys = [PuppetSystem.KEY, SolidSystem.KEY, PathfindingSystem.KEY, CameraSystem.KEY];
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
        PathfindingSystem.nav(q.level).statics.length,
        PathfindingSystem.nav(p.level).statics.length,
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
      t.eq(g.size, 32, "size is cols × rows");
      const a = g.alloc(Infinity);
      t.ok(a.cols === 8 && a.rows === 4, "alloc takes the grid's shape");
      t.ok(a.data.length === 32 && a.data[31] === Infinity, "and fills every cell");
      t.eq(g.cellAt(3 * 32 + 5, 2 * 32), 2 * 8 + 3, "cellAt is the index under the point");
      t.eq(g.cellAt(-1, 0), -1, "off the grid is -1");
      t.eq(g.cellAt(8 * 32, 0), -1, "the far edge is off the grid");
      const c = g.cellRect({ x1: 40, y1: -50, x2: 96, y2: 65 }, {});
      t.ok(c.x0 === 1 && c.x1 === 3, "x2 is exclusive: a rect ending on a cell line stops before it");
      t.ok(c.y0 === 0 && c.y1 === 3, "a rect is clipped to the grid");
      const off = g.cellRect({ x1: 300, y1: 0, x2: 400, y2: 32 }, {});
      t.ok(off.x0 >= off.x1, "a rect off the grid is empty");
      const misfit = new TileLayer(new LevelGrid({ cols: 8, rows: 5 }));
      let threw = false;
      try {
        g.insert(misfit);
      } catch (e) {
        threw = true;
      }
      t.ok(threw, "a layer that doesn't span the grid throws");
      t.eq(g.layers.length, 0, "and stays out of the stack");
      misfit.destroy();
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

      // the log is shared, never drained: a second reader keeps its own cursor
      const twin = new NavGrid(ctx.grid);
      twin.sync();
      ctx.layer.set(5, 5, ctx.rock);
      nav.sync();
      t.eq(twin.sync(), true, "a second reader sees a write the first already synced");
      t.eq(twin.grid.get(5, 5), Infinity, "and replays its cell");

      const layer = ctx.layer;
      while (layer.log.length < 256) layer.set(0, 7, ctx.rock);
      nav.sync();
      layer.set(2, 7, ctx.mud);
      t.eq(layer.since(layer.edits - 1), 0, "a reader caught up at a full log still replays the next write");
      const behind = layer.edits;
      for (let i = 0; i < 300; i++) layer.set(i % 8, 6, ctx.rock);
      layer.set(1, 7, ctx.mud);
      t.eq(layer.since(behind), -1, "a reader past the log's reach resamples everything");
      nav.sync();
      twin.sync();
      t.ok(nav.grid.get(1, 7) === 3 && nav.grid.get(7, 6) === Infinity, "the resample is whole");
      t.ok(twin.grid.get(2, 7) === 3 && twin.grid.get(1, 7) === 3, "for every reader behind");
      twin.destroy();
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
      ctx.wall = Test.box(s, 96, 0, 32, 224); // column 3, rows 0..6: a detour through row 7
      ctx.walker = s.create();
      s.add(ctx.walker, Position, { x: 16, y: 16, z: 0 });
      s.add(ctx.walker, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 }, { mint: true });
      ctx.other = s.create();
      // a held path a restamp drops
      s.add(ctx.other, PathResponse, { path: [{ x: 0, y: 0 }], index: 0 }, { mint: true });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const level = ctx.level;
      const hold = () =>
        s.add(ctx.other, PathResponse, { path: [{ x: 0, y: 0 }], index: 0 }, { mint: true });
      const ask = () =>
        s.add(ctx.walker, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 }, { mint: true });
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      const r1 = s.get(ctx.walker, PathResponse);
      t.ok(r1 !== undefined, "the request is served");
      t.ok(r1.path.length > 8, "the path detours around the stamped wall: " + r1.path.length);
      t.eq(s.get(ctx.other, PathResponse), undefined, "the first stamp drops every held path");
      // `solid` flipped in place, as a door's leaf does
      const col = s.get(ctx.wall, Collision);
      col.solid = false;
      ask();
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      t.eq(s.get(ctx.walker, PathResponse).path.length, 8, "an open leaf leaves the stamp");
      col.solid = true;
      ask();
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      t.ok(s.get(ctx.walker, PathResponse).path.length > 8, "a closed leaf re-enters the stamp");
      // the wall goes: the restamp needs no hook and no call from the writer
      hold();
      s.remove(ctx.wall);
      s.flush();
      ask();
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      t.eq(s.get(ctx.walker, PathResponse).path.length, 8, "with the wall gone the path runs straight");
      t.eq(s.get(ctx.other, PathResponse), undefined, "a restamp drops every held path");
      // only kinematic colliders move the generation
      hold();
      const body = s.create();
      s.add(body, Position, { x: 200, y: 200, z: 0 });
      s.add(body, BBox, { x: -8, y: -8, width: 16, height: 16 });
      s.add(body, Collision, { solid: true });
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      t.ok(s.get(ctx.other, PathResponse) !== undefined, "a body spawn keeps every held path");
      t.eq(PuppetSystem.colliders(level).gen, 4, "the generation counts the static set's changes");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    id: "nav.tiles",
    // a wall cell painted across a held path drops it, and the replan detours
    setup(ctx) {
      Object.assign(ctx, Test.level(8, 8));
      Test.types(ctx);
      const s = ctx.entities;
      ctx.walker = s.create();
      s.add(ctx.walker, Position, { x: 16, y: 16, z: 0 });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const level = ctx.level;
      const layer = ctx.layer;
      const ask = () =>
        s.add(ctx.walker, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 }, { mint: true });
      ask();
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      t.eq(s.get(ctx.walker, PathResponse).path.length, 8, "an open level plans straight");
      for (let y = 0; y < 7; y++) layer.set(3, y, ctx.rock); // column 3, rows 0..6
      t.eq(layer.occupied(3, 1), true, "occupied reads a set cell");
      t.eq(layer.occupied(2, 2), false, "occupied reads an empty cell");
      PuppetSystem.update(level);
      PathfindingSystem.update(level);
      t.eq(s.get(ctx.walker, PathResponse), undefined, "the edit drops the held path");
      ask();
      PathfindingSystem.update(level);
      t.ok(s.get(ctx.walker, PathResponse).path.length > 8, "the replan detours through row 7");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    id: "level.zones",
    // a wall ring with a one-cell gap: open, the border floods in; stamped shut, it is a zone
    setup(ctx) {
      const ring = ["......", ".####.", ".#....", ".####.", "......"];
      ctx.ring = (x, y) => ring[y].charAt(x) === "#";
      // edge-closed, with every diagonal of the centre open
      const cross = [".#..", "#.#.", ".#..", "...."];
      ctx.cross = (x, y) => cross[y].charAt(x) === "#";
      ctx.map = new ZoneMap(new LevelGrid({ cellWidth: 32, cellHeight: 32, cols: 6, rows: 5 }));
    },
    verify(ctx, t) {
      const map = ctx.map;
      map.label(ctx.ring);
      t.eq(map.zones.length, 1, "an open gap leaves only the outside");
      t.eq(map.at(2, 2), ZoneMap.OUTSIDE, "the border floods through the gap");
      t.eq(map.at(1, 1), ZoneMap.BLOCKED, "a blocked cell reads blocked");
      t.eq(map.zones[0].cells, 21, "the outside counts every open cell");

      map.label(ctx.ring, [
        { x1: 128, y1: 64, x2: 160, y2: 96 },
        { x1: 160, y1: 128, x2: 256, y2: 224 },
      ]);
      t.eq(map.zones.length, 2, "a stamped gap closes one zone");
      t.eq(map.at(4, 2), ZoneMap.BLOCKED, "a rect blocks its cells");
      t.eq(map.at(5, 4), ZoneMap.BLOCKED, "a rect past the edge is clipped, not dropped");
      t.ok(map.at(2, 2) === 1 && map.at(3, 2) === 1, "the enclosed cells are zone 1");
      t.eq(map.zones[1].first, 2 * 6 + 2, "first is the zone's lowest cell index");
      t.eq(map.zones[1].cells, 2, "cells counts the zone");
      t.eq(map.at(-1, 0), ZoneMap.OUTSIDE, "off-grid reads outside");
      t.eq(map.atWorld(2 * 32 + 5, 2 * 32 + 31), 1, "atWorld reads the cell under the point");

      const rects = map.rects();
      t.eq(rects.length, 1, "the zone meshes into one rect");
      const r = rects[0];
      t.ok(
        r.x1 === 64 && r.y1 === 64 && r.x2 === 128 && r.y2 === 96,
        "the rect is world px with exclusive far edges",
      );
      t.ok(map.rects() === rects, "rects is cached");
      map.label(ctx.ring);
      t.ok(map.rects() !== rects, "a label drops the cache");
      t.eq(map.rects().length, 0, "an unlabeled ring has no zone rects");

      const cross = new ZoneMap(new LevelGrid({ cellWidth: 32, cellHeight: 32, cols: 4, rows: 4 }));
      cross.label(ctx.cross);
      t.eq(cross.at(1, 1), 1, "open diagonals leave an edge-closed cell a zone");
      t.eq(cross.zones.length, 2, "and only that cell");
      cross.destroy();
    },
    teardown(ctx) {
      ctx.map.destroy();
    },
  },
  {
    // a pass's noise seed folds in its salt, so two passes over one lattice sample independent
    // fields, and a salt keeps its seed wherever its pass sits in the list
    id: "levelgen.salt",
    setup(ctx) {
      ctx.seeds = [];
      ctx.probe = (salt) => ({
        salt,
        apply: (c) => {
          ctx.seeds.push(c.seed);
        },
      });
      ctx.palette = [{ id: "test_floor", pathCost: 1 }];
    },
    verify(ctx, t) {
      const make = (passes) =>
        new LevelGen({ palette: ctx.palette, seed: 1337, passes });
      make([ctx.probe(2), ctx.probe(1)]).generate(2, 2);
      make([ctx.probe(1)]).generate(2, 2);
      const s2 = ctx.seeds[0];
      const s1 = ctx.seeds[1];
      t.ok(s1 !== s2, "two salts fold two seeds");
      t.eq(ctx.seeds[2], s1, "a salt's seed ignores its list index");
      const lattices = [6, 10];
      for (let k = 0; k < lattices.length; k++) {
        const l = lattices[k];
        let n = 0;
        let sa = 0;
        let sb = 0;
        let sab = 0;
        let saa = 0;
        let sbb = 0;
        for (let y = 0; y < 128; y++)
          for (let x = 0; x < 128; x++) {
            const a = noise2(x, y, s1, l);
            const b = noise2(x, y, s2, l);
            n++;
            sa += a;
            sb += b;
            sab += a * b;
            saa += a * a;
            sbb += b * b;
          }
        const cov = sab / n - (sa / n) * (sb / n);
        const va = saa / n - (sa / n) * (sa / n);
        const vb = sbb / n - (sb / n) * (sb / n);
        const r = cov / Math.sqrt(va * vb);
        t.ok(
          Math.abs(r) < 0.2,
          "salted fields are uncorrelated at lattice " + l + " : r " + r,
        );
      }
    },
  },
  {
    id: "level.data",
    // content stays inside its footprint, and a moved or painted spawn is the consumer's own: no
    // edit to it reaches the source
    setup(ctx) {
      ctx.src = {
        cols: 4,
        rows: 3,
        tiles: [{ layer: "test_wall", rects: [[0, 0, 4, 1]] }],
        spawns: [
          { gx: 1, gy: 2, kind: "test_a", items: [{ itemId: "test_b", qty: 2, tag: 7 }] },
        ],
      };
    },
    verify(ctx, t) {
      const src = ctx.src;
      const throws = (data) => {
        try {
          LevelData.check(data);
        } catch (e) {
          return true;
        }
        return false;
      };
      t.ok(!throws(src), "content inside the footprint passes");
      t.ok(
        throws({ cols: 4, rows: 3, tiles: [{ layer: "test_wall", rects: [[1, 0, 4, 1]] }] }),
        "a rect past the footprint throws",
      );
      t.ok(throws({ cols: 4, rows: 3, spawns: [{ gx: 0, gy: 3 }] }), "a spawn past it throws");

      const st = LevelData.translate(src, 5, 6);
      const s = st.spawns[0];
      t.ok(s.gx === 6 && s.gy === 8, "translate shifts the spawn");
      t.eq(st.tiles[0].rects[0][0], 5, "and the rects");
      t.eq(s.kind, "test_a", "a spawn keeps its own keys");
      t.eq(s.items[0].tag, 7, "and its nested ones whole");
      s.items[0].qty = 9;
      s.items.push({ itemId: "test_c", qty: 1 });
      const own = src.spawns[0].items;
      t.ok(own.length === 1 && own[0].qty === 2, "an edit to a moved spawn leaves the source");
      const painted = LevelData.paint({ cols: 4, rows: 3, spawns: src.spawns }, { layers: {} });
      painted.spawns[0].items[0].qty = 9;
      t.eq(own[0].qty, 2, "so does an edit to a painted one");
    },
  },
  // What one A* expansion costs, on the shape a far plan has: a weighted field corner to corner,
  // where the unit heuristic is weak enough that most of the level expands. The row is ns per
  // expansion, not per plan — multiply by the logged n for what one plan costs a frame.
  {
    id: "perf.plan",
    setup(ctx) {
      Object.assign(ctx, Test.level(PLAN_COLS, PLAN_COLS));
      Test.types(ctx);
      // a weighted field, not a maze: the cost spread is what defeats the heuristic
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
      // an admissible octile plan never comes out dearer than the cardinal one; an overestimating
      // heuristic still returns a path, so only this catches it (docs/GMRT.md #15549)
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
      // paired with the row above, says how much of an expansion is the neighbour scan
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
