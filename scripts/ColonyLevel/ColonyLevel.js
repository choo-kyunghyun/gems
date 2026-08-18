const CELL = 32; // fallback cell size when a level omits `cell` (32px convention — the 2026-07 media set is authored 1:1 at 32px/cell)

/**
 * The colony's level builder: the map graph (id → file) plus build(), which paints a level FILE into
 * a store + grid and returns { grid, spawn, colliders, <key>Layer/<key>Type per layer } for the
 * caller to hang on its Level (ColonyMap._buildWorld does; the Level owns the grid's lifecycle from
 * there). Wall colliders are greedy-meshed by TileEdit.
 *
 * A level is fully resident: everything it holds is built here, once, and simulated for the map's
 * lifetime. `meta.generated` swaps the file's hand-painted grid for a procedural one (_generate) —
 * the ground is still ordinary tile data either way, so nothing downstream knows the difference.
 *
 * File shape: { cell?, cols, rows, meta: { playerSpawn }, walls: [[x,y,w,h]...] } — walls are cell
 * rectangles (map straight onto the greedy mesh). Grid size is cols/rows, NOT the room, so a level
 * can exceed the view and the follow camera scrolls across it.
 */
globalThis.ColonyLevel = {
  // World graph: map id → level file. Maps are connected by `portal` spawns (see ColonySpawn.spawn).
  // START is the boot map.
  // DISCRETE FILES: a level file has to parse in one go, and a level owns exactly one entity store —
  // so map size is bounded by both. The graph is how the world grows past one map.
  MAPS: {
    overworld: "levels/overworld.json",
    interior_01: "levels/interior_01.json",
  },
  START: "overworld",
  mapFile(id) {
    return ColonyLevel.MAPS[id];
  },

  // one-shot editor→play hand-off: the level editor's Test Play sets a save-dir level file;
  // sceneColony consumes it once on create, then clears it
  playtestFile: undefined,

  /**
   * Make the contentTiles.LAYERS TileLayers + TileTypes (bottom→top) and return a handles bag keyed
   * `<key>Layer`/`<key>Type` — plus, for a materials-bearing layer (wall), `<key>Types`:
   * one TileType per material keyed by material key (`<key>Type` stays materials[0], the
   * default every existing consumer paints).
   */
  _makeLayers(grid) {
    const h = {};
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      const layer = new TileLayer(grid.cols, grid.rows, {
        emptyCost: cfg.emptyCost,
      });
      grid.insert(layer);
      h[cfg.key + "Layer"] = layer;
      if (cfg.materials !== undefined) {
        const types = {};
        for (let m = 0; m < cfg.materials.length; m++) {
          const mat = cfg.materials[m];
          types[mat.key] = new TileType({
            id: mat.id,
            name: I18n.text(mat.name),
            pathCost: cfg.pathCost,
          });
        }
        h[cfg.key + "Types"] = types;
        h[cfg.key + "Type"] = types[cfg.materials[0].key];
      } else {
        h[cfg.key + "Type"] = new TileType({
          id: cfg.id,
          name: I18n.text(cfg.name),
          pathCost: cfg.pathCost,
        });
      }
    }
    return h;
  },

  /**
   * Auto-fill each `fill` layer's grid with its material (the walkable base). Authored maps only —
   * a generated map paints the same layer from its biome palette instead.
   */
  _fillLayers(grid, h) {
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (!cfg.fill) continue;
      const layer = h[cfg.key + "Layer"];
      const type = h[cfg.key + "Type"];
      for (let y = 0; y < grid.rows; y++)
        for (let x = 0; x < grid.cols; x++) layer.set(x, y, type);
    }
  },

  /**
   * Paint cell-rectangles ([x,y,w,h]) of `type` into a layer. An absent array is a no-op, so
   * older level files are unaffected.
   */
  _paintRects(layer, rects, type) {
    if (rects === undefined) return;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      for (let y = r[1]; y < r[1] + r[3]; y++)
        for (let x = r[0]; x < r[0] + r[2]; x++) layer.set(x, y, type);
    }
  },

  /**
   * Build a Level: paint the grid + mesh kinematic wall colliders. Returns the built handles; the
   * caller owns grid.destroy() and the colliders. `entryId` selects the player spawn from
   * `meta.entries` (the matching side of a portal), falling back to entries.default → legacy
   * meta.playerSpawn.
   *
   * A `meta.generated` level paints itself (_generate) and hands back `spawns` (the descriptors the
   * caller feeds ColonySpawn) + `terrainMats` (the material table its render passes stack); an authored
   * one fills the walkable base from the file's cell-rects and leaves both undefined.
   *
   * TWO collider lists, because they have different lifetimes: `colliders` is the wall layer's
   * greedy mesh, which BuildMode remeshes wholesale on every tile edit, while `statics` is the
   * geometry that has no tile layer to remesh from (impassable terrain, the level edge).
   */
  build(entities, data, entryId = "default") {
    const cell = data.cell ?? CELL;
    const grid = new LevelGrid({
      cellWidth: cell,
      cellHeight: cell,
      cols: data.cols,
      rows: data.rows,
    });
    const h = ColonyLevel._makeLayers(grid);
    const statics = [];
    const gen =
      data.meta.generated === true
        ? ColonyLevel._generate(entities, grid, h, data, statics)
        : undefined;
    if (gen === undefined) {
      // Terrain auto-filled as the walkable base; walls + optional floors from the file's
      // cell-rects (fence has no file source yet).
      ColonyLevel._fillLayers(grid, h);
      ColonyLevel._paintRects(h.wallLayer, data.walls, h.wallType);
      ColonyLevel._paintRects(h.floorLayer, data.floors, h.floorType);
    }

    const colliders = [];
    TileEdit.meshSolid(entities, grid, h.wallLayer, colliders);

    const spawn = this._resolveSpawn(grid, data, entryId);
    return {
      grid,
      spawn,
      colliders,
      statics,
      spawns: gen !== undefined ? gen.spawns : undefined,
      terrainMats: gen !== undefined ? gen.mats : undefined,
      ...h,
    };
  },

  /**
   * Paint a GENERATED level in place. The biome terrain lands as per-cell TileTypes on the terrain
   * layer, so it is ordinary tile data from here on — LevelGrid.costAt prices nav from it and the
   * stacked dual-grid passes render it, with no sampler left running at play time. Generated walls
   * join the file's on the wall layer (the caller meshes them). Impassable terrain and the level
   * edge become COLLIDE-ONLY boxes collected into `statics`, apart from the wall layer's mesh so a
   * build-mode remesh can't free them.
   */
  _generate(entities, grid, h, data, statics) {
    const t0 = current_time;
    const gen = OverworldGen.create({
      seed: data.meta.seed ?? 1337,
      authored: data, // hand-built hub laid over the generated ground (AuthoredStamp)
    });
    const out = gen.generate(grid.cols, grid.rows);
    // one TileType per palette material, id = index + 1 (a 0 id reads as an empty cell). The order
    // IS the painter order, which is what lets the stacked render passes threshold on the id.
    const mats = [];
    const types = [];
    for (let i = 0; i < gen.palette.length; i++) {
      const p = gen.palette[i];
      const type = new TileType({
        id: i + 1,
        name: p.name,
        pathCost: p.pathCost,
      });
      types.push(type);
      mats.push({ type: type, sprite: p.sprite });
    }
    gen.paint(h.terrainLayer, types, grid.cols, grid.rows);
    ColonyLevel._paintRects(h.wallLayer, out.walls, h.wallType);
    for (let i = 0; i < out.solid.length; i++) {
      const r = out.solid[i];
      statics.push(
        ColonyLevel._solidBox(
          entities,
          r[0] * grid.cellWidth,
          r[1] * grid.cellHeight,
          r[2] * grid.cellWidth,
          r[3] * grid.cellHeight,
        ),
      );
    }
    ColonyLevel.buildWorldBorder(entities, grid, statics);
    Log.info(
      `ColonyLevel: generated ${grid.cols}x${grid.rows} in ${current_time - t0}ms — ` +
        `${out.walls.length} wall rect(s), ${out.spawns.length} spawn(s)`,
    );
    return { spawns: out.spawns, mats: mats };
  },

  /**
   * Wall border ringing the level (anchored at cell 0) so the player + enemies can't leave; the
   * 4 ids are pushed onto `out`. Kinematic-solid like any wall, so SolidSystem collides + NavGrid
   * rasterizes them. Left/right span one cell past top/bottom to cover the outer corners (no
   * diagonal slip-through).
   */
  buildWorldBorder(entities, grid, out) {
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const W = grid.cols * cw;
    const H = grid.rows * ch;
    out.push(ColonyLevel._solidBox(entities, 0, -ch, W, ch)); // top
    out.push(ColonyLevel._solidBox(entities, 0, H, W, ch)); // bottom
    out.push(ColonyLevel._solidBox(entities, -cw, -ch, cw, H + 2 * ch)); // left
    out.push(ColonyLevel._solidBox(entities, W, -ch, cw, H + 2 * ch)); // right
  },

  /**
   * One bare kinematic-solid collider (world px) — the collide-only form for water and the level
   * border, which are drawn as ground or not at all rather than as walls. Same shape as
   * TileEdit.meshSolid's: Position at the rect's top-left, BBox (0,0) spanning it.
   */
  _solidBox(entities, x, y, w, h) {
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y, z: 0 });
    entities.add(id, BBox, { x: 0, y: 0, width: w, height: h });
    entities.add(id, Collision, {
      solid: true,
      kinematic: true,
      mask: null,
      hits: [],
    });
    return id;
  },

  /**
   * Resolve the player spawn (world coords): named entry → entries.default → legacy meta.playerSpawn.
   */
  _resolveSpawn(grid, data, entryId) {
    const entries = data.meta.entries;
    let entry = data.meta.playerSpawn;
    if (entries !== undefined)
      entry = entries[entryId] ?? entries.default ?? entry;
    return grid.gridToWorld(entry.gx, entry.gy);
  },
};
