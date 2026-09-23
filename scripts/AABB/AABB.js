// World-space AABB geometry — owns the non-uniform BBox anchor
// (walls at a corner, players centered).
/** @typedef {{x1:number,y1:number,x2:number,y2:number}} AABBRect */
/** @typedef {AABBRect & {cx:number,cy:number}} AABBEdges */
globalThis.AABB = {
  /** A zeroed rect for the `*Into` calls — one owner for the shape. */
  rect() {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  },

  /** The edges plus the centre — the one-shot form; a per-test loop uses edgesInto. */
  edges(pos, box) {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    const x2 = x1 + box.width;
    const y2 = y1 + box.height;
    return { x1, y1, x2, y2, cx: (x1 + x2) * 0.5, cy: (y1 + y2) * 0.5 };
  },

  /**
   * `edges` into a caller-owned rect (AABB.rect), the four edges and no centre: a pair sweep
   * reuses one or two instead of allocating per test — the object literal is ~3x the arithmetic,
   * and the centre pair about half of what remains (testRuntime perf.measured), so a reader that
   * wants a centre takes `(x1 + x2) * 0.5` where it needs it. The rect is the caller's, so never
   * hand one to something that outlives the call.
   */
  edgesInto(pos, box, out) {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    out.x1 = x1;
    out.y1 = y1;
    out.x2 = x1 + box.width;
    out.y2 = y1 + box.height;
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

  /**
   * Strict overlap — touching edges don't count (matches physics separation). A per-candidate
   * loop inlines this test: the call is about twice it (testRuntime perf.measured aabb.overlap).
   */
  overlap(a, b) {
    return a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1;
  },
};
