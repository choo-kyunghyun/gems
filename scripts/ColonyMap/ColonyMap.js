// Map engine for the colony scene — world-map travel, the map pool, and the runtime over a Level.
// Free functions over the scene (composition; GMRT has no usable class inheritance).
/**
 * A map IS a Level in the World pool, and everything the colony holds of it lives in that Level's
 * two bags under KEY: the DATA record in `level.meta` — a save holds it — and the RUNTIME in
 * `level.cache`, built on the map's first activation and freed with the level. Nothing of a map
 * lives here or on the scene, so a park is a camera unassign and a resume a pointer swap.
 *
 * The data record (`ColonyMap.of(level)`):
 * @typedef {Object} ColonyMapData
 * @property {{x:number,y:number}} spawn  the point the map was entered at (world) — the respawn point, the trader's market point
 * @property {Object<string,{x:number,y:number}>} entries  the named arrival points (world) — a later arrival lands at one
 * @property {number[]} statics  the collider ids no tile layer owns (impassable terrain, the level edge) — a remesh never frees them
 * @property {Object<string,number[]>} colliders  per solid LAYERS key, its greedy-meshed collider ids (remeshed whole on an edit — BuildMode)
 * @property {Array|undefined} terrainMats  a generated map's terrain material table as rows (ColonyLevel.terrainRows); undefined with one fill type
 * @property {AABBRect|undefined} reachZone  the reach quest's region; undefined on a map without the marker
 * @property {boolean} reachDone
 *
 * The runtime (`ColonyMap.runtime(level)`) — the tilemap handles, one set per contentTiles.LAYERS
 * entry: `<key>Layer` (the TileLayer) and `<key>Type` (its default TileType), plus `<key>Types`
 * (material key → TileType) on a materials-bearing layer — mounted with the level, and the
 * presentation, built once by _activate:
 * @typedef {Object} ColonyMapRuntime
 * @property {Array|undefined} terrainMats  the material table as live rows ({ type, sprite, material } — ColonyLevel._terrainTypes)
 * @property {Renderer|undefined} renderer  the pass stack; undefined until the first activation
 * @property {Object<string,RenderPass>} tilePasses  the tile pass per layer key — a BuildMode edit marks its layer's dirty
 * @property {RenderTileMap[]} terrainPasses  a generated map's ground stack, lowest material first — GrassSystem marks them
 * @property {RenderGrass|undefined} grassPass  the grass volume layer — likewise
 * @property {RenderDebugEntity} bboxPass  the lime BBox outlines — the `debugBBox` setting drives its `enabled`
 * The spatial mirrors sit in the same cache under their readers' keys: the NavGrid under
 * PathfindingSystem.KEY, the Rooms under RoomSystem.KEY, the Broadphase under SeparationSystem.KEY;
 * the camera is an ENTITY of the store (_buildCamera) and its native view sits under
 * CameraSystem.KEY.
 */
/**
 * Visited maps stay ALIVE in the World level pool — data and runtime both on the Level — so a
 * trip never destroys/rebuilds. Only the SQUAD migrates: every entity sharing the player's Squad
 * id (player included) moves as a WHOLE entity through World.take/put — a trip forces a "wait"
 * member back to "follow" first, so the squad always travels together. Travel is by WORLD MAP
 * (travel(), below): the squad deploys from a site's beacon to any other site (contentSites), the
 * crossing costing in-game hours. There is no per-map player and no carried component subset;
 * kicked/unhired companions are plain map residents. Everything is persistent for the session: a
 * map builds from its data exactly ONCE (first visit), then only freezes/thaws — no eviction, cold
 * serialize, or respawn-from-file reconcile.
 *
 * Two ways into a map: build() is the FIRST visit — the site's seed, the generator, the painter,
 * the spawn pass (the only place procedural content is ever made); resume() is a pooled level —
 * parked earlier, or restored from a save (restoreLevel pools a saved map's data at load, its
 * runtime built on its first visit). go() picks between them.
 */
globalThis.ColonyMap = {
  KEY: "map", // its key in both bags — the data record in Level.meta, the runtime in Level.cache
  // the Records keys of the whole-map records this engine writes (data keys — a save holds
  // them): `indoor` true on an interior (no sky passes, the cozy BGM), `climate` the pinned sky
  // (Weather.setClimate's record), `biome` the profile id (contentBiomes — FloraSystem's spread
  // pool). A Settlement record sits under Settlement.KEY, the flora clock under FloraSystem.KEY,
  // the room temperatures under RoomSystem.KEY, the player's builds under BuildMode.KEY.
  INDOOR: "indoor",
  CLIMATE: "climate",
  BIOME: "biome",
  WIND: "wind", // the level's constant wind strength (biome profile `wind`) — grass sway

  /** The level's data record (the typedef above). */
  of(level) {
    return level.meta.get(ColonyMap.KEY);
  },

  /** The level's runtime (the typedef above), or undefined before the level is mounted. */
  runtime(level) {
    return level.cache.get(ColonyMap);
  },

  /** A data record with every field declared and nothing built. */
  _data() {
    return {
      spawn: undefined,
      entries: undefined,
      statics: undefined,
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
   * Take the SQUAD to another map: every member (player FIRST) leaves the current world as a
   * whole entity via World.take, the map parks, and the members land in the target via
   * World.put with entry-position overrides (_arriveSquad). "wait" is map-local — the trip
   * forces it back to "follow" (re-applying its carry bonus) so the squad always travels
   * together; only kicked/unhired companions stay behind. Called from create() + travel().
   */
  go(scene, mapId, entryId) {
    let squad = null; // whole-entity snapshots, player first; null = boot (spawn a fresh player)
    // ── PHASE A: pull the squad out, then park the current map (its level stays pooled) ──
    if (scene.playerId !== undefined) {
      const sid = scene.level.entities.get(scene.playerId, Squad).id;
      const members = Companions.members(
        scene.level.entities,
        sid,
        scene.playerId,
      );
      squad = [];
      for (let i = 0; i < members.length; i++) {
        // no member opts out of travel: a "wait" companion snaps back to follow (+carry bonus);
        // the player leads the list and is no Follower
        if (members[i] !== scene.playerId)
          Companions.setState(
            scene.level.entities,
            scene.playerId,
            members[i],
            "follow",
          );
        squad.push(World.take(scene.level.id, members[i]));
      }
      Trader.onSuspend(scene.level); // dehydrate any embodied wandering trader → its record (before park)
      scene.level.entities.flush(); // commit the taken members' removals before parking
      ColonyMap.suspend(scene);
    }
    // ── PHASE B: enter the target — a pooled level resumes (parked, or restored from a save
    // and never visited), anything else builds from its site ──
    if (World.get(mapId) !== null) ColonyMap.resume(scene, mapId, entryId, squad);
    else ColonyMap.build(scene, mapId, entryId, squad);
    Trader.onActivate(scene.level); // embody any trader currently in this map
  },

  /**
   * Land the traveling squad at the entry: the player (squad[0]) first — scene.playerId
   * re-latches to its new id — then companions staggered beside it. Whole-entity restore
   * (World.put), so Appearance/Equipment/Stats arrive intact with no re-derive.
   */
  _arriveSquad(scene, squad, sp) {
    if (squad === null || squad.length === 0) return;
    scene.playerId = World.put(scene.level.id, squad[0], {
      [Position]: { x: sp.x, y: sp.y, z: 0 },
      [Velocity]: { x: 0, y: 0, z: 0 },
    });
    for (let i = 1; i < squad.length; i++)
      World.put(scene.level.id, squad[i], {
        [Position]: { x: sp.x - 24 - i * 22, y: sp.y + 24, z: 0 },
        [Velocity]: { x: 0, y: 0, z: 0 },
      });
  },

  /**
   * Park the live map: its Level stays in the pool untouched, runtime and all. Unassign (not
   * destroy) the camera's view — the parked map keeps it for resume; without the unassign its
   * later teardown would tear down the live view.
   */
  suspend(scene) {
    CameraSystem.view(scene.level).release();
  },

  /**
   * Resume a pooled level: point the scene at it, land the traveling squad at the entry (a
   * parked store has no player — the squad left on a trip; a restored one holds its saved
   * player), then re-claim the viewport — or, on a saved map's first visit since the load, build
   * its runtime here, exactly as build() does after the spawn pass.
   */
  resume(scene, mapId, entryId, squad) {
    const level = World.get(mapId); // the pooled data, exactly as it parked (or loaded)
    scene.level = level;
    World.activeId = mapId;
    const data = ColonyMap.of(level);
    const rt = ColonyMap.runtime(level);

    const sp = data.entries[entryId] ?? data.spawn;
    ColonyMap._arriveSquad(scene, squad, sp);
    // the player is whoever the store holds — restored with it on the load boot, just landed on
    // a trip (re-latched per frame from the same query thereafter)
    const pid = level.entities.first(Playable);
    scene.playerId = pid !== -1 ? pid : undefined;

    if (rt.renderer === undefined) ColonyMap._activate(scene);
    else {
      CameraSystem.view(level).assign(0);
      // snap the camera's look-at to the entry so it doesn't pan from the parked position (the
      // TARGET needs no re-aim: the arrived player carries CameraFocus — take/put re-mints its
      // id, but the follow policy resolves the marker by live query each update)
      const entities = level.entities;
      const cp = entities.require(entities.first(Camera), Position);
      cp.x = sp.x;
      cp.y = sp.y;
    }
    ColonyMap._arrive(scene);
  },

  /**
   * The map's ambient bed: interiors (meta.indoor) the cozy loop, the open world the tense one —
   * what plays whenever the player's Radio is off (its `ambient` hook is wired to this).
   */
  bed(level) {
    const indoor = level.meta.get(ColonyMap.INDOOR) === true;
    return indoor ? musAmbientCozy : musAmbientTense;
  },

  /**
   * Cross-fade to the map's bed on every arrival — unless the Radio is tuned: its station plays
   * through arrivals, the bed returning when the dial goes off (Radio.off). Music.play treats a
   * same-track re-request as a no-op, so this is safe to call unconditionally.
   */
  _applyBgm(scene) {
    if (Radio.on()) return;
    Music.play(ColonyMap.bed(scene.level));
  },

  /**
   * The map's climate (meta.climate — a forced sky condition + Kelvin offset, whole-map) or the
   * open sky when it has none. Called on every arrival like _applyBgm; Weather cross-fades either way.
   */
  _applyClimate(scene) {
    Weather.setClimate(scene.level.meta.get(ColonyMap.CLIMATE));
  },

  /**
   * Every arrival (build + resume): the scene's per-map transients reset — kept off the level so a
   * resume can't restore a stale one — the map's bed and sky, and the world-space effects of the
   * previous map dropped (their coordinates are map-local).
   */
  _arrive(scene) {
    scene.build.armed = false;
    scene.build.active = false;
    scene.nearNpc = false;
    scene.window.dirty = true; // the bag, if it shows, re-reads this map's squad + store
    ColonyMap._applyBgm(scene);
    ColonyMap._applyClimate(scene);
    FloatingText.clear();
    ParticleFx.clear();
    WorldOverlay.clearTracers();
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

  // Build a map fresh from its data — the FIRST visit ONLY (a revisit resumes the pooled level;
  // nothing is ever rebuilt). The one place the site's seed, the generator and the spawn pass are
  // read. `squad` is handed in by go() (null on boot → spawn a fresh player). Orchestrates the
  // helpers below.
  build(scene, mapId, entryId, squad = null) {
    const loaded = ColonyMap._loadData(mapId, entryId);
    const data = loaded.data;
    mapId = loaded.mapId;
    entryId = loaded.entryId;
    Log.info(`colony map: ${mapId} (entry ${entryId})`);

    const built = ColonyMap._buildWorld(scene, data, mapId, entryId, squad); // the Level (+ player on boot) + its records
    // pool it BEFORE the squad lands — World.put resolves the destination through the pool
    World.add(mapId, scene.level);
    World.activeId = mapId; // building a map activates it
    ColonyMap._arriveSquad(scene, squad, ColonyMap.of(scene.level).spawn); // already entry-resolved
    ColonyMap._spawnWorld(scene, built); // the residents, from the build's descriptors
    ColonyMap._activate(scene); // the runtime over the level, shared with resume()
    ColonyMap._arrive(scene);
  },

  /**
   * Pool a SAVED map's data — its records as captured, its grid cell for cell and its store whole
   * — with no seed, spawn or remesh (a load makes nothing): the Level, mounted (layer handles) but
   * not activated, so its first visit builds the presentation like any resume. `m` is a SaveGame
   * map entry, `buf` its grid blob (freed here). Returns the level, or null when the entry is
   * unusable (Log.error'd, nothing pooled) — the map's first visit then builds it fresh, loudly.
   */
  restoreLevel(m, buf) {
    const level = new Level({ id: m.id, capacity: m.capacity });
    level.meta.import(m.meta);
    const rec = ColonyMap.of(level);
    if (rec === undefined) {
      Log.error(`map "${m.id}": save entry carries no map record`);
      buffer_delete(buf);
      level.destroy();
      return null;
    }
    const h = ColonyLevel.restore(
      level.entities,
      { ...m, terrainMats: rec.terrainMats },
      buf,
    );
    buffer_delete(buf);
    if (h === null) {
      level.destroy();
      return null;
    }
    level.grid = h.grid;
    ColonyMap._mount(level, h);
    World.add(m.id, level);
    Log.info(`colony map: ${m.id} [restored]`);
    return level;
  },

  /**
   * Mount the level's runtime with the builder's handles — the material table as live rows and
   * one Layer/Type pair per LAYERS entry, plus <key>Types for a materials-bearing layer (wall).
   */
  _mount(level, h) {
    const rt = level.cache.of(ColonyMap, ColonyMap._runtime);
    rt.terrainMats = h.terrainMats;
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const key = contentTiles.LAYERS[i].key;
      rt[key + "Layer"] = h[key + "Layer"];
      rt[key + "Type"] = h[key + "Type"];
      if (h[key + "Types"] !== undefined) rt[key + "Types"] = h[key + "Types"];
    }
  },

  /** The presentation over a mounted level — once per level, on its first activation. */
  _activate(scene) {
    ColonyMap._buildCamera(scene); // follow camera — before the passes, which take it at construction
    ColonyMap._buildRenderer(scene); // render pass stack
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
   * its runtime mounted. The player spawns here ONLY on boot (squad === null) — trip arrivals
   * transfer the whole player entity in via _arriveSquad, which re-latches scene.playerId. Returns
   * ColonyLevel's built handles, which the caller threads on to _spawnWorld. A map is fully
   * resident (scatter entities + terrain/wall colliders all live at once), so its cap scales with
   * the grid.
   */
  _buildWorld(scene, data, mapId, entryId, squad) {
    scene.level = new Level({
      id: mapId,
      capacity: Math.max(1024, Math.ceil((data.cols * data.rows) / 4)),
    });
    const level = scene.level;
    const built = ColonyLevel.build(level.entities, data, entryId);
    level.grid = built.grid;
    const rec = ColonyMap._data();
    level.meta.set(ColonyMap.KEY, rec);
    rec.spawn = built.spawn;
    rec.entries = ColonyMap._entryTable(level.grid, built.entries); // named entries → world coords
    rec.statics = built.statics;
    rec.terrainMats = ColonyLevel.terrainRows(built.terrainMats);
    // <key>Colliders for a solid layer (wall, fence — BuildMode remeshes exactly these)
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const key = contentTiles.LAYERS[i].key;
      if (built[key + "Colliders"] !== undefined)
        rec.colliders[key] = built[key + "Colliders"];
    }
    ColonyMap._mount(level, built);
    // boot only: spawn the player (mints the Squad id). A trip arrival
    // instead lands the transferred player in _arriveSquad right after this.
    if (squad === null) {
      scene.playerId = ColonyPlayer.spawn(level.entities, built.spawn);
    }

    // The level's whole-map records (Records), off the data's meta: the indoor flag (no sky
    // passes, the cozy interior BGM), the climate (pinned over the map by _applyClimate on every
    // arrival), and the settlement (optional meta.settlement — an authored faction hub / raider
    // camp; the overworld is the colony's "hub", whose NPCs and stockpile chest are its
    // Residents, their settlementId this map's id). A level without one stays unsettled until a
    // Survey Post founds it (BuildMode.claim).
    const meta = level.meta;
    meta.set(ColonyMap.BIOME, data.meta.biome);
    const prof = contentBiomes.BIOMES[data.meta.biome];
    if (prof !== undefined && prof.wind !== undefined)
      meta.set(ColonyMap.WIND, prof.wind);
    if (data.meta.indoor === true) meta.set(ColonyMap.INDOOR, true);
    if (data.meta.climate !== undefined)
      meta.set(ColonyMap.CLIMATE, data.meta.climate);
    const s = data.meta.settlement;
    if (s !== undefined)
      Settlement.found(level, {
        name: s.name !== undefined ? I18n.text(s.name) : "", // an i18n key
        factionId: s.faction,
        color: s.color,
        comp: s.comp, // SettlementComponent id array
      });
    return built;
  },

  /**
   * The level's residents, all live at once — a map is fully simulated for its lifetime. One
   * adapter (ColonySpawn.spawnEntity) over the descriptors the build handed back — the file's, the
   * generator's, or both merged, since the builder resolves that. The scene reads NPC/portal/enemy/
   * companion handles LIVE by component query — stored id lists would dangle across a map swap.
   */
  _spawnWorld(scene, built) {
    const entities = scene.level.entities;
    const grid = scene.level.grid;
    for (let i = 0; i < built.spawns.length; i++)
      ColonySpawn.spawnEntity(entities, grid, built.spawns[i]);
    // A region, not an entity, so it is read off the descriptors here (and saved as a rect thereafter).
    const rec = ColonyMap.of(scene.level);
    rec.reachZone = ColonyMap._reach(grid, built.spawns);
    rec.reachDone = rec.reachZone === undefined; // nothing to reach on this map
  },

  /**
   * RenderGrass clump defs for a material table: per material, its MATERIALS clump (one row,
   * the profile's `clumpTint` overriding its own) plus its clutter rows, plus the profile's
   * `clutter` extras for that material — each a { id (the TileType threshold), sprite, min, max,
   * chance, scaleMin, scaleMax, tint, edge, flat } row the pass scatters.
   */
  _clumpDefs(mats, profile) {
    const tintHex = profile !== undefined ? profile.clumpTint : undefined;
    const extra = profile !== undefined ? profile.clutter : undefined;
    const defs = [];
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i].material;
      const def = mat !== undefined ? contentBiomes.MATERIALS[mat] : undefined;
      if (def === undefined) continue;
      const rows = [];
      if (def.clump !== undefined)
        rows.push({
          src: def.clump,
          tint: tintHex !== undefined ? tintHex : def.clump.tint,
        });
      if (def.clutter !== undefined)
        for (let k = 0; k < def.clutter.length; k++)
          rows.push({ src: def.clutter[k], tint: def.clutter[k].tint });
      const own = extra !== undefined ? extra[mat] : undefined;
      if (own !== undefined)
        for (let k = 0; k < own.length; k++)
          rows.push({ src: own[k], tint: own[k].tint });
      for (let k = 0; k < rows.length; k++) {
        const src = rows[k].src;
        defs.push({
          id: mats[i].type.id,
          sprite: src.sprite,
          min: src.min,
          max: src.max,
          chance: src.chance,
          scaleMin: src.scaleMin,
          scaleMax: src.scaleMax,
          tint: rows[k].tint !== undefined ? Color.parse(rows[k].tint) : undefined,
          edge: src.edge,
          flat: src.flat,
        });
      }
    }
    return defs;
  },

  /**
   * A terrain pass's `wave` option for a contentBiomes material id: its crest tone as 0..1
   * floats over the weather's sim clock (the crests freeze on pause with the rain), or
   * undefined for still ground (and for a saved row predating material ids).
   */
  _wave(materialId) {
    const def =
      materialId !== undefined ? contentBiomes.MATERIALS[materialId] : undefined;
    if (def === undefined || def.wave === undefined) return undefined;
    const c = Color.parse(def.wave);
    return {
      r: colour_get_red(c) / 255,
      g: colour_get_green(c) / 255,
      b: colour_get_blue(c) / 255,
      time: () => Weather.time(),
    };
  },

  /**
   * Assemble the renderer pass stack (ground → tiles → shadows → entities → debug →
   * sky overlay → lighting).
   *
   * The GROUND is the terrain layer either way — the difference is only how many passes read it. A
   * generated map's biome materials stack as one dual-grid pass per material, lowest first, each
   * taking the cells whose TileType id reaches its threshold: an upper material's transparent
   * corners reveal the one below, which is the A-over-B transition the sets are drawn for. Because
   * the stack is cumulative, `skipAbove` drops the quads the next material covers whole — without it
   * every material would draw its full extent under the ones above.
   */
  _buildRenderer(scene) {
    const pitch = ColonyMap.BB_PITCH;
    const level = scene.level;
    const rt = ColonyMap.runtime(level);
    const camera = CameraSystem.view(level); // the camera entity is built first (_activate): every view-dependent pass takes its view here
    Grassland.clearBuilt(level); // prefab-built ground sheds its grass before the VBOs bake
    const renderer = new Renderer();
    rt.renderer = renderer;
    // Generated ground UNDER everything (the LAYERS loop below skips `terrain` when this ran).
    const mats = rt.terrainMats;
    if (mats !== undefined)
      for (let i = 0; i < mats.length; i++) {
        const spr = mats[i].sprite;
        if (!sprite_exists(spr)) {
          // a saved row whose art is gone since (ColonyLevel._terrainTypes)
          Log.warn(`terrain sprite missing: ${mats[i].material}`);
          continue;
        }
        const pass = new RenderTileMap(rt.terrainLayer, level.grid, spr, {
          autotile: "dual",
          minId: mats[i].type.id,
          skipAbove: i < mats.length - 1 ? mats[i + 1].type.id : undefined,
          wave: ColonyMap._wave(mats[i].material),
        });
        rt.terrainPasses.push(pass);
        renderer.insert(pass);
      }
    // the grass materials' volume layer (RenderGrass) — upright clumps entering the depth
    // pool over the finished ground, before the entities; the camera's live pitch drives its
    // height compensation like the billboards'
    if (mats !== undefined) {
      const profile = contentBiomes.BIOMES[level.meta.get(ColonyMap.BIOME)];
      const cdefs = ColonyMap._clumpDefs(mats, profile);
      if (cdefs.length > 0) {
        // wind: the meta constant; a save predating it falls back to the biome profile
        let wind = level.meta.get(ColonyMap.WIND);
        if (wind === undefined)
          wind = profile !== undefined && profile.wind !== undefined ? profile.wind : 0;
        rt.grassPass = new RenderGrass(rt.terrainLayer, level.grid, cdefs, {
          wind: wind,
          time: () => Weather.time(),
          camera: camera,
        });
        renderer.insert(rt.grassPass);
      }
    }
    // Resident tile layers (terrain/floor) as real tilemaps — bottom→top per contentTiles.LAYERS;
    // the wall layer draws only as the lit RenderWalls pass below (pitched maps — no flat
    // fallback); on pitched maps the fence layer joins as RenderFence (its flat fallback
    // keeps the autotile RenderTileMap). VBO-cached + keyed by layer
    // so a BuildMode edit markDirty's the matching pass. A generated map holds the floor/fence
    // layers EMPTY until the player builds — an empty layer emits no quads, so they are free there.
    const tilePasses = rt.tilePasses;
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.key === "wall") continue; // RenderWalls (lit boxes) below — no flat fallback
      if (cfg.key === "fence" && pitch > 0) continue; // RenderFence (post-and-rail boxes) below
      if (cfg.key === "terrain" && mats !== undefined) continue; // the material stack above
      const pass = new RenderTileMap(
        rt[cfg.key + "Layer"],
        level.grid,
        cfg.sprite,
        {
          autotile: cfg.type,
          color: Color.parse(cfg.color),
        },
      );
      tilePasses[cfg.key] = pass;
      renderer.insert(pass);
    }
    // the sprite-free cost fill stays as an inspection overlay, inserted off; culled to the
    // camera view like the grid lines (essential on a large generated map)
    const costPass = new RenderDebugTileMap(level.grid, {
      cost: true,
      tiles: false,
      alpha: 0.5,
      camera: camera,
    });
    costPass.enabled = false;
    renderer.insert(costPass);
    const gridPass = new RenderGrid(level.grid, { camera: camera }); // cell boundary lines
    gridPass.enabled = false; // off in normal play
    renderer.insert(gridPass);
    // Foot shadows UNDER the entities (runtime ellipse per body, not baked into the sprites).
    // A body lying FLAT casts none: a corpse (Interaction "corpse" — ColonyCombat._toCorpse; NPCs
    // carry no Health, so Health can't be the living test) or a downed companion (Downed).
    renderer.insert(
      new RenderEntityShadow({
        filter: (entities, id) => {
          if (entities.has(id, Downed)) return false;
          const it = entities.get(id, Interaction);
          return it !== undefined ? it.kind !== "corpse" : true; // `?:` not `||` (docs/GMRT.md)
        },
      }),
    );
    // Deep-furniture meshes (VOLUME category of the projection contract — see RenderBillboard):
    // real depth-writing geometry, so it shares the billboard depth pool. Pitched maps only —
    // a flat map has no depth-writing entity pass to sort against. Sun + point lights injected
    // like RenderLighting's ambient (the pass is Core; WorldClock and the Light token are not);
    // the camera is the nearest-point-light selection center. seed = entity id keeps the mesh
    // flicker in phase with RenderLighting's glow pools.
    let meshPass;
    if (pitch > 0) {
      meshPass = new RenderMesh({
        sun: () => WorldClock.sunDir(),
        chroma: () => ColonyMap.chroma(), // the atmosphere dial (hour × season × sky × setting)
        pointLights: (entities) => {
          const out = [];
          entities.forEach([Light, Position], (id, lt, p) => {
            out.push({
              x: p.x,
              y: p.y,
              radius: lt.radius,
              color: lt.color,
              intensity: lt.intensity,
              flicker: lt.flicker,
              seed: id,
            });
          });
          return out;
        },
        camera: camera,
      });
      renderer.insert(meshPass);
      // GROUND joins the one lit shader: the terrain material stack + every resident tile pass
      // read this pass's light gather (up normal — flat ground). Assigned post-construction
      // because the ground passes are built above, before the mesh pass exists; the wall
      // passes below take it at construction. Flat maps (pitch 0) stay unlit.
      for (let i = 0; i < rt.terrainPasses.length; i++)
        rt.terrainPasses[i].lights = meshPass;
      if (rt.grassPass !== undefined) rt.grassPass.lights = meshPass;
      const tileKeys = Object.keys(tilePasses);
      for (let i = 0; i < tileKeys.length; i++)
        tilePasses[tileKeys[i]].lights = meshPass;
      // WALLS category (art projection contract): the resident wall layer as lit boxes
      // (top + exposed south faces) in the same depth pool, sharing the mesh pass's
      // sun + culled point lights. Keyed into tilePasses so BuildMode's edit
      // markDirty reaches it.
      // ONE pass covers every wall on the map — the generator's and the player's both paint the
      // same layer. PER-CELL MATERIALS from the wall cfg (near-white face texture × tint per
      // material, bucketed by TileType id — see RenderWalls); materials[0] (brick) doubles as the
      // default bucket for generated walls.
      const wallCfg = contentTiles.get("wall");
      const wallMats = [];
      for (let i = 0; i < wallCfg.materials.length; i++) {
        const m = wallCfg.materials[i];
        wallMats.push({
          id: m.id,
          sprite: m.sprite,
          frame: 0,
          color: Color.parse(m.color),
        });
      }
      tilePasses.wall = new RenderWalls(level.grid, rt.wallLayer, {
        color: wallMats[0].color,
        sprite: wallMats[0].sprite,
        frame: 0,
        lights: meshPass,
        materials: wallMats,
      });
      renderer.insert(tilePasses.wall);
      // the fence layer as lit post-and-rail boxes in the same depth pool — its occupancy read
      // is the autotiling (RenderFence); the flat blob4 config stays for the editor
      tilePasses.fence = new RenderFence(level.grid, rt.fenceLayer, {
        color: Color.parse(contentTiles.get("fence").color),
        lights: meshPass,
      });
      renderer.insert(tilePasses.fence);
    }
    // Entities via the production sprite pass (per-entity data — name/facing/animator state —
    // is inspected with entities.dump(), not by world-space label passes).
    // Pitched maps hand the billboard pass the mesh pass as its light source (sprite sun
    // response: sprites dim/warm with the sun + catch torchlight like the mesh faces) and the
    // camera, whose live pitch drives its height compensation (the STANDING category).
    renderer.insert(
      pitch > 0
        ? new RenderBillboard({ lights: meshPass, camera: camera })
        : new RenderEntity(),
    );
    // lime bbox outlines — the debugBBox setting is the toggle (sceneColony.draw syncs it live)
    rt.bboxPass = new RenderDebugEntity();
    rt.bboxPass.enabled = Settings.get("debugBBox");
    renderer.insert(rt.bboxPass);
    const paths = new RenderDebugPath(level.grid); // enemy A* paths, off until toggled
    paths.enabled = false;
    renderer.insert(paths);
    // entity "active range" rings (turret fire / enemy aggro/give-up/attack), off until toggled
    const ranges = new RenderDebugRange({
      ranges: [
        {
          component: Brain,
          field: "deAggro",
          color: make_colour_rgb(110, 110, 110),
          alpha: 0.3,
        },
        {
          component: Brain,
          field: "aggro",
          color: make_colour_rgb(230, 220, 80),
        },
        {
          component: Brain,
          field: "attackRange",
          color: make_colour_rgb(235, 80, 80),
        },
      ],
    });
    renderer.insert(ranges);
    // The sky overlay just under the day/night tint, so night darkens the rain: cloud shadows
    // under the weather (tint + rain/snow), both layers of one RenderOverlay that is cut out over
    // every room (Rooms.rects, the boxes a wall tall) — no rain, tint or cloud on a floor under a
    // roof. Skipped indoors (meta.indoor) — no open sky inside a cave.
    if (level.meta.get(ColonyMap.INDOOR) !== true) {
      const clouds = new RenderCloudShadow({ camera: camera });
      clouds.enabled = false; // the flat look: no noise field drifting over the ground
      const weather = new RenderWeather({ camera: camera });
      const wall = tilePasses.wall; // RenderWalls on a pitched map (its height); flat: absent
      const roofH =
        wall !== undefined && wall.height !== undefined ? wall.height : 0;
      const rooms = RoomSystem.rooms(level);
      renderer.insert(
        new RenderOverlay({
          layers: [clouds, weather],
          cutout: () => rooms.rects(),
          height: roofH,
          camera: camera,
        }),
      );
    }
    // Lighting LAST — a per-frame light map composited over everything. Day/night is its ambient
    // term ("lighting with no lights"); Light entities + a night vignette layer on top.
    renderer.insert(
      new RenderLighting({
        ambient: () => WorldClock.tint(),
        vignette: 0, // the flat look: night is one even multiply, no corner gradient
        camera: camera,
      }),
    );
  },

  /**
   * The level's camera entity under the follow policy; the passes take its view at construction
   * (_buildRenderer). A restored save already holds the entity (the view it was left at), a
   * fresh build gets one at the spawn; the policy is minted either way — its tuning is this
   * engine's, not the save's — seeded so the zoom resumes where it was.
   * 32px-cell world: base zoom 2 for the pitched 2.5D framing (flat fallback 1) and the wheel
   * snaps through integer stops — a whole number of screen px per world px keeps every texel
   * the same size across the screen (a fractional zoom draws them 1 px and 2 px wide by turns).
   * The pitch still foreshortens rows by cos(pitch); only the horizontal scale is exact.
   */
  _buildCamera(scene) {
    const pitch = ColonyMap.BB_PITCH;
    const baseZoom = pitch > 0 ? 2 : 1;
    const level = scene.level;
    const entities = level.entities;
    // Cap zoom-OUT to the world: viewCap = max view WIDTH (world px); the policy derives its live
    // zoom floor from it + the current surface each frame. Horizontal is the binding axis on a
    // landscape surface.
    const viewCap = level.grid.cols * level.grid.cellWidth;
    let id = entities.first(Camera);
    if (id === -1) {
      const sp = ColonyMap.of(level).spawn;
      id = Cameras.create(entities, {
        x: sp.x,
        y: sp.y,
        pitch: (pitch * Math.PI) / 180, // frame-0 seed; the curve overwrites it every update
        // ortho eye distance: the 100 default near-clips close ground at steep pitch
        // (a black band along the screen bottom); image-identical otherwise under ortho
        dist: 2000,
        zoom: baseZoom,
      });
    }
    const curve = ColonyMap.PITCH_CURVE;
    entities.mint(
      id,
      CameraFollow,
      Cameras.follow({
        lerp: 0.15,
        pitch: pitch,
        // pitch-by-zoom (upright-sprite camera) — see ColonyMap.PITCH_CURVE
        pitchLo: curve.pitchLo,
        pitchHi: curve.pitchHi,
        zoomLo: curve.zoomLo,
        zoomHi: curve.zoomHi,
        zoom: entities.require(id, Camera).zoom, // the target resumes at the persisted zoom
        zoomHome: baseZoom,
        viewCap: viewCap, // live zoom-out cap: view width ≤ this (no dark void past the map)
        zoomMax: 3, // one integer stop of zoom-in headroom
        zoomSteps: [0.5, 1, 2, 3],
        // Edge-clamp the look-at to the finite world so the pitched view never shows past a map
        // edge. gridToWorld anchors cell 0 at world (0,0).
        bounds: {
          x1: 0,
          y1: 0,
          x2: level.grid.cols * level.grid.cellWidth,
          y2: level.grid.rows * level.grid.cellHeight,
        },
      }),
    );
    CameraSystem.view(level).assign(0);
  },

  /**
   * The world-map trip (WorldMapUI's Travel): the crossing's in-game hours pass on the world
   * timeline FIRST — the clock and the sky roll on, so a due WorldEvent (a trader's leg) fires on
   * arrival — then the squad lands at the site's default entry through go(). A same-site request
   * is a no-op.
   */
  travel(scene, siteId) {
    if (siteId === scene.level.id) return;
    const hours = ColonyMap.travelHours(scene.level.id, siteId);
    const secs = (hours / 24) * WorldClock.dayLength;
    WorldClock.update(secs);
    Weather.update(secs);
    Log.info(`travel → ${siteId} (${hours} h)`);
    ColonyMap.go(scene, siteId, "default");
  },

  /**
   * In-game hours a trip takes: the two sites' chart distance (contentSites `pos`, in [0,1]
   * chart space) × HOURS_PER_CHART, at least 1. An endpoint that is no site reads 1.
   */
  travelHours(fromId, toId) {
    const a = contentSites.get(fromId);
    const b = contentSites.get(toId);
    if (a === undefined || b === undefined) return 1;
    const dx = a.pos.x - b.pos.x;
    const dy = a.pos.y - b.pos.y;
    return Math.max(
      1,
      Math.round(Math.sqrt(dx * dx + dy * dy) * ColonyMap.HOURS_PER_CHART),
    );
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

// 2.5D adopted: camera pitch in degrees (0 = flat top-down, debug only — front-view art reads
// wrong flat). Assigned after the object literal — GMRT static-field-init quirk. Read by
// _buildRenderer (billboard vs flat entity pass) + _buildCamera (pitch + framing zoom).
// With the upright-sprite camera this is the frame-0 seed + the pitched-map GATE only —
// the LIVE pitch is PITCH_CURVE below (42° zoomed out → 58° zoomed in).
ColonyMap.BB_PITCH = 42;
// Pitch-by-zoom curve (upright-sprite camera), the CameraFollow curve fields: shallow 42° at
// the zoom-out floor (~1.25 on a 1920 surface) easing linearly to 58° at max zoom-in (2.625) —
// "look further = flatter". Thresholds are the spike values HALVED for the 32px-cell world
// (zoom seeds halved, same screen framing); the 42–58° outputs are angles, unchanged.
ColonyMap.PITCH_CURVE = { pitchLo: 42, pitchHi: 58, zoomLo: 1.25, zoomHi: 2.625 };
// Hours a trip across one whole world-map chart unit takes — the travelHours scale (corner to
// corner is ~1.4 units). Assigned after the literal like BB_PITCH.
ColonyMap.HOURS_PER_CHART = 20;
// The world's albedo chroma this frame (shMeshlit's u_chroma, through RenderMesh's provider):
// the clock's hour/season schedule times the sky's factor, pulled toward 1 (the authored
// colours) by the `worldChroma` setting — 0 turns the atmosphere off, 1 is the full schedule.
ColonyMap.chroma = () => {
  const k = WorldClock.chroma() * Weather.chromaMod();
  return 1 - (1 - k) * Settings.get("worldChroma");
};
