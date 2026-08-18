// World-space AABB geometry — owns the non-uniform BBox anchor
// (walls at a corner, players centered).
/** @typedef {{x1:number,y1:number,x2:number,y2:number}} AABBRect */
/** @typedef {AABBRect & {cx:number,cy:number}} AABBEdges */
globalThis.AABB = {
  /** A zeroed rect for the `*Into` calls — one owner for the shape. */
  rect() {
    return { x1: 0, y1: 0, x2: 0, y2: 0, cx: 0, cy: 0 };
  },

  edges(pos, box) {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    const x2 = x1 + box.width;
    const y2 = y1 + box.height;
    return { x1, y1, x2, y2, cx: (x1 + x2) * 0.5, cy: (y1 + y2) * 0.5 };
  },

  /**
   * `edges` into a caller-owned rect (AABB.rect). A pair sweep reuses one or two instead of
   * allocating per test: the object literal, not the arithmetic, is the cost here — ~3.5x
   * (docs/PERF.md). The rect is the caller's, so never hand one to something that outlives
   * the call.
   */
  edgesInto(pos, box, out) {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    const x2 = x1 + box.width;
    const y2 = y1 + box.height;
    out.x1 = x1;
    out.y1 = y1;
    out.x2 = x2;
    out.y2 = y2;
    out.cx = (x1 + x2) * 0.5;
    out.cy = (y1 + y2) * 0.5;
    return out;
  },

  /** Position + BBox both required — callers pass component-queried ids, so the reads are unguarded. */
  of(entities, id) {
    const pos = entities.get(id, Position);
    const box = entities.get(id, BBox);
    return AABB.edges(pos, box);
  },

  /** `of` into a caller-owned rect (see edgesInto). */
  ofInto(entities, id, out) {
    return AABB.edgesInto(
      entities.get(id, Position),
      entities.get(id, BBox),
      out,
    );
  },

  /** Strict overlap — touching edges don't count (matches physics separation). */
  overlap(a, b) {
    return a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1;
  },
};
