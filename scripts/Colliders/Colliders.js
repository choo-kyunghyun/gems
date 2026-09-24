/**
 * THE bare static collider and its grid-rect batch — the form every wall, water rect and level
 * edge takes. A kinematic solid is made by replacement, never moved or resized: static stays static.
 */
globalThis.Colliders = {
  /**
   * The collider (world px): Position at the box's TOP-LEFT, BBox anchored (0,0) spanning w×h,
   * and nothing else — no Visual, so the caller either draws it as tiles or leaves it invisible
   * (water, the border). Kinematic, so bodies collide against it and nav stamps it as blocked.
   */
  box(entities, x, y, w, h) {
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y });
    entities.add(id, BBox, { width: w, height: h });
    entities.add(id, Collision, { kinematic: true });
    return id;
  },

  /** One box() per [gx, gy, wCells, hCells] grid rect, ids pushed onto `out`. */
  boxes(entities, rects, cellW, cellH, out) {
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
  },
};
