const ANCHOR_CLEAR = 6; // cells around a site's anchor kept procedural-free — no camp on the doorstep

/**
 * The colony's level builder: load() turns a world-map site into level data (a LevelData plus
 * `meta`, the generator inputs and whole-map flags), build() generates and paints it into a store
 * + grid, and restore() rebuilds a saved map's grid over its cells. The caller owns the returned
 * grid.
 *
 * Every level is procedural and fully resident: the site's seed and biome drive the generator and
 * its anchor prefab fixes the one hand-built structure, on a build only — a saved map comes back
 * whole through restore(). The first build lays the site's own seed and each later one a seed of
 * its own. Grid size is cols/rows, not the room, so a level can exceed the view.
 */
globalThis.ColonyLevel = {
  // The boot site — the colony's home level and the world map's hub.
  START: "hub",
  SEED_SALT: 811, // folds the build count into a revisit's seed

  /** Level data for a site id at its `visit`th build (0 = first); null for an unknown id or biome. */
  load(id, visit = 0) {
    const site = contentSites.get(id);
    if (site === undefined) {
      Log.error(`ColonyLevel: no site "${id}"`);
      return null;
    }
    return ColonyLevel._siteData(site, visit);
  },

  /**
   * An empty LevelData at the site's size whose `meta` carries the generator inputs and whole-map
   * flags. Returns null for an unknown biome.
   */
  _siteData(site, visit) {
    const biome = contentBiomes.BIOMES[site.biome];
    if (biome === undefined) {
      Log.error(`ColonyLevel: site "${site.id}" names no biome profile`);
      return null;
    }
    const meta = {
      seed: ColonyLevel._seed(site.seed, visit),
      biome: site.biome,
      anchor: site.anchor,
      clear: site.clear ?? ANCHOR_CLEAR,
      danger: site.danger,
    };
    if (site.settlement !== undefined) meta.settlement = site.settlement;
    if (site.claimable === true) meta.claimable = true;
    if (site.id === ColonyLevel.START) meta.persistent = true; // the home is never rebuilt
    return {
      cell: LevelGrid.CELL,
      cols: site.cols,
      rows: site.rows,
      meta: meta,
      tiles: [],
      spawns: [],
    };
  },

  /** A site's first build lays its own seed; each later one a seed hashed from it and the count. */
  _seed(base, visit) {
    if (visit === 0) return base;
    return Math.floor(hash2(base, visit, ColonyLevel.SEED_SALT) * 2147483647);
  },

  /**
   * Insert the tile layers bottom→top, each under its content key with every type it may hold
   * bound, a materials layer's first material its default. `terrain` (TileTypes) stands in for
   * the terrain layer's lone type; with `cells`, each layer adopts its saved id channel.
   */
  _makeLayers(grid, terrain, cells) {
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      const layer = new TileLayer(grid, {
        key: cfg.key,
        emptyCost: cfg.emptyCost,
        ids: cells === undefined ? undefined : cells.layers[i],
      });
      grid.insert(layer);
      if (cfg.key === "terrain" && terrain !== undefined) {
        for (let t = 0; t < terrain.length; t++) layer.bind(terrain[t]);
      } else if (cfg.materials !== undefined) {
        for (let m = 0; m < cfg.materials.length; m++) {
          const mat = cfg.materials[m];
          layer.bind(
            new TileType({ id: mat.id, key: mat.key, name: I18n.text(mat.name), pathCost: cfg.pathCost }),
          );
        }
      } else {
        layer.bind(new TileType({ id: cfg.id, name: I18n.text(cfg.name), pathCost: cfg.pathCost }));
      }
    }
  },

  /** An empty grid of `shape`'s cell size, cols and rows. */
  _grid(shape) {
    return new LevelGrid({
      cellWidth: shape.cellWidth,
      cellHeight: shape.cellHeight,
      cols: shape.cols,
      rows: shape.rows,
    });
  },

  /**
   * Generate and paint a level; the caller owns grid.destroy(). `entryId` picks the arrival entry,
   * falling back to `default`. `spawns` are translated but not spawned; `terrain` is the ground's
   * material keys, id = index + 1.
   */
  build(data, entryId = "default") {
    const cell = data.cell ?? LevelGrid.CELL;
    const grid = ColonyLevel._grid({ cellWidth: cell, cellHeight: cell, cols: data.cols, rows: data.rows });
    const gen = ColonyLevel._generator(data);
    const terrain = [];
    for (let i = 0; i < gen.palette.length; i++) terrain.push(gen.palette[i].id);
    const types = ColonyLevel._terrainTypes(terrain);
    ColonyLevel._makeLayers(grid, types);

    const out = ColonyLevel._generate(gen, grid, types, data);
    const painted = LevelData.paint(out, grid);

    const entries = ColonyLevel._entries(out.spawns);
    const spawn = ColonyLevel._resolveSpawn(grid, entries, entryId);
    return { grid, spawn, entries, spawns: painted.spawns, terrain };
  },

  /** The site's generator. A `danger` of 0 marks a safe site: no raider spawns. */
  _generator(data) {
    return OverworldGen.create({
      seed: data.meta.seed,
      biome: contentBiomes.BIOMES[data.meta.biome],
      anchor: data.meta.anchor,
      clear: data.meta.clear,
      spawnFilter:
        data.meta.danger === 0 ? (s) => s.preset !== "raider" : undefined,
    });
  },

  /**
   * Run the generator and lay down what is not LevelData: the terrain base as ordinary per-cell
   * tile data. Returns the accumulated LevelData, anchor content merged.
   */
  _generate(gen, grid, types, data) {
    const t0 = current_time;
    const out = gen.generate(grid.cols, grid.rows);
    // only a claimable site keeps the anchor's Survey Post
    if (data.meta.claimable !== true)
      out.spawns = out.spawns.filter((s) => s.kind !== "claim");
    gen.paint(out, grid.layer("terrain"), types);
    let cells = 0;
    for (let i = 0; i < out.tiles.length; i++)
      cells += out.tiles[i].cells.length / 2;
    Log.info(
      `ColonyLevel: generated ${grid.cols}x${grid.rows} ${data.meta.biome} in ${current_time - t0}ms — ` +
        `${cells} tile cell(s), ${out.spawns.length} spawn(s)`,
    );
    return out;
  },

  /**
   * Terrain TileTypes for a ground's material keys, id = index + 1 (0 is an empty cell); the order
   * is the paint order, so render passes can threshold on the id. A key gone from the content
   * keeps its id and costs 1.
   */
  _terrainTypes(keys) {
    const types = [];
    for (let i = 0; i < keys.length; i++) {
      const m = contentBiomes.MATERIALS[keys[i]];
      types.push(
        new TileType({
          id: i + 1,
          key: keys[i],
          name: m !== undefined ? m.name : keys[i],
          pathCost: m !== undefined ? m.pathCost : undefined,
        }),
      );
    }
    return types;
  },

  /**
   * The named arrival points (grid coords) off the `entry` markers. A level with no default entry
   * is a data error: thrown, not defaulted.
   */
  _entries(spawns) {
    const out = {};
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      if (s.preset === "entry") out[s.id ?? "default"] = { gx: s.gx, gy: s.gy };
    }
    if (out.default === undefined)
      throw new Error("ColonyLevel: the level has no default entry");
    return out;
  },

  /**
   * Rebuild a saved map's grid over its cells record: the layers come up as build() makes them,
   * each adopting its saved cells — no seed, no generator, nothing spawned. `terrain` is the
   * ground's material keys build() returned. Null when the record doesn't fit the layer stack.
   * @param {LevelCells} cells
   */
  restore(cells, terrain) {
    if (cells.layers.length !== contentTiles.LAYERS.length) {
      Log.error(
        `ColonyLevel.restore: the save holds ${cells.layers.length} layer(s), ` +
          `the stack ${contentTiles.LAYERS.length}`,
      );
      return null;
    }
    const grid = ColonyLevel._grid(cells);
    const types = terrain !== undefined ? ColonyLevel._terrainTypes(terrain) : undefined;
    ColonyLevel._makeLayers(grid, types, cells);
    grid.prune();
    return grid;
  },

  /** The player spawn in world coords, falling back to the `default` entry. */
  _resolveSpawn(grid, entries, entryId) {
    const e = entries[entryId] ?? entries.default;
    return grid.gridToWorld(e.gx, e.gy);
  },
};
