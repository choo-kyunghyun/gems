// World-space AABB geometry — owns the non-uniform BBox anchor (walls at a
// corner, players centered). See docs/architecture/utilities.md → AABB.
/** @typedef {{x1:number,y1:number,x2:number,y2:number}} AABBRect */
/** @typedef {AABBRect & {cx:number,cy:number}} AABBEdges */
globalThis.AABB = class AABB {
  /**
   * Edges + center of `box` at `pos`. `pos` is any {x, y}
   * (e.g. an interpolated render pos).
   * @param {{x:number,y:number}} pos @param {BBox} box @returns {AABBEdges}
   */
  static edges(pos, box) {
    const x1 = pos.x + box.x;
    const y1 = pos.y + box.y;
    const x2 = x1 + box.width;
    const y2 = y1 + box.height;
    return { x1, y1, x2, y2, cx: (x1 + x2) * 0.5, cy: (y1 + y2) * 0.5 };
  }

  /**
   * Edges of entity `id` from its Position + BBox.
   * @param {Entity} entities @param {number} id @returns {AABBEdges}
   */
  static of(entities, id) {
    // contract: `id` has Position + BBox (callers pass queried ids)
    const pos = /** @type {Position} */ (entities.get(Position, id));
    const box = /** @type {BBox} */ (entities.get(BBox, id));
    return AABB.edges(pos, box);
  }

  /**
   * @param {AABBRect} a @param {AABBRect} b
   * @returns {boolean} whether `a`/`b` overlap — strict, touching edges
   * don't count (matches physics separation).
   */
  static overlap(a, b) {
    return a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1;
  }
};
