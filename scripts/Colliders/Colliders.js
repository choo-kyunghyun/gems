/**
 * The level's colliders as kept between ticks — SolidSystem's entry in the level's cache
 * (`SolidSystem.colliders`): the kinematic solids baked into flat `{ id, x1, y1, x2, y2 }`
 * records (`statics`), what NavGrid stamps; `gen`, the count of bakes — the signal a mirror of
 * the kinematic solids (NavGrid) polls by number; and the dynamic solid bodies as of the last
 * refresh — parallel arrays of the component objects themselves, reused (a stale tail past
 * `bodyCount` is never read; `bodyVels` holds undefined for a body without Velocity, listed,
 * never moved) — the one body list the integrate loop, SeparationSystem, `eachBody` and its
 * readers share. The collision itself is the runtime's, over the mirrors (PuppetSystem).
 *
 * Everything here is derived from the store's Collision carriers: `refresh` walks them once —
 * THE collider walk of a tick (every wall is a carrier, so a walk costs the level's collider
 * count) — fingerprints the KINEMATIC carriers as each id with its `solid` flag (a body coming
 * or going never touches the bake), and re-bakes only when the fingerprint moved. The bake
 * holds a STATIC IS STATIC premise: a kinematic solid never moves or resizes in place —
 * every one in the project comes from a level build, a tile remesh or a prop spawn, each of
 * which replaces entities rather than moving them, so the id set plus the `solid` flags is the
 * whole signal (a door's leaf or a trunk turning solid flips the flag in place and re-bakes like
 * a wall built). Give a solid a Velocity (MovementSystem's job) and this goes stale.
 *
 * The lists are as of the last refresh — at most one tick stale, so a collider removed this
 * frame may linger with a freed id: a reader validates an id.
 *
 * `box`/`boxes` mint THE bare static collider — the form every wall, water rect and level edge
 * takes.
 */
globalThis.Colliders = class Colliders {
  constructor() {
    this.ids = null; // the fingerprint's ids: the walk's kinematic carriers in order; null = never
    this.solids = null; // the fingerprint's `solid` flag per id
    this.statics = [];
    this.gen = 0;
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

  /**
   * Is the bake still the truth? The same kinematic ids with the same `solid` flags in the same
   * order — a walk's order only moves when the set does (Columns). A compare over the
   * candidates is a few hundred tests; re-deriving them is that many component lookups and AABB
   * allocations.
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
   * Bake the kinematic solids into flat records: edges plus the id, the rects NavGrid stamps.
   * The candidates are the kinematic carriers, so a moved fingerprint IS a moved static set:
   * every bake counts.
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
  }
};
