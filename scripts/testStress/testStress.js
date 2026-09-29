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
const CHURN = 16; // short-lived colliders spawned a frame
const TTL_MIN = 0.1; // s
const TTL_SPAN = 0.4; // s over the minimum, so the churn's live count stays well under capacity
const SHOOTERS = 8; // volleys a frame
const PELLETS = 8; // casts a volley
const SPREAD = 0.3; // rad, a volley's cone
const RANGE = 384; // px

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
  ctx.agents = [];
  for (let i = 0; i < AGENTS; i++) {
    const at = pick();
    const goal = pick();
    const id = s.create();
    ctx.agents.push(id);
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

/**
 * What the shared load must end with, whatever the scenario put it through; `extra` is what the
 * scenario keeps live beside it.
 */
function _stressVerify(ctx, t, extra = 0) {
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
    AGENTS + 2 + extra, // + the camera entity and the level's own
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

/** The entities carrying `token`. */
function _stressCount(entities, token) {
  let n = 0;
  entities.forEach([token], () => {
    n += 1;
  });
  return n;
}

/** Spawns CHURN non-solid colliders on random free cells, each expiring on its own Lifetime. */
function _stressSpawn(ctx) {
  const s = ctx.entities;
  const rand = ctx.churnRand;
  const free = ctx.free;
  const grid = ctx.grid;
  const ring = ctx.spawned;
  for (let k = 0; k < CHURN; k++) {
    const idx = free[Math.floor(rand() * free.length)];
    const at = grid.gridToWorld(idx % COLS, Math.floor(idx / COLS));
    const id = s.create();
    s.add(id, Position, { x: at.x, y: at.y, z: 0 });
    s.add(id, BBox, { x: -2, y: -2, width: 4, height: 4 });
    s.add(id, Collision, { solid: false });
    s.add(id, Lifetime, { secs: TTL_MIN + rand() * TTL_SPAN });
    s.add(id, "StressChurn", { self: id });
    ring[ctx.ringAt] = id;
    ctx.ringAt = (ctx.ringAt + 1) % ring.length;
  }
}

/**
 * Recent handles whose validity disagrees with the row their slot holds: a live one must name its
 * own row, and a dead one never its slot's next owner.
 */
function _stressHandles(ctx) {
  const s = ctx.entities;
  const ring = ctx.spawned;
  let bad = 0;
  for (let k = 0; k < ring.length; k++) {
    const id = ring[k];
    if (id < 0) continue;
    const row = s.get(id, "StressChurn");
    const owns = row === undefined ? false : row.self === id;
    if (s.isValid(id) !== owns) bad += 1;
  }
  return bad;
}

/** Puppet instances beyond the ones the store's Instance rows hold. */
function _stressPuppets(ctx) {
  return Math.abs(
    instance_number(Puppet) - ctx.puppets - _stressCount(ctx.entities, Instance),
  );
}

/** SHOOTERS volleys of PELLETS casts from random agents, each segment and hit kept for audit. */
function _stressVolley(ctx) {
  const level = ctx.level;
  const s = ctx.entities;
  const rand = ctx.castRand;
  const agents = ctx.agents;
  const segs = ctx.segs;
  const hits = ctx.hits;
  let w = 0;
  let n = 0;
  for (let k = 0; k < SHOOTERS; k++) {
    const id = agents[Math.floor(rand() * agents.length)];
    const pos = s.get(id, Position);
    const aim = rand() * Math.PI * 2;
    for (let p = 0; p < PELLETS; p++) {
      const a = aim + (rand() - 0.5) * SPREAD;
      const x1 = pos.x + Math.cos(a) * RANGE;
      const y1 = pos.y + Math.sin(a) * RANGE;
      const hit = Query.cast(level, pos.x, pos.y, x1, y1, { ignore: id });
      if (hit !== null) {
        if (hit.id === level.self) ctx.walls += 1;
        else ctx.bodies += 1;
      }
      hits[n++] = hit;
      segs[w++] = id;
      segs[w++] = pos.x;
      segs[w++] = pos.y;
      segs[w++] = x1;
      segs[w++] = y1;
    }
  }
  segs.length = w;
  hits.length = n;
}

/**
 * Kept casts that break the cast contract, each segment re-cast whole: the nearest hit is the
 * first of all of them, every `t` lies on the segment, a cell hit enters a blocking cell, and a
 * body hit is a live collider other than the shooter.
 */
function _stressCasts(ctx) {
  const level = ctx.level;
  const s = ctx.entities;
  const solid = SolidSystem.tiles(level);
  const segs = ctx.segs;
  const hits = ctx.hits;
  let bad = 0;
  for (let k = 0; k < hits.length; k++) {
    const shooter = segs[k * 5];
    const x0 = segs[k * 5 + 1];
    const y0 = segs[k * 5 + 2];
    const dx = segs[k * 5 + 3] - x0;
    const dy = segs[k * 5 + 4] - y0;
    const hit = hits[k];
    const all = Query.castAll(level, x0, y0, x0 + dx, y0 + dy, { ignore: shooter });
    if (hit === null) {
      if (all.length > 0) bad += 1;
      continue;
    }
    if (all.length === 0) {
      bad += 1;
      continue;
    }
    if (all[0].t !== hit.t) bad += 1;
    for (let j = 0; j < all.length; j++) {
      const h = all[j];
      if (!(h.t >= 0)) bad += 1;
      if (h.t > 1) bad += 1;
      if (h.id === level.self) {
        // the cell entered lies past the face the normal names — a step along the ray from a
        // point near a corner could land in the diagonal neighbour instead
        let cx = Math.floor(h.x / CELL);
        let cy = Math.floor(h.y / CELL);
        if (h.t > 0) {
          if (h.nx !== 0) cx = Math.round(h.x / CELL) - (h.nx > 0 ? 1 : 0);
          else cy = Math.round(h.y / CELL) - (h.ny > 0 ? 1 : 0);
        }
        if (!solid.at(cx, cy)) bad += 1;
      } else if (h.id === shooter) bad += 1;
      else if (!s.isValid(h.id)) bad += 1;
      else if (!s.has(h.id, Collision)) bad += 1;
    }
  }
  return bad;
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
  {
    // the shared load while short-lived colliders spawn and expire every frame, so the free
    // list turns over many times and every expiry releases a puppet
    id: "stress.churn",
    frames: FRAMES,
    setup(ctx) {
      _stressWorld(ctx, "stress.churn");
      ctx.churnRand = _stressRand(24680);
      ctx.spawned = new Array(CHURN * 60).fill(-1); // a second's spawns
      ctx.ringAt = 0;
      PuppetSystem.probe(); // made on first use, so made before the count
      ctx.puppets = instance_number(Puppet);
      ctx.peak = ctx.entities.count();
      ctx.stale = 0;
      ctx.leaks = 0;
    },
    frame(ctx, i, t) {
      const s = ctx.entities;
      let t0 = get_timer();
      _stressSpawn(ctx);
      t.sample("stress.churn.spawn", get_timer() - t0);
      ctx.peak = Math.max(ctx.peak, s.count());
      _stressStep(ctx, i, t);
      t0 = get_timer();
      LifetimeSystem.update(ctx.level);
      const t1 = get_timer();
      s.flush();
      t.sample("stress.churn.expire", t1 - t0);
      t.sample("stress.churn.flush", get_timer() - t1);
      t.sample("stress.churn.live", s.count() - AGENTS - 2);
      if (i % AUDIT_EVERY === 0) {
        ctx.stale += _stressHandles(ctx);
        ctx.leaks += _stressPuppets(ctx);
      }
    },
    draw: _stressDraw,
    verify(ctx, t) {
      const s = ctx.entities;
      _stressVerify(ctx, t, _stressCount(s, "StressChurn"));
      t.eq(
        ctx.stale + _stressHandles(ctx),
        0,
        "a live handle names its own row and a dead one never its slot's next owner",
      );
      t.eq(
        ctx.leaks + _stressPuppets(ctx),
        0,
        "every expired collider's puppet went with it",
      );
      t.eq(s.ids.next, ctx.peak, "a freed slot is reused before a new one is added");
    },
    teardown: _stressTeardown,
  },
  {
    // the shared load under hitscan volleys, each cast over the colliders and the blocking cells
    id: "stress.cast",
    frames: FRAMES,
    setup(ctx) {
      _stressWorld(ctx, "stress.cast");
      ctx.castRand = _stressRand(13579);
      ctx.segs = [];
      ctx.hits = [];
      ctx.walls = 0;
      ctx.bodies = 0;
      ctx.bad = 0;
    },
    frame(ctx, i, t) {
      // after the step, as a shot resolves against where the bodies moved
      _stressStep(ctx, i, t);
      const walls = ctx.walls;
      const bodies = ctx.bodies;
      const t0 = get_timer();
      _stressVolley(ctx);
      t.sample("stress.cast.volley", get_timer() - t0);
      t.sample("stress.cast.walls", ctx.walls - walls);
      t.sample("stress.cast.bodies", ctx.bodies - bodies);
      if (i % AUDIT_EVERY === 0) ctx.bad += _stressCasts(ctx);
    },
    draw: _stressDraw,
    verify(ctx, t) {
      _stressVerify(ctx, t);
      t.eq(ctx.bad, 0, "every audited cast keeps the cast contract");
      t.ok(ctx.walls > 0, "volleys hit walls");
      t.ok(ctx.bodies > 0, "volleys hit bodies");
    },
    teardown: _stressTeardown,
  },
]);
