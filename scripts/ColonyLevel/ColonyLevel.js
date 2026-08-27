const CELL = 32; // fallback cell size when a level omits `cell` (32px convention — the 2026-07 media set is authored 1:1 at 32px/cell)
const PAD_REACH = 2; // cells the landing pad keeps clear of a synthesized level's edge (the 3×3 apron + the border wall)
const PAD_CLEAR = 6; // cells around the apron kept procedural-free (meta.clear) — no camp on the doorstep

/**
 * The colony's level builder: load(), which turns a world-map SITE (contentSites) into level data —
 * its authored file, or a LevelData synthesized from its biome — and build(), which paints that
 * data into a store + grid and returns { grid, spawn, statics, <key>Layer/<key>Type per layer,
 * <key>Colliders per solid layer } for the caller to hang on its Level (ColonyMap._buildWorld does;
 * the Level owns the grid's lifecycle from there). Solid-layer colliders are greedy-meshed by TileEdit.
 *
 * A level is fully resident: everything it holds is built here, once, and simulated for the map's
 * lifetime. `meta.generated` swaps the file's hand-painted grid for a procedural one (_generate),
 * tuned by the biome profile `meta.biome` names — the ground is still ordinary tile data either way,
 * so nothing downstream knows the difference. The file, the seed and the painter are the FIRST
 * build only: a saved map comes back through restore() — its grid cell for cell and its store
 * whole — and never sees them again.
 *
 * File shape is a LevelData plus `meta` — one painter (LevelData.paint) writes it whether it came
 * off disk or out of a generator, so the two branches below differ only in the terrain BASE. Grid
 * size is cols/rows, NOT the room, so a level can exceed the view and the follow camera scrolls
 * across it.
 */
globalThis.ColonyLevel = {
  // The boot site — the colony's home level, and the world map's hub (contentSites.SITES[0]).
  START: "hub",
  // The editor's Test Play map id: load() serves `playtest` for it (sceneColony latches the one-shot
  // playtestFile into it on create), so the file is never a site.
  PLAYTEST: "_playtest",
  playtest: undefined,

  // one-shot editor→play hand-off: the level editor's Test Play sets a save-dir level file;
  // sceneColony consumes it once on create, then clears it
  playtestFile: undefined,

  /**
   * Level data for a map id: the site's authored file where it has one, else a LevelData
   * synthesized from its biome (_siteData). Returns null for an unknown id or a bad file — the
   * caller falls back to START.
   */
  load(id) {
    if (id === ColonyLevel.PLAYTEST)
      return ColonyLevel.playtest === undefined
        ? null
        : LevelSerializer.load(ColonyLevel.playtest, { genre: "topdown" });
    const site = contentSites.get(id);
    if (site === undefined) {
      Log.error(`ColonyLevel: no site "${id}"`);
      return null;
    }
    if (site.file !== undefined)
      return LevelSerializer.load(site.file, { genre: "topdown" });
    return ColonyLevel._siteData(site);
  },

  /**
   * A generated site's level data, synthesized from its def: the biome's climate over the whole
   * level, and the LANDING PAD — the travel beacon on a 3×3 tile apron, with the default entry a
   * cell below it — probed off the biome's field (the same seed the build paints from) so it lands
   * on spawnable ground. The apron is authored content, so AuthoredStamp's claim (widened by
   * meta.clear) keeps the procedural passes off the arrival area. Returns null for an unknown biome.
   */
  _siteData(site) {
    const biome = contentBiomes.BIOMES[site.biome];
    if (biome === undefined) {
      Log.error(`ColonyLevel: site "${site.id}" names no biome profile`);
      return null;
    }
    const cols = site.cols;
    const rows = site.rows;
    const pad = ColonyLevel._padSpot(
      OverworldGen.field(site.seed, biome),
      cols,
      rows,
    );
    const data = {
      version: LevelSerializer.CURRENT_VERSION,
      genre: "topdown",
      cell: CELL,
      cols: cols,
      rows: rows,
      meta: {
        generated: true,
        seed: site.seed,
        biome: site.biome,
        clear: PAD_CLEAR,
        entries: { default: { gx: pad.x, gy: pad.y + 1 } },
      },
      tiles: [{ layer: "floorTile", rects: [[pad.x - 1, pad.y - 1, 3, 3]] }],
      spawns: [
        {
          preset: "prop",
          gx: pad.x,
          gy: pad.y,
          kind: "travel",
          label: "Beacon",
        },
      ],
    };
    const c = biome.climate;
    if (c !== undefined)
      data.meta.climate = [
        {
          name: site.id,
          rect: [0, 0, cols, rows],
          weather: c.weather,
          tempMod: c.tempMod,
          color: c.color,
        },
      ];
    return data;
  },

  /**
   * The landing pad cell: the cell nearest the level center whose 3×3 block is all spawnable
   * ground (ring scan outward), so the beacon, its apron and the arrival cell never sit in water.
   * Falls back to the center when no such block exists (a level that is all water — a data error).
   */
  _padSpot(field, cols, rows) {
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const rMax = Math.max(cols, rows);
    for (let r = 0; r < rMax; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring cells only
          const x = cx + dx;
          const y = cy + dy;
          if (
            x < PAD_REACH ||
            y < PAD_REACH ||
            x >= cols - PAD_REACH ||
            y >= rows - PAD_REACH
          )
            continue;
          if (ColonyLevel._clear3(field, x, y)) return { x: x, y: y };
        }
    Log.warn("ColonyLevel: no spawnable landing pad — using the level center");
    return { x: cx, y: cy };
  },

  _clear3(field, x, y) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (!field.spawnable(x + dx, y + dy)) return false;
    return true;
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
   * Build a Level: paint the grid + mesh each solid layer's kinematic colliders. Returns the built
   * handles; the caller owns grid.destroy() and the colliders. `entryId` selects the player spawn from
   * `meta.entries` (the arrival point of a trip), falling back to entries.default → legacy
   * meta.playerSpawn.
   *
   * `spawns` comes back on every path — the descriptors the caller feeds ColonySpawn, translated
   * but not spawned. `terrainMats` (the material table the render passes stack) is generated-only.
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

    // one collider list per SOLID layer, each remeshed on its own (a wall edit never touches the
    // fence's)
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.solid !== true) continue;
      const colliders = [];
      TileEdit.meshSolid(entities, grid, h[cfg.key + "Layer"], colliders);
      h[cfg.key + "Colliders"] = colliders;
    }

    const spawn = this._resolveSpawn(grid, data, entryId);
    return {
      grid,
      spawn,
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
   * The profile is `meta.biome` (contentBiomes.BIOMES; an unknown name is a data error, logged and
   * generated as steppe so the map still opens); `meta.clear` widens the authored content's claim
   * by that many cells. The terrain lands as per-cell TileTypes on the
   * terrain layer, so it is ordinary tile data from here on — LevelGrid.costAt prices nav from it
   * and the stacked dual-grid passes render it, with no sampler left running at play time.
   * Impassable terrain and the level edge become COLLIDE-ONLY boxes collected into `statics`, apart
   * from the wall layer's mesh so a build-mode remesh can't free them.
   */
  _generate(entities, grid, h, data, statics) {
    const t0 = current_time;
    const biomeId = data.meta.biome ?? "steppe";
    let biome = contentBiomes.BIOMES[biomeId];
    if (biome === undefined) {
      Log.error(
        `ColonyLevel: unknown biome "${biomeId}" — generating as steppe`,
      );
      biome = contentBiomes.BIOMES.steppe;
    }
    const gen = OverworldGen.create({
      seed: data.meta.seed ?? 1337,
      authored: data, // hand-built hub laid over the generated ground (AuthoredStamp)
      clear: data.meta.clear ?? 0,
      biome: biome,
    });
    const out = gen.generate(grid.cols, grid.rows);
    const terrain = ColonyLevel._terrainTypes(gen.palette);
    gen.paint(h.terrainLayer, terrain.types, grid.cols, grid.rows);
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
   * Rebuild a Level from a SAVE — build()'s counterpart for a map that already exists, with no
   * file, seed or painter: the grid and its layers/types come up empty exactly as build() makes
   * them, the cells fill from the saved LevelGrid.pack buffer, and the store imports the saved
   * export whole — every entity under its saved id and generation, colliders and statics included,
   * so nothing is spawned or re-meshed. `saved` is a SaveGame map entry: { cell, cols, rows, layers
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
