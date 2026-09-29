// Stress scenarios: each runs its own sim step for real frames, so a slow frame takes its bigger
// step, draws through the Core debug passes only, samples what a frame costs and asserts what
// must hold under load. The screenshot is for eyes; the log line is the record.

const CELL = 32;
const COLS = 64;
const ROWS = 64;
const AGENTS = 500; // the colony's entity count, all of them movers
const WALLS = 60;
const HALF = 6; // px, bodies under the broadphase cell
const SPEED = 96; // px/s
const ARRIVE = 16; // px, beyond a waypoint's 0.4-cell skip
const REPLAN = 4; // s — ~2 requests a frame over all agents, under the budget
const FRAMES = 300;
const SHOT_FRAME = 150;
const AUDIT_EVERY = 60; // frames between the invariant audits
const EDITS = 16; // rocks raised a frame and as many torn down, so the edit logs wrap every few frames
const LIFE = 15; // frames a raised rock stands

/**
 * Overlaps past half a pixel only: mask edges round to whole pixels (docs/GMRT.md), so a body may
 * rest that deep in a face.
 */
function _stressOverlaps(level) {
  const tiles = SolidSystem.tiles(level);
  let overlaps = 0;
  level.entities.forEach(["StressAgent", Position, BBox], (id, ag, pos, box) => {
    const x1 = pos.x + box.x + 0.5;
    const y1 = pos.y + box.y + 0.5;
    const gx0 = Math.floor(x1 / CELL);
    const gy0 = Math.floor(y1 / CELL);
    const gx1 = Math.ceil((x1 + box.width - 1) / CELL) - 1; // a far edge on a cell's face is out of it
    const gy1 = Math.ceil((y1 + box.height - 1) / CELL) - 1;
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) if (tiles.at(gx, gy)) overlaps += 1;
  });
  return overlaps;
}

/** Cells where a mirror of the layers disagrees with them: the solid mask or the nav costs. */
function _stressStale(level) {
  const grid = level.grid;
  const solid = SolidSystem.tiles(level);
  const nav = PathfindingSystem.nav(level).grid.data;
  let stale = 0;
  for (let y = 0; y < grid.rows; y++)
    for (let x = 0; x < grid.cols; x++) {
      const cost = grid.costAt(x, y);
      if (solid.at(x, y) !== (cost === Infinity)) stale += 1;
      if (nav[x + y * grid.cols] !== cost) stale += 1;
    }
  return stale;
}

/** Park–Miller LCG: reproducible layouts without the shared random stream (docs/GMRT.md). */
function _stressRand(seed) {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

/** The shared load: a walled level of AGENTS path-following movers under a top-down camera. */
function _stressWorld(ctx, id) {
  ctx.id = id;
  const grid = new LevelGrid({
    cellWidth: CELL,
    cellHeight: CELL,
    cols: COLS,
    rows: ROWS,
  });
  const layer = new TileLayer(grid, { emptyCost: 1 });
  grid.insert(layer);
  const level = new Level({ id: "stress", grid, capacity: 1024 });
  const s = level.entities;
  ctx.level = level;
  ctx.grid = grid;
  ctx.layer = layer;
  ctx.entities = s;

  const rand = _stressRand(12345);
  const rock = new TileType({ id: 1, pathCost: null });
  ctx.rock = rock;
  for (let w = 0; w < WALLS; w++) {
    const x0 = 1 + Math.floor(rand() * (COLS - 8));
    const y0 = 1 + Math.floor(rand() * (ROWS - 8));
    const cw = 1 + Math.floor(rand() * 6);
    const ch = 1 + Math.floor(rand() * 6);
    for (let y = y0; y < y0 + ch; y++)
      for (let x = x0; x < x0 + cw; x++) layer.set(x, y, rock);
  }
  ctx.nav = PathfindingSystem.nav(level);

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
    s.add(id, "StressAgent", {
      tx: goal.x,
      ty: goal.y,
      pathCd: 0,
      pathRate: REPLAN,
      trips: 0,
      served: false,
    });
  }

  // a top-down camera framing the whole level.
  const sh = surface_get_height(application_surface);
  Cameras.create(s, {
    x: (COLS * CELL) / 2,
    y: (ROWS * CELL) / 2,
    dist: 2000,
    zoom: sh / (ROWS * CELL),
  });
  CameraSystem.view(level).assign(0);
  ctx.camera = CameraSystem.view(level);
  ctx.renderer = new Renderer();
  ctx.renderer.insert(
    new RenderGrid(grid, { camera: ctx.camera, color: c_dkgray }),
  );
  // the path overlay is costly, so it is on for the screenshot frame only — a scenario's
  // draw must stay cheap or it inflates the tick count.
  ctx.paths = new RenderDebugPath(grid);
  ctx.paths.enabled = false;
  ctx.renderer.insert(ctx.paths);
  ctx.renderer.insert(new RenderDebugEntity());
  ctx.overlaps = 0;
}

/** One sim step of the shared load, each phase sampled under the scenario's id. */
function _stressStep(ctx, i, t) {
  const t0 = get_timer();
  const s = ctx.entities;
  const grid = ctx.grid;
  const pick = ctx.pick;
  const key = ctx.id;
  let steerUs = 0;
  let pathUs = 0;
  let solidUs = 0;
  let sepUs = 0;
  let t1 = get_timer();
  PuppetSystem.update(ctx.level);
  const puppetUs = get_timer() - t1;
  t1 = get_timer();
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
    const sp = SPEED * PathFollow.speedScale(grid, pos.x, pos.y); // every cell costs 1
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
  PathfindingSystem.update(ctx.level);
  t1 = get_timer();
  pathUs += t1 - t2;
  SolidSystem.update(ctx.level);
  t2 = get_timer();
  solidUs += t2 - t1;
  // the invariant under load, read where it must hold: after the solid pass and before the
  // separation push, which the next solid pass undoes.
  if (i % AUDIT_EVERY === 0) ctx.overlaps += _stressOverlaps(ctx.level);
  SeparationSystem.update(ctx.level);
  sepUs += get_timer() - t2;
  s.flush();
  t.sample(key + ".update", get_timer() - t0); // us, the phases below inside it
  t.sample(key + ".puppet", puppetUs);
  t.sample(key + ".steer", steerUs);
  t.sample(key + ".path", pathUs);
  t.sample(key + ".solid", solidUs);
  t.sample(key + ".separation", sepUs);
  t.sample(key + ".pending", s.query(PathRequest).length);
  ctx.paths.enabled = i === SHOT_FRAME;
  if (i === SHOT_FRAME) Screenshot.take(key.replace(".", "-") + ".png");
}

function _stressDraw(ctx, t) {
  const t0 = get_timer();
  CameraSystem.apply(ctx.level);
  ctx.renderer.draw(ctx.entities);
  t.sample(ctx.id + ".draw", get_timer() - t0);
}

/** What the shared load must end with, whatever the scenario put it through. */
function _stressVerify(ctx, t) {
  const s = ctx.entities;
  let trips = 0;
  let nan = 0;
  s.forEach(["StressAgent", Position], (id, ag, pos) => {
    trips += ag.trips;
    if (pos.x !== pos.x) nan += 1;
    if (pos.y !== pos.y) nan += 1;
  });
  t.sample(ctx.id + ".trips", trips);
  t.ok(trips > 0, "agents arrive and re-target");
  t.eq(nan, 0, "no coordinate went NaN under load");
  t.eq(ctx.overlaps, 0, "no body inside a wall after any solid pass");
  t.eq(
    s.count(),
    AGENTS + 2, // + the camera entity and the level's own
    "no entity leaked or vanished",
  );
}

function _stressTeardown(ctx) {
  ctx.renderer.destroy();
  ctx.level.destroy();
}

/** Stamps `ctx.stamp` on every cell within a pixel of an agent's box. */
function _stressMark(ctx) {
  const occ = ctx.occ;
  const stamp = ++ctx.stamp;
  ctx.entities.forEach(["StressAgent", Position, BBox], (id, ag, pos, box) => {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    const gx0 = Math.max(0, Math.floor((x1 - 1) / CELL));
    const gy0 = Math.max(0, Math.floor((y1 - 1) / CELL));
    const gx1 = Math.min(COLS - 1, Math.floor((x1 + box.width + 1) / CELL));
    const gy1 = Math.min(ROWS - 1, Math.floor((y1 + box.height + 1) / CELL));
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) occ[gx + gy * COLS] = stamp;
  });
}

/**
 * Tears down the rocks raised LIFE frames ago, then raises EDITS on random empty cells that no
 * body marks, so the storm's walls stay a bounded share of the level.
 */
function _stressEdit(ctx) {
  const layer = ctx.layer;
  const occ = ctx.occ;
  const stamp = ctx.stamp;
  const rand = ctx.editRand;
  const raised = ctx.raised;
  const at = (ctx.batch % LIFE) * EDITS;
  ctx.batch += 1;
  for (let k = at; k < at + EDITS; k++) {
    const idx = raised[k];
    if (idx >= 0) layer.clear(idx % COLS, Math.floor(idx / COLS));
    raised[k] = -1;
  }
  for (let k = at; k < at + EDITS; k++) {
    const idx = Math.floor(rand() * COLS * ROWS);
    if (occ[idx] === stamp) continue;
    const x = idx % COLS;
    const y = Math.floor(idx / COLS);
    if (layer.get(x, y)) continue;
    layer.set(x, y, ctx.rock);
    raised[k] = idx;
  }
}

Test.register(Test.STRESS, [
  {
    id: "stress.pathfind",
    frames: FRAMES,
    setup(ctx) {
      _stressWorld(ctx, "stress.pathfind");
    },
    frame: _stressStep,
    draw: _stressDraw,
    verify(ctx, t) {
      _stressVerify(ctx, t);
      let unserved = 0;
      ctx.entities.forEach(["StressAgent"], (id, ag) => {
        if (!ag.served) unserved += 1;
      });
      t.eq(
        unserved,
        0,
        "every agent had a path served within the run (no budget starvation)",
      );
    },
    teardown: _stressTeardown,
  },
  {
    // the shared load while walls rise and fall every frame, so each mirror of the layers
    // replays its edit log per frame; a raised rock may close a route while a request waits,
    // so a walker may go the run unserved
    id: "stress.tiles",
    frames: FRAMES,
    setup(ctx) {
      _stressWorld(ctx, "stress.tiles");
      ctx.editRand = _stressRand(67890);
      ctx.occ = new Array(COLS * ROWS).fill(0);
      ctx.stamp = 0;
      ctx.raised = new Array(EDITS * LIFE).fill(-1);
      ctx.batch = 0;
      ctx.stale = 0;
    },
    frame(ctx, i, t) {
      // the edits land before the step, as a build lands before the sim
      _stressMark(ctx);
      _stressEdit(ctx);
      _stressStep(ctx, i, t);
      if (i % AUDIT_EVERY === 0) ctx.stale += _stressStale(ctx.level);
    },
    draw: _stressDraw,
    verify(ctx, t) {
      _stressVerify(ctx, t);
      t.eq(
        ctx.stale + _stressStale(ctx.level),
        0,
        "the solid mask and the nav costs match the layers at every audit",
      );
    },
    teardown: _stressTeardown,
  },
]);
