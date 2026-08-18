/**
 * Bodies it moves must NOT also be in MovementSystem. SOLE writer of `Grounded.isGrounded` (true when
 * a downward sub-step pushed the body back up) — jump/coyote logic reads it live off the component
 * (the &&-clobber quirk, GMRT.md → Runtime and Build Issues). Statics are bucketed into a spatial
 * grid (_gridRebuild) so each body tests only its local cells, not every static — see _resolve.
 *
 * The snapshot + grid are CACHED across ticks, which is what makes a whole map's worth of statics
 * affordable: re-deriving them each tick costs with the LEVEL's size (every wall, water rect and
 * boulder, plus a bucket per cell they span), while the body loop that actually resolves collisions
 * costs with the number of movers. The cache holds a STATIC IS STATIC premise: a kinematic solid
 * never moves or resizes in place. Every one in the project comes from a level build, a tile remesh
 * or a prop spawn, and each of those replaces entities rather than moving them — so a changed id set
 * is the whole signal, and it is checked every tick. Give a solid a Velocity (MovementSystem's job)
 * and this would go stale; call invalidate() if you must mutate one in place.
 */
globalThis.SolidSystem = {
  maxStep: 8, // keep below thinnest collider to prevent tunneling
  oneWayTol: 2, // px a body may sink into a one-way top and still be caught (resting slack)

  // Private static-collision grid — parallel-array buckets (GMRT: no object-keyed Map/Set). Insert
  // AND query by AABB SPAN (every cell an AABB overlaps), so there's no cell-size constraint (unlike
  // the center-bucket Broadphase) and huge statics just occupy many cells; _cell is a pure perf knob.
  _cell: 64,
  _cols: 0,
  _rows: 0,
  _buckets: [],

  // cache: the store it was taken from, the id set it was taken from (the fingerprint), and the
  // baked records _resolve reads
  _store: null,
  _ids: [],
  _statics: [],

  // Scratch reused every tick: the candidate list the cache fingerprints against, and the
  // mover's rect (_resolve runs twice per sub-step per body — docs/PERF.md).
  _candidates: [],
  _rect: AABB.rect(),

  /** Force the next update to re-derive the static snapshot (see the class doc's premise). */
  invalidate() {
    SolidSystem._store = null;
  },

  update(entities) {
    const dt = SimClock.tickDuration;

    const ids = SolidSystem._candidates;
    let w = 0;
    entities.forEach([Collision, Position, BBox], (id) => {
      ids[w++] = id;
    });
    ids.length = w;
    if (!this._fresh(entities, ids)) this._snapshot(entities, ids);
    const statics = this._statics;

    entities.forEach([Collision, Position, BBox, Velocity], (id, col, pos, box, vel) => {
      if (!col.solid || col.kinematic) return;

      const dx = vel.x * dt;
      const dy = vel.y * dt;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SolidSystem.maxStep),
      );
      const sx = dx / steps;
      const sy = dy / steps;

      let grounded = false;

      for (let s = 0; s < steps; s++) {
        pos.x += sx;
        if (SolidSystem._resolve(pos, box, col, statics, sx, true) !== 0)
          vel.x = 0;

        pos.y += sy;
        const pushY = SolidSystem._resolve(pos, box, col, statics, sy, false);
        if (pushY !== 0) {
          if (pushY > 0) grounded = true;
          vel.y = 0;
        }
      }

      if (col.passThroughTicks !== undefined && col.passThroughTicks > 0) {
        col.passThroughTicks--;
      }

      const gr = entities.get(id, Grounded);
      if (gr !== undefined) gr.isGrounded = grounded;
    });
  },

  /**
   * push body out of overlapping statics along one axis (deepest correction wins).
   * `statics` is the cached snapshot (precomputed edges + oneWay flag), so the loop is
   * flat field reads — keep it free of entities.get / AABB.of (the profiled hot spot). Scans only the
   * statics in the grid cells the body's post-move AABB overlaps (sub-stepping caps the move to
   * maxStep, so the current AABB captures every static this sub-step could hit). A multi-cell static
   * may be tested more than once — harmless: the oneWay/overlap/deepest-correction body is idempotent.
   * returns sign of correction (+1 = pushed toward -, i.e. up/left; -1 = toward +; 0 = none).
   * for Y, +1 means grounded.
   */
  _resolve(pos, box, colMover, statics, v, isX) {
    const a = AABB.edgesInto(pos, box, SolidSystem._rect);

    let correction = 0;

    // exact cell range an [x1,x2)×[y1,y2) AABB touches: floor(lo) .. ceil(hi)-1 (x2/y2 exclusive)
    const cell = SolidSystem._cell;
    const gx0 = SolidSystem._clampCol(Math.floor(a.x1 / cell));
    const gy0 = SolidSystem._clampRow(Math.floor(a.y1 / cell));
    const gx1 = SolidSystem._clampCol(Math.ceil(a.x2 / cell) - 1);
    const gy1 = SolidSystem._clampRow(Math.ceil(a.y2 / cell) - 1);

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const bucket = SolidSystem._buckets[gy * SolidSystem._cols + gx];
        for (let k = 0; k < bucket.length; k++) {
          const b = statics[bucket[k]];

          if (b.oneWay) {
            // jump-through platform: only blocks downward landing.
            // never push horizontally — sideways ejection was caused by that.
            // oneWayTol lets a resting body avoid slipping through on a sub-pixel sink.
            if (isX) continue;
            if (colMover.passThroughTicks > 0) continue;
            if (v < 0) continue;
            const prevBot = a.y2 - v; // bottom edge before this sub-step's move
            if (prevBot > b.y1 + SolidSystem.oneWayTol) continue;
          }

          if (!AABB.overlap(a, b)) continue;

          const lo = isX ? a.x2 - b.x1 : a.y2 - b.y1; // overlap if pushed toward -
          const hi = isX ? b.x2 - a.x1 : b.y2 - a.y1; // overlap if pushed toward +
          let c;
          if (v > 0) c = -lo;
          else if (v < 0) c = hi;
          else c = lo < hi ? -lo : hi;

          if (Math.abs(c) > Math.abs(correction)) correction = c;
        }
      }
    }

    if (correction === 0) return 0;
    if (isX) pos.x += correction;
    else pos.y += correction;
    return correction < 0 ? 1 : -1;
  },

  /**
   * Is the cache still the truth? Same store, same candidate ids in the same order — query() walks
   * entity indexes ascending, so the order only moves when the set does. An id compare over the
   * candidates is a few hundred int tests; re-deriving them is that many component lookups, AABB
   * allocations and bucket inserts.
   */
  _fresh(entities, ids) {
    if (this._store !== entities) return false;
    const prev = this._ids;
    if (prev.length !== ids.length) return false;
    for (let i = 0; i < ids.length; i++) if (prev[i] !== ids[i]) return false;
    return true;
  },

  /**
   * Bake the kinematic solids into flat records: edges + oneWay, so the body×static resolve loop
   * reads plain fields — no AABB.of / entities.get per test. Those per-test Map lookups + edge
   * allocs were ~70% of the colony's tick cost before the snapshot existed.
   */
  _snapshot(entities, ids) {
    const statics = [];
    for (let i = 0; i < ids.length; i++) {
      const col = entities.get(ids[i], Collision);
      if (!col.solid || !col.kinematic) continue;
      const e = AABB.of(entities, ids[i]);
      statics.push({
        x1: e.x1,
        y1: e.y1,
        x2: e.x2,
        y2: e.y2,
        oneWay: col.oneWay === true,
      });
    }
    this._store = entities;
    this._ids = ids.slice(); // query()'s array is fresh, but the fingerprint must outlive this tick
    this._statics = statics;
    this._gridRebuild(statics);
  },

  _clampCol(g) {
    return g < 0 ? 0 : g >= this._cols ? this._cols - 1 : g;
  },
  _clampRow(g) {
    return g < 0 ? 0 : g >= this._rows ? this._rows - 1 : g;
  },

  /**
   * Bucket the static snapshot by AABB span (each static into every cell it overlaps), so _resolve
   * scans only a body's local cells. Sized to the statics' extent (origin 0 — the level is anchored
   * at cell 0 by the always-present border); buckets are reused, reallocated only when a new level
   * resizes the grid. Runs with the snapshot, not per tick.
   */
  _gridRebuild(statics) {
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < statics.length; i++) {
      if (statics[i].x2 > maxX) maxX = statics[i].x2;
      if (statics[i].y2 > maxY) maxY = statics[i].y2;
    }
    const cols = Math.max(1, Math.ceil(maxX / this._cell));
    const rows = Math.max(1, Math.ceil(maxY / this._cell));
    if (cols !== this._cols || rows !== this._rows) {
      this._cols = cols;
      this._rows = rows;
      this._buckets = [];
      for (let i = 0; i < cols * rows; i++) this._buckets.push([]);
    } else {
      for (let i = 0; i < this._buckets.length; i++)
        this._buckets[i].length = 0;
    }

    const cell = this._cell;
    for (let i = 0; i < statics.length; i++) {
      const s = statics[i];
      const gx0 = this._clampCol(Math.floor(s.x1 / cell));
      const gy0 = this._clampRow(Math.floor(s.y1 / cell));
      const gx1 = this._clampCol(Math.ceil(s.x2 / cell) - 1);
      const gy1 = this._clampRow(Math.ceil(s.y2 / cell) - 1);
      for (let gy = gy0; gy <= gy1; gy++)
        for (let gx = gx0; gx <= gx1; gx++)
          this._buckets[gy * this._cols + gx].push(i);
    }
  },
};
