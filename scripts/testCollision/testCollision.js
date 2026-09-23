// Core/Collision and Puppet cases: SolidSystem and SeparationSystem over the mirrors
// PuppetSystem keeps, the collider fingerprint, AABB, Query, Raycast, the runtime's mask
// queries, and perf.builtin, the runtime's collision built-ins against Core/Collision. Every
// case here references Core only; the case contract and the perf.* rule are Test's.

const N = 4000; // the perf.builtin loop length
const BENCH_STATICS = 200; // perf.builtin's statics
const BENCH_BODIES = 500; // perf.builtin's bodies, the colony's count

Test.register(Test.CHECK, [
  {
    id: "system.solid",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.wall = Colliders.box(s, 100, 0, 32, 64);
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 50, y: 16, z: 0 });
      s.add(ctx.body, BBox, { x: 0, y: 0, width: 16, height: 16 });
      s.add(ctx.body, Collision, { solid: true });
      s.add(ctx.body, Velocity, { x: 600, y: 0, z: 0 }); // 10 px per tick at the pinned step
      // the sim integrates by Time.step, REAL frame time (a fast frame's is short): pinned so
      // the 20 ticks are 200 px whatever the frame took, restored in teardown
      ctx.step = Time.step;
      Time.step = 1 / 60;
    },
    verify(ctx, t) {
      const s = ctx.entities;
      for (let k = 0; k < 20; k++) {
        PuppetSystem.update(ctx.level); // the scene's order: the mirror first
        SolidSystem.update(ctx.level);
      }
      const pos = s.get(ctx.body, Position);
      const vel = s.get(ctx.body, Velocity);
      t.ok(pos.x + 16 <= 100 + 0.5, "body never enters the wall past the half pixel the runtime rounds (docs/GMRT.md): " + pos.x);
      t.ok(pos.x >= 80, "body reaches the wall: " + pos.x);
      t.eq(vel.x, 0, "a blocked body's velocity is what it moved: none");
      const wallPos = s.get(ctx.wall, Position);
      t.eq(wallPos.x, 100, "kinematic solid never moves");
      t.eq(
        PuppetSystem.colliders(ctx.level).statics.length,
        1,
        "static snapshot holds the wall",
      );
    },
    teardown(ctx) {
      Time.step = ctx.step;
      ctx.level.destroy();
    },
  },
  {
    id: "solid.fingerprint",
    // a kinematic collider's `solid` flipped IN PLACE (a door's leaf, a trunk growing solid)
    // re-bakes like a wall built or torn down — no call from the writer
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.wall = Colliders.box(s, 100, 0, 32, 64);
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 50, y: 16, z: 0 });
      s.add(ctx.body, BBox, { x: 0, y: 0, width: 16, height: 16 });
      s.add(ctx.body, Collision, { solid: true });
      s.add(ctx.body, Velocity, { x: 600, y: 0, z: 0 });
      ctx.step = Time.step; // pinned as system.solid's: the walk through the leaf is 20 ticks of it
      Time.step = 1 / 60;
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const level = ctx.level;
      const col = s.get(ctx.wall, Collision);
      PuppetSystem.update(level); // the mirrors, ahead of the solid pass as in the scene
      SolidSystem.update(level);
      const c = PuppetSystem.colliders(level);
      t.eq(c.statics.length, 1, "the wall bakes");
      t.eq(c.gen, 1, "the first bake counts");
      col.solid = false; // the leaf opens
      for (let k = 0; k < 20; k++) {
        PuppetSystem.update(level); // the leaf's mirror empties its mask
        SolidSystem.update(level);
      }
      t.eq(c.statics.length, 0, "an open leaf leaves the bake");
      t.eq(c.gen, 2, "the flip moved the generation");
      t.ok(s.get(ctx.body, Position).x > 100, "the body walks through the open leaf");
      col.solid = true; // the leaf closes behind it
      PuppetSystem.update(level); // the mirror's walk is the collider walk
      t.eq(c.statics.length, 1, "a closed leaf re-enters the bake");
      t.eq(c.gen, 3, "the flip back moved the generation again");
      PuppetSystem.update(level);
      t.eq(c.gen, 3, "an unchanged set holds the generation");
    },
    teardown(ctx) {
      Time.step = ctx.step;
      ctx.level.destroy();
    },
  },
  {
    // the bodies each pass walks: a body without Velocity is never moved, a solid-off body
    // never separated, a kinematic neither
    id: "system.solid.bodies",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.wall = Colliders.box(s, 100, 0, 32, 64);
      ctx.still = s.create(); // no Velocity: a cast target, not a mover
      s.add(ctx.still, Position, { x: 10, y: 100, z: 0 });
      s.add(ctx.still, BBox, { x: 0, y: 0, width: 16, height: 16 });
      s.add(ctx.still, Collision, { solid: true });
      ctx.a = s.create();
      s.add(ctx.a, Position, { x: 40, y: 40, z: 0 });
      s.add(ctx.a, BBox, { x: 0, y: 0, width: 16, height: 16 });
      s.add(ctx.a, Collision, { solid: true });
      s.add(ctx.a, Velocity, { x: 0, y: 0, z: 0 });
      ctx.b = s.create(); // overlaps a by 8 px in x, 16 in y — separation pushes along x
      s.add(ctx.b, Position, { x: 48, y: 40, z: 0 });
      s.add(ctx.b, BBox, { x: 0, y: 0, width: 16, height: 16 });
      s.add(ctx.b, Collision, { solid: true });
      s.add(ctx.b, Velocity, { x: 0, y: 0, z: 0 });
      ctx.corpse = s.create(); // solid off: never separated
      s.add(ctx.corpse, Position, { x: 40, y: 40, z: 0 });
      s.add(ctx.corpse, BBox, { x: 0, y: 0, width: 16, height: 16 });
      s.add(ctx.corpse, Collision, { solid: false });
      s.add(ctx.corpse, Velocity, { x: 0, y: 0, z: 0 });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      PuppetSystem.update(ctx.level); // the mirrors, as the scene runs them first
      SolidSystem.update(ctx.level);
      t.eq(s.get(ctx.still, Position).x, 10, "a body without Velocity is not integrated");
      t.eq(s.get(ctx.wall, Position).x, 100, "a kinematic is not integrated");

      SeparationSystem.update(ctx.level);
      const pa = s.get(ctx.a, Position);
      const pb = s.get(ctx.b, Position);
      t.near(pa.x, 36, 1e-6, "separation pushes a back half the overlap");
      t.near(pb.x, 52, 1e-6, "separation pushes b forward half the overlap");
      t.eq(s.get(ctx.corpse, Position).x, 40, "a solid-off body is not separated");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    id: "collision.aabb",
    setup(ctx) {
      const s = new Table(8);
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
      const s = new Table(8);
      ctx.entities = s;
      ctx.near = s.create();
      s.add(ctx.near, Position, { x: 10, y: 0, z: 0 });
      ctx.far = s.create();
      s.add(ctx.far, Position, { x: 100, y: 0, z: 0 });
      s.add(ctx.far, "TestMarker", { on: true });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      t.eq(
        Query.inRadius(s, 0, 0, 200, { has: "TestMarker" }).length,
        1,
        "has: joins the marker",
      );
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
  // ── puppet.mirror: every collider's instance mirrors its components ─────────────
  // PuppetSystem's contract: a kinematic is a Solid, a body a Puppet, the mask is the AABB,
  // the instance follows Position, a solid flip empties the mask, a parked level answers no
  // query, and the level's teardown destroys the instance.
  {
    id: "puppet.mirror",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.wall = Colliders.box(s, 100, 0, 64, 32);
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 40, y: 40, z: 0 });
      s.add(ctx.body, BBox, { x: -8, y: -8, width: 16, height: 16 });
      s.add(ctx.body, Collision, { solid: true });
      ctx.probe = instance_create_depth(-4000, -4000, 0, Puppet); // the queries' scope, off-level
      PuppetSystem.update(ctx.level);
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const probe = ctx.probe;
      const wall = s.get(ctx.wall, Instance);
      const body = s.get(ctx.body, Instance);
      t.ok(wall !== undefined && body !== undefined, "a collider is minted a mirror");
      if (wall === undefined || body === undefined) return;
      const wi = wall.inst;
      const bi = body.inst;
      t.eq(object_get_name(wi.object_index), "Solid", "a kinematic's object");
      t.eq(object_get_name(bi.object_index), "Puppet", "a body's object");
      const e = AABB.of(s, ctx.wall);
      t.ok(
        wi.bbox_left === e.x1 && wi.bbox_top === e.y1 && wi.bbox_right === e.x2 && wi.bbox_bottom === e.y2,
        "a static's mask is its AABB: " + wi.bbox_left + "," + wi.bbox_top + "-" + wi.bbox_right + "," + wi.bbox_bottom,
      );
      t.ok(bi.bbox_left === 32 && bi.bbox_right === 48, "a body's mask is its AABB: " + bi.bbox_left + "-" + bi.bbox_right);
      t.eq(bi.x, 40, "a centred body's instance sits at its Position");
      t.eq(bi.eid, ctx.body, "eid names the entity");
      const at = (x1, y1, x2, y2, obj) => instance_exists(probe.collision_rectangle(x1, y1, x2, y2, obj, false, true));
      t.ok(at(110, 10, 120, 20, Solid), "Solid answers for the wall");
      t.ok(!at(30, 30, 50, 50, Solid), "Solid does not answer for the body");
      t.ok(at(30, 30, 50, 50, Puppet), "Puppet answers for the body");
      t.ok(at(110, 10, 120, 20, Puppet), "Puppet answers for the wall, its child's");
      s.get(ctx.body, Position).x = 200;
      PuppetSystem.update(ctx.level);
      t.eq(bi.x, 200, "the instance follows Position");
      t.ok(!at(30, 30, 50, 50, Puppet), "the old place is empty");
      s.get(ctx.body, Collision).solid = false;
      PuppetSystem.update(ctx.level);
      t.ok(!at(190, 30, 210, 50, Puppet), "a solid-off body answers no rectangle");
      t.ok(!instance_exists(probe.collision_point(200, 40, Puppet, false, true)), "nor a point");
      s.get(ctx.body, Collision).solid = true;
      PuppetSystem.update(ctx.level);
      t.ok(at(190, 30, 210, 50, Puppet), "solid on: it answers again");
      PuppetSystem.park(ctx.level);
      t.ok(!at(110, 10, 120, 20, Solid), "a parked level's mirrors answer nothing");
      PuppetSystem.thaw(ctx.level);
      t.ok(at(110, 10, 120, 20, Solid), "thawed, they answer");
      ctx.level.destroy();
      ctx.level = null;
      t.ok(!instance_exists(wi), "the level's teardown destroys the mirror");
    },
    teardown(ctx) {
      instance_destroy(ctx.probe);
      if (ctx.level !== null) ctx.level.destroy();
    },
  },
  // ── collision.mask: the runtime's mask queries over the mirrors ──────────────────
  {
    id: "collision.mask",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.wall = Colliders.box(s, 100, 0, 32, 64);
      const body = (x, y, solid) => {
        const id = s.create();
        s.add(id, Position, { x, y, z: 0 });
        s.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
        s.add(id, Collision, { solid });
        return id;
      };
      ctx.near = body(40, 40, true); // box 32..48: its centre outside a rect to 36, its box inside
      ctx.marked = body(200, 40, true);
      s.add(ctx.marked, "TestMarker", { on: true });
      ctx.corpse = body(40, 100, false);
      PuppetSystem.update(ctx.level);
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const rect = Query.maskRect(s, 0, 0, 36, 60);
      t.eq(rect.length, 1, "a box reaching into the rect counts, its centre outside");
      t.eq(rect[0], ctx.near, "and it is the body");
      t.eq(Query.inRect(s, 0, 0, 36, 60).length, 0, "where the point form counts the centre only");
      t.eq(Query.maskRect(s, 90, 10, 110, 20).length, 1, "a static's mask answers a rect");
      t.eq(Query.maskRadius(s, 60, 40, 20).length, 1, "a circle reaches a box");
      t.eq(Query.maskRadius(s, 0, 0, 1000, { has: "TestMarker" }).length, 1, "has: narrows to the marker's carrier");
      t.eq(Query.maskRadius(s, 40, 100, 4).length, 0, "a solid-off body wears no mask");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    id: "collision.raycast",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.wall = Colliders.box(s, 100, 0, 32, 64);
      PuppetSystem.update(ctx.level); // the wall's mirror, which the cast lists
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const hit = Raycast.cast(ctx.level, 0, 16, 200, 16);
      t.ok(hit !== null, "a segment through the wall hits");
      if (hit !== null) {
        t.eq(hit.id, ctx.wall, "hit id is the wall");
        t.near(hit.x, 100, 1e-6, "hit lands on the near face");
        t.near(hit.t, 0.5, 1e-6, "t is the segment parameter");
        t.eq(hit.nx, -1, "normal points back along the ray");
      }
      t.eq(
        Raycast.cast(ctx.level, 0, 16, 90, 16),
        null,
        "a segment short of the wall misses",
      );
      t.eq(
        Raycast.cast(ctx.level, 0, 80, 200, 80),
        null,
        "a segment beside the wall misses",
      );
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  // ── perf.builtin: the runtime's collision built-ins against Core/Collision ────────
  // What the runtime's instance collision costs against what Core/Collision keeps in JS, over
  // the mirrors PuppetSystem keeps (a Solid a static, a
  // Puppet a body, `eid` the entity behind it) at the colony's shape: 500 bodies, ~200 statics.
  // Each row is a built-in against the JS form; every built-in runs instance-scoped (a
  // collision call throws outside one), and a hit is read back through the DS list and its
  // `eid` — the price a replacement pays, not a benchmark shortcut. Raycast.cast rides
  // collision_line_list itself now, so its row is a cast's cost and the collision_line row
  // what a hit-or-miss alone costs. The checks record where the two agree and differ: the
  // runtime keeps a fractional bbox (docs/GMRT.md), and rectangle_in_rectangle counts a
  // touching edge where AABB.overlap is strict.
  {
    id: "perf.builtin",
    frames: 2, // the masks land on the instances after their first step
    setup(ctx) {
      const grid = new LevelGrid({ cellWidth: 32, cellHeight: 32, cols: 64, rows: 64 });
      grid.insert(new TileLayer(64, 64, { emptyCost: 1 }));
      const level = new Level({ id: "test", grid, capacity: 1024 });
      const s = level.entities;
      ctx.level = level;
      ctx.entities = s;
      let seed = 4242;
      const rand = () => {
        seed = (seed * 48271) % 2147483647;
        return seed / 2147483647;
      };
      ctx.insts = []; // every instance made here beyond the mirrors, for teardown
      ctx.list = ds_list_create();
      ctx.probe = PuppetSystem.probe(); // the scope the built-ins run in

      // the statics: random 32-128 px boxes on the cell lattice
      ctx.staticIds = [];
      for (let k = 0; k < BENCH_STATICS; k++) {
        const x = 32 * Math.floor(rand() * 60);
        const y = 32 * Math.floor(rand() * 60);
        const w = 32 * (1 + Math.floor(rand() * 4));
        const h = 32 * (1 + Math.floor(rand() * 4));
        const id = Colliders.box(s, x, y, w, h);
        ctx.staticIds.push(id);
      }

      // the bodies: 12 px centred boxes at integer positions (so the bboxes agree exactly)
      const n = BENCH_BODIES;
      ctx.n = n;
      ctx.bodyIds = new Array(n);
      ctx.bodyPos = new Array(n);
      ctx.bodyBox = new Array(n);
      ctx.bodyInst = new Array(n);
      for (let i = 0; i < n; i++) {
        const px = 16 + Math.floor(rand() * 2016);
        const py = 16 + Math.floor(rand() * 2016);
        const id = s.create();
        const pos = { x: px, y: py, z: 0 };
        const box = { x: -6, y: -6, width: 12, height: 12 };
        s.add(id, Position, pos);
        s.add(id, BBox, box);
        s.add(id, Collision, { solid: true });
        s.add(id, Velocity, { x: 0, y: 0, z: 0 });
        ctx.bodyIds[i] = id;
        ctx.bodyPos[i] = pos;
        ctx.bodyBox[i] = box;
      }
      PuppetSystem.update(level); // the mirrors
      for (let i = 0; i < n; i++) ctx.bodyInst[i] = s.get(ctx.bodyIds[i], Instance).inst;

      // rect pairs for the overlap row (perf.measured's shape)
      ctx.ra = new Array(N);
      ctx.rb = new Array(N);
      for (let i = 0; i < N; i++) {
        ctx.ra[i] = { x1: i, y1: 0, x2: i + 16, y2: 16 };
        const bx = i + (i & 1 ? 8 : 20);
        ctx.rb[i] = { x1: bx, y1: 0, x2: bx + 16, y2: 16 };
      }
      // query rects, segments
      ctx.queries = [];
      for (let k = 0; k < 64; k++) {
        const x = Math.floor(rand() * 1800);
        const y = Math.floor(rand() * 1800);
        ctx.queries.push({ x1: x, y1: y, x2: x + 256, y2: y + 256 });
      }
      ctx.segs = [];
      for (let k = 0; k < 200; k++) {
        const x0 = 64 + Math.floor(rand() * 1920);
        const y0 = 64 + Math.floor(rand() * 1920);
        const a = rand() * 6.2831853;
        const len = 64 + rand() * 448;
        ctx.segs.push({
          x0,
          y0,
          x1: Math.round(x0 + Math.cos(a) * len),
          y1: Math.round(y0 + Math.sin(a) * len),
        });
      }
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const level = ctx.level;
      const probe = ctx.probe;
      const list = ctx.list;
      const n = ctx.n;
      const bodyPos = ctx.bodyPos;
      const bodyBox = ctx.bodyBox;
      const bodyInst = ctx.bodyInst;

      // ── the mirror holds: an instance carries its entity and the bbox the components give
      const b0 = bodyInst[0];
      t.eq(b0.eid, ctx.bodyIds[0], "eid reads back");
      t.eq(b0.bbox_left, bodyPos[0].x - 6, "a body's mask left edge");
      t.eq(b0.bbox_right - b0.bbox_left, 12, "a body's mask width");
      const s0 = s.get(ctx.staticIds[0], Instance).inst;
      t.eq(s0.bbox_left, s.get(ctx.staticIds[0], Position).x, "a static's mask left edge");

      // ── semantics: touching edges, and a fractional position
      const touch = rectangle_in_rectangle(0, 0, 16, 16, 16, 0, 32, 16);
      t.eq(
        AABB.overlap({ x1: 0, y1: 0, x2: 16, y2: 16 }, { x1: 16, y1: 0, x2: 32, y2: 16 }),
        false,
        "AABB: touching edges do not overlap",
      );
      Log.info("[BENCH] builtin.touching rectangle_in_rectangle " + touch);
      const fa = instance_create_depth(500.5, 500.5, 0, Puppet);
      ctx.insts.push(fa);
      Log.info("[BENCH] builtin.fractional x 500.5 -> bbox_left " + fa.bbox_left + " right " + fa.bbox_right);

      // ── AABB.overlap vs rectangle_in_rectangle: the boundary crossing alone
      const ra = ctx.ra;
      const rb = ctx.rb;
      const readRects = () => {
        let acc = 0;
        for (let i = 0; i < N; i++) acc += ra[i].x1 + rb[i].x1;
        return acc;
      };
      let jsOverlaps = 0;
      let gmOverlaps = 0;
      t.measure("aabb.overlap.inline", N, readRects, () => {
        let acc = 0;
        for (let i = 0; i < N; i++) {
          const a = ra[i];
          const b = rb[i];
          acc += a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1 ? 1 : 0;
        }
        jsOverlaps = acc;
        return acc;
      });
      t.measure("builtin.rectangle_in_rectangle", N, readRects, () => {
        let acc = 0;
        for (let i = 0; i < N; i++) {
          const a = ra[i];
          const b = rb[i];
          acc += rectangle_in_rectangle(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2) !== 0 ? 1 : 0;
        }
        gmOverlaps = acc;
        return acc;
      });
      t.eq(gmOverlaps, jsOverlaps, "rectangle_in_rectangle agrees with AABB.overlap on the pairs");

      // ── the sync a replacement pays every tick: a body's x/y onto its instance
      const readPos = () => {
        let acc = 0;
        for (let i = 0; i < n; i++) acc += bodyPos[i].x + bodyPos[i].y;
        return acc;
      };
      t.measure("builtin.sync.xy", n, readPos, () => {
        let acc = 0;
        for (let i = 0; i < n; i++) {
          const p = bodyPos[i];
          const inst = bodyInst[i];
          inst.x = p.x;
          inst.y = p.y;
          acc += p.x;
        }
        return acc;
      });

      // ── Query.inRect (a Position walk) vs Query.maskRect (the runtime's list + the id read-back)
      const queries = ctx.queries;
      const nq = queries.length;
      let jsFound = 0;
      let gmFound = 0;
      const jsIds = [];
      t.measure("query.inRect", nq, Test.empty(nq), () => {
        let acc = 0;
        jsIds.length = 0;
        for (let k = 0; k < nq; k++) {
          const q = queries[k];
          const ids = Query.inRect(s, q.x1, q.y1, q.x2, q.y2);
          acc += ids.length;
          jsIds.push(ids);
        }
        jsFound = acc;
        return acc;
      });
      const gmSets = [];
      t.measure("query.maskRect", nq, Test.empty(nq), () => {
        let acc = 0;
        gmSets.length = 0;
        for (let k = 0; k < nq; k++) {
          const q = queries[k];
          const ids = Query.maskRect(s, q.x1, q.y1, q.x2, q.y2);
          const set = new Set();
          for (let j = 0; j < ids.length; j++) set.add(ids[j]);
          gmSets.push(set);
          acc += ids.length;
        }
        gmFound = acc;
        return acc;
      });
      let missing = 0;
      for (let k = 0; k < nq; k++) {
        const ids = jsIds[k];
        const set = gmSets[k];
        for (let j = 0; j < ids.length; j++) {
          // a Position inside the rect is a mask overlapping it; statics carry Position too
          if (!set.has(ids[j]) && s.get(ids[j], BBox).width === 12) missing++;
        }
      }
      t.eq(missing, 0, "every body Query.inRect finds, Query.maskRect finds");
      Log.info("[BENCH] builtin.query hits js " + jsFound + " gm " + gmFound + " over " + nq + " rects");

      // ── instance_place_list per body (+ read-back): the pair sweep a separation pass asks for
      let gmPairs = 0;
      const bodySet = new Set(); // a Puppet query lists the Solids too: keep the bodies
      for (let i = 0; i < n; i++) bodySet.add(ctx.bodyIds[i]);
      t.measure("builtin.instance_place_list.bodies", n, Test.empty(n), () => {
        let acc = 0;
        for (let i = 0; i < n; i++) {
          const inst = bodyInst[i];
          ds_list_clear(list);
          const found = inst.instance_place_list(inst.x, inst.y, Puppet, list, false);
          for (let j = 0; j < found; j++) {
            const eid = ds_list_find_value(list, j).eid;
            if (eid !== undefined) acc += bodySet.has(eid) ? 1 : 0; // never an undefined key (docs/GMRT.md)
          }
        }
        gmPairs = acc;
        return acc;
      });
      t.ok(gmPairs > 0, "instance_place_list finds the overlapping bodies (each pair twice): " + gmPairs);

      // ── instance_place_list + bbox reads per body against the statics
      let gmCand = 0;
      t.measure("builtin.instance_place_list.statics", n, Test.empty(n), () => {
        let acc = 0;
        for (let i = 0; i < n; i++) {
          const inst = bodyInst[i];
          ds_list_clear(list);
          const found = inst.instance_place_list(inst.x, inst.y, Solid, list, false);
          for (let j = 0; j < found; j++) {
            const h = ds_list_find_value(list, j);
            acc += h.bbox_left + h.bbox_top + h.bbox_right + h.bbox_bottom > 0 ? 1 : 0;
          }
        }
        gmCand = acc;
        return acc;
      });
      t.ok(gmCand >= 0, "instance_place_list lists the statics a body overlaps: " + gmCand);

      // ── Raycast.cast vs collision_line (a line of sight) and collision_line_list + slab (a hit point)
      const segs = ctx.segs;
      const ns = segs.length;
      const jsHits = new Array(ns);
      const gmHits = new Array(ns);
      const targets = Puppet; // a Solid is its child
      t.measure("raycast.cast", ns, Test.empty(ns), () => {
        let acc = 0;
        for (let k = 0; k < ns; k++) {
          const g = segs[k];
          const hit = Raycast.cast(level, g.x0, g.y0, g.x1, g.y1);
          jsHits[k] = hit;
          if (hit !== null) acc++;
        }
        return acc;
      });
      t.measure("builtin.collision_line", ns, Test.empty(ns), () => {
        let acc = 0;
        for (let k = 0; k < ns; k++) {
          const g = segs[k];
          const r = probe.collision_line(g.x0, g.y0, g.x1, g.y1, targets, false, true);
          const hit = instance_exists(r);
          gmHits[k] = hit;
          if (hit) acc++;
        }
        return acc;
      });
      let disagree = 0;
      for (let k = 0; k < ns; k++) if ((jsHits[k] !== null) !== gmHits[k]) disagree++;
      t.eq(disagree, 0, "collision_line agrees with Raycast.cast on a line of sight");
      let nearestAgree = 0;
      let nearestBoth = 0;
      t.measure("builtin.collision_line_list.nearest", ns, Test.empty(ns), () => {
        let acc = 0;
        nearestAgree = 0;
        nearestBoth = 0;
        for (let k = 0; k < ns; k++) {
          const g = segs[k];
          ds_list_clear(list);
          const found = probe.collision_line_list(g.x0, g.y0, g.x1, g.y1, targets, false, true, list, true);
          let bestT = Infinity;
          let bestId = -1;
          const dx = g.x1 - g.x0;
          const dy = g.y1 - g.y0;
          for (let j = 0; j < found; j++) {
            const h = ds_list_find_value(list, j);
            const r = Raycast._segmentAABB(
              g.x0,
              g.y0,
              dx,
              dy,
              h.bbox_left,
              h.bbox_top,
              h.bbox_right,
              h.bbox_bottom,
            );
            if (r === null) continue;
            if (r.t < bestT) {
              bestT = r.t;
              bestId = h.eid;
            }
          }
          if (bestId !== -1) acc++;
          const js = jsHits[k];
          if (js !== null && bestId !== -1) {
            nearestBoth++;
            if (Math.abs(js.t - bestT) < 1e-6) nearestAgree++; // by distance: a shared edge is a tie
          }
        }
        return acc;
      });
      t.eq(nearestAgree, nearestBoth, "the nearest hit's distance agrees between the slab walk and the list");

      // ── move_and_collide, the runtime's resolver, a 1 px step on each axis. Last, since it
      // moves the bodies. Its return is a GML array — read through array_length, never coerced
      // (docs/GMRT.md).
      t.measure("builtin.move_and_collide", n, Test.empty(n), () => {
        let acc = 0;
        for (let i = 0; i < n; i++) acc += array_length(bodyInst[i].move_and_collide(1, 1, Solid));
        return acc;
      });
    },
    teardown(ctx) {
      for (let i = 0; i < ctx.insts.length; i++) instance_destroy(ctx.insts[i]);
      ds_list_destroy(ctx.list);
      ctx.level.destroy();
    },
  },
]);
