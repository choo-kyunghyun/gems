// Stress scenarios, handed to sceneTest's runner after testCore — the same case contract, plus
// the optional `draw(ctx, t)`: a scenario stands a level up in setup, runs its own tick loop in
// `frame` for `frames` REAL frames (the tick count comes from real frame time, so SimClock's
// cliff shows), draws it through the Core debug passes (no sprite — Core only), samples what a
// frame costs (`t.sample`, reported as a distribution) and asserts what must HOLD under load —
// never a time: a time is a sample, an assertion is a fact (no starvation, no overlap, no NaN).
// The one screenshot per scenario is for eyes; the log line is the record.

const CELL = 32;
const COLS = 64; // 2048 px square
const ROWS = 64;
const AGENTS = 500; // the colony's entity count, all of them movers
const WALLS = 60; // random rects of 1-6 cells
const HALF = 6; // agent half-size (12 px bodies, under the broadphase's 64 px cell)
const SPEED = 96; // px/s
const ARRIVE = 8; // px from the goal that counts as arrived
const REPLAN = 240; // ticks between an agent's replans — ~2 requests/tick over 500 agents, under the budget
const FRAMES = 300; // ~5 s at 60 fps, longer past the cliff
const SHOT_FRAME = 150;
const OVERLAP_EVERY = 60; // frames between the body-vs-wall sweeps (500 × ~80 rect tests each)

/**
 * Bodies overlapping a static, past a sub-pixel tolerance (the resolver parks a body ON a face).
 * Read after the solid pass and before the separation push — the one point where zero must hold.
 */
function _stressOverlaps(s) {
  const statics = SolidSystem.statics(s);
  const rect = AABB.rect();
  let overlaps = 0;
  s.forEach(["StressAgent", Position, BBox], (id, ag, pos, box) => {
    AABB.edgesInto(pos, box, rect);
    for (let k = 0; k < statics.length; k++) {
      const st = statics[k];
      if (
        rect.x2 > st.x1 + 0.01 &&
        st.x2 > rect.x1 + 0.01 &&
        rect.y2 > st.y1 + 0.01 &&
        st.y2 > rect.y1 + 0.01
      )
        overlaps += 1;
    }
  });
  return overlaps;
}

/** Park–Miller LCG: reproducible layouts without the shared GML stream (docs/GMRT.md → Math.random). */
function _stressRand(seed) {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

globalThis.testStress = {
  CASES: [
    {
      id: "stress.pathfind",
      frames: FRAMES,
      setup(ctx) {
        const grid = new LevelGrid({
          cellWidth: CELL,
          cellHeight: CELL,
          cols: COLS,
          rows: ROWS,
        });
        const layer = new TileLayer(COLS, ROWS, { emptyCost: 1 });
        grid.insert(layer);
        const level = new Level({ id: "stress", grid, capacity: 1024 });
        const s = level.entities;
        ctx.level = level;
        ctx.grid = grid;
        ctx.entities = s;

        // the maze: random wall rects, remeshed into kinematic colliders, stamped into the nav grid
        const rand = _stressRand(12345);
        const rock = new TileType({ id: "stress_rock", pathCost: null });
        for (let w = 0; w < WALLS; w++) {
          const x0 = 1 + Math.floor(rand() * (COLS - 8));
          const y0 = 1 + Math.floor(rand() * (ROWS - 8));
          const cw = 1 + Math.floor(rand() * 6);
          const ch = 1 + Math.floor(rand() * 6);
          for (let y = y0; y < y0 + ch; y++)
            for (let x = x0; x < x0 + cw; x++) TileEdit.set(layer, x, y, rock);
        }
        ctx.colliders = [];
        TileEdit.remesh(s, grid, layer, ctx.colliders);
        ctx.nav = new NavGrid(grid);
        ctx.nav.sync();
        ctx.nav.stamp(SolidSystem.statics(s)); // once: the walls never change
        MotionPlanner.setGrid(ctx.nav.grid);
        PathFollow.bind(null); // every cell costs 1
        s.broadphase = new Broadphase(COLS * CELL, ROWS * CELL, 64);

        // the agents, each on a free cell with a free-cell goal
        const free = [];
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++)
            if (!layer.get(x, y)) free.push(x + y * COLS);
        ctx.free = free;
        const pick = () => {
          const idx = free[Math.floor(rand() * free.length)];
          return grid.gridToWorld(idx % COLS, Math.floor(idx / COLS));
        };
        ctx.pick = pick;
        for (let i = 0; i < AGENTS; i++) {
          const at = pick();
          const goal = pick();
          const id = s.create();
          s.add(id, Position, { x: at.x, y: at.y, z: 0 });
          s.add(id, BBox, {
            x: -HALF,
            y: -HALF,
            width: HALF * 2,
            height: HALF * 2,
          });
          s.add(id, Collision, { solid: true });
          s.add(id, Velocity, { x: 0, y: 0, z: 0 });
          // the walker's bag: PathFollow.target's pathCd/pathRate throttle plus the goal + tallies
          s.add(id, "StressAgent", {
            tx: goal.x,
            ty: goal.y,
            pathCd: 0,
            pathRate: REPLAN,
            trips: 0,
            served: false,
          });
        }

        // a top-down ortho camera framing the whole level, and the debug passes over it
        const sw = surface_get_width(application_surface);
        const sh = surface_get_height(application_surface);
        const cx = (COLS * CELL) / 2;
        const cy = (ROWS * CELL) / 2;
        ctx.camera = new Camera({ projection: CAMERA_PROJECTION.ORTHO })
          .setFrom(cx, cy, -2000)
          .setTo(cx, cy, 0)
          .setUp(0, 1, 0)
          .setSize((ROWS * CELL * sw) / sh, ROWS * CELL);
        ctx.camera.assign(0);
        ctx.renderer = new Renderer();
        ctx.renderer.insert(
          new RenderGrid(grid, { camera: ctx.camera, color: c_dkgray }),
        );
        // the path overlay draws 500 paths of draw_line (~16 ms a frame), so it is on for the
        // screenshot frame only — a scenario's draw must stay cheap or it inflates the tick count
        ctx.paths = new RenderDebugPath(grid);
        ctx.paths.enabled = false;
        ctx.renderer.insert(ctx.paths);
        ctx.renderer.insert(new RenderDebugEntity());
        ctx.overlaps = 0;
        SimClock.reset();
      },
      frame(ctx, i, t) {
        const t0 = get_timer();
        const s = ctx.entities;
        const grid = ctx.grid;
        const pick = ctx.pick;
        let steerUs = 0;
        let pathUs = 0;
        let solidUs = 0;
        let sepUs = 0;
        ctx.nav.sync(); // a no-op here, kept so the loop has a real scene's shape
        const ticks = SimClock.advance();
        for (let k = 0; k < ticks; k++) {
          InterpolationSystem.snapshot(s);
          let t1 = get_timer();
          // the walkers: arrive → new goal; else steer at PathFollow's movement point
          s.forEach(["StressAgent", Position, Velocity], (id, ag, pos, vel) => {
            const gx = ag.tx - pos.x;
            const gy = ag.ty - pos.y;
            if (gx * gx + gy * gy < ARRIVE * ARRIVE) {
              ag.trips += 1;
              PathFollow.clear(s, id);
              ag.pathCd = 0;
              const goal = pick();
              ag.tx = goal.x;
              ag.ty = goal.y;
              vel.x = 0;
              vel.y = 0;
              return;
            }
            const mp = PathFollow.target(s, grid, id, ag, pos, ag.tx, ag.ty);
            if (!ag.served) if (s.has(id, PathResponse)) ag.served = true;
            const mx = mp.x - pos.x;
            const my = mp.y - pos.y;
            const d = Math.sqrt(mx * mx + my * my);
            const sp = SPEED * PathFollow.speedScale(pos.x, pos.y);
            if (d > 1e-6) {
              vel.x = (mx / d) * sp;
              vel.y = (my / d) * sp;
            } else {
              vel.x = 0;
              vel.y = 0;
            }
          });
          let t2 = get_timer();
          steerUs += t2 - t1;
          PathfindingSystem.update(s);
          t1 = get_timer();
          pathUs += t1 - t2;
          SolidSystem.update(s);
          t2 = get_timer();
          solidUs += t2 - t1;
          // THE invariant under load, read where it must hold: after the solid pass and before
          // the separation push (which the next solid pass undoes), no body is inside a wall
          if (k === 0)
            if (i % OVERLAP_EVERY === 0) ctx.overlaps += _stressOverlaps(s);
          SeparationSystem.update(s);
          sepUs += get_timer() - t2;
          s.flush();
        }
        t.sample("stress.pathfind.update", get_timer() - t0); // us per frame, the phases below inside it
        t.sample("stress.pathfind.steer", steerUs);
        t.sample("stress.pathfind.path", pathUs);
        t.sample("stress.pathfind.solid", solidUs);
        t.sample("stress.pathfind.separation", sepUs);
        t.sample("stress.pathfind.ticks", ticks);
        t.sample("stress.pathfind.pending", s.query(PathRequest).length); // the planner's backlog
        ctx.paths.enabled = i === SHOT_FRAME;
        if (i === SHOT_FRAME) Screenshot.take("stress-pathfind.png");
      },
      draw(ctx, t) {
        const t0 = get_timer();
        ctx.camera.update();
        ctx.renderer.draw(ctx.entities);
        t.sample("stress.pathfind.draw", get_timer() - t0);
      },
      verify(ctx, t) {
        const s = ctx.entities;
        let unserved = 0;
        let trips = 0;
        let nan = 0;
        s.forEach(["StressAgent", Position], (id, ag, pos) => {
          if (!ag.served) unserved += 1;
          trips += ag.trips;
          if (pos.x !== pos.x) nan += 1;
          if (pos.y !== pos.y) nan += 1;
        });
        t.sample("stress.pathfind.trips", trips);
        t.eq(
          unserved,
          0,
          "every agent had a path served within the run (no budget starvation)",
        );
        t.ok(trips > 0, "agents arrive and re-target");
        t.eq(nan, 0, "no coordinate went NaN under load");
        t.eq(ctx.overlaps, 0, "no body inside a wall after any solid pass");
        t.eq(
          s.count(),
          AGENTS + ctx.colliders.length,
          "no entity leaked or vanished",
        );
      },
      teardown(ctx) {
        ctx.renderer.destroy();
        ctx.camera.destroy(); // unassigns the view, restoring default room rendering
        ctx.nav.destroy();
        ctx.level.destroy();
      },
    },
  ],
};
