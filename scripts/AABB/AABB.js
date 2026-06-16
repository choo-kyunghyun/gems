// World-space axis-aligned bounding box helpers. Owns the BBox-anchor convention
// (BBox offset vs Position is non-uniform — walls anchor at a corner, players at
// center), so collision/geometry derive box edges here instead of re-deriving
// `pos.x + box.x + box.width` inline at every call site.
//
// GMRT-safe: plain index math, returns plain objects, no Map/Set iteration.
globalThis.AABB = class AABB {
  /**
   * World-space edges + center of `box` placed at position-like `pos`. `pos` need
   * not be a Position component — pass any {x, y} (e.g. an interpolated render pos).
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

  /** Edges of entity `id`, read straight off its Position + BBox. @param {World} world @param {number} id @returns {{x1:number,y1:number,x2:number,y2:number,cx:number,cy:number}} */
  static of(world, id) {
    return AABB.edges(world.get(Position, id), world.get(BBox, id));
  }

  /** @returns {boolean} whether `a` and `b` overlap. Touching edges do NOT count (strict), matching the physics separation tests. */
  static overlap(a, b) {
    return a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1;
  }
};
