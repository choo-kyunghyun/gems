/**
 * The level's kinematic solids as kept between ticks — PuppetSystem's entry in the level's cache
 * (`PuppetSystem.colliders`): the kinematic solids baked into flat `{ id, x1, y1, x2, y2 }`
 * records (`statics`), what NavGrid stamps, and `gen`, the count of bakes — the signal a mirror
 * of the kinematic solids (NavGrid) polls by number. The collision itself is the runtime's, over
 * the mirrors (PuppetSystem), so no body list lives here: a mover walks its own tokens.
 *
 * Everything here is derived from the store's Collision carriers, and the walk that derives it
 * is the mirror's (PuppetSystem.update — THE collider walk of a tick, every wall a carrier): it
 * lists the KINEMATIC carriers into `walkIds`/`walkSolids`, each id with its `solid` flag (a
 * body coming or going never touches the bake), and `refresh` fingerprints that list against the
 * last bake's, re-baking only when it moved. The bake holds a STATIC IS STATIC premise: a
 * kinematic solid never moves or resizes in place — every one in the project comes from a level
 * build, a tile remesh or a prop spawn, each of which replaces entities rather than moving them,
 * so the id set plus the `solid` flags is the whole signal (a door's leaf or a trunk turning
 * solid flips the flag in place and re-bakes like a wall built). Give a solid a Velocity and
 * this goes stale.
 *
 * The bake is as of the last walk — at most one tick stale, so a collider removed this frame may
 * linger with a freed id: a reader validates an id. A reader before the first walk (`walk`)
 * takes one of its own.
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
    // the walk's candidate lists, fingerprinted against `ids`/`solids` by `refresh` (level-sized
    // scratch, reused — docs/ARCHITECTURE.md → Hot-path idioms; a bake swaps them with the fingerprint)
    this.walkIds = [];
    this.walkSolids = [];
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

  /** The standalone walk: list the kinematic carriers and refresh — a reader ahead of the mirror's walk. */
  walk(entities) {
    const ids = this.walkIds;
    const flags = this.walkSolids;
    let w = 0;
    entities.forEach([Collision], (id, col) => {
      if (!col.kinematic) return;
      ids[w] = id;
      flags[w] = col.solid;
      w++;
    });
    ids.length = w;
    flags.length = w;
    this.refresh(entities);
  }

  /** Fingerprint the walk's lists (`walkIds`/`walkSolids`, filled) against the bake; re-bake if the set moved. */
  refresh(entities) {
    const ids = this.walkIds;
    const flags = this.walkSolids;
    if (!this._fresh(ids, flags)) this._bake(entities, ids, flags);
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
    // the fingerprint takes the walk's lists; the old fingerprint becomes the next walk's scratch
    const prevIds = this.ids;
    const prevSolids = this.solids;
    this.ids = ids;
    this.solids = flags;
    this.walkIds = prevIds === null ? [] : prevIds;
    this.walkSolids = prevSolids === null ? [] : prevSolids;
    this.statics = statics;
    this.gen++;
  }
};
