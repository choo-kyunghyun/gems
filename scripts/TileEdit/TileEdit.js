// Core tile-layer editing service: read/write cells of a Level's TileLayer and keep the
// derived data (pathfinding nav cost + solid colliders) in sync. Genre-agnostic — shared
// by any tile-based editor or build mode (TopDown's BuildMode) and by level loaders
// (TopDownLevel.build), so the "edit a solid tile → resync nav + rebuild colliders"
// invariant lives in exactly one place.
//
// Cells store TileType objects (or 0 for empty — Grid.get returns 0, not undefined, for
// an in-bounds empty cell), so occupancy is a truthy test, never `!== undefined`.
globalThis.TileEdit = {
  // True when (gx, gy) holds a tile. Truthy test: 0 = empty, a TileType = filled.
  occupied(layer, gx, gy) {
    return !!layer.get(gx, gy);
  },

  // Write a tile into a layer and resync that cell's nav cost. Returns nothing; the
  // caller rebuilds colliders (remesh) when the layer is solid.
  set(level, layer, gx, gy, type) {
    layer.set(gx, gy, type);
    level.syncAt(gx, gy);
  },

  // Clear a cell and resync its nav cost.
  clear(level, layer, gx, gy) {
    layer.set(gx, gy, undefined);
    level.syncAt(gx, gy);
  },

  /**
   * Greedy-mesh the solid cells of `layer` into the fewest rectangles, returned as
   * `[gx, gy, wCells, hCells]` in GRID coords (extend right for width, then down while the
   * whole row stays solid). Per-cell boxes leave internal seams between abutting tiles and
   * the AABB resolver snags on each — merging removes that class of bug (see memory
   * project_tile_collider_seams). Shared by `meshSolid` (build colliders) and level export
   * (serialize a wall layer back to the file's `walls` rects).
   */
  meshRects(level, layer) {
    const cols = level.cols;
    const rows = level.rows;
    const consumed = new Array(cols * rows).fill(false);
    // Grid.get returns 0 for empty in-bounds cells (not undefined) and a TileType for a
    // filled cell — test truthiness, not `!== undefined`, or every empty cell reads solid.
    const solid = (x, y) =>
      x < cols && y < rows && layer.get(x, y) && !consumed[y * cols + x];

    const rects = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!solid(x, y)) continue;

        let w = 1;
        while (solid(x + w, y)) w++;

        let h = 1;
        for (let grow = true; grow; h++) {
          for (let k = 0; k < w; k++)
            if (!solid(x + k, y + h)) {
              grow = false;
              break;
            }
        }
        h--; // last iteration that incremented also set grow=false

        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) consumed[yy * cols + xx] = true;

        rects.push([x, y, w, h]);
      }
    }
    return rects;
  },

  /**
   * Greedy-mesh the solid cells of `layer` into the fewest kinematic-solid collider
   * entities (one per `meshRects` rectangle), pushing their ids onto `out`. Box geometry
   * uses the level's cell size.
   */
  meshSolid(world, level, layer, out) {
    const cw = level.cellWidth;
    const ch = level.cellHeight;
    const rects = this.meshRects(level, layer);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const id = world.create();
      world.add(id, Position, { x: r[0] * cw, y: r[1] * ch, z: 0 });
      world.add(id, BBox, { x: 0, y: 0, width: r[2] * cw, height: r[3] * ch });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      out.push(id);
    }
  },

  /**
   * Rebuild every collider from the current state of `layer`. Removes the old colliders
   * and re-greedy-meshes in place — call after a solid-tile edit so freshly built/removed
   * tiles re-merge without seam bugs.
   */
  remesh(world, level, layer, colliders) {
    for (let i = 0; i < colliders.length; i++) world.remove(colliders[i]);
    world.flush(); // commit removals before re-meshing so ids don't collide
    colliders.length = 0;
    this.meshSolid(world, level, layer, colliders);
  },
};
