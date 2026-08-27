const CELL = 32; // fallback cell size when a level omits `cell` (32px convention — the 2026-07 media set is authored 1:1 at 32px/cell)
const ANCHOR_CLEAR = 6; // cells around a site's anchor prefab kept procedural-free (meta.clear) — no camp on the doorstep

/**
 * The colony's level builder: load(), which turns a world-map SITE (contentSites) into level data —
 * a LevelData whose `meta` carries the site's generator inputs — and build(), which paints that
 * data into a store + grid and returns { grid, spawn, entries, statics, spawns, <key>Layer/<key>Type
 * per layer, <key>Colliders per solid layer } for the caller to hang on its Level
 * (ColonyMap._buildWorld does; the Level owns the grid's lifecycle from there). Solid-layer
 * colliders are greedy-meshed by TileEdit.
 *
 * A level is fully resident: everything it holds is built here, once, and simulated for the map's
 * lifetime. Every level is PROCEDURAL — there is no level file: the biome-profiled generator
 * (_generate) runs over the site's seed, and the site's anchor prefab fixes its one hand-built
 * structure — so the ground is ordinary tile data from the first frame and nothing downstream
 * knows how it came to be. The seed and the generator are the FIRST build only: a saved map comes
 * back through restore() — its grid cell for cell and its store whole — and never sees them again.
 *
 * Level data is a LevelData plus `meta` (the site's generator inputs and whole-map flags); the
 * generator's accumulated LevelData is written by the one painter (LevelData.paint) over the
 * terrain base it also produced. Grid size is cols/rows, NOT the room, so a level can exceed the
 * view and the follow camera scrolls across it.
 */
globalThis.ColonyLevel = {
  // The boot site — the colony's home level, and the world map's hub (contentSites.SITES[0]).
  START: "hub",

  /**
   * Level data for a map id (the site's — _siteData). Returns null for an unknown id or an unknown
   * biome — the caller falls back to START.
   */
  load(id) {
    const site = contentSites.get(id);
    if (site === undefined) {
      Log.error(`ColonyLevel: no site "${id}"`);
      return null;
    }
    return ColonyLevel._siteData(site);
  },

  /**
   * A site's level data: an empty LevelData at the site's size whose `meta` carries what the
   * generator and the map runtime read — the seed, the biome profile, the anchor prefab and its
   * clear margin, and, off the profile and the site, the whole-map indoor flag, climate and
   * settlement. The arrival points come out of the generator (the anchor's `entry` marker), not
   * the data. Returns null for an unknown biome.
   */
  _siteData(site) {
    const biome = contentBiomes.BIOMES[site.biome];
    if (biome === undefined) {
      Log.error(`ColonyLevel: site "${site.id}" names no biome profile`);
      return null;
    }
    const meta = {
      seed: site.seed,
      biome: site.biome,
      anchor: site.anchor,
      clear: site.clear ?? ANCHOR_CLEAR,
    };
    if (biome.indoor === true) meta.indoor = true;
    if (biome.climate !== undefined) meta.climate = biome.climate;
    if (site.settlement !== undefined) meta.settlement = site.settlement;
    return {
      cell: CELL,
      cols: site.cols,
      rows: site.rows,
      meta: meta,
      tiles: [],
      spawns: [],
    };
  },

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
   * Build a Level: generate, paint the grid + mesh each solid layer's kinematic colliders. Returns
   * the built handles; the caller owns grid.destroy() and the colliders. `entryId` selects the
   * player spawn from the level's entries (the arrival point of a trip), falling back to `default`.
   *
   * `spawns` are the descriptors the caller feeds ColonySpawn, translated but not spawned;
   * `entries` the named arrival points in grid coords (_entries); `terrainMats` the material
   * table the render passes stack.
   *
   * TWO kinds of collider list, because they have different lifetimes: a solid layer's
   * `<key>Colliders` is its greedy mesh, which BuildMode remeshes wholesale on every edit of that
   * layer, while `statics` is the geometry that has no tile layer to remesh from (impassable
   * terrain, the level edge).
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

    // the generator's passes ACCUMULATE the level's LevelData (the anchor prefab's content among
    // them) over the terrain base _generate paints; the one painter then writes that content
    const gen = ColonyLevel._generate(entities, grid, h, data, statics);
    const painted = LevelData.paint(gen.out, { grid: grid, layers: h });

    // one collider list per SOLID layer, each remeshed on its own (a wall edit never touches the
    // fence's)
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.solid !== true) continue;
      const colliders = [];
      TileEdit.meshSolid(entities, grid, h[cfg.key + "Layer"], colliders);
      h[cfg.key + "Colliders"] = colliders;
    }

    const entries = ColonyLevel._entries(gen.out.spawns);
    const spawn = ColonyLevel._resolveSpawn(grid, entries, entryId);
    return {
      grid,
      spawn,
      entries,
      statics,
      spawns: painted.spawns,
      terrainMats: gen.mats,
      ...h,
    };
  },

  /**
   * Run the generator and lay down everything that is NOT LevelData: the biome terrain base, and
   * the collide-only geometry that has no tile layer behind it. Returns `{ out, mats }` — `out` the
   * accumulated LevelData for the caller's painter (the anchor prefab's content is already merged
   * into it), `mats` the palette table the stacked render passes threshold on.
   *
   * The profile is `meta.biome` (contentBiomes.BIOMES — load() already rejected an unknown one),
   * the fixed structure `meta.anchor` (a Prefab id), and `meta.clear` the cells claimed around it.
   * The terrain lands as per-cell TileTypes on the
   * terrain layer, so it is ordinary tile data from here on — LevelGrid.costAt prices nav from it
   * and the stacked dual-grid passes render it, with no generator left running at play time.
   * Impassable terrain and the level edge become COLLIDE-ONLY boxes collected into `statics`, apart
   * from the wall layer's mesh so a build-mode remesh can't free them.
   */
  _generate(entities, grid, h, data, statics) {
    const t0 = current_time;
    const biomeId = data.meta.biome;
    const gen = OverworldGen.create({
      seed: data.meta.seed,
      biome: contentBiomes.BIOMES[biomeId],
      anchor: data.meta.anchor,
      clear: data.meta.clear,
    });
    const out = gen.generate(grid.cols, grid.rows);
    const terrain = ColonyLevel._terrainTypes(gen.palette);
    gen.paint(out, h.terrainLayer, terrain.types);
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
      `ColonyLevel: generated ${grid.cols}x${grid.rows} ${biomeId} in ${current_time - t0}ms — ` +
        `${rects} tile rect(s), ${out.spawns.length} spawn(s)`,
    );
    return { out: out, mats: terrain.mats };
  },

  /**
   * The terrain layer's TileTypes for a material table — one per entry, id = index + 1 (a 0 id
   * reads as an empty cell). The order IS the painter order, which is what lets the stacked render
   * passes threshold on the id. `defs` is a generator palette, or the same rows read back from a
   * save (name / pathCost / sprite — a null pathCost is blocking, TileType's convention). Returns
   * { types, mats }: the types in order, and the { type, sprite } table the render passes stack.
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
      mats.push({ type: type, sprite: d.sprite });
    }
    return { types: types, mats: mats };
  },

  /**
   * The level's named arrival points (grid coords) off the content's `entry` markers — the anchor
   * prefab's `{ preset: "entry", id?, gx, gy }`, id default "default". A level with no default
   * entry has nowhere to arrive, so it is a data error: thrown, not defaulted.
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
   * Rebuild a Level from a SAVE — build()'s counterpart for a map that already exists, with no
   * seed or painter: the grid and its layers/types come up empty exactly as build() makes them,
   * the cells fill from the saved LevelGrid.pack buffer, and the store imports the saved export
   * whole — every entity under its saved id and generation, colliders and statics included, so
   * nothing is spawned or re-meshed. `saved` is a SaveGame map entry: { cell, cols, rows, layers
   * (the LAYERS keys the buffer was packed in), terrainMats? (a generated map's palette rows —
   * _terrainTypes), world (the store export) }. Returns { grid, terrainMats, <key>Layer/<key>Type
   * (+Types) } — build()'s bag minus what the scene saved for itself — or null when the buffer or
   * the layer stack doesn't fit (Log.error'd, nothing written).
   */
  restore(entities, saved, buf) {
    const keys = saved.layers ?? [];
    let same = keys.length === contentTiles.LAYERS.length;
    let k = 0;
    while (same) {
      if (k >= keys.length) break;
      if (keys[k] !== contentTiles.LAYERS[k].key) same = false;
      k++;
    }
    if (!same) {
      Log.error(
        `ColonyLevel.restore: saved layer stack [${keys.join(",")}] is not the LAYERS stack`,
      );
      return null;
    }
    const grid = new LevelGrid({
      cellWidth: saved.cell,
      cellHeight: saved.cell,
      cols: saved.cols,
      rows: saved.rows,
    });
    const h = ColonyLevel._makeLayers(grid);
    // per layer, the TileType a packed id means: the terrain palette on a generated map, the
    // material types on a materials-bearing layer, else the layer's one type
    let mats;
    const tables = [];
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      const table = [];
      if (cfg.key === "terrain" && saved.terrainMats !== undefined) {
        const terrain = ColonyLevel._terrainTypes(saved.terrainMats);
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
    entities.import(saved.world);
    return { grid, terrainMats: mats, ...h };
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

  /** Resolve the player spawn (world coords): the named entry, falling back to `default`. */
  _resolveSpawn(grid, entries, entryId) {
    const e = entries[entryId] ?? entries.default;
    return grid.gridToWorld(e.gx, e.gy);
  },
};
