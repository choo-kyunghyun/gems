const CELL = 32; // fallback cell size; the media set is authored 1:1 at 32px/cell
const ANCHOR_CLEAR = 6; // cells around a site's anchor kept procedural-free — no camp on the doorstep

/**
 * The colony's level builder: load() turns a world-map site into level data (a LevelData plus
 * `meta`, the generator inputs and whole-map flags), build() generates and paints it into a store
 * + grid, and restore() rebuilds a saved map. The caller owns the returned grid and colliders.
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
    if (biome.indoor === true) meta.indoor = true;
    if (biome.climate !== undefined) meta.climate = biome.climate;
    if (site.settlement !== undefined) meta.settlement = site.settlement;
    if (site.claimable === true) meta.claimable = true;
    if (site.id === ColonyLevel.START) meta.persistent = true; // the home is never rebuilt
    return {
      cell: CELL,
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
   * Insert the tile layers bottom→top and return a handles bag keyed `<key>Layer`/`<key>Type`; a
   * materials-bearing layer also gets `<key>Types` by material key, with `<key>Type` the default
   * (first) material.
   */
  _makeLayers(grid) {
    const h = {};
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      const layer = new TileLayer(grid, {
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
   * Generate and paint a level, meshing each solid layer's colliders; the caller owns
   * grid.destroy() and the colliders. `entryId` picks the arrival entry, falling back to
   * `default`. `spawns` are translated but not spawned.
   *
   * A solid layer's `<key>Colliders` is its own greedy mesh, remeshed wholesale on edit; geometry
   * with no tile layer behind it (impassable terrain, the level edge) belongs to no list, so a
   * remesh never frees it.
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

    const gen = ColonyLevel._generate(entities, grid, h, data);
    const painted = LevelData.paint(gen.out, { layers: h });

    // one list per solid layer, so an edit remeshes only its own layer
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.solid !== true) continue;
      const colliders = [];
      h[cfg.key + "Layer"].meshSolid(entities, grid, colliders);
      h[cfg.key + "Colliders"] = colliders;
    }

    const entries = ColonyLevel._entries(gen.out.spawns);
    const spawn = ColonyLevel._resolveSpawn(grid, entries, entryId);
    return {
      grid,
      spawn,
      entries,
      spawns: painted.spawns,
      terrainMats: gen.mats,
      ...h,
    };
  },

  /**
   * Run the generator and lay down everything that is not LevelData: the terrain base as ordinary
   * per-cell tile data, and collide-only boxes for impassable terrain and the level edge. Returns
   * `{ out, mats }` — the accumulated LevelData (anchor content merged) and the terrain material
   * table. A `danger` of 0 marks a safe site: no raider spawns.
   */
  _generate(entities, grid, h, data) {
    const t0 = current_time;
    const biomeId = data.meta.biome;
    const gen = OverworldGen.create({
      seed: data.meta.seed,
      biome: contentBiomes.BIOMES[biomeId],
      anchor: data.meta.anchor,
      clear: data.meta.clear,
      spawnFilter:
        data.meta.danger === 0 ? (s) => s.preset !== "raider" : undefined,
    });
    const out = gen.generate(grid.cols, grid.rows);
    // only a claimable site keeps the anchor's Survey Post
    if (data.meta.claimable !== true)
      out.spawns = out.spawns.filter((s) => s.kind !== "claim");
    const terrain = ColonyLevel._terrainTypes(gen.palette);
    gen.paint(out, h.terrainLayer, terrain.types);
    // terrain types by material id, so content can paint the terrain layer by material
    h.terrainTypes = {};
    for (let i = 0; i < terrain.mats.length; i++)
      h.terrainTypes[terrain.mats[i].material] = terrain.mats[i].type;
    Colliders.boxes(entities, out.solid, grid.cellWidth, grid.cellHeight, []);
    ColonyLevel.buildWorldBorder(entities, grid);
    let rects = 0;
    for (let i = 0; i < out.tiles.length; i++)
      rects += out.tiles[i].rects.length;
    Log.info(
      `ColonyLevel: generated ${grid.cols}x${grid.rows} ${biomeId} in ${current_time - t0}ms — ` +
        `${rects} tile rect(s), ${out.spawns.length} spawn(s)`,
    );
    return { out: out, mats: terrain.mats };
  },

  /**
   * A material table as plain save rows, in order so id = index + 1 survives the round trip: the
   * sprite by name (a record holds no handles), a blocking cost as Infinity (null through JSON,
   * still blocking). undefined when there is no table.
   */
  terrainRows(mats) {
    if (mats === undefined) return undefined;
    const rows = [];
    for (let i = 0; i < mats.length; i++)
      rows.push({
        name: mats[i].type.name,
        pathCost: mats[i].type.pathCost,
        sprite: sprite_get_name(mats[i].sprite),
        material: mats[i].material,
      });
    return rows;
  },

  /**
   * Terrain TileTypes for a material table, id = index + 1 (0 is an empty cell); the order is the
   * paint order, so render passes can threshold on the id. `defs` is a generator palette (sprite
   * refs) or saved rows (sprite names). Returns `{ types, mats }`.
   */
  _terrainTypes(defs) {
    const types = [];
    const mats = [];
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const type = new TileType({
        id: i + 1,
        name: d.name,
        pathCost: d.pathCost,
      });
      types.push(type);
      const sprite =
        typeof d.sprite === "string" ? asset_get_index(d.sprite) : d.sprite;
      mats.push({ type: type, sprite: sprite, material: d.material ?? d.id });
    }
    return { types: types, mats: mats };
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
   * Rebuild a saved map's grid: the layers come up as build() makes them and the cells fill from
   * the packed buffer — no seed, no generator, nothing spawned or remeshed. `buf` stays the
   * caller's to free. Returns null when the buffer doesn't fit the layer stack.
   */
  restore(shape, terrainMats, buf) {
    const grid = new LevelGrid({
      cellWidth: shape.cellWidth,
      cellHeight: shape.cellHeight,
      cols: shape.cols,
      rows: shape.rows,
    });
    const h = ColonyLevel._makeLayers(grid);
    // per layer, the TileType each packed id means
    let mats;
    const tables = [];
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      const table = [];
      if (cfg.key === "terrain" && terrainMats !== undefined) {
        const terrain = ColonyLevel._terrainTypes(terrainMats);
        mats = terrain.mats;
        for (let t = 0; t < terrain.types.length; t++)
          table[terrain.types[t].id] = terrain.types[t];
      } else if (cfg.materials !== undefined) {
        const types = h[cfg.key + "Types"];
        for (let m = 0; m < cfg.materials.length; m++) {
          const t = types[cfg.materials[m].key];
          table[t.id] = t;
        }
      } else {
        const t = h[cfg.key + "Type"];
        table[t.id] = t;
      }
      tables.push(table);
    }
    if (!grid.unpack(buf, (l, id) => tables[l][id])) {
      grid.destroy();
      return null;
    }
    return { grid, terrainMats: mats, ...h };
  },

  /**
   * A solid border ringing the level so nothing can leave. Left/right span one cell past
   * top/bottom to cover the outer corners (no diagonal slip-through).
   */
  buildWorldBorder(entities, grid) {
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const W = grid.cols * cw;
    const H = grid.rows * ch;
    Colliders.box(entities, 0, -ch, W, ch);
    Colliders.box(entities, 0, H, W, ch);
    Colliders.box(entities, -cw, -ch, cw, H + 2 * ch);
    Colliders.box(entities, W, -ch, cw, H + 2 * ch);
  },

  /** The player spawn in world coords, falling back to the `default` entry. */
  _resolveSpawn(grid, entries, entryId) {
    const e = entries[entryId] ?? entries.default;
    return grid.gridToWorld(e.gx, e.gy);
  },
};
