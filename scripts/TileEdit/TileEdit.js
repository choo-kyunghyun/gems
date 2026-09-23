/**
 * Tile layer edits and their colliders. No nav resync call is needed: a cell write bumps the
 * layer's `edits` and remeshed colliders move the collider generation, both of which nav polls.
 * An empty cell reads 0, not undefined, so occupancy is a truthy test, never `!== undefined`.
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

  /** A layer's solid cells as the fewest [gx,gy,wCells,hCells] rects. */
  meshRects(grid, layer) {
    return Grid.meshRects(grid.cols, grid.rows, (x, y) => !!layer.get(x, y));
  },

  /** One kinematic-solid collider per rect; ids pushed onto `out`. */
  meshSolid(entities, grid, layer, out) {
    Colliders.boxes(
      entities,
      TileEdit.meshRects(grid, layer),
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
    TileEdit.meshSolid(entities, grid, layer, colliders);
  },
};
