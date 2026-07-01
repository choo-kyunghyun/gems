// World-space AABB helpers. Owns the non-uniform BBox-anchor convention (walls anchor at a
// corner, players at center), so collision/geometry derive edges here, not inline at each site.
// GMRT-safe: plain index math, plain objects, no Map/Set iteration.
globalThis.AABB = class AABB {
  /**
   * Edges + center of `box` at `pos`. `pos` is any {x, y} (e.g. an interpolated render pos).
   * @param {{x:number,y:number}} pos @param {BBox} box
   * @returns {{x1:number,y1:number,x2:number,y2:number,cx:number,cy:number}}
   */
  static edges(pos, box) {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    const x2 = x1 + box.width;
    const y2 = y1 + box.height;
    return { x1, y1, x2, y2, cx: (x1 + x2) * 0.5, cy: (y1 + y2) * 0.5 };
  }

  /** Edges of entity `id` from its Position + BBox. @param {ECS} world @param {number} id @returns {{x1:number,y1:number,x2:number,y2:number,cx:number,cy:number}} */
  static of(world, id) {
    return AABB.edges(world.get(Position, id), world.get(BBox, id));
  }

  /** @returns {boolean} whether `a`/`b` overlap — strict, touching edges don't count (matches physics separation). */
  static overlap(a, b) {
    return a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1;
  }
};
