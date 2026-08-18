/**
 * There is no nav resync — live pathfinding reads NavGrid, and the debug cost shading computes
 * grid.costAt on demand. Cells store TileType objects (or 0 for empty — Grid.get returns 0, not
 * undefined), so occupancy is a truthy test, never `!== undefined`.
 */
globalThis.TileEdit = {
  occupied(layer, gx, gy) {
    return !!layer.get(gx, gy);
  },

  /** Caller must remesh after editing a solid layer. */
  set(layer, gx, gy, type) {
    layer.set(gx, gy, type);
  },

  clear(layer, gx, gy) {
    layer.set(gx, gy, undefined);
  },

  /** A layer's solid cells as the fewest [gx,gy,wCells,hCells] rects (Grid.meshRects). */
  meshRects(grid, layer) {
    // Grid.get returns 0 for empty (not undefined) — test truthiness, not !== undefined
    return Grid.meshRects(grid.cols, grid.rows, (x, y) => !!layer.get(x, y));
  },

  /** One kinematic-solid collider per meshRects rectangle; ids pushed onto `out`. */
  meshSolid(entities, grid, layer, out) {
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const rects = this.meshRects(grid, layer);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const id = entities.create();
      entities.add(id, Position, { x: r[0] * cw, y: r[1] * ch, z: 0 });
      entities.add(id, BBox, {
        x: 0,
        y: 0,
        width: r[2] * cw,
        height: r[3] * ch,
      });
      entities.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      out.push(id);
    }
  },

  /** Flush first so old ids don't collide. */
  remesh(entities, grid, layer, colliders) {
    for (let i = 0; i < colliders.length; i++) entities.remove(colliders[i]);
    entities.flush();
    colliders.length = 0;
    this.meshSolid(entities, grid, layer, colliders);
  },
};
