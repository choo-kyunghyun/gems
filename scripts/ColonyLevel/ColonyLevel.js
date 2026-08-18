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
 * File shape is a LevelData plus `meta` — one painter (LevelData.paint) writes it whether it came
 * off disk or out of a generator, so the two branches below differ only in the terrain BASE. Grid
 * size is cols/rows, NOT the room, so a level can exceed the view and the follow camera scrolls
 * across it.
 */
globalThis.ColonyLevel = {
  // World graph: map id → level file. Maps are connected by `portal` spawns (see ColonySpawn.spawnEntity).
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
   * Build a Level: paint the grid + mesh kinematic wall colliders. Returns the built handles; the
   * caller owns grid.destroy() and the colliders. `entryId` selects the player spawn from
   * `meta.entries` (the matching side of a portal), falling back to entries.default → legacy
   * meta.playerSpawn.
   *
   * `spawns` comes back on every path — the descriptors the caller feeds ColonySpawn, translated
   * but not spawned. `terrainMats` (the material table the render passes stack) is generated-only.
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

    // The CONTENT is one shape either way: a generated level's passes ACCUMULATE a LevelData (the
    // file's own content among them, via AuthoredStamp), an authored level IS one. Only the terrain
    // BASE forks — the biome field paints it per cell, a hand-painted map auto-fills the walkable
    // material.
    let content = data;
    let mats;
    if (data.meta.generated === true) {
      const gen = ColonyLevel._generate(entities, grid, h, data, statics);
      content = gen.out;
      mats = gen.mats;
    } else {
      ColonyLevel._fillLayers(grid, h);
    }
    const painted = LevelData.paint(content, { grid: grid, layers: h });

    const colliders = [];
    TileEdit.meshSolid(entities, grid, h.wallLayer, colliders);

    const spawn = this._resolveSpawn(grid, data, entryId);
    return {
      grid,
      spawn,
      colliders,
      statics,
      spawns: painted.spawns,
      terrainMats: mats,
      ...h,
    };
  },

  /**
   * Run the generator and lay down everything that is NOT LevelData: the biome terrain base, and
   * the collide-only geometry that has no tile layer behind it. Returns `{ out, mats }` — `out` the
   * accumulated LevelData for the caller's painter (the file's authored content is already merged
   * into it by AuthoredStamp), `mats` the palette table the stacked render passes threshold on.
   *
   * The terrain lands as per-cell TileTypes on the terrain layer, so it is ordinary tile data from
   * here on — LevelGrid.costAt prices nav from it and the stacked dual-grid passes render it, with
   * no sampler left running at play time. Impassable terrain and the level edge become COLLIDE-ONLY
   * boxes collected into `statics`, apart from the wall layer's mesh so a build-mode remesh can't
   * free them.
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
    SolidSystem.boxes(
      entities,
      out.solid,
      grid.cellWidth,
      grid.cellHeight,
      statics,
    );
    ColonyLevel.buildWorldBorder(entities, grid, statics);
    let rects = 0;
    for (let i = 0; i < out.tiles.length; i++)
      rects += out.tiles[i].rects.length;
    Log.info(
      `ColonyLevel: generated ${grid.cols}x${grid.rows} in ${current_time - t0}ms — ` +
        `${rects} tile rect(s), ${out.spawns.length} spawn(s)`,
    );
    return { out: out, mats: mats };
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
    out.push(SolidSystem.box(entities, 0, -ch, W, ch)); // top
    out.push(SolidSystem.box(entities, 0, H, W, ch)); // bottom
    out.push(SolidSystem.box(entities, -cw, -ch, cw, H + 2 * ch)); // left
    out.push(SolidSystem.box(entities, W, -ch, cw, H + 2 * ch)); // right
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
