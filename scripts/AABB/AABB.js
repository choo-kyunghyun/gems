// World-space AABB geometry — owns the non-uniform BBox anchor
// (walls at a corner, players centered).
/** @typedef {{x1:number,y1:number,x2:number,y2:number}} AABBRect */
globalThis.AABB = {
  /** A zeroed rect for `at`/`ofInto` — one owner for the shape. */
  rect() {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  },

  /**
   * A Position + BBox's edges into a caller-owned rect (AABB.rect), no centre: a pair sweep
   * reuses one or two instead of allocating per test — the object literal is ~3x the arithmetic,
   * and the centre pair about half of what remains (testRuntime perf.measured aabb.literal), so a
   * reader that wants a centre takes `(x1 + x2) * 0.5` where it needs it. The rect is the
   * caller's, so never hand one to something that outlives the call.
   */
  at(pos, box, out) {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    out.x1 = x1;
    out.y1 = y1;
    out.x2 = x1 + box.width;
    out.y2 = y1 + box.height;
    return out;
  },

  /**
   * The entity's edges plus its centre, freshly allocated — the one-shot form; a per-test loop
   * uses ofInto. Position + BBox both required — callers pass component-queried ids, so the
   * reads are unguarded.
   * @returns {AABBRect & {cx:number,cy:number}}
   */
  of(entities, id) {
    const pos = entities.get(id, Position);
    const box = entities.get(id, BBox);
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    const x2 = x1 + box.width;
    const y2 = y1 + box.height;
    return { x1, y1, x2, y2, cx: (x1 + x2) * 0.5, cy: (y1 + y2) * 0.5 };
  },

  /** `of` into a caller-owned rect (see at). */
  ofInto(entities, id, out) {
    return AABB.at(
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
