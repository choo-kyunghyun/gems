/**
 * The colony's maps.
 *
 * A map IS a Level in the World pool, and everything the colony holds of it is a component of
 * that Level's own entity (`level.self`): the saved data record under KEY and the runtime under
 * RUNTIME, derived when the level is mounted and freed with it. Nothing of a map lives here, so
 * parking and resuming a map cost no rebuild.
 *
 * A Level comes to be one of two ways: build() on a visit to a map not pooled (the only place
 * procedural content is made) and restoreLevel() for a saved map (no seed or spawn). Both
 * pool the Level mounted but not activated. A PERSISTENT map builds once and a revisit resumes
 * it; any other is transient, freed on departure and built afresh from a new seed next visit.
 *
 * @typedef {Object} ColonyMapData
 * @property {{x:number,y:number}} spawn  the point the map was entered at (world) — the respawn point
 * @property {Object<string,{x:number,y:number}>} entries  the named arrival points (world)
 * @property {Array|undefined} terrainMats  the terrain material table as rows; undefined with one fill type
 *
 * The runtime also holds, per layer key, `<key>Layer` (the TileLayer), `<key>Type` (its default
 * TileType) and, on a materials-bearing layer, `<key>Types` (material key → TileType).
 * @typedef {Object} ColonyMapRuntime
 * @property {Array|undefined} terrainMats  the material table as live rows
 */
globalThis.ColonyMap = {
  KEY: "colony_map", // saved
  RUNTIME: "colony_map_runtime", // derived, never saved
  // Saved whole-map records on the level's own entity.
  INDOOR: "indoor",
  CLIMATE: "climate",
  BIOME: "biome",
  WIND: "wind", // constant wind strength
  PERSISTENT: "persistent", // true: kept pooled across departures
  VISITS: "colony_visits", // saved, on the world's own entity

  of(level) {
    return level.entities.get(level.self, ColonyMap.KEY);
  },

  persistent(level) {
    return level.entities.get(level.self, ColonyMap.PERSISTENT) === true;
  },

  /** Keep the map pooled from now on. */
  persist(level) {
    level.entities.add(level.self, ColonyMap.PERSISTENT, true);
  },

  /** `{ mapId -> builds so far }` */
  visits(world) {
    return world.of(ColonyMap.VISITS, () => ({}));
  },

  /** Undefined before the level is mounted. */
  runtime(level) {
    return level.entities.get(level.self, ColonyMap.RUNTIME);
  },

  _data() {
    return {
      spawn: undefined,
      entries: undefined,
      terrainMats: undefined,
    };
  },

  _runtime() {
    return { terrainMats: undefined };
  },

  /** Grid-coord entries converted to world coords, so a resume can reposition without a rebuild. */
  _entryTable(grid, entries) {
    const out = {};
    for (const k in entries)
      out[k] = grid.gridToWorld(entries[k].gx, entries[k].gy);
    return out;
  },

  /**
   * Build a map fresh from its site, at a seed of this build's own. Returns the Level, pooled in
   * `world` and populated but not activated; its id is the site's, or START's when the site failed
   * to load. `player` true spawns a fresh player at the entry (boot only).
   */
  build(world, mapId, entryId, player) {
    const loaded = ColonyMap._loadData(world, mapId, entryId);
    Log.info(
      `colony map: ${loaded.mapId} (entry ${loaded.entryId}, seed ${loaded.data.meta.seed})`,
    );
    const r = ColonyMap._buildLevel(loaded.data, loaded.mapId, loaded.entryId, player);
    world.add(loaded.mapId, r.level); // pooled before populate so arrivals can land through the pool
    ColonyMap.populate(r.level, r.built.spawns);
    return r.level;
  },

  /**
   * The level's grid codec. Unpack also mounts the layer handles, since the TileTypes the cells
   * name are runtime objects; it runs after the plain components, so the map record is readable.
   */
  _gridCodec(level) {
    return {
      pack: (grid) => grid.pack(),
      unpack: (buf) => {
        if (buf === undefined) {
          Log.error(`map "${level.id}": save carries no grid blob`);
          return undefined;
        }
        const rec = ColonyMap.of(level);
        const h = ColonyLevel.restore(
          LevelGrid.shape(buf),
          rec === undefined ? undefined : rec.terrainMats,
          buf,
        );
        if (h === null) return undefined;
        ColonyMap._mount(level, h);
        return h.grid;
      },
    };
  },

  /**
   * Pool a saved map in `world` with no seed or spawn, mounted but not activated. `source(name)`
   * yields its blobs (the source's to free). Returns the level, or null when the entry is unusable
   * (logged, nothing pooled) — the map's first visit then builds it fresh.
   */
  restoreLevel(world, m, source) {
    const level = new Level({ id: m.id, capacity: m.capacity });
    level.entities.codec(Level.GRID, ColonyMap._gridCodec(level));
    level.entities.import(m.level, source);
    if (ColonyMap.of(level) === undefined)
      Log.error(`map "${m.id}": save entry carries no map record`);
    else if (level.grid !== null) {
      world.add(m.id, level);
      Log.info(`colony map: ${m.id} [restored]`);
      return level;
    }
    level.destroy(); // the codec said why
    return null;
  },

  _mount(level, h) {
    const rt = level.entities.derive(level.self, ColonyMap.RUNTIME, ColonyMap._runtime);
    rt.terrainMats = h.terrainMats;
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const key = contentTiles.LAYERS[i].key;
      rt[key + "Layer"] = h[key + "Layer"];
      rt[key + "Type"] = h[key + "Type"];
      if (h[key + "Types"] !== undefined) rt[key + "Types"] = h[key + "Types"];
    }
  },

  /** Counts the build against the map it lands on. */
  _loadData(world, mapId, entryId) {
    const visits = ColonyMap.visits(world);
    let data = ColonyLevel.load(mapId, visits[mapId] ?? 0);
    if (data === null) {
      Log.error(`map "${mapId}" failed — falling back to ${ColonyLevel.START}`);
      mapId = ColonyLevel.START;
      entryId = "default";
      data = ColonyLevel.load(mapId, visits[mapId] ?? 0);
    }
    visits[mapId] = (visits[mapId] ?? 0) + 1;
    return { data, mapId, entryId };
  },

  /**
   * The Level with its data record filled and runtime mounted; returns { level, built }. A map is
   * fully resident, so its entity cap scales with the grid.
   */
  _buildLevel(data, mapId, entryId, player) {
    const level = new Level({
      id: mapId,
      capacity: Math.max(1024, Math.ceil((data.cols * data.rows) / 4)),
    });
    level.entities.codec(Level.GRID, ColonyMap._gridCodec(level)); // the grid saves as a blob
    const built = ColonyLevel.build(data, entryId);
    level.grid = built.grid;
    const rec = ColonyMap._data();
    level.entities.add(level.self, ColonyMap.KEY, rec);
    rec.spawn = built.spawn;
    rec.entries = ColonyMap._entryTable(level.grid, built.entries);
    rec.terrainMats = ColonyLevel.terrainRows(built.terrainMats);
    ColonyMap._mount(level, built);
    Grassland.clearBuilt(level);
    // A trip arrival transfers the existing player instead.
    if (player) ColonyPlayer.spawn(level.entities, built.spawn);

    // A level without an authored settlement stays unsettled until one is founded in play.
    const entities = level.entities;
    const self = level.self;
    entities.add(self, ColonyMap.BIOME, data.meta.biome);
    const prof = contentBiomes.BIOMES[data.meta.biome];
    if (prof !== undefined && prof.wind !== undefined)
      entities.add(self, ColonyMap.WIND, prof.wind);
    if (data.meta.indoor === true) entities.add(self, ColonyMap.INDOOR, true);
    if (data.meta.climate !== undefined)
      entities.add(self, ColonyMap.CLIMATE, data.meta.climate);
    if (data.meta.persistent === true) ColonyMap.persist(level);
    const s = data.meta.settlement;
    if (s !== undefined)
      Settlement.found(level, {
        name: s.name !== undefined ? I18n.text(s.name) : "", // an i18n key
        factionId: s.faction,
        color: s.color,
        comp: s.comp, // SettlementComponent id array
      });
    return { level, built };
  },

  /**
   * Spawn the level's residents, all live at once — a map is fully simulated for its lifetime.
   * Readers query residents live by component; stored id lists would dangle across a map swap.
   */
  populate(level, spawns) {
    const entities = level.entities;
    const grid = level.grid;
    for (let i = 0; i < spawns.length; i++)
      ColonySpawn.spawnEntity(entities, grid, spawns[i]);
  },
};
