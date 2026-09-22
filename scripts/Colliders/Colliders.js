/**
 * The level's colliders as kept between ticks — SolidSystem's entry in the level's cache
 * (`SolidSystem.colliders`): the kinematic solids baked into flat `{ id, x1, y1, x2, y2 }`
 * records (`statics`) and bucketed by AABB span into a cell grid (`buckets` over `cols`×`rows`
 * cells of `cell` px, parallel-array buckets — GMRT: no object-keyed Map/Set — with `minX`/`minY`,
 * how far the statics overhang below the grid's origin: the border boxes sit at -cell..0, a
 * static there is clamped into the edge cell, and `walk`'s clip reaches down to it), so a body
 * or a cast tests only the cells it touches; `gen`, the count of bakes — the signal a mirror of
 * the kinematic solids (NavGrid) polls by number; and the dynamic solid bodies as of the last
 * refresh — parallel arrays of the component objects themselves, reused (a stale tail past
 * `bodyCount` is never read; `bodyVels` holds undefined for a body without Velocity, listed for
 * a cast, never moved) — the one body list the integrate loop, `eachBody` and its readers share.
 *
 * Everything here is derived from the store's Collision carriers: `refresh` walks them once —
 * THE collider walk of a tick (every wall is a carrier, so a walk costs the level's collider
 * count) — fingerprints the KINEMATIC carriers as each id with its `solid` flag (a body coming
 * or going never touches the bake), and re-bakes only when the fingerprint moved. That is what
 * makes a whole map's worth of statics affordable: re-deriving
 * them costs with the LEVEL's size (every wall, water rect and boulder, plus a bucket per cell
 * they span), while the body loop that resolves collisions costs with the number of movers. The
 * bake holds a STATIC IS STATIC premise: a kinematic solid never moves or resizes in place —
 * every one in the project comes from a level build, a tile remesh or a prop spawn, each of
 * which replaces entities rather than moving them, so the id set plus the `solid` flags is the
 * whole signal (a door's leaf or a trunk turning solid flips the flag in place and re-bakes like
 * a wall built). Give a solid a Velocity (MovementSystem's job) and this goes stale.
 *
 * The bake also serves segment queries: Raycast reads the statics through `statics`/`walk` and
 * the dynamic bodies through `eachBody`, so a cast costs the cells it crosses plus the movers,
 * not the map's collider count. Both are as of the last refresh — at most one tick stale, since
 * a tick's brains fire before SolidSystem.update (sceneColony.update's order), so a collider
 * removed this frame may linger with a freed id: a reader validates a hit's id.
 *
 * `box`/`boxes` mint THE bare static collider — the form every wall, water rect and level edge
 * takes.
 */
globalThis.Colliders = class Colliders {
  /** @param {number} cell the bucket grid's cell (px) — a pure perf knob, see SolidSystem.cell */
  constructor(cell) {
    this.cell = cell;
    this.ids = null; // the fingerprint's ids: the walk's kinematic carriers in order; null = never
    this.solids = null; // the fingerprint's `solid` flag per id
    this.statics = [];
    this.gen = 0;
    this.cols = 0;
    this.rows = 0;
    this.buckets = [];
    this.minX = 0;
    this.minY = 0;
    this.bodyIds = [];
    this.bodyCols = [];
    this.bodyPos = [];
    this.bodyBoxes = [];
    this.bodyVels = [];
    this.bodyCount = 0;
    // the walk's candidate lists, fingerprinted against `ids`/`solids` (level-sized scratch,
    // reused — docs/ARCHITECTURE.md → Hot-path idioms; a bake swaps them with the fingerprint)
    this._candIds = [];
    this._candSolids = [];
  }

  /**
   * THE bare static collider (world px): Position at the box's TOP-LEFT, BBox anchored (0,0)
   * spanning w×h, and nothing else — no Visual, so the caller either draws it as tiles or leaves
   * it invisible (water, the border). Kinematic, so bodies collide against it and NavGrid stamps
   * it as blocked; made by replacement, never moved or resized (the premise above).
   */
  static box(entities, x, y, w, h) {
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y, z: 0 });
    entities.add(id, BBox, { x: 0, y: 0, width: w, height: h });
    entities.add(id, Collision, {
      solid: true,
      kinematic: true,
    });
    return id;
  }

  /** One box() per [gx, gy, wCells, hCells] grid rect (Grid.meshRects' form), ids pushed onto `out`. */
  static boxes(entities, rects, cellW, cellH, out) {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      out.push(
        Colliders.box(
          entities,
          r[0] * cellW,
          r[1] * cellH,
          r[2] * cellW,
          r[3] * cellH,
        ),
      );
    }
    return out;
  }

  /**
   * Re-fingerprint the store's kinematic colliders and re-bake if the set moved; the same pass
   * lists the dynamic bodies for the integrate loop and `eachBody`. Velocity cannot join the
   * walk's tokens (a static carries none, and the fingerprint needs every static), so it is one
   * `get` per BODY — the movers, not the walls.
   */
  refresh(entities) {
    const ids = this._candIds;
    const flags = this._candSolids;
    const bIds = this.bodyIds;
    const bCols = this.bodyCols;
    const bPos = this.bodyPos;
    const bBoxes = this.bodyBoxes;
    const bVels = this.bodyVels;
    let w = 0;
    let b = 0;
    entities.forEach([Collision, Position, BBox], (id, col, pos, box) => {
      if (col.kinematic) {
        ids[w] = id;
        flags[w] = col.solid;
        w++;
        return;
      }
      bIds[b] = id;
      bCols[b] = col;
      bPos[b] = pos;
      bBoxes[b] = box;
      bVels[b] = entities.get(id, Velocity);
      b++;
    });
    ids.length = w;
    flags.length = w;
    this.bodyCount = b;
    if (!this._fresh(ids, flags)) this._bake(entities, ids, flags);
  }

  /**
   * Visit the bucket grid's cells along a segment in entry order — `fn(bucket, t)` gets a cell's
   * static indexes and the segment parameter where it enters the cell; return false to stop early.
   * The segment is clipped to the statics' extent — the grid rect plus the overhang below 0 the
   * edge cells absorb (minX/minY), where the walk pins to the edge cell — so nothing is missed;
   * a multi-cell static appears in every cell it spans (and an edge cell may be visited twice), so
   * the caller dedupes.
   */
  walk(x0, y0, x1, y1, fn) {
    const cell = this.cell;
    const cols = this.cols;
    const rows = this.rows;
    const dx = x1 - x0;
    const dy = y1 - y0;

    // clip the segment's parameter range to the statics' extent
    let t0 = 0;
    let t1 = 1;
    if (dx !== 0) {
      let ta = (this.minX - x0) / dx;
      let tb = (cols * cell - x0) / dx;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    } else if (x0 < this.minX || x0 >= cols * cell) return;
    if (dy !== 0) {
      let ta = (this.minY - y0) / dy;
      let tb = (rows * cell - y0) / dy;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    } else if (y0 < this.minY || y0 >= rows * cell) return;
    if (t0 > t1) return;

    let gx = this.clampCol(Math.floor((x0 + dx * t0) / cell));
    let gy = this.clampRow(Math.floor((y0 + dy * t0) / cell));
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
      if (fn(this.buckets[gy * cols + gx], t) === false) return;
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
  }

  /**
   * Visit the dynamic solid bodies — every non-kinematic collider — as `fn(id, col, pos, box)`,
   * the component objects themselves so `solid` reads live (a corpse drops out of the hits the
   * frame it dies). As of the last refresh: a body removed since may linger (validate the id),
   * one spawned since is not listed until the next refresh. A per-frame consumer (SeparationSystem,
   * which reads the body arrays by index) therefore runs after SolidSystem.update in the same
   * frame — the walk that lists the bodies is the one update takes, never a second one here.
   */
  eachBody(fn) {
    const ids = this.bodyIds;
    const cols = this.bodyCols;
    const pos = this.bodyPos;
    const boxes = this.bodyBoxes;
    const n = this.bodyCount;
    for (let i = 0; i < n; i++) fn(ids[i], cols[i], pos[i], boxes[i]);
  }

  clampCol(g) {
    return g < 0 ? 0 : g >= this.cols ? this.cols - 1 : g;
  }

  clampRow(g) {
    return g < 0 ? 0 : g >= this.rows ? this.rows - 1 : g;
  }

  /**
   * Is the bake still the truth? The same kinematic ids with the same `solid` flags in the same
   * order — a walk's order only moves when the set does (Columns). A compare over the
   * candidates is a few hundred tests; re-deriving them is that many component lookups, AABB
   * allocations and bucket inserts.
   */
  _fresh(ids, flags) {
    const prevIds = this.ids;
    if (prevIds === null) return false;
    if (prevIds.length !== ids.length) return false;
    const prevFlags = this.solids;
    for (let i = 0; i < ids.length; i++) {
      if (prevIds[i] !== ids[i]) return false;
      if (prevFlags[i] !== flags[i]) return false;
    }
    return true;
  }

  /**
   * Bake the kinematic solids into flat records: edges (plus the id, for a raycast's hit) so the
   * body×static resolve loop reads plain fields — no AABB.of / entities.get per test. Those per-test
   * Map lookups + edge allocs were ~70% of the colony's tick cost before the snapshot existed.
   * The candidates are the kinematic carriers, so a moved fingerprint IS a moved static set: every
   * bake counts and rebuilds the grid.
   */
  _bake(entities, ids, flags) {
    const statics = [];
    for (let i = 0; i < ids.length; i++) {
      if (!flags[i]) continue;
      const e = AABB.of(entities, ids[i]);
      statics.push({
        id: ids[i],
        x1: e.x1,
        y1: e.y1,
        x2: e.x2,
        y2: e.y2,
      });
    }
    // the fingerprint takes the scratch lists; the old fingerprint becomes next tick's scratch
    const prevIds = this.ids;
    const prevSolids = this.solids;
    this.ids = ids;
    this.solids = flags;
    this._candIds = prevIds === null ? [] : prevIds;
    this._candSolids = prevSolids === null ? [] : prevSolids;
    this.statics = statics;
    this.gen++;
    this._gridRebuild(statics);
  }

  /**
   * Bucket the statics by AABB span (each static into every cell it overlaps), so a resolve
   * scans only a body's local cells. Sized to the statics' extent (origin 0 — the level is
   * anchored at cell 0 by the always-present border); buckets are reused, reallocated only when
   * the extent resizes the grid. Runs with the bake, not per tick.
   */
  _gridRebuild(statics) {
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
    this.minX = minX;
    this.minY = minY;
    const cell = this.cell;
    const cols = Math.max(1, Math.ceil(maxX / cell));
    const rows = Math.max(1, Math.ceil(maxY / cell));
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
      this.buckets = [];
      for (let i = 0; i < cols * rows; i++) this.buckets.push([]);
    } else {
      for (let i = 0; i < this.buckets.length; i++) this.buckets[i].length = 0;
    }

    const buckets = this.buckets;
    for (let i = 0; i < statics.length; i++) {
      const s = statics[i];
      const gx0 = this.clampCol(Math.floor(s.x1 / cell));
      const gy0 = this.clampRow(Math.floor(s.y1 / cell));
      const gx1 = this.clampCol(Math.ceil(s.x2 / cell) - 1);
      const gy1 = this.clampRow(Math.ceil(s.y2 / cell) - 1);
      for (let gy = gy0; gy <= gy1; gy++)
        for (let gx = gx0; gx <= gx1; gx++) buckets[gy * cols + gx].push(i);
    }
  }
};
