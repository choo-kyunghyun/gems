/**
 * Bodies it moves must NOT also be in MovementSystem. Statics are bucketed into a spatial
 * grid (_gridRebuild) so each body tests only its local cells, not every static — see _resolve.
 *
 * The snapshot + grid are the level's CACHE (`level.cache` under KEY, seeded on first use and freed
 * with the level), kept across ticks — which is what makes a whole map's worth of statics affordable:
 * re-deriving them each tick costs with the LEVEL's size (every wall, water rect and boulder, plus
 * a bucket per cell they span), while the body loop that actually resolves collisions costs with
 * the number of movers. The cache holds a STATIC IS STATIC premise: a kinematic solid never moves
 * or resizes in place. Every one in the project comes from a level build, a tile remesh or a prop
 * spawn, and each of those replaces entities rather than moving them — so a changed id set is the
 * whole signal, and it is checked every tick. Give a solid a Velocity (MovementSystem's job) and
 * this would go stale; call invalidate(level) if you must mutate one in place (a door's `solid`).
 *
 * The snapshot + grid also serve segment queries: Raycast reads the statics through `statics`/`walk`
 * and the dynamic bodies through `eachBody`, so a cast costs the cells it crosses plus the movers,
 * not the map's collider count. Every entry point takes the LEVEL, whose cache it reads.
 */
globalThis.SolidSystem = {
  KEY: "solid", // its Level.cache key
  maxStep: 8, // keep below thinnest collider to prevent tunneling
  // the static grid's cell (px): insert AND query by AABB SPAN (every cell an AABB overlaps), so
  // there's no cell-size constraint (unlike the center-bucket Broadphase) and huge statics just
  // occupy many cells — a pure perf knob
  cell: 64,

  // Injected: `(level, statics)` fired when the static set CHANGES (not on every snapshot — a
  // body spawn refreshes the fingerprint without touching a wall). The one place the kinematic
  // solids are known to have moved, so anything mirroring them (NavGrid) refreshes here, not by
  // polling. Wired by the scene that owns the nav grid; null = nobody listening.
  onStatics: null,

  // Scratch reused every tick: the candidate list the cache fingerprints against, and the
  // mover's rect (_resolve runs twice per sub-step per body — docs/ARCHITECTURE.md → Hot-path idioms).
  _candidates: [],
  _rect: AABB.rect(),

  /**
   * The level's cache record, seeded empty: `ids` the id set the snapshot was taken from (the
   * fingerprint; null = never, or invalidated), `statics` the baked `{ id, x1, y1, x2, y2 }`
   * records _resolve reads, the bucket grid over them (`cols`/`rows`/`buckets`, parallel-array
   * buckets — GMRT: no object-keyed Map/Set — and `minX`/`minY`, how far the statics overhang
   * below the grid's origin: the border boxes sit at -cell..0, a static there is clamped into
   * the edge cell, and walk's clip reaches down to it), and the dynamic solid bodies as of the
   * last refresh — parallel arrays of the component objects themselves, reused (a stale tail
   * past `bodyCount` is never read) — the one body list update's integrate loop, eachBody and
   * its readers share; `bodyVels` holds undefined for a body without Velocity (listed for a
   * cast, never moved).
   */
  cache(level) {
    return level.cache.of(SolidSystem, SolidSystem._seed);
  },

  _seed() {
    return {
      ids: null,
      statics: [],
      cols: 0,
      rows: 0,
      buckets: [],
      minX: 0,
      minY: 0,
      bodyIds: [],
      bodyCols: [],
      bodyPos: [],
      bodyBoxes: [],
      bodyVels: [],
      bodyCount: 0,
    };
  },

  /** Force the level's next update to re-derive the static snapshot (see the class doc's premise). */
  invalidate(level) {
    const c = level.cache.get(SolidSystem);
    if (c !== undefined) c.ids = null;
  },

  /**
   * THE bare static collider (world px), the form every wall, water rect and level edge takes:
   * Position at the box's TOP-LEFT, BBox anchored (0,0) spanning w×h, and nothing else — no
   * Visual, so the caller either draws it as tiles or leaves it invisible (water, the border).
   * Kinematic, so bodies collide against it here and NavGrid stamps it as blocked; made by
   * replacement, never moved or resized (the cache premise above).
   */
  box(entities, x, y, w, h) {
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y, z: 0 });
    entities.add(id, BBox, { x: 0, y: 0, width: w, height: h });
    entities.add(id, Collision, {
      solid: true,
      kinematic: true,
    });
    return id;
  },

  /** One box() per [gx, gy, wCells, hCells] grid rect (Grid.meshRects' form), ids pushed onto `out`. */
  boxes(entities, rects, cellW, cellH, out) {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      out.push(
        SolidSystem.box(
          entities,
          r[0] * cellW,
          r[1] * cellH,
          r[2] * cellW,
          r[3] * cellH,
        ),
      );
    }
    return out;
  },

  /**
   * The static snapshot for a reader outside update() (Raycast): `{ id, x1, y1, x2, y2 }` records,
   * indexed by the bucket grid `walk` visits. As of the last update() on this level — at most one
   * tick stale, since a tick's brains fire before update() (sceneColony.update's order), so a static
   * removed this frame may linger with a freed id: validate a hit's id. A level this system has not
   * updated yet (a map's first tick) is snapshotted here.
   */
  statics(level) {
    const c = SolidSystem.cache(level);
    if (c.ids === null) SolidSystem._refresh(level, c);
    return c.statics;
  },

  /**
   * Visit the bucket grid's cells along a segment in entry order — `fn(bucket, t)` gets a cell's
   * static indexes and the segment parameter where it enters the cell; return false to stop early.
   * The segment is clipped to the statics' extent — the grid rect plus the overhang below 0 the
   * edge cells absorb (minX/minY), where the walk pins to the edge cell — so nothing is missed;
   * a multi-cell static appears in every cell it spans (and an edge cell may be visited twice), so
   * the caller dedupes.
   */
  walk(level, x0, y0, x1, y1, fn) {
    const c = SolidSystem.cache(level);
    const cell = SolidSystem.cell;
    const cols = c.cols;
    const rows = c.rows;
    const dx = x1 - x0;
    const dy = y1 - y0;

    // clip the segment's parameter range to the statics' extent
    let t0 = 0;
    let t1 = 1;
    if (dx !== 0) {
      let ta = (c.minX - x0) / dx;
      let tb = (cols * cell - x0) / dx;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    } else if (x0 < c.minX || x0 >= cols * cell) return;
    if (dy !== 0) {
      let ta = (c.minY - y0) / dy;
      let tb = (rows * cell - y0) / dy;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    } else if (y0 < c.minY || y0 >= rows * cell) return;
    if (t0 > t1) return;

    let gx = SolidSystem._clampCol(c, Math.floor((x0 + dx * t0) / cell));
    let gy = SolidSystem._clampRow(c, Math.floor((y0 + dy * t0) / cell));
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    // parameter at the next x / y cell boundary, and the parameter width of one cell
    let tMaxX =
      dx > 0
        ? ((gx + 1) * cell - x0) / dx
        : dx < 0
          ? (gx * cell - x0) / dx
          : Infinity;
    let tMaxY =
      dy > 0
        ? ((gy + 1) * cell - y0) / dy
        : dy < 0
          ? (gy * cell - y0) / dy
          : Infinity;
    const tDeltaX = dx !== 0 ? cell / Math.abs(dx) : Infinity;
    const tDeltaY = dy !== 0 ? cell / Math.abs(dy) : Infinity;

    let t = t0;
    while (true) {
      // (no `for (;;)` — an empty for initializer fails the build, GMRT.md #15566)
      if (fn(c.buckets[gy * cols + gx], t) === false) return;
      if (tMaxX < tMaxY) {
        if (tMaxX > t1) return;
        t = tMaxX;
        tMaxX += tDeltaX;
        gx += stepX;
        if (gx >= cols) return;
        if (gx < 0) {
          // below the origin everything is the edge column's: pin, and step only in y from here
          gx = 0;
          tMaxX = Infinity;
        }
      } else {
        if (tMaxY > t1) return;
        t = tMaxY;
        tMaxY += tDeltaY;
        gy += stepY;
        if (gy >= rows) return;
        if (gy < 0) {
          gy = 0;
          tMaxY = Infinity;
        }
      }
    }
  },

  /**
   * Visit the dynamic solid bodies — every non-kinematic collider — as `fn(id, col, pos, box)`,
   * the component objects themselves so `solid` reads live (a corpse drops out of the hits the
   * frame it dies). As of the last refresh, like `statics`: a body removed since may linger
   * (validate the id), one spawned since is not listed until the next update(). A per-frame
   * consumer (SeparationSystem) therefore runs after update() in the same frame — the walk that
   * lists the bodies is the one update() takes, never a second one here.
   */
  eachBody(level, fn) {
    const c = SolidSystem.cache(level);
    if (c.ids === null) SolidSystem._refresh(level, c);
    const ids = c.bodyIds;
    const cols = c.bodyCols;
    const pos = c.bodyPos;
    const boxes = c.bodyBoxes;
    const n = c.bodyCount;
    for (let i = 0; i < n; i++) fn(ids[i], cols[i], pos[i], boxes[i]);
  },

  /**
   * Re-fingerprint the level's colliders and re-snapshot if the set moved; the same pass lists the
   * dynamic bodies for update's integrate loop and eachBody. THE collider walk of a tick: every
   * wall is a Collision carrier, so a walk costs the level's collider count, and this is the only
   * one. Velocity cannot join the walk's tokens (a static carries none, and the fingerprint needs
   * every static), so it is one `get` per BODY — the movers, not the walls.
   */
  _refresh(level, c) {
    const entities = level.entities;
    const ids = SolidSystem._candidates;
    const bIds = c.bodyIds;
    const bCols = c.bodyCols;
    const bPos = c.bodyPos;
    const bBoxes = c.bodyBoxes;
    const bVels = c.bodyVels;
    let w = 0;
    let b = 0;
    entities.forEach([Collision, Position, BBox], (id, col, pos, box) => {
      ids[w++] = id;
      if (col.kinematic) return;
      bIds[b] = id;
      bCols[b] = col;
      bPos[b] = pos;
      bBoxes[b] = box;
      bVels[b] = entities.get(id, Velocity);
      b++;
    });
    ids.length = w;
    c.bodyCount = b;
    if (!SolidSystem._fresh(c, ids)) SolidSystem._snapshot(level, c, ids);
  },

  update(level) {
    const dt = Time.step;
    const c = SolidSystem.cache(level);

    SolidSystem._refresh(level, c);
    const statics = c.statics;

    // integrate the bodies _refresh listed (non-kinematic already) — the moving solid ones
    const cols = c.bodyCols;
    const poss = c.bodyPos;
    const boxes = c.bodyBoxes;
    const vels = c.bodyVels;
    const n = c.bodyCount;
    for (let i = 0; i < n; i++) {
      const vel = vels[i];
      if (vel === undefined) continue;
      if (!cols[i].solid) continue;
      const pos = poss[i];
      const box = boxes[i];

      const dx = vel.x * dt;
      const dy = vel.y * dt;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SolidSystem.maxStep),
      );
      const sx = dx / steps;
      const sy = dy / steps;

      for (let s = 0; s < steps; s++) {
        pos.x += sx;
        if (SolidSystem._resolve(c, pos, box, statics, sx, true) !== 0)
          vel.x = 0;

        pos.y += sy;
        if (SolidSystem._resolve(c, pos, box, statics, sy, false) !== 0)
          vel.y = 0;
      }
    }
  },

  /**
   * push body out of overlapping statics along one axis (deepest correction wins).
   * `statics` is the cached snapshot (precomputed edges), so the loop is
   * flat field reads — keep it free of entities.get / AABB.of (the profiled hot spot). Scans only the
   * statics in the grid cells the body's post-move AABB overlaps (sub-stepping caps the move to
   * maxStep, so the current AABB captures every static this sub-step could hit). A multi-cell static
   * may be tested more than once — harmless: the overlap/deepest-correction body is idempotent.
   * returns sign of correction (+1 = pushed toward -, i.e. up/left; -1 = toward +; 0 = none).
   */
  _resolve(c, pos, box, statics, v, isX) {
    const a = AABB.edgesInto(pos, box, SolidSystem._rect);

    let correction = 0;

    // exact cell range an [x1,x2)×[y1,y2) AABB touches: floor(lo) .. ceil(hi)-1 (x2/y2 exclusive)
    const cell = SolidSystem.cell;
    const gx0 = SolidSystem._clampCol(c, Math.floor(a.x1 / cell));
    const gy0 = SolidSystem._clampRow(c, Math.floor(a.y1 / cell));
    const gx1 = SolidSystem._clampCol(c, Math.ceil(a.x2 / cell) - 1);
    const gy1 = SolidSystem._clampRow(c, Math.ceil(a.y2 / cell) - 1);
    const buckets = c.buckets;
    const cols = c.cols;

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const bucket = buckets[gy * cols + gx];
        for (let k = 0; k < bucket.length; k++) {
          const b = statics[bucket[k]];

          if (!AABB.overlap(a, b)) continue;

          const lo = isX ? a.x2 - b.x1 : a.y2 - b.y1; // overlap if pushed toward -
          const hi = isX ? b.x2 - a.x1 : b.y2 - a.y1; // overlap if pushed toward +
          let cc;
          if (v > 0) cc = -lo;
          else if (v < 0) cc = hi;
          else cc = lo < hi ? -lo : hi;

          if (Math.abs(cc) > Math.abs(correction)) correction = cc;
        }
      }
    }

    if (correction === 0) return 0;
    if (isX) pos.x += correction;
    else pos.y += correction;
    return correction < 0 ? 1 : -1;
  },

  /**
   * Is the cache still the truth? Same candidate ids in the same order — a walk's order only
   * moves when the set does (ComponentStore). An id compare over the candidates is a few hundred
   * int tests; re-deriving them is that many component lookups, AABB allocations and bucket inserts.
   */
  _fresh(c, ids) {
    const prev = c.ids;
    if (prev === null) return false;
    if (prev.length !== ids.length) return false;
    for (let i = 0; i < ids.length; i++) if (prev[i] !== ids[i]) return false;
    return true;
  },

  /**
   * Bake the kinematic solids into flat records: edges (plus the id, for a raycast's hit) so the
   * body×static resolve loop reads plain fields — no AABB.of / entities.get per test. Those per-test
   * Map lookups + edge allocs were ~70% of the colony's tick cost before the snapshot existed.
   */
  _snapshot(level, c, ids) {
    const entities = level.entities;
    const statics = [];
    for (let i = 0; i < ids.length; i++) {
      const col = entities.get(ids[i], Collision);
      if (!col.solid || !col.kinematic) continue;
      const e = AABB.of(entities, ids[i]);
      statics.push({
        id: ids[i],
        x1: e.x1,
        y1: e.y1,
        x2: e.x2,
        y2: e.y2,
      });
    }
    // A refresh on a changed candidate set is usually a dynamic body coming or going, with the
    // statics themselves identical — then the buckets (indexes into an equal-by-index list)
    // still hold and no listener needs telling. A first (or invalidated) snapshot always counts.
    const changed = c.ids === null || !SolidSystem._same(c, statics);
    c.ids = ids.slice(); // the scratch list is reused next tick, but the fingerprint must outlive it
    c.statics = statics;
    if (!changed) return;
    SolidSystem._gridRebuild(c, statics);
    if (SolidSystem.onStatics !== null) SolidSystem.onStatics(level, statics);
  },

  /** Same rects at the same indexes as the current snapshot (the walk order is stable). */
  _same(c, statics) {
    const prev = c.statics;
    if (prev.length !== statics.length) return false;
    for (let i = 0; i < statics.length; i++) {
      const a = prev[i];
      const b = statics[i];
      if (a.x1 !== b.x1) return false;
      if (a.y1 !== b.y1) return false;
      if (a.x2 !== b.x2) return false;
      if (a.y2 !== b.y2) return false;
    }
    return true;
  },

  _clampCol(c, g) {
    return g < 0 ? 0 : g >= c.cols ? c.cols - 1 : g;
  },
  _clampRow(c, g) {
    return g < 0 ? 0 : g >= c.rows ? c.rows - 1 : g;
  },

  /**
   * Bucket the static snapshot by AABB span (each static into every cell it overlaps), so _resolve
   * scans only a body's local cells. Sized to the statics' extent (origin 0 — the level is anchored
   * at cell 0 by the always-present border); buckets are reused, reallocated only when the extent
   * resizes the grid. Runs with the snapshot, not per tick.
   */
  _gridRebuild(c, statics) {
    let maxX = 0;
    let maxY = 0;
    let minX = 0;
    let minY = 0;
    for (let i = 0; i < statics.length; i++) {
      if (statics[i].x2 > maxX) maxX = statics[i].x2;
      if (statics[i].y2 > maxY) maxY = statics[i].y2;
      if (statics[i].x1 < minX) minX = statics[i].x1;
      if (statics[i].y1 < minY) minY = statics[i].y1;
    }
    c.minX = minX;
    c.minY = minY;
    const cell = SolidSystem.cell;
    const cols = Math.max(1, Math.ceil(maxX / cell));
    const rows = Math.max(1, Math.ceil(maxY / cell));
    if (cols !== c.cols || rows !== c.rows) {
      c.cols = cols;
      c.rows = rows;
      c.buckets = [];
      for (let i = 0; i < cols * rows; i++) c.buckets.push([]);
    } else {
      for (let i = 0; i < c.buckets.length; i++) c.buckets[i].length = 0;
    }

    const buckets = c.buckets;
    for (let i = 0; i < statics.length; i++) {
      const s = statics[i];
      const gx0 = SolidSystem._clampCol(c, Math.floor(s.x1 / cell));
      const gy0 = SolidSystem._clampRow(c, Math.floor(s.y1 / cell));
      const gx1 = SolidSystem._clampCol(c, Math.ceil(s.x2 / cell) - 1);
      const gy1 = SolidSystem._clampRow(c, Math.ceil(s.y2 / cell) - 1);
      for (let gy = gy0; gy <= gy1; gy++)
        for (let gx = gx0; gx <= gx1; gx++) buckets[gy * cols + gx].push(i);
    }
  },
};
