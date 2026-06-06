// Level data and builder for the top-down demo.
// Add more entries to TopDownLevels to extend the game.
//
// build() creates and returns { level, layer, spawn } — the scene owns level's lifecycle.
// Each level: { playerSpawn: { gx, gy }, paint(layer, cols, rows, wall) }

const TOPDOWN_CELL = 32;

/** @type {{ playerSpawn: {gx:number,gy:number}, paint: function }[]} */
globalThis.TopDownLevels = [
  {
    playerSpawn: { gx: 2, gy: 2 },
    paint(layer, cols, rows, wall) {
      for (let x = 0; x < cols; x++) { layer.set(x, 0, wall); layer.set(x, rows - 1, wall); }
      for (let y = 0; y < rows; y++) { layer.set(0, y, wall); layer.set(cols - 1, y, wall); }
      for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) layer.set(x, y, wall);
      for (let x = 10; x <= 14; x++) layer.set(x, 8, wall);
      for (let y = 4; y <= 8; y++) layer.set(10, y, wall);
      layer.set(16, 3, wall);
    },
  },
];

globalThis.TopDownLevel = {
  /**
   * Creates a Level from data, spawns kinematic wall entities into world.
   * Returns { level, spawn } — caller is responsible for level.destroy().
   */
  build(world, data) {
    const level = new Level({ cellWidth: TOPDOWN_CELL, cellHeight: TOPDOWN_CELL });
    const wall  = new TileType({ id: 1, name: "벽" });
    const cols  = Math.min(20, level.cols);
    const rows  = Math.min(14, level.rows);

    // Scratch grid — used only to resolve which cells are solid, not inserted into level.
    const scratch = new TileLayer(level.cols, level.rows);
    data.paint(scratch, cols, rows, wall);

    // Greedy-mesh solid cells into the fewest rectangles so a straight wall becomes one
    // collider. Per-cell boxes leave internal seams between abutting tiles, and the AABB
    // resolver snags a slider on each seam — merging them away removes that whole class of bug.
    const consumed = new Array(cols * rows).fill(false);
    const solid = (x, y) => x < cols && y < rows && scratch.get(x, y) && !consumed[y * cols + x];

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!solid(x, y)) continue;

        let w = 1;
        while (solid(x + w, y)) w++;

        let h = 1;
        for (let grow = true; grow; h++) {
          for (let k = 0; k < w; k++) if (!solid(x + k, y + h)) { grow = false; break; }
        }
        h--; // last iteration that incremented also set grow=false

        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) consumed[yy * cols + xx] = true;

        const id = world.create();
        world.add(id, Position,  { x: x * TOPDOWN_CELL, y: y * TOPDOWN_CELL, z: 0 });
        world.add(id, BBox,      { x: 0, y: 0, width: w * TOPDOWN_CELL, height: h * TOPDOWN_CELL });
        world.add(id, Collision, { solid: true, kinematic: true, mask: null, hits: [] });
      }
    }
    scratch.destroy();

    const spawn = level.gridToWorld(data.playerSpawn.gx, data.playerSpawn.gy);
    return { level: level, spawn: spawn };
  },
};
