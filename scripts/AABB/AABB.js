// World-space AABB geometry — owns the non-uniform BBox anchor
// (walls at a corner, players centered).
/** @typedef {{x1:number,y1:number,x2:number,y2:number}} AABBRect */
/** @typedef {AABBRect & {cx:number,cy:number}} AABBEdges */
globalThis.AABB = {
  edges(pos, box) {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    const x2 = x1 + box.width;
    const y2 = y1 + box.height;
    return { x1, y1, x2, y2, cx: (x1 + x2) * 0.5, cy: (y1 + y2) * 0.5 };
  },

  /** Position + BBox both required — callers pass component-queried ids, so the reads are unguarded. */
  of(entities, id) {
    const pos = entities.get(id, Position);
    const box = entities.get(id, BBox);
    return AABB.edges(pos, box);
  },

  /** Strict overlap — touching edges don't count (matches physics separation). */
  overlap(a, b) {
    return a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1;
  },
};
