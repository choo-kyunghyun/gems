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
    SolidSystem.boxes(
      entities,
      this.meshRects(grid, layer),
      grid.cellWidth,
      grid.cellHeight,
      out,
    );
  },

  /** Flush first so old ids don't collide. */
  remesh(entities, grid, layer, colliders) {
    for (let i = 0; i < colliders.length; i++) entities.remove(colliders[i]);
    entities.flush();
    colliders.length = 0;
    this.meshSolid(entities, grid, layer, colliders);
  },
};
