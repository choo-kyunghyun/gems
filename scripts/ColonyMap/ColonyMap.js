// Map engine for the colony scene — the map pool and the data + runtime over a Level.
// Free functions over the level (composition; GMRT has no usable class inheritance).
/**
 * A map IS a Level in the World pool, and everything the colony holds of it is a component of
 * that Level's own entity (`level.self`): the DATA record under KEY — a save holds it — and the
 * RUNTIME under RUNTIME, derived on the map's first activation and freed with the level. Nothing
 * of a map lives here or on the scene, so a park is a camera unassign and a resume a pointer swap
 * (ColonyTravel — the squad's crossing and the two ways into a map; this engine knows the level
 * and never the scene).
 *
 * The data record (`ColonyMap.of(level)`):
 * @typedef {Object} ColonyMapData
 * @property {{x:number,y:number}} spawn  the point the map was entered at (world) — the respawn point, the trader's market point
 * @property {Object<string,{x:number,y:number}>} entries  the named arrival points (world) — a later arrival lands at one
 * @property {Object<string,number[]>} colliders  per solid LAYERS key, its greedy-meshed collider ids (remeshed whole on an edit — BuildMode)
 * @property {Array|undefined} terrainMats  a generated map's terrain material table as rows (ColonyLevel.terrainRows); undefined with one fill type
 * @property {AABBRect|undefined} reachZone  the reach quest's region; undefined on a map without the marker
 * @property {boolean} reachDone
 *
 * The runtime (`ColonyMap.runtime(level)`) — the tilemap handles, one set per contentTiles.LAYERS
 * entry: `<key>Layer` (the TileLayer) and `<key>Type` (its default TileType), plus `<key>Types`
 * (material key → TileType) on a materials-bearing layer — mounted with the level, and the
 * presentation, built once by ColonyView.activate:
 * @typedef {Object} ColonyMapRuntime
 * @property {Array|undefined} terrainMats  the material table as live rows ({ type, sprite, material } — ColonyLevel._terrainTypes)
 * @property {Renderer|undefined} renderer  the pass stack; undefined until the first activation
 * @property {Object<string,RenderPass>} tilePasses  the tile pass per layer key — a BuildMode edit marks its layer's dirty
 * @property {RenderTileMap[]} terrainPasses  a generated map's ground stack, lowest material first — GrassSystem marks them
 * @property {RenderGrass|undefined} grassPass  the grass volume layer — likewise
 * @property {RenderDebugEntity} bboxPass  the lime BBox outlines — the `debugBBox` setting drives its `enabled`
 * The spatial mirrors sit on the same entity under their readers' keys: the NavGrid under
 * PathfindingSystem.KEY, the Rooms under RoomSystem.MIRROR; the camera is an ENTITY of the
 * store (ColonyView) and its native view sits under CameraSystem.KEY.
 */
/**
 * Two ways a Level comes to be: build() is a map's FIRST visit — the site's seed, the generator,
 * the painter, the spawn pass (the only place procedural content is ever made) — and
 * restoreLevel() a SAVED map's, its store whole and its grid cell for cell, with no seed, spawn
 * or remesh. Both pool the Level (World.add), mounted (the layer handles) but not activated: the
 * presentation is ColonyView's, on the first arrival (ColonyTravel), and a map builds exactly
 * once — a revisit resumes the pooled level.
 */
globalThis.ColonyMap = {
  KEY: "map", // its data record's token on the level's own entity — a data key (a save holds it)
  RUNTIME: "map_runtime", // its runtime's derived token there — never saved
  // the tokens of the whole-map records this engine writes on the level's own entity (data keys
  // — a save holds them): `indoor` true on an interior (no sky passes, the cozy BGM), `climate`
  // the pinned sky (Weather.setClimate's record), `biome` the profile id (contentBiomes —
  // FloraSystem's spread pool). A Settlement record sits under Settlement.KEY, the flora clock
  // under FloraSystem.KEY, the room temperatures under RoomSystem.KEY, the player's builds under
  // BuildMode.KEY.
  INDOOR: "indoor",
  CLIMATE: "climate",
  BIOME: "biome",
  WIND: "wind", // the level's constant wind strength (biome profile `wind`) — grass sway

  /** The level's data record (the typedef above). */
  of(level) {
    return level.entities.get(level.self, ColonyMap.KEY);
  },

  /** The level's runtime (the typedef above), or undefined before the level is mounted. */
  runtime(level) {
    return level.entities.get(level.self, ColonyMap.RUNTIME);
  },

  /** A data record with every field declared and nothing built. */
  _data() {
    return {
      spawn: undefined,
      entries: undefined,
      colliders: {},
      terrainMats: undefined,
      reachZone: undefined,
      reachDone: false,
    };
  },

  /** A runtime with every field declared and nothing built; Level.destroy frees it through `destroy`. */
  _runtime() {
    return {
      terrainMats: undefined,
      renderer: undefined,
      tilePasses: {},
      terrainPasses: [],
      grassPass: undefined,
      bboxPass: undefined,
      destroy() {
        if (this.renderer !== undefined) this.renderer.destroy(); // frees the tile/terrain VBOs
      },
    };
  },

  /**
   * World-coord entry points by name — the builder's grid-coord table (ColonyLevel._entries)
   * converted, for repositioning the player on a resume without rebuilding.
   */
  _entryTable(grid, entries) {
    const out = {};
    for (const k in entries)
      out[k] = grid.gridToWorld(entries[k].gx, entries[k].gy);
    return out;
  },

  /**
   * Build a map fresh from its site — the FIRST visit ONLY (a revisit resumes the pooled level;
   * nothing is ever rebuilt). The one place the site's seed, the generator and the spawn pass are
   * read. Returns the Level, pooled and populated but not activated; its id is the site's, or
   * START's when the site failed to load (_loadData). `player` true spawns a fresh player at the
   * entry (boot only) — a trip lands the traveling one instead (ColonyTravel._arriveSquad).
   */
  build(mapId, entryId, player) {
    const loaded = ColonyMap._loadData(mapId, entryId);
    Log.info(`colony map: ${loaded.mapId} (entry ${loaded.entryId})`);
    const r = ColonyMap._buildWorld(loaded.data, loaded.mapId, loaded.entryId, player);
    World.add(loaded.mapId, r.level); // pooled here: the squad lands through the pool (World.put) once this returns
    ColonyMap.populate(r.level, r.built.spawns);
    return r.level;
  },

  /**
   * The level's grid codec (Level.GRID through the store's codec channel — Level's header): pack
   * is the grid's own; unpack rebuilds the grid from the blob's shape and the map record's
   * terrain palette (ColonyLevel.restore) and MOUNTS the layer handles it made, since the
   * TileTypes the cells name are the runtime's. It runs inside the store import, after the plain
   * components — the record is there to read.
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
   * Pool a SAVED map's data — its store whole, the grid cell for cell with it — with no seed,
   * spawn or remesh (a load makes nothing): the Level, mounted (layer handles) but not activated,
   * so its first visit builds the presentation like any resume (ColonyTravel.resume). `m` is a SaveGame map entry,
   * `source(name)` its blobs (the source's to free). Returns the level, or null when the entry is
   * unusable (Log.error'd, nothing pooled) — the map's first visit then builds it fresh, loudly.
   */
  restoreLevel(m, source) {
    const level = new Level({ id: m.id, capacity: m.capacity });
    level.entities.codec(Level.GRID, ColonyMap._gridCodec(level));
    level.entities.import(m.world, source);
    if (ColonyMap.of(level) === undefined)
      Log.error(`map "${m.id}": save entry carries no map record`);
    else if (level.grid !== null) {
      World.add(m.id, level);
      Log.info(`colony map: ${m.id} [restored]`);
      return level;
    }
    level.destroy(); // the codec said why
    return null;
  },

  /**
   * Mount the level's runtime with the builder's handles — the material table as live rows and
   * one Layer/Type pair per LAYERS entry, plus <key>Types for a materials-bearing layer (wall).
   */
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

  _loadData(mapId, entryId) {
    let data = ColonyLevel.load(mapId);
    if (data === null) {
      Log.error(`map "${mapId}" failed — falling back to ${ColonyLevel.START}`);
      mapId = ColonyLevel.START;
      entryId = "default";
      data = ColonyLevel.load(mapId);
    }
    return { data, mapId, entryId };
  },

  /**
   * The Level (store + LevelGrid + its whole-map records) with the map's data record filled and
   * its runtime mounted. The player spawns here ONLY on boot (`player`) — a trip arrival
   * transfers the whole player entity in (ColonyTravel._arriveSquad). Returns { level, built } —
   * ColonyLevel's built handles, which build() threads on to populate. A map is fully resident
   * (scatter entities + terrain/wall colliders all live at once), so its cap scales with the grid.
   */
  _buildWorld(data, mapId, entryId, player) {
    const level = new Level({
      id: mapId,
      capacity: Math.max(1024, Math.ceil((data.cols * data.rows) / 4)),
    });
    level.entities.codec(Level.GRID, ColonyMap._gridCodec(level)); // the grid saves as a blob
    const built = ColonyLevel.build(level.entities, data, entryId);
    level.grid = built.grid;
    const rec = ColonyMap._data();
    level.entities.add(level.self, ColonyMap.KEY, rec);
    rec.spawn = built.spawn;
    rec.entries = ColonyMap._entryTable(level.grid, built.entries); // named entries → world coords
    rec.terrainMats = ColonyLevel.terrainRows(built.terrainMats);
    // <key>Colliders for a solid layer (wall, fence — BuildMode remeshes exactly these)
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const key = contentTiles.LAYERS[i].key;
      if (built[key + "Colliders"] !== undefined)
        rec.colliders[key] = built[key + "Colliders"];
    }
    ColonyMap._mount(level, built);
    // boot only: spawn the player (mints the Squad id). A trip arrival instead lands the
    // transferred player once the level is pooled (ColonyTravel.build).
    if (player) ColonyPlayer.spawn(level.entities, built.spawn);

    // The level's whole-map records (components of its own entity), off the data's meta: the
    // indoor flag (no sky passes, the cozy interior BGM), the climate (pinned over the map by
    // _applyClimate on every arrival), and the settlement (optional meta.settlement — an authored
    // faction hub / raider camp; the overworld is the colony's "hub", whose NPCs and stockpile
    // chest are its Residents, their settlementId this map's id). A level without one stays
    // unsettled until a Survey Post founds it (BuildMode.claim).
    const entities = level.entities;
    const self = level.self;
    entities.add(self, ColonyMap.BIOME, data.meta.biome);
    const prof = contentBiomes.BIOMES[data.meta.biome];
    if (prof !== undefined && prof.wind !== undefined)
      entities.add(self, ColonyMap.WIND, prof.wind);
    if (data.meta.indoor === true) entities.add(self, ColonyMap.INDOOR, true);
    if (data.meta.climate !== undefined)
      entities.add(self, ColonyMap.CLIMATE, data.meta.climate);
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
   * The level's residents, all live at once — a map is fully simulated for its lifetime. One
   * adapter (ColonySpawn.spawnEntity) over the descriptors the build handed back — the file's, the
   * generator's, or both merged, since the builder resolves that. The scene reads NPC/portal/enemy/
   * companion handles LIVE by component query — stored id lists would dangle across a map swap.
   */
  populate(level, spawns) {
    const entities = level.entities;
    const grid = level.grid;
    for (let i = 0; i < spawns.length; i++)
      ColonySpawn.spawnEntity(entities, grid, spawns[i]);
    // A region, not an entity, so it is read off the descriptors here (and saved as a rect thereafter).
    const rec = ColonyMap.of(level);
    rec.reachZone = ColonyMap._reach(grid, spawns);
    rec.reachDone = rec.reachZone === undefined; // nothing to reach on this map
  },

  /**
   * Reach-quest zone from the level's "reach" spawn descriptor (undefined when the map has no
   * marker). A region, not an entity — so it is resolved from the descriptor rather than spawned,
   * and kept as a rect from there on.
   */
  _reach(grid, spawns) {
    for (let i = 0; i < spawns.length; i++)
      if (spawns[i].preset === "reach")
        return ColonySpawn.reachZone(grid, spawns[i]);
    return undefined;
  },
};
