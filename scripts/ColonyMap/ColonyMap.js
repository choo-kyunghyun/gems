// Map engine for the colony scene — world-map travel, map pool, and persistence.
// Free functions over the scene (composition; GMRT has no usable class inheritance).
/**
 * Visited maps stay ALIVE: the World level pool holds each map's DATA (its Level — grid,
 * entities, whole-map records) and `_parked` below holds the per-map RUNTIME the colony builds
 * over it (renderer, camera, physics, nav, render-pass handles), so a trip never
 * destroys/rebuilds. Only the SQUAD migrates: every entity sharing the player's Squad id (player included) moves as a WHOLE entity
 * through World.take/put — a trip forces a "wait" member back to "follow" first, so the squad
 * always travels together. Travel is by WORLD MAP (travel(), below): the squad deploys from a
 * site's beacon to any other site (contentSites), the crossing costing in-game hours. There is
 * no per-map player and no carried component subset; kicked/unhired companions are plain map
 * residents. Everything is persistent for the session: a map builds from its data exactly ONCE
 * (first visit), then only freezes/thaws — no eviction, cold serialize, or respawn-from-file
 * reconcile.
 *
 * Three ways into a map, one runtime after: build() is the FIRST visit — the site's seed, the
 * generator, the painter, the spawn pass (the only place procedural content is ever made); restore()
 * is a SAVED map's first visit since the load — its grid and store come back exactly as captured
 * and nothing is made; resume() is a live parked bundle. go() picks between them.
 */
globalThis.ColonyMap = {
  _parked: {}, // mapId -> the park bundle below. The map's DATA is its pooled Level, not this.
  // the LevelMeta keys of the whole-map records this engine writes (data keys — a save holds
  // them): `indoor` true on an interior (no sky passes, the cozy BGM), `climate` the pinned sky
  // (Weather.setClimate's record), `biome` the profile id (contentBiomes — FloraSystem's spread
  // pool). A Settlement record sits under Settlement.KEY, the flora clock under FloraSystem.KEY,
  // the room temperatures under RoomSystem.KEY.
  INDOOR: "indoor",
  CLIMATE: "climate",
  BIOME: "biome",

  // fields _stash/_unstash copy between scene and a parked bundle (excludes scene-shell +
  // per-activate transients reset by _activateReset on each map open). NOT listed: the Level
  // itself (the pool holds it, its whole-map records on its meta — a resume re-points scene.level
  // at it) and the per-layer tilemap
  // handles (<key>Layer/<key>Type/<key>Types), which _bundleKeys derives from contentTiles.LAYERS so a
  // new LAYERS entry can't silently miss the bundle.
  // (playerId is NOT bundled — it's DERIVED: set on boot spawn/arrival and re-latched per frame
  // from the Playable query, so the bundle never carries a player handle)
  BUNDLE_KEYS: [
    "spawn",
    "entries",
    "statics",
    "terrainMats",
    "_built",
    "_builtEnts",
    "reachZone",
    "reachDone",
    "nav",
    "rooms",
    "physics",
    "renderer",
    "camera",
    "cameraFollow", // the camera's normal control — parks with it, so a resume can put it back
    // NOTE: no "followers"/"playerId" — squad members leave before the park; residents live in the world

    "_tilePasses",
    "_terrainPasses",
    "_decorPass",
    "_grassPass",
    "_entityPass",
    "_tilePass",
    "_gridPass",
    "_clouds",
    "_weather",
    "_sky",
    "_lighting",
  ],

  /**
   * Take the SQUAD to another map: every member (player FIRST) leaves the current world as a
   * whole entity via World.take, the map parks, and the members land in the target via
   * World.put with entry-position overrides (_arriveSquad). "wait" is map-local — the trip
   * forces it back to "follow" (re-applying its carry bonus) so the squad always travels
   * together; only kicked/unhired companions stay behind. Called from create() + travel().
   */
  go(scene, mapId, entryId) {
    let squad = null; // whole-entity snapshots, player first; null = boot (spawn a fresh player)
    // ── PHASE A: pull the squad out, then park the current map (its store stays alive) ──
    if (scene.playerId !== undefined) {
      const sid = scene.level.entities.get(scene.playerId, Squad).id;
      const members = FollowerSystem.members(
        scene.level.entities,
        sid,
        scene.playerId,
      );
      squad = [];
      for (let i = 0; i < members.length; i++) {
        // no member opts out of travel: a "wait" companion snaps back to follow (+carry bonus)
        FollowerSystem.setState(
          scene.level.entities,
          scene.playerId,
          members[i],
          "follow",
        );
        squad.push(World.take(scene.level.id, members[i]));
      }
      Trader.onSuspend(scene); // dehydrate any embodied wandering trader → its record (before park)
      scene.level.entities.flush(); // commit the taken members' removals before parking
      ColonyMap.suspend(scene);
    }
    // ── PHASE B: enter the target — resume its parked bundle, restore its saved entry, else
    // build from file ── every resident map is parked at this point (Phase A parked the current
    // one), so a _parked hit is always a full park bundle
    if (ColonyMap._parked[mapId] !== undefined)
      ColonyMap.resume(scene, mapId, entryId, squad);
    else {
      const pending = SaveGame.takePendingMap(mapId);
      let restored = false;
      if (pending !== null)
        restored = ColonyMap.restore(scene, mapId, entryId, squad, pending);
      if (!restored) {
        if (pending !== null)
          Log.error(`map "${mapId}": save entry unusable — building it fresh`);
        ColonyMap.build(scene, mapId, entryId, squad);
      }
    }
    Trader.onActivate(scene); // embody any trader currently in this map
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
   * Park the live map: its runtime moves to _parked; its Level is already pooled and stays there
   * untouched. Unassign (not destroy) the camera — the parked map keeps it for resume; without
   * the unassign its later destroy() would tear down the live view.
   */
  suspend(scene) {
    if (scene.camera) scene.camera.unassign();
    ColonyMap._parked[scene.level.id] = ColonyMap._stash(scene);
  },

  /**
   * Resume a parked map: restore its fields, re-claim the viewport, and land the traveling squad
   * at the entry (the parked store has no player — the squad left on a trip).
   */
  resume(scene, mapId, entryId, squad) {
    scene.level = World.get(mapId); // the pooled data, exactly as it parked
    ColonyMap._unstash(scene, ColonyMap._parked[mapId]);
    World.activeId = mapId;
    MotionPlanner.setGrid(scene.nav.grid);
    if (scene.camera) scene.camera.assign(0);

    const sp = scene.entries[entryId] ?? scene.spawn;
    ColonyMap._arriveSquad(scene, squad, sp);
    // snap the follow camera to the entry so it doesn't pan from the parked position (the
    // TARGET needs no re-aim: the arrived player carries CameraFocus — take/put re-mints its
    // id, but CameraFollow resolves the marker by live query each update)
    if (scene.camera) {
      scene.camera.toX = sp.x;
      scene.camera.toY = sp.y;
    }

    ColonyMap._activateReset(scene);
    ColonyMap._applyBgm(scene); // crossfade to the resumed map's ambient (indoor ⇄ overworld)
    ColonyMap._applyClimate(scene);
    FloatingText.clear(); // drop the previous map's combat numbers (world coords are map-local)
    ParticleFx.clear();
  },

  /**
   * Map-appropriate ambient: interiors (meta.indoor) get the cozy loop, the open world the
   * tense one. Called on every map arrival (build + resume); Music.play cross-fades and treats
   * a same-track re-request as a no-op, so this is safe to call unconditionally.
   */
  _applyBgm(scene) {
    const indoor = scene.level.meta.get(ColonyMap.INDOOR) === true;
    Music.play(indoor ? musAmbientCozy : musAmbientTense);
  },

  /**
   * The map's climate (meta.climate — a forced sky condition + Kelvin offset, whole-map) or the
   * open sky when it has none. Called on every arrival like _applyBgm; Weather cross-fades either way.
   */
  _applyClimate(scene) {
    Weather.setClimate(scene.level.meta.get(ColonyMap.CLIMATE));
  },

  /**
   * Full bundle key list: BUNDLE_KEYS + the per-layer handles from contentTiles.LAYERS
   * (<key>Layer/<key>Type, plus <key>Types for a materials-bearing layer and <key>Colliders for a
   * solid one). Rebuilt per call (trip-rate, tiny).
   */
  _bundleKeys() {
    const keys = ColonyMap.BUNDLE_KEYS.slice();
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      keys.push(cfg.key + "Layer");
      keys.push(cfg.key + "Type");
      if (cfg.materials !== undefined) keys.push(cfg.key + "Types");
      if (cfg.solid === true) keys.push(cfg.key + "Colliders");
    }
    return keys;
  },

  /**
   * Pointer-copy per-map fields level↔bundle. Index loop (no Map/Set iteration — GMRT).
   */
  _stash(scene) {
    const b = {};
    const keys = ColonyMap._bundleKeys();
    for (let i = 0; i < keys.length; i++) b[keys[i]] = scene[keys[i]];
    return b;
  },
  _unstash(scene, b) {
    const keys = ColonyMap._bundleKeys();
    for (let i = 0; i < keys.length; i++) scene[keys[i]] = b[keys[i]];
  },

  /**
   * Per-activate transient reset (build + resume). Kept off the bundle so a resume can't restore
   * a stale transient.
   */
  _activateReset(scene) {
    scene._hpTrack = {};
    scene._buildActive = false;
    BuildMode.active = false;
    scene.nearNpc = false;
    scene._npcId = -1;
    if (scene.invOpen) scene._invDirty = true;
    // Re-point CombatAI's shared store/grid statics. A resume keeps actors without re-attaching,
    // so bind explicitly — else enemies step against the previously-built store and fault.
    CombatAI.bind(scene.level.entities, scene.level.grid);
    // Re-point the terrain movement pricing (mover speed × 1/cost) at the active map, same reason.
    PathFollow.bind(ColonyMap._terrainCost(scene));
  },

  /**
   * Per-map terrain movement-cost provider ((wx, wy) → cost ≥ 1, Infinity = impassable) feeding
   * PathFollow's speed pricing (NavGrid reads the same LevelGrid.costAt itself, in cells). The
   * ground is tile data on every map — generated biome materials or the authored fill — so this
   * is one grid lookup: the topmost layer's TileType cost, which TileType already normalizes
   * (`pathCost: null` → Infinity).
   */
  _terrainCost(scene) {
    const grid = scene.level.grid;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    return (wx, wy) => grid.costAt(Math.floor(wx / cw), Math.floor(wy / ch));
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

  // Build a map fresh from its data — the FIRST visit ONLY (a revisit resumes its live parked
  // bundle, a saved map restores; nothing is ever rebuilt). The one place the site's seed, the
  // generator and the spawn pass are read. `squad` is handed in by go() (null on boot → spawn a fresh
  // player). Orchestrates the helpers below.
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
    ColonyMap._arriveSquad(scene, squad, scene.spawn); // scene.spawn is already entry-resolved
    // build-mode tracking, fresh per first visit (parks with the bundle thereafter). _builtEnts
    // persists on the scene across map swaps (BuildMode.build runs once) — reset explicitly.
    scene._built = {};
    scene._builtEnts = {};
    ColonyMap._spawnWorld(scene, data, built); // the residents, from the build's descriptors
    ColonyMap._activate(scene); // the runtime over the level, shared with restore()
  },

  /**
   * Bring a SAVED map back — a load's first visit to it. The Level comes up from its save entry
   * exactly as captured (ColonyLevel.restore: the grid cell for cell, the store whole with every
   * entity under its saved id, colliders and statics included), the per-map fields the scene
   * saved for itself come straight off the entry, and only the RUNTIME is re-made around it
   * (_activate — the same steps build runs after its spawn pass). Nothing is painted, spawned or
   * re-meshed, so the entity set is the saved one. `squad` lands like on a build (null on the
   * load boot — the player is already in the store). `pending` is SaveGame.takePendingMap's
   * { map, buf }; the buffer is freed here. Returns false when the entry can't be applied
   * (Log.error'd) — the scene then holds no level, and the caller builds instead.
   */
  restore(scene, mapId, entryId, squad, pending) {
    const m = pending.map;
    Log.info(`colony map: ${mapId} (entry ${entryId}) [restored]`);
    scene.level = new Level({ id: mapId, capacity: m.capacity });
    scene.level.meta.import(m.meta); // the whole-map records, as captured
    const h = ColonyLevel.restore(scene.level.entities, m, pending.buf);
    buffer_delete(pending.buf);
    if (h === null) {
      scene.level.destroy();
      return false;
    }
    scene.level.grid = h.grid;
    scene.spawn = m.spawn;
    scene.entries = m.entries;
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const key = contentTiles.LAYERS[i].key;
      scene[key + "Layer"] = h[key + "Layer"];
      scene[key + "Type"] = h[key + "Type"];
      if (h[key + "Types"] !== undefined)
        scene[key + "Types"] = h[key + "Types"];
      if (m.colliders[key] !== undefined)
        scene[key + "Colliders"] = m.colliders[key];
    }
    scene.statics = m.statics;
    scene.terrainMats = h.terrainMats;
    World.add(mapId, scene.level);
    World.activeId = mapId;
    ColonyMap._arriveSquad(scene, squad, scene.entries[entryId] ?? scene.spawn);
    // the player is whoever the store holds — restored with it on the load boot, just landed on
    // a trip (re-latched per frame from the same query thereafter)
    const pid = scene.level.entities.first(Playable);
    scene.playerId = pid !== -1 ? pid : undefined;
    scene._built = m.built;
    scene._builtEnts = m.builtEnts;
    scene.reachZone = m.reachZone;
    scene.reachDone = m.reachDone === true;
    scene._npcId = -1;
    ColonyMap._activate(scene);
    return true;
  },

  /**
   * The runtime over a level that already holds its grid and its entities — the tail build() and
   * restore() share: per-activate transients, the spatial indexes, the render pass stack, the
   * follow camera, the map's ambient, and a clean effects slate.
   */
  _activate(scene) {
    ColonyMap._activateReset(scene); // per-activate transients (hp track, build mode, inv)
    ColonyMap._buildSpatial(scene); // broadphase + nav grid + room mirror
    ColonyMap._buildRenderer(scene); // render pass stack
    ColonyMap._buildCamera(scene); // follow camera + view culling + debug
    ColonyMap._applyBgm(scene); // map-appropriate ambient (re-requesting the same track is a no-op)
    ColonyMap._applyClimate(scene); // the map's sky (meta.climate) or the open one
    FloatingText.clear(); // drop combat numbers + particles from the previous map (map-local coords)
    ParticleFx.clear();
  },

  /**
   * A map's level data (ColonyLevel.load — its file, or its synthesized site), falling back to
   * the home site if it's bad. Returns resolved ids + data.
   */
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
   * Entity store + LevelGrid + the level's whole-map records. The player spawns here ONLY on boot
   * (squad === null) — trip arrivals transfer the whole player entity in via _arriveSquad,
   * which re-latches scene.playerId. Returns ColonyLevel's built handles, which the caller threads on
   * to _spawnWorld. A map is fully resident (scatter entities + terrain/wall colliders all live at
   * once), so its cap scales with the grid.
   */
  _buildWorld(scene, data, mapId, entryId, squad) {
    scene.level = new Level({
      id: mapId,
      capacity: Math.max(1024, Math.ceil((data.cols * data.rows) / 4)),
    });
    const built = ColonyLevel.build(scene.level.entities, data, entryId);
    scene.level.grid = built.grid;
    scene.spawn = built.spawn; // for player respawn on death
    scene.entries = ColonyMap._entryTable(scene.level.grid, built.entries); // named entries → world coords (resume)
    // tilemap handles (render passes + build mode) — one Layer/Type pair per LAYERS entry,
    // plus <key>Types for a materials-bearing layer (wall) and <key>Colliders for a solid one
    // (wall, fence — BuildMode remeshes exactly these). Bundled via _bundleKeys.
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const key = contentTiles.LAYERS[i].key;
      scene[key + "Layer"] = built[key + "Layer"];
      scene[key + "Type"] = built[key + "Type"];
      if (built[key + "Types"] !== undefined)
        scene[key + "Types"] = built[key + "Types"];
      if (built[key + "Colliders"] !== undefined)
        scene[key + "Colliders"] = built[key + "Colliders"];
    }
    // level-geometry colliders that are NOT a tile layer's (impassable terrain, the level edge):
    // held apart so a build-mode remesh can't free them (a save keeps the id list, like the
    // per-layer ones)
    scene.statics = built.statics;
    scene.terrainMats = built.terrainMats; // generated maps only — the stacked ground passes' table
    // boot only: spawn the player (mints the Squad id). A trip arrival
    // instead lands the transferred player in _arriveSquad right after this.
    if (squad === null) {
      scene.playerId = PlayerSystem.spawn(scene.level.entities, built.spawn);
    }

    // The level's whole-map records (LevelMeta), off the data's meta: the indoor flag (no sky
    // passes, the cozy interior BGM), the climate (pinned over the map by _applyClimate on every
    // arrival), and the settlement (optional meta.settlement — an authored faction hub / raider
    // camp; the overworld is the colony's "hub", whose NPCs and stockpile chest are its
    // Residents, their settlementId this map's id). A level without one stays unsettled until a
    // Survey Post founds it (BuildMode.claim).
    const meta = scene.level.meta;
    meta.set(ColonyMap.BIOME, data.meta.biome);
    if (data.meta.indoor === true) meta.set(ColonyMap.INDOOR, true);
    if (data.meta.climate !== undefined)
      meta.set(ColonyMap.CLIMATE, data.meta.climate);
    const s = data.meta.settlement;
    if (s !== undefined)
      Settlement.found(scene.level, {
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
  _spawnWorld(scene, data, built) {
    const entities = scene.level.entities;
    const grid = scene.level.grid;
    for (let i = 0; i < built.spawns.length; i++)
      ColonySpawn.spawnEntity(entities, grid, built.spawns[i]);
    // A region, not an entity, so it is read off the descriptors here (and saved as a rect thereafter).
    scene.reachZone = ColonyMap._reach(scene, built.spawns);
    scene.reachDone = scene.reachZone === undefined; // nothing to reach on this map
    scene._npcId = -1; // resolved live each frame by _updateNpc (nearest "npc" in range)
  },

  /**
   * The map's two spatial indexes: the store's broadphase + the level-sized pathfinding grid.
   * The nav grid's size is the level's, so MotionPlanner.setGrid runs once here per map; its
   * contents refresh on their own signals (sceneColony.step syncs tile costs, SolidSystem.onStatics
   * re-stamps colliders).
   */
  _buildSpatial(scene) {
    // O(n) broadphase for SeparationSystem, the one symmetric-pair sweep left (it rebuilds the grid
    // per tick). cellSize (96px) exceeds max dynamic-body diameter (~27px at 16px cells), which is
    // the center-bucket contract; huge SOLID colliders (level border, water rects) never enter it —
    // SeparationSystem buckets dynamic bodies only. Rides with the store, so a parked map keeps it
    // across a resume; rebuilt per cold build.
    // NOTE: this shared grid serves the DYNAMIC symmetric pair problem (mob↔mob).
    // SolidSystem's asymmetric body-vs-static query uses its OWN static grid (SolidSystem._gridRebuild)
    // — a different query shape (range query, multi-cell statics), so it can't reuse this instance.
    scene.level.entities.broadphase = new Broadphase(
      scene.level.grid.cols * scene.level.grid.cellWidth,
      scene.level.grid.rows * scene.level.grid.cellHeight,
      96,
    );

    scene.nav = new NavGrid(scene.level.grid);
    MotionPlanner.setGrid(scene.nav.grid);

    // the enclosure mirror: the wall layer bounds a room (a fence has no roof). RoomSystem feeds it
    // the doors and reads it for the environmental needs; parks with the map like the nav grid.
    scene.rooms = new Rooms(scene.level.grid, [scene.wallLayer]);
  },

  /**
   * The RenderDecor defs of a generated map's material table: every `decor` entry of a
   * material row, keyed by the row's TileType id, its sprite resolved (a missing one is
   * warned and skipped, like a missing terrain sheet).
   */
  _decorDefs(mats) {
    const defs = [];
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i].material;
      const def = mat !== undefined ? contentBiomes.MATERIALS[mat] : undefined;
      if (def === undefined || def.decor === undefined) continue;
      for (let k = 0; k < def.decor.length; k++) {
        const d = def.decor[k];
        const spr = asset_get_index(d.sprite);
        if (!sprite_exists(spr)) {
          Log.warn(`decor sprite missing: ${d.sprite}`); // GMRT: sprite_exists, not >=0
          continue;
        }
        defs.push({
          id: mats[i].type.id,
          sprite: spr,
          density: d.density,
          upright: d.upright === true,
        });
      }
    }
    return defs;
  },

  /**
   * The RenderGrass defs of a material table: every `clump` entry of a material row, keyed
   * by the row's TileType id — _decorDefs' shape for the volume layer. `tintHex` is the
   * biome profile's clumpTint — it overrides every def's own `clump.tint` (the sheet is a
   * white mask, so the resolved color IS the field's color).
   */
  _clumpDefs(mats, tintHex) {
    const defs = [];
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i].material;
      const def = mat !== undefined ? contentBiomes.MATERIALS[mat] : undefined;
      if (def === undefined || def.clump === undefined) continue;
      const spr = asset_get_index(def.clump.sprite);
      if (!sprite_exists(spr)) {
        Log.warn(`clump sprite missing: ${def.clump.sprite}`); // GMRT: sprite_exists, not >=0
        continue;
      }
      const hex = tintHex !== undefined ? tintHex : def.clump.tint;
      defs.push({
        id: mats[i].type.id,
        sprite: spr,
        min: def.clump.min,
        max: def.clump.max,
        scaleMin: def.clump.scaleMin,
        scaleMax: def.clump.scaleMax,
        tint: hex !== undefined ? Color.parse(hex) : undefined,
        edge: def.clump.edge,
      });
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
    GrassSystem.clearBuilt(scene); // prefab-built ground sheds its grass before the VBOs bake
    scene.renderer = new Renderer();
    // Generated ground UNDER everything (the LAYERS loop below skips `terrain` when this ran).
    scene._terrainPasses = [];
    const mats = scene.terrainMats;
    if (mats !== undefined)
      for (let i = 0; i < mats.length; i++) {
        const spr = asset_get_index(mats[i].sprite);
        if (!sprite_exists(spr)) {
          Log.warn(`terrain sprite missing: ${mats[i].sprite}`); // GMRT: sprite_exists, not >=0
          continue;
        }
        const pass = new RenderTileMap(
          scene.terrainLayer,
          scene.level.grid,
          spr,
          {
            autotile: "dual",
            minId: mats[i].type.id,
            skipAbove: i < mats.length - 1 ? mats[i + 1].type.id : undefined,
            variants: true, // weighted full-tile picks so a wide field doesn't tile visibly
            wave: ColonyMap._wave(mats[i].material),
          },
        );
        scene._terrainPasses.push(pass);
        scene.renderer.insert(pass);
      }
    // the materials' identity pieces over the finished ground (RenderDecor) — flat decals in
    // painter order here, the upright ones entering the depth pool before the entities
    scene._decorPass = undefined;
    if (mats !== undefined) {
      const defs = ColonyMap._decorDefs(mats);
      if (defs.length > 0) {
        scene._decorPass = new RenderDecor(
          scene.terrainLayer,
          scene.level.grid,
          defs,
        );
        scene.renderer.insert(scene._decorPass);
      }
    }
    // the grass materials' volume layer (RenderGrass) — upright clumps in the depth pool,
    // over the decor pieces
    scene._grassPass = undefined;
    if (mats !== undefined) {
      const profile = contentBiomes.BIOMES[scene.level.meta.get(ColonyMap.BIOME)];
      const cdefs = ColonyMap._clumpDefs(
        mats,
        profile !== undefined ? profile.clumpTint : undefined,
      );
      if (cdefs.length > 0) {
        scene._grassPass = new RenderGrass(
          scene.terrainLayer,
          scene.level.grid,
          cdefs,
        );
        scene.renderer.insert(scene._grassPass);
      }
    }
    // Resident tile layers (terrain/floor) as real tilemaps — bottom→top per contentTiles.LAYERS;
    // on pitched maps the wall and fence layers join below as the lit RenderWalls/RenderFence
    // passes (the flat fallback keeps their autotile RenderTileMaps). VBO-cached + keyed by layer
    // so a BuildMode edit markDirty's the matching pass. A generated map holds the floor/fence
    // layers EMPTY until the player builds — an empty layer emits no quads, so they are free there.
    scene._tilePasses = {};
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.key === "wall" && pitch > 0) continue; // RenderWalls (lit boxes) below
      if (cfg.key === "fence" && pitch > 0) continue; // RenderFence (post-and-rail boxes) below
      if (cfg.key === "terrain" && mats !== undefined) continue; // the material stack above
      const spr = asset_get_index(cfg.sprite);
      if (!sprite_exists(spr)) {
        Log.warn(`tile sprite missing: ${cfg.sprite}`); // GMRT: validate via sprite_exists, not >=0
        continue;
      }
      const pass = new RenderTileMap(
        scene[cfg.key + "Layer"],
        scene.level.grid,
        spr,
        {
          autotile: cfg.type,
          color: Color.parse(cfg.color),
        },
      );
      scene._tilePasses[cfg.key] = pass;
      scene.renderer.insert(pass);
    }
    // the sprite-free cost fill stays as an inspection overlay, inserted off
    scene._tilePass = new RenderDebugTileMap(scene.level.grid, {
      cost: true,
      tiles: false,
      alpha: 0.5,
    });
    scene._tilePass.enabled = false;
    scene.renderer.insert(scene._tilePass);
    scene._gridPass = new RenderGrid(scene.level.grid); // cell boundary lines
    scene._gridPass.enabled = false; // off in normal play
    scene.renderer.insert(scene._gridPass);
    // Foot shadows UNDER the entities (runtime ellipse per body, not baked into the sprites).
    scene.renderer.insert(new RenderEntityShadow());
    // Deep-furniture meshes (VOLUME category of the projection contract — see RenderBillboard):
    // real depth-writing geometry, so it shares the billboard depth pool. Pitched maps only —
    // a flat map has no depth-writing entity pass to sort against. Sun + point lights injected
    // like RenderLighting's ambient (the pass is Core; WorldClock and the Light token are not);
    // camera assigned in _buildCamera (the nearest-point-light selection center). seed = entity
    // id keeps the mesh flicker in phase with RenderLighting's glow pools.
    if (pitch > 0) {
      scene._meshPass = new RenderMesh({
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
      });
      scene.renderer.insert(scene._meshPass);
      // GROUND joins the one lit shader: the terrain material stack + every resident tile pass
      // read this pass's light gather (up normal — flat ground). Assigned post-construction
      // because the ground passes are built above, before the mesh pass exists; the wall
      // passes below take it at construction. Flat maps (pitch 0) stay unlit.
      for (let i = 0; i < scene._terrainPasses.length; i++)
        scene._terrainPasses[i].lights = scene._meshPass;
      if (scene._decorPass !== undefined)
        scene._decorPass.lights = scene._meshPass;
      if (scene._grassPass !== undefined)
        scene._grassPass.lights = scene._meshPass;
      const tileKeys = Object.keys(scene._tilePasses);
      for (let i = 0; i < tileKeys.length; i++)
        scene._tilePasses[tileKeys[i]].lights = scene._meshPass;
      // WALLS category (art projection contract): the resident wall layer as lit boxes
      // (top + exposed south faces) in the same depth pool, sharing the mesh pass's
      // sun + culled point lights. Keyed into _tilePasses so BuildMode's edit
      // markDirty reaches it (the flat "corner" autotile config stays as the flat-map fallback).
      // ONE pass covers every wall on the map — the generator's and the player's both paint the
      // same layer. PER-CELL MATERIALS from the wall cfg (near-white face texture × tint per
      // material, bucketed by TileType id — see RenderWalls); materials[0] (brick) doubles as the
      // default bucket for generated walls.
      const wallCfg = contentTiles.get("wall");
      const wallMats = [];
      for (let i = 0; i < wallCfg.materials.length; i++) {
        const m = wallCfg.materials[i];
        const ms = asset_get_index(m.sprite);
        wallMats.push({
          id: m.id,
          sprite: sprite_exists(ms) ? ms : undefined, // GMRT: validate via sprite_exists
          frame: 0,
          color: Color.parse(m.color),
        });
      }
      scene._tilePasses.wall = new RenderWalls(
        scene.level.grid,
        scene.wallLayer,
        {
          color: wallMats[0].color,
          sprite: wallMats[0].sprite,
          frame: 0,
          lights: scene._meshPass,
          materials: wallMats,
        },
      );
      scene.renderer.insert(scene._tilePasses.wall);
      // the fence layer as lit post-and-rail boxes in the same depth pool — its occupancy read
      // is the autotiling (RenderFence); the flat blob4 config stays for the editor like the wall's
      scene._tilePasses.fence = new RenderFence(
        scene.level.grid,
        scene.fenceLayer,
        {
          color: Color.parse(contentTiles.get("fence").color),
          lights: scene._meshPass,
        },
      );
      scene.renderer.insert(scene._tilePasses.fence);
    }
    // Entities via the production sprite pass (per-entity data — name/facing/animator state —
    // is inspected with entities.dump(), not by world-space label passes).
    // Pitched maps hand the billboard pass the mesh pass as its light source (sprite sun
    // response: sprites dim/warm with the sun + catch torchlight like the mesh faces).
    scene._entityPass =
      pitch > 0
        ? new RenderBillboard({ lights: scene._meshPass })
        : new RenderEntity();
    scene.renderer.insert(scene._entityPass);
    const bbox = new RenderDebugEntity(); // lime bbox outlines, off until toggled
    bbox.enabled = false;
    scene.renderer.insert(bbox);
    const paths = new RenderDebugPath(scene.level.grid); // enemy A* paths, off until toggled
    paths.enabled = false;
    scene.renderer.insert(paths);
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
    scene.renderer.insert(ranges);
    // The sky overlay just under the day/night tint, so night darkens the rain: cloud shadows
    // under the weather (tint + rain/snow), both layers of one RenderOverlay that is cut out over
    // every room (Rooms.rects, the boxes a wall tall) — no rain, tint or cloud on a floor under a
    // roof. Skipped indoors (meta.indoor) — no open sky inside a cave.
    scene._clouds = undefined;
    scene._weather = undefined;
    scene._sky = undefined;
    if (scene.level.meta.get(ColonyMap.INDOOR) !== true) {
      scene._clouds = new RenderCloudShadow();
      scene._clouds.enabled = false; // the flat look: no noise field drifting over the ground
      scene._weather = new RenderWeather();
      const wall = scene._tilePasses.wall; // RenderWalls on a pitched map (its height); flat: a tilemap
      const roofH =
        wall !== undefined && wall.height !== undefined ? wall.height : 0;
      scene._sky = new RenderOverlay({
        layers: [scene._clouds, scene._weather],
        cutout: () => scene.rooms.rects(),
        height: roofH,
      });
      scene.renderer.insert(scene._sky);
    }
    // Lighting LAST — a per-frame light map composited over everything. Day/night is its ambient
    // term ("lighting with no lights"); Light entities + a night vignette layer on top.
    scene._lighting = new RenderLighting({
      ambient: () => WorldClock.tint(),
      vignette: 0, // the flat look: night is one even multiply, no corner gradient
    });
    scene.renderer.insert(scene._lighting);
  },

  /**
   * Follow camera on the new player + view culling.
   * 32px-cell world: base zoom 2 for the pitched 2.5D framing (flat fallback 1) and the wheel
   * snaps through integer stops — a whole number of screen px per world px keeps every texel
   * the same size across the screen (a fractional zoom draws them 1 px and 2 px wide by turns).
   * The pitch still foreshortens rows by cos(pitch); only the horizontal scale is exact.
   */
  _buildCamera(scene) {
    const pitch = ColonyMap.BB_PITCH;
    const baseZoom = pitch > 0 ? 2 : 1;
    // Cap zoom-OUT to the world: viewCap = max view WIDTH (world px); the control derives its live
    // zoom floor from it + the current surface each frame. Horizontal is the binding axis on a
    // landscape surface.
    const viewCap = scene.level.grid.cols * scene.level.grid.cellWidth;
    // no width/height seed — CameraFollow re-derives the extent from the surface every update
    scene.cameraFollow = new CameraFollow({
      entities: scene.level.entities,
      target: scene.playerId, // fallback seed — the live CameraFocus query wins (ColonyPlayer)
      lerp: 0.15,
      pitch: pitch, // frame-0 seed; the pitchCurve below overwrites it every update
      // pitch-by-zoom (upright-sprite camera) — see ColonyMap._pitchCurve
      pitchCurve: ColonyMap._pitchCurve,
      // ortho eye distance: the 100 default near-clips close ground at steep pitch
      // (a black band along the screen bottom); image-identical otherwise under ortho
      eyeDist: 2000,
      zoom: baseZoom,
      viewCap: viewCap, // live zoom-out cap: view width ≤ this (no dark void past the map)
      zoomMax: 3, // one integer stop of zoom-in headroom
      zoomSteps: [0.5, 1, 2, 3],
      // Edge-clamp the look-at to the finite world so the pitched view never shows past a map
      // edge. gridToWorld anchors cell 0 at world (0,0).
      bounds: {
        x1: 0,
        y1: 0,
        x2: scene.level.grid.cols * scene.level.grid.cellWidth,
        y2: scene.level.grid.rows * scene.level.grid.cellHeight,
      },
    });
    scene.camera = new Camera().setControl(scene.cameraFollow);
    scene.camera.assign(0);
    // Cull the grid pass to the camera view (essential on a large generated map).
    scene._gridPass.camera = scene.camera;
    scene._tilePass.camera = scene.camera; // view-cull the placeholder tile fill
    if (scene._clouds !== undefined) scene._clouds.camera = scene.camera;
    if (scene._weather !== undefined) scene._weather.camera = scene.camera;
    if (scene._sky !== undefined) scene._sky.camera = scene.camera;
    scene._lighting.camera = scene.camera;
    // the STANDING passes read the live pitch for their height compensation (RenderBillboard)
    if (scene._entityPass instanceof RenderBillboard)
      scene._entityPass.camera = scene.camera;
    if (scene._decorPass !== undefined) scene._decorPass.camera = scene.camera;
    if (scene._grassPass !== undefined) scene._grassPass.camera = scene.camera;
    if (scene._meshPass !== undefined) scene._meshPass.camera = scene.camera;
  },

  /**
   * Scene teardown: reclaim every parked map — its runtime here, its Level from the pool — then
   * drop the park index (the caller drops the pool itself). Park the live map FIRST, so no map is
   * missed. No global input/weather teardown — those are scene-scoped. renderer.destroy() frees
   * the tile/terrain VBOs.
   */
  reset() {
    const ids = Object.keys(ColonyMap._parked);
    for (let i = 0; i < ids.length; i++) {
      const b = ColonyMap._parked[ids[i]];
      if (b.camera) b.camera.destroy();
      if (b.renderer) b.renderer.destroy();
      const level = World.get(ids[i]);
      if (level !== null) level.destroy();
    }
    ColonyMap._parked = {};
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
  _reach(scene, spawns) {
    for (let i = 0; i < spawns.length; i++)
      if (spawns[i].preset === "reach")
        return ColonySpawn.reachZone(scene.level.grid, spawns[i]);
    return undefined;
  },
};

// 2.5D adopted: camera pitch in degrees (0 = flat top-down, debug only — front-view art reads
// wrong flat). Assigned after the object literal — GMRT static-field-init quirk. Read by
// _buildRenderer (billboard vs flat entity pass) + _buildCamera (pitch + framing zoom).
// With the upright-sprite camera this is the frame-0 seed + the pitched-map GATE only —
// the LIVE pitch is _pitchCurve below (42° zoomed out → 58° zoomed in).
ColonyMap.BB_PITCH = 42;
// Pitch-by-zoom curve (upright-sprite camera): shallow 42° at the zoom-out floor (~1.25 on
// a 1920 surface) easing to 58° at max zoom-in (2.625) — "look further = flatter".
// Thresholds are the spike values HALVED for the 32px-cell world (zoom seeds halved, same
// screen framing); the 42–58° outputs are angles, unchanged.
ColonyMap._pitchCurve = (z) => 42 + 16 * clamp((z - 1.25) / 1.375, 0, 1);
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
