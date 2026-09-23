/**
 * World-space AABB geometry.
 * @typedef {{x1:number,y1:number,x2:number,y2:number}} AABBRect
 */
globalThis.AABB = {
  /** One owner for the rect shape. */
  rect() {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  },

  /**
   * Edges into a caller-owned rect, with no centre: a pair sweep reuses one instead of
   * allocating a literal per test (perf.measured). Never hand the rect to something that
   * outlives the call.
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
   * The allocating one-shot form; a per-test loop uses ofInto. The entity must carry Position
   * and BBox; the reads are unguarded.
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

  /** `of` into a caller-owned rect, with no centre. */
  ofInto(entities, id, out) {
    return AABB.at(
      entities.get(id, Position),
      entities.get(id, BBox),
      out,
    );
  },

  /**
   * Strict: touching edges do not overlap. A per-candidate loop inlines this test, since the
   * call costs about twice it (perf.measured).
   */
  overlap(a, b) {
    return a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1;
  },
};
