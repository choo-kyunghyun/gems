// Level data and builder for the top-down demo.
// Add more entries to TopDownLevels to extend the game.
//
// build() creates and returns { level, spawn, wallLayer, floorLayer, wallType,
// floorType, colliders } — the scene owns level's lifecycle. The wall TileLayer is
// kept on the level (not discarded) so a debug render pass can draw it and build mode
// can edit it; colliders are greedy-meshed from that layer and rebuilt by remeshWalls
// after build-mode edits.
//
// Each level: { playerSpawn: { gx, gy }, paint(layer, cols, rows, wall) }

const TOPDOWN_CELL = 32;

/** @type {{ playerSpawn: {gx:number,gy:number}, paint: function }[]} */
globalThis.TopDownLevels = [
  {
    playerSpawn: { gx: 2, gy: 2 },
    paint(layer, cols, rows, wall) {
      for (let x = 0; x < cols; x++) {
        layer.set(x, 0, wall);
        layer.set(x, rows - 1, wall);
      }
      for (let y = 0; y < rows; y++) {
        layer.set(0, y, wall);
        layer.set(cols - 1, y, wall);
      }
      for (let y = 4; y <= 6; y++)
        for (let x = 4; x <= 6; x++) layer.set(x, y, wall);
      for (let x = 10; x <= 14; x++) layer.set(x, 8, wall);
      for (let y = 4; y <= 8; y++) layer.set(10, y, wall);
      layer.set(16, 3, wall);
    },
  },
];

globalThis.TopDownLevel = {
  /**
   * Creates a Level from data, paints walls into a persistent TileLayer, and spawns
   * kinematic wall colliders into world. Returns the level handles; the caller owns
   * level.destroy() and the collider entities.
   */
  build(world, data) {
    const level = new Level({
      cellWidth: TOPDOWN_CELL,
      cellHeight: TOPDOWN_CELL,
    });
    const wallType = new TileType({ id: 1, name: "벽", pathCost: null });
    const floorType = new TileType({ id: 2, name: "바닥" }); // walkable cosmetic (pathCost 1)
    const cols = Math.min(20, level.cols);
    const rows = Math.min(14, level.rows);

    // Bottom floor layer (walkable, nav-neutral) then the wall layer above it. Both stay
    // on the level so Level._computeNav resolves wall→Infinity else floor/empty→1 and the
    // debug pass can read them.
    const floorLayer = new TileLayer(level.cols, level.rows, { emptyCost: 1 });
    const wallLayer = new TileLayer(level.cols, level.rows);
    level.insert(floorLayer);
    level.insert(wallLayer);

    data.paint(wallLayer, cols, rows, wallType);
    level.syncAll();

    const colliders = [];
    this._meshWalls(world, level, wallLayer, colliders);

    const spawn = level.gridToWorld(data.playerSpawn.gx, data.playerSpawn.gy);
    return {
      level,
      spawn,
      wallLayer,
      floorLayer,
      wallType,
      floorType,
      colliders,
    };
  },

  /**
   * Greedy-mesh solid cells of wallLayer into the fewest rectangles so a straight wall
   * becomes one collider. Per-cell boxes leave internal seams between abutting tiles, and
   * the AABB resolver snags a slider on each seam — merging them away removes that whole
   * class of bug (see memory project_tile_collider_seams). Pushes collider ids onto `out`.
   */
  _meshWalls(world, level, wallLayer, out) {
    const cols = level.cols;
    const rows = level.rows;
    const consumed = new Array(cols * rows).fill(false);
    // Grid.get returns 0 for empty in-bounds cells (not undefined) and a TileType for
    // walls — test truthiness, not `!== undefined`, or every empty cell reads as solid.
    const solid = (x, y) =>
      x < cols && y < rows && wallLayer.get(x, y) && !consumed[y * cols + x];

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

        const id = world.create();
        world.add(id, Position, {
          x: x * TOPDOWN_CELL,
          y: y * TOPDOWN_CELL,
          z: 0,
        });
        world.add(id, BBox, {
          x: 0,
          y: 0,
          width: w * TOPDOWN_CELL,
          height: h * TOPDOWN_CELL,
        });
        world.add(id, Collision, {
          solid: true,
          kinematic: true,
          mask: null,
          hits: [],
        });
        out.push(id);
      }
    }
  },

  /**
   * Rebuild every wall collider from the current wallLayer. Called after a build-mode
   * wall edit. Removes the old colliders and re-greedy-meshes in place (cheap on the
   * ~20×14 grid), so freshly built/removed walls re-merge without seam bugs.
   */
  remeshWalls(world, level, wallLayer, colliders) {
    for (let i = 0; i < colliders.length; i++) world.remove(colliders[i]);
    world.flush(); // commit removals before re-meshing so ids don't collide
    colliders.length = 0;
    this._meshWalls(world, level, wallLayer, colliders);
  },
};
