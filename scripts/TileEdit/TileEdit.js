// tile-layer editing service: write cells + keep solid COLLIDERS in sync (meshSolid/remesh).
// one place for the "edit a solid tile → rebuild colliders" invariant. (There is no nav resync —
// live pathfinding reads NavGrid, and the debug cost shading computes level.costAt on demand.)
//
// cells store TileType objects (or 0 for empty — Grid.get returns 0, not undefined),
// so occupancy is a truthy test, never `!== undefined`.
globalThis.TileEdit = {
  // 0 = empty, TileType = filled — truthy test
  occupied(layer, gx, gy) {
    return !!layer.get(gx, gy);
  },

  // caller must remesh after editing a solid layer
  set(layer, gx, gy, type) {
    layer.set(gx, gy, type);
  },

  clear(layer, gx, gy) {
    layer.set(gx, gy, undefined);
  },

  // greedy-mesh solid cells into fewest rects; per-cell boxes leave seams that snag the AABB
  // resolver (see memory project_tile_collider_seams). returns [gx,gy,wCells,hCells] in grid coords.
  meshRects(level, layer) {
    const cols = level.cols;
    const rows = level.rows;
    const consumed = new Array(cols * rows).fill(false);
    // Grid.get returns 0 for empty (not undefined) — test truthiness, not !== undefined
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

  // one kinematic-solid collider per meshRects rectangle; ids pushed onto `out`
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

  // rebuild colliders after a solid-tile edit; flush first so old ids don't collide
  remesh(world, level, layer, colliders) {
    for (let i = 0; i < colliders.length; i++) world.remove(colliders[i]);
    world.flush();
    colliders.length = 0;
    this.meshSolid(world, level, layer, colliders);
  },
};
