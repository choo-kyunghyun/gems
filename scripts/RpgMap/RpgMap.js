// Map-graph engine for the RPG scene — portal travel, map pool, and persistence.
// Free functions over the scene (composition; GMRT has no usable class inheritance).
/**
 * Visited maps stay ALIVE: the World level pool holds each map's DATA (its Level — grid +
 * entities) and `_parked` below holds the per-map RUNTIME the RPG builds over it (renderer,
 * camera, physics, nav, render-pass handles), so a door trip never destroys/rebuilds. Only the
 * SQUAD migrates:
 * every entity sharing the player's Squad id (player included) moves as a WHOLE entity through
 * World.take/put — a portal forces a "wait" member back to "follow" first, so the squad
 * always travels together. There is no per-map player and no carried component subset; kicked/unhired
 * companions are plain map residents. Everything is persistent for the session: a map builds from
 * file exactly ONCE (first visit), then only freezes/thaws — no eviction, cold serialize, or
 * respawn-from-file reconcile. Disk saves are the follow-up seam.
 */
globalThis.RpgMap = {
  _parked: {}, // mapId -> the park bundle below. The map's DATA is its pooled Level, not this.

  // fields _stash/_restore copy between scene and a parked bundle (excludes scene-shell +
  // per-activate transients reset by _activateReset on each map open). NOT listed: the Level
  // itself (the pool holds it — a resume re-points scene.level at it) and the per-layer tilemap
  // handles (<key>Layer/<key>Type/<key>Types), which _bundleKeys derives from RpgLevel.LAYERS so a
  // new LAYERS entry can't silently miss the bundle.
  // (playerId is NOT bundled — it's DERIVED: set on boot spawn/arrival and re-latched per frame
  // from the Playable query, so the bundle never carries a player handle)
  BUNDLE_KEYS: [
    "spawn",
    "entries",
    "_chunked",
    "_indoor",
    "colliders",
    "_built",
    "_builtEnts",
    "reachZone",
    "reachDone",
    "nav",
    "physics",
    "renderer",
    "generator",
    "chunks",
    "terrain",
    "camera",
    // NOTE: no "followers"/"playerId" — squad members leave before the park; residents live in the world

    "_tilePasses",
    "_tilePass",
    "_gridPass",
    "_chunkPass",
    "_clouds",
    "_weather",
    "_lighting",
  ],

  /**
   * Take the SQUAD through a portal: every member (player FIRST) leaves the current world as a
   * whole entity via World.take, the map parks, and the members land in the target via
   * World.put with entry-position overrides (_arriveSquad). "wait" is map-local — the
   * portal forces it back to "follow" (re-applying its carry bonus) so the squad always travels
   * together; only kicked/unhired companions stay behind. Called from create() + checkPortals.
   */
  go(scene, mapId, entryId) {
    let squad = null; // whole-entity snapshots, player first; null = boot (spawn a fresh player)
    // ── PHASE A: pull the squad out, then park the current map (its store stays alive) ──
    if (scene.playerId !== undefined) {
      const sid = scene.level.entities.get(Squad, scene.playerId).id;
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
      RpgMap.suspend(scene);
    }
    // ── PHASE B: enter the target — resume its parked bundle, else build from file ──
    // every resident map is parked at this point (Phase A parked the current one), so a
    // _parked hit is always a full park bundle
    if (RpgMap._parked[mapId] !== undefined)
      RpgMap.resume(scene, mapId, entryId, squad);
    else RpgMap.build(scene, mapId, entryId, squad);
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
   * the unassign its later destroy() would tear down the live view. exitRegion so the next map
   * re-detects its climate.
   */
  suspend(scene) {
    if (scene.camera) scene.camera.unassign();
    Weather.exitRegion();
    RpgMap._parked[scene.level.id] = RpgMap._stash(scene);
  },

  /**
   * Resume a parked map: restore its fields, re-claim the viewport, and land the traveling squad
   * at the entry (the parked store has no player — the squad left through the portal).
   */
  resume(scene, mapId, entryId, squad) {
    scene.level = World.get(mapId); // the pooled data, exactly as it parked
    RpgMap._restore(scene, RpgMap._parked[mapId]);
    World.activeId = mapId;
    MotionPlanner.setGrid(scene.nav);
    if (scene.camera) scene.camera.assign(0);

    const sp = scene.entries[entryId] ?? scene.spawn;
    RpgMap._arriveSquad(scene, squad, sp);
    // snap the follow camera to the entry so it doesn't pan from the parked position (the
    // TARGET needs no re-aim: the arrived player carries CameraFocus — take/put re-mints its
    // id, but CameraFollow resolves the marker by live query each update)
    if (scene.camera) {
      scene.camera.toX = sp.x;
      scene.camera.toY = sp.y;
    }

    // chunked: re-seed the entity sim ring around the entry so the first frame back has no gap
    if (scene.chunks !== undefined) scene.chunks.update(sp.x, sp.y);

    RpgMap._activateReset(scene);
    RpgMap._registerCameraDebug(scene);
    RpgMap._applyBgm(scene); // crossfade to the resumed map's ambient (indoor ⇄ overworld)
    FloatingText.clear(); // drop the previous map's combat numbers (world coords are map-local)
    ParticleFx.clear();
  },

  /**
   * Map-appropriate ambient: interiors (meta.indoor) get the cozy loop, the open world the
   * tense one. Called on every map arrival (build + resume); Music.play cross-fades and treats
   * a same-track re-request as a no-op, so this is safe to call unconditionally.
   */
  _applyBgm(scene) {
    Music.play(scene._indoor === true ? mus_ambient_cozy : mus_ambient_tense);
  },

  /**
   * Full bundle key list: BUNDLE_KEYS + the per-layer handles from RpgLevel.LAYERS
   * (<key>Layer/<key>Type, plus <key>Types for a materials-bearing layer). Rebuilt per call
   * (portal-rate, tiny).
   */
  _bundleKeys() {
    const keys = RpgMap.BUNDLE_KEYS.slice();
    for (let i = 0; i < RpgLevel.LAYERS.length; i++) {
      const cfg = RpgLevel.LAYERS[i];
      keys.push(cfg.key + "Layer");
      keys.push(cfg.key + "Type");
      if (cfg.materials !== undefined) keys.push(cfg.key + "Types");
    }
    return keys;
  },

  /**
   * Pointer-copy per-map fields level↔bundle. Index loop (no Map/Set iteration — GMRT).
   */
  _stash(scene) {
    const b = {};
    const keys = RpgMap._bundleKeys();
    for (let i = 0; i < keys.length; i++) b[keys[i]] = scene[keys[i]];
    return b;
  },
  _restore(scene, b) {
    const keys = RpgMap._bundleKeys();
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
    scene._climateZone = 0;
    scene._npcId = -1;
    // nav-rebuild gate (sceneRpg.step): force a rebuild on the first frame of a (re)activated map
    scene._navGx = undefined;
    scene._navGy = undefined;
    scene._navTick = 0;
    // portal re-entry guard: an arrival entry may overlap a portal, so lock travel until the player
    // has stepped clear of every portal once (checkPortals arms it). Prevents door ping-pong.
    scene._portalLock = true;
    if (scene.invOpen) scene._invDirty = true;
    // Re-point CombatAI's shared store/grid statics. A resume keeps actors without re-attaching,
    // so bind explicitly — else enemies step against the previously-built store and fault.
    CombatAI.bind(scene.level.entities, scene.level.grid);
    // Re-point the terrain movement pricing (mover speed × 1/cost) at the active map, same reason.
    PathFollow.bind(RpgMap._terrainCost(scene));
  },

  /**
   * Per-map terrain movement-cost provider ((wx, wy) → cost ≥ 1, Infinity = impassable) feeding
   * NavGrid's route weights and PathFollow's speed pricing. Chunked maps price the biome via the
   * manager's STORE-backed costAt (stored terrain — the world is pregenerated, so this is a
   * lookup, not a noise resample); plain maps (interiors) price no terrain → null (cost 1).
   */
  _terrainCost(scene) {
    if (!scene._chunked || scene.chunks === undefined) return null;
    const chunks = scene.chunks;
    const cw = scene.level.grid.cellWidth;
    const ch = scene.level.grid.cellHeight;
    return (wx, wy) => chunks.costAt(Math.floor(wx / cw), Math.floor(wy / ch));
  },

  /**
   * World-coord entry points by name, for repositioning the player on a resume (no file reload).
   * Mirrors _resolveSpawn's sources: meta.entries, plus legacy meta.playerSpawn as "default".
   */
  _entryTable(grid, data) {
    const out = {};
    const e = data.meta.entries;
    if (e !== undefined)
      for (const k in e) out[k] = grid.gridToWorld(e[k].gx, e[k].gy);
    if (data.meta.playerSpawn !== undefined && out.default === undefined)
      out.default = grid.gridToWorld(
        data.meta.playerSpawn.gx,
        data.meta.playerSpawn.gy,
      );
    return out;
  },

  // Build a map fresh from file — first visit ONLY (a revisit always resumes its live parked
  // bundle; nothing is ever rebuilt). `squad` is handed in by go() (null on boot → spawn a fresh
  // player). Orchestrates the helpers below.
  build(scene, mapId, entryId, squad = null) {
    const loaded = RpgMap._loadData(mapId, entryId);
    const data = loaded.data;
    mapId = loaded.mapId;
    entryId = loaded.entryId;
    // On a LOAD, SaveGame stashes each saved map's state; consume this map's here (null for a new
    // game / an unvisited map). Its chunk cache feeds _spawnWorld; its builds apply after scaffolding.
    const mapState = SaveGame.takePendingMap(mapId);
    // chunked: streams terrain + entities around the player (overworld); plain builds up front
    scene._chunked = data.meta.chunked === true;
    // indoor maps (meta.indoor): no sky passes, and the cozy interior BGM below
    scene._indoor = data.meta.indoor === true;
    Log.info(
      `RPG map: ${mapId} (entry ${entryId})${scene._chunked ? " [chunked]" : ""}`,
    );

    RpgMap._buildWorld(scene, data, mapId, entryId, squad); // the Level (+ player on boot) + zones
    // pool it BEFORE the squad lands — World.put resolves the destination through the pool
    World.add(mapId, scene.level);
    World.activeId = mapId; // building a map activates it (a load boots straight through here)
    RpgMap._arriveSquad(scene, squad, scene.spawn); // scene.spawn is already entry-resolved
    // build-mode tracking, fresh per first visit (parks with the bundle thereafter). _builtEnts
    // persists on the scene across map swaps (BuildMode.build runs once) — reset explicitly.
    scene._built = {};
    scene._builtEnts = {};
    // entities (streamed or up-front). A loaded map threads its deep chunk cache in here so touched
    // chunks materialize their saved state instead of fresh spawns.
    RpgMap._spawnWorld(scene, data, {
      chunkCache: mapState !== null ? mapState.chunkCache : undefined,
    });
    RpgMap._activateReset(scene); // per-activate transients (hp track, build mode, climate, inv)
    RpgMap._buildPipeline(scene); // nav window + physics pipeline
    RpgMap._buildRenderer(scene, data); // render pass stack
    RpgMap._buildCamera(scene, data); // follow camera + view culling + debug
    RpgMap._applyBgm(scene); // map-appropriate ambient (re-requesting the same track is a no-op)

    FloatingText.clear(); // drop combat numbers + particles from the previous map (map-local coords)
    ParticleFx.clear();

    // a loaded map's builds + claimed zone (after scaffolding, so the tile layers/colliders exist)
    if (mapState !== null) SaveGame.applyMapState(scene, mapState);
  },

  /**
   * Load a map file, falling back to the start map if it's bad. Returns resolved ids + parsed data.
   */
  _loadData(mapId, entryId) {
    const file = RpgLevel.mapFile(mapId);
    let data = LevelSerializer.load(file, { genre: "topdown" });
    if (data === null) {
      Log.error(
        `map "${mapId}" (${file}) failed — falling back to ${RpgLevel.START}`,
      );
      mapId = RpgLevel.START;
      entryId = "default";
      data = LevelSerializer.load(RpgLevel.mapFile(mapId), {
        genre: "topdown",
      });
    }
    return { data, mapId, entryId };
  },

  /**
   * Entity store + LevelGrid + the buildable/climate zone channels. The player spawns here ONLY on boot
   * (squad === null) — portal arrivals transfer the whole player entity in via _arriveSquad,
   * which re-latches scene.playerId. Chunked gets a bigger entity cap (a window of chunks' worth
   * of entities + colliders + drops) and an empty resident grid (player builds only).
   */
  _buildWorld(scene, data, mapId, entryId, squad) {
    // a streamed map holds a window of chunks' worth of entities + colliders + drops at once
    scene.level = new Level({
      id: mapId,
      capacity: scene._chunked ? 1024 : 256,
    });
    const built = scene._chunked
      ? RpgLevel.buildChunked(scene.level.entities, data, entryId)
      : RpgLevel.build(scene.level.entities, data, entryId);
    scene.level.grid = built.grid;
    scene.spawn = built.spawn; // for player respawn on death
    scene.entries = RpgMap._entryTable(scene.level.grid, data); // named entries → world coords (resume)
    // tilemap handles (render passes + build mode) — one Layer/Type pair per LAYERS entry,
    // plus <key>Types for a materials-bearing layer (wall). Bundled via _bundleKeys.
    for (let i = 0; i < RpgLevel.LAYERS.length; i++) {
      const key = RpgLevel.LAYERS[i].key;
      scene[key + "Layer"] = built[key + "Layer"];
      scene[key + "Type"] = built[key + "Type"];
      if (built[key + "Types"] !== undefined)
        scene[key + "Types"] = built[key + "Types"];
    }
    scene.colliders = built.colliders;
    // boot only: bind the keymap + spawn the player (mints the Squad id). A portal arrival
    // instead lands the transferred player in _arriveSquad right after this.
    if (squad === null) {
      PlayerSystem.bindKeys();
      scene.playerId = PlayerSystem.spawn(scene.level.entities, built.spawn);
    }

    // settlement channel (one per map) — Survey Posts found player-owned Settlements into it, build
    // mode gates placement to owned land, RenderZone visualizes every settlement's territory. Created
    // empty up front so the persistence import + RenderZone have a target before anything is founded.
    Settlement.channel(scene.level.grid);
    // Authored non-player settlements (optional meta.settlements, mirroring meta.climate below):
    // faction hubs / raider camps. The overworld authors one — the colony "hub", whose NPCs and
    // stockpile chest are its Residents — so the player's own founded settlement and an authored
    // faction's coexist on one map, which is the case the sid-keyed model exists to support.
    const settlements = data.meta.settlements;
    if (settlements !== undefined)
      for (let i = 0; i < settlements.length; i++) {
        const s = settlements[i];
        const r = s.rect;
        Settlement.found(scene.level.grid, r[0], r[1], r[2], r[3], {
          id: s.id, // stable authored sid (residents reference it)
          // name is an i18n key — the label renders in-world (RenderZoneLabel), so localize it
          name: s.name !== undefined ? I18n.text(s.name) : "",
          factionId: s.faction ?? "",
          color: s.color,
          comp: s.comp, // SettlementComponent id array
        });
      }

    // Climate zones (optional, from meta.climate): regions that override the open sky (forced
    // Weather condition + Kelvin temp offset) while the player is inside. Built before the
    // persistence import so it round-trips like the buildable zone.
    const climate = data.meta.climate;
    if (climate !== undefined) {
      const cmap = scene.level.grid.addZoneMap("climate");
      for (let i = 0; i < climate.length; i++) {
        const c = climate[i];
        const z = cmap.define({
          name: c.name,
          tags: ["climate"],
          data: {
            weather: c.weather ?? null,
            tempMod: c.tempMod ?? 0,
            color: c.color ?? "#88aaff",
          },
        });
        const r = c.rect;
        cmap.paintRect(z.id, r[0], r[1], r[2], r[3]);
      }
    }
  },

  // Entities. Chunked sim-LODs them via ChunkManager (live near the player, frozen snapshots
  // beyond); plain spawns all up front. Either way the scene reads NPC/portal/enemy/companion
  // handles LIVE by component query — stored id lists would dangle across freeze/thaw.
  _spawnWorld(scene, data, opts = {}) {
    if (scene._chunked) {
      // the pass-composed generator: authored hub overlay + procedural wilderness in one
      scene.generator = OverworldGen.create({
        seed: data.meta.seed ?? 1337,
        chunkCols: data.meta.chunkCols ?? 16,
        chunkRows: data.meta.chunkRows ?? 16,
        authored: data, // hand-built hub overlaid onto its chunks (AuthoredStamp)
      });
      // Finite world: a worldCols × worldRows rectangle (matches the resident grid), ringed by
      // a wall border so the player/enemies can't leave.
      const wc = data.meta.worldCols ?? data.cols ?? 128;
      const wr = data.meta.worldRows ?? data.rows ?? 128;
      // Entity sim-LOD: simRadius 1 keeps only ~9 chunks live (the rest hold frozen snapshots).
      // simRadius:1 stays the shipped default pending a simRadius:2 re-measure with SolidSystem's
      // static grid in place (the historical wide-SIM blocker — see SolidSystem._gridRebuild).
      scene.chunks = new ChunkManager(
        scene.level.entities,
        scene.level.grid,
        scene.generator,
        {
          chunkCols: data.meta.chunkCols ?? 16,
          chunkRows: data.meta.chunkRows ?? 16,
          simRadius: 1,
          worldCols: wc,
          worldRows: wr,
          /** descriptor adapter — chunk spawns build through the same path as file spawns */
          spawn: (entities, grid, desc) =>
            RpgSpawn.spawnEntity(entities, grid, desc),
        },
      );
      RpgLevel.buildWorldBorder(scene.level.entities, scene.level.grid, wc, wr); // edge walls (always present)
      // Generate the ENTIRE finite world into the manager's store now (one-time, behind the
      // scene fade) — geometry is resident for the map's lifetime; mid-game work is entity
      // promote/demote only, and generate() never runs in play.
      const t0 = current_time;
      const pregen = scene.chunks.pregenerate();
      Log.info(
        `RpgMap: pregenerated ${pregen} chunks in ${current_time - t0}ms`,
      );
      // deep-save restore: overwrite touched chunks with their saved entity state BEFORE the first
      // update, so they materialize saved snapshots (dead mobs stay dead) instead of fresh spawns.
      if (opts.chunkCache !== undefined)
        scene.chunks.importCache(opts.chunkCache);
      const sp = scene.level.entities.get(Position, scene.playerId);
      scene.chunks.update(sp.x, sp.y); // populate the sim ring around the spawn
      scene.reachZone = RpgMap._authoredReach(scene, data); // origin-area quest zone (authored hub)
    } else {
      // build reuses the live scene object and only _restore rewrites every bundle key, so a
      // previous chunked map's manager must not leak onto this one (step would keep driving the
      // parked map's sim ring, and a save would export its cache under this map's id)
      scene.generator = undefined;
      scene.chunks = undefined;
      const ents = RpgSpawn.spawn(scene.level.entities, scene.level.grid, data);
      scene.reachZone = ents.reach; // undefined when the map has no reach marker
    }
    scene.reachDone = scene.reachZone === undefined; // nothing to reach on this map
    scene._npcId = -1; // resolved live each frame by _updateNpc (nearest "npc" in range)
  },

  /**
   * Pathfinding nav window + physics pipeline. NavGrid.size() is constant, so MotionPlanner.setGrid
   * runs once here per map (sceneRpg.step rebuilds occupancy around the player each frame).
   */
  _buildPipeline(scene) {
    // O(n) broadphase for SeparationSystem + TriggerSystem (each rebuilds it per tick). It removes
    // TriggerSystem's O(n²) sweep over every collider — ~halving the step at
    // the shipping simRadius:1 (≈22-36ms → ≈10-20ms). cellSize (48px) exceeds max dynamic-body /
    // non-solid sensor diameter (~16-24px at 16px cells); huge SOLID colliders (world border, water
    // rects) are exempt — TriggerSystem skips solid-vs-solid and SeparationSystem buckets dynamic
    // bodies only. Rides with the store, so a parked map keeps it across a resume; rebuilt per cold
    // build. NOTE: this shared grid serves the DYNAMIC symmetric pair problem (mob↔mob, mob↔sensor).
    // SolidSystem's asymmetric body-vs-static query uses its OWN static grid (SolidSystem._gridRebuild)
    // — a different query shape (range query, multi-cell statics), so it can't reuse this instance.
    // History: SolidSystem was O(bodies×statics); a per-tick static snapshot cut per-test
    // allocs (~8.5→~1.2ms/tick at simRadius:1), then spatial bucketing of that snapshot
    // removed the linear-over-all-statics scan — lifting the wide-SIM blocker (pending re-measure).
    scene.level.entities.broadphase = new Broadphase(
      scene.level.grid.cols * scene.level.grid.cellWidth,
      scene.level.grid.rows * scene.level.grid.cellHeight,
      96,
    );

    scene.nav = new NavGrid(
      32,
      32,
      scene.level.grid.cellWidth,
      scene.level.grid.cellHeight,
      RpgMap._terrainCost(scene), // weight routes by terrain (wade only when it beats going around)
    );
    MotionPlanner.setGrid(scene.nav);

    // brains decide velocity (player input, then AI) → resolve paths → collide → push crowders
    // apart → triggers (pickups) → projectiles → expire.
    scene.physics = new Pipeline()
      .add(PlayerSystem) // the player brain: input → Velocity/fire (drives Playable entities)
      .add(StateSystem) // drives the CombatAI Idle/Chase/Attack schemas (enemies AND turrets)
      .add(PathfindingSystem) // enemy PathRequest → PathResponse over scene.nav
      .add(SolidSystem)
      .add(SeparationSystem) // unstack dynamic bodies (RTS-style crowding), after SolidSystem
      .add(TriggerSystem)
      .add(ProjectileSystem)
      .add(LifetimeSystem);
  },

  /**
   * Assemble the renderer pass stack (ground → tiles → zones → shadows → entities → debug →
   * weather → lighting). Tiles are
   * still placeholder: the resident layers render as a sprite-free debug fill (RenderDebugTileMap)
   * rather than the per-layer RenderTileMap loop (restore that loop when tile art lands). Chunked
   * terrain uses its real dual-grid tilesets (TerrainStream).
   */
  _buildRenderer(scene, data) {
    const pitch = RpgMap.BB_PITCH;
    scene.renderer = new Renderer();
    // Chunk-streamed terrain UNDER everything, so RenderChunks runs ground:false (its checker is
    // replaced by the terrain) and only draws walls + frozen-entity snapshots.
    if (scene._chunked) {
      scene.terrain = new TerrainStream(scene.chunks);
      scene.renderer.insert(scene.terrain); // one set of per-chunk VBOs, under everything
      scene.terrain.build(); // whole world once — geometry is resident, only entities freeze/thaw
      scene._chunkPass = new RenderChunks(scene.chunks, {
        font: I18n.font("default"),
        ground: false,
        // pitched maps draw the generated walls as lit boxes (the RenderWalls insert
        // below, over chunks.wallLayer()) — the flat rects stay only for the flat fallback
        walls: !(pitch > 0),
      });
      scene.renderer.insert(scene._chunkPass);
    } else {
      // same leak guard as _spawnWorld: a stale pass would get this map's camera below
      scene.terrain = undefined;
      scene._chunkPass = undefined;
    }
    // Resident tile layers (terrain/floor/fence) as real tilemaps again — bottom→top per
    // RpgLevel.LAYERS; the wall layer joins below as the lit RenderWalls pass on pitched maps
    // (flat fallback keeps its "corner" RenderTileMap). VBO-cached + keyed by layer so a
    // BuildMode edit markDirty's the matching pass. Chunked maps hold these layers EMPTY
    // (streamed terrain is TerrainStream's) — an empty layer emits no quads, so free there.
    scene._tilePasses = {};
    for (let i = 0; i < RpgLevel.LAYERS.length; i++) {
      const cfg = RpgLevel.LAYERS[i];
      if (cfg.key === "wall" && pitch > 0) continue; // RenderWalls (lit boxes) below
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
    // the sprite-free cost fill stays as a debug overlay — Debug → Render → Tiles
    scene._tilePass = new RenderDebugTileMap(scene.level.grid, {
      cost: true,
      tiles: false,
      alpha: 0.5,
    });
    scene._tilePass.enabled = false;
    scene.renderer.insert(scene._tilePass);
    scene._gridPass = new RenderGrid(scene.level.grid); // cell boundary lines
    scene._gridPass.enabled = false; // off in normal play; toggle via Debug → Render → Grid
    scene.renderer.insert(scene._gridPass);
    scene.renderer.insert(new RenderZone(scene.level.grid, "settlement"));
    scene.renderer.insert(
      new RenderZoneLabel(scene.level.grid, "settlement", {
        font: I18n.font("default"),
      }),
    );
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
        pointLights: (entities) => {
          const out = [];
          const ids = entities.query(Light, Position);
          for (let i = 0; i < ids.length; i++) {
            const p = entities.get(Position, ids[i]);
            const lt = entities.get(Light, ids[i]);
            out.push({
              x: p.x,
              y: p.y,
              radius: lt.radius,
              color: lt.color,
              intensity: lt.intensity,
              flicker: lt.flicker,
              seed: ids[i],
            });
          }
          return out;
        },
      });
      scene.renderer.insert(scene._meshPass);
      // GROUND joins the one lit shader: the streamed terrain + every resident tile pass
      // read this pass's light gather (up normal — flat ground). Assigned post-construction
      // because the ground passes are built above, before the mesh pass exists; the wall
      // passes below take it at construction. Flat maps (pitch 0) stay unlit.
      if (scene.terrain !== undefined) scene.terrain.lights = scene._meshPass;
      const tileKeys = Object.keys(scene._tilePasses);
      for (let i = 0; i < tileKeys.length; i++)
        scene._tilePasses[tileKeys[i]].lights = scene._meshPass;
      // WALLS category (art projection contract): the resident wall layer as lit boxes
      // (top + exposed south faces) in the same depth pool, sharing the mesh pass's
      // sun + culled point lights. Keyed into _tilePasses so BuildMode's edit
      // markDirty reaches it (the flat "corner" autotile config stays for the editor).
      // PER-CELL MATERIALS from the wall cfg (near-white face texture × tint per material,
      // bucketed by TileType id — see RenderWalls); materials[0] (brick) doubles as the
      // default bucket for file/streamed walls.
      const wallCfg = RpgLevel.layerCfg("wall");
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
      scene._tilePasses.wall = new RenderWalls(scene.level.grid, scene.wallLayer, {
        color: wallMats[0].color,
        sprite: wallMats[0].sprite,
        frame: 0,
        lights: scene._meshPass,
        materials: wallMats,
      });
      scene.renderer.insert(scene._tilePasses.wall);
      // The chunked overworld's AUTHORED/streamed walls (hub building, prefab ruins/camps)
      // join the same lit-box pass over the manager's whole-store occupancy view — walls are
      // static after pregeneration, so it's one lazy VBO build with no streaming coupling
      // (RenderChunks' flat rects are disabled above in its favor; never edited, so it's not
      // keyed into _tilePasses). Same brick texture/tint as the resident walls.
      if (scene._chunked)
        scene.renderer.insert(
          new RenderWalls(scene.level.grid, scene.chunks.wallLayer(), {
            color: wallMats[0].color, // occupancy view has no TileTypes — all default brick
            sprite: wallMats[0].sprite,
            frame: 0,
            lights: scene._meshPass,
          }),
        );
    }
    // Entities via the production sprite pass (per-entity data — name/facing/animator state —
    // is inspected by clicking the entity in the Debug overlay, not by world-space label passes).
    // Pitched maps hand the billboard pass the mesh pass as its light source (sprite sun
    // response: sprites dim/warm with the sun + catch torchlight like the mesh faces).
    const entityPass =
      pitch > 0
        ? new RenderBillboard({ lights: scene._meshPass })
        : new RenderEntity();
    scene.renderer.insert(entityPass);
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
    // Cloud shadows under the weather tint, weather (tint + rain/snow) just under the day/night
    // tint, so night darkens the rain. Skipped indoors (meta.indoor) — no open sky inside a cave.
    scene._clouds = undefined;
    scene._weather = undefined;
    if (!data.meta.indoor) {
      scene._clouds = new RenderCloudShadow();
      scene.renderer.insert(scene._clouds);
      scene._weather = new RenderWeather();
      scene.renderer.insert(scene._weather);
    }
    // Lighting LAST — a per-frame light map composited over everything. Day/night is its ambient
    // term ("lighting with no lights"); Light entities + a night vignette layer on top.
    scene._lighting = new RenderLighting({ ambient: () => WorldClock.tint() });
    scene.renderer.insert(scene._lighting);
  },

  /**
   * Follow camera on the new player + view culling + the live Debug camera section.
   * 32px-cell world: base zoom 1.75 for the pitched 2.5D framing (flat fallback 1) — half the
   * old 16px-cell seeds, so the on-screen framing is unchanged (view shows 2× the world px).
   */
  _buildCamera(scene, data) {
    const pitch = RpgMap.BB_PITCH;
    const baseZoom = pitch > 0 ? 1.75 : 1;
    // Cap zoom-OUT to the world: viewCap = max view WIDTH (world px); camera derives live
    // minZoom from it + the current surface each frame. Horizontal is the binding axis on a
    // landscape surface.
    const viewCap = scene.level.grid.cols * scene.level.grid.cellWidth;
    scene.camera = CameraFollow.create2d({
      entities: scene.level.entities,
      followTarget: scene.playerId, // fallback seed — the live CameraFocus query wins (RpgPlayer)
      followLerp: 0.15,
      pitch: pitch, // frame-0 seed; the pitchCurve below overwrites it every update
      // pitch-by-zoom (upright-sprite camera) — see RpgMap._pitchCurve
      pitchCurve: RpgMap._pitchCurve,
      // ortho eye distance: the -100 default near-clips close ground at steep pitch
      // (a black band along the screen bottom); image-identical otherwise under ortho
      followHeight: -2000,
      // CameraFollow recomputes the view extent each frame, so width/height below are just the seed.
      zoom: baseZoom,
      viewCap: viewCap, // live zoom-out cap: view width ≤ this (no dark void past the streamed region)
      maxZoom: baseZoom * 1.5, // modest zoom-in headroom
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
      // Edge-clamp the look-at to the finite world so the pitched view never shows past a map edge.
      // gridToWorld anchors cell 0 at world (0,0).
      clamp: {
        x1: 0,
        y1: 0,
        x2: scene.level.grid.cols * scene.level.grid.cellWidth,
        y2: scene.level.grid.rows * scene.level.grid.cellHeight,
      },
    });
    scene.camera.assign(0);
    // Cull the grid pass to the camera view (essential for the chunked map's large home grid).
    scene._gridPass.camera = scene.camera;
    scene._tilePass.camera = scene.camera; // view-cull the placeholder tile fill
    // whole-world chunk passes cull to the view too (the world no longer streams)
    if (scene.terrain !== undefined) scene.terrain.camera = scene.camera;
    if (scene._chunkPass !== undefined) scene._chunkPass.camera = scene.camera;
    if (scene._clouds !== undefined) scene._clouds.camera = scene.camera;
    if (scene._weather !== undefined) scene._weather.camera = scene.camera;
    scene._lighting.camera = scene.camera;
    // (sprites are UPRIGHT constants now — the entity pass no longer tracks camera pitch)
    if (scene._meshPass !== undefined) scene._meshPass.camera = scene.camera;
    RpgMap._registerCameraDebug(scene); // Debug/ImGui live camera controls (pitch/zoom)
  },

  /**
   * Register the Debug "Camera" section bound to the LIVE scene camera (pitch + zoom) for runtime
   * render inspection. Re-added on each build/resume (Debug.add replaces by name) so the sliders
   * drive the ACTIVE map's camera; removed on scene destroy. RPG-owned (pitch is a Game concern).
   */
  _registerCameraDebug(scene) {
    const cam = scene.camera;
    if (cam === undefined) return;
    Debug.add({
      name: "Camera",
      // pitchCurve is a computed toggle — staged (contract: Debug); the plain
      // cam fields below ref live, two-way
      data: { pitchCurve: false, zoom: 0, pitch: 0 },
      _last: false,
      build() {
        // pitch is normally the zoom curve's — uncheck to hand-tune with the slider below
        this.data.pitchCurve = cam.followPitchCurve !== undefined;
        this._last = this.data.pitchCurve;
        dbg_checkbox(ref_create(this.data, "pitchCurve"), "Pitch by zoom");
        dbg_slider(ref_create(cam, "pitchDeg"), 0, 85, "Pitch (deg)", 1);
        dbg_slider(ref_create(cam, "followZoomTarget"), 0.5, 4, "Zoom", 0.1);
        // 6DOF free-fly noclip camera (on Time.raw so it works while the sim is paused) — detach
        // from the player to inspect the render from any angle. Switches to perspective projection.
        dbg_checkbox(ref_create(cam, "freeCam"), "Free cam (WASD/RMB)");
        dbg_slider(ref_create(cam, "flySpeed"), 60, 2400, "Fly speed", 10);
        dbg_button("Recenter on player", () => {
          // same live resolution as CameraFollow: the CameraFocus carrier, else followTarget
          if (cam.entities === undefined) return;
          const foci = cam.entities.query(CameraFocus);
          const pos = cam.entities.get(
            Position,
            foci.length > 0 ? foci[0] : cam.followTarget,
          );
          if (pos !== undefined) {
            cam.toX = pos.x;
            cam.toY = pos.y;
          }
        });
        dbg_watch(ref_create(this.data, "zoom"), "Zoom (live)");
        dbg_watch(ref_create(this.data, "pitch"), "Pitch (rad)");
      },
      update() {
        const d = this.data;
        if (d.pitchCurve !== this._last)
          cam.followPitchCurve = d.pitchCurve ? RpgMap._pitchCurve : undefined;
        else d.pitchCurve = cam.followPitchCurve !== undefined;
        this._last = d.pitchCurve;
        d.zoom = cam.followZoom;
        d.pitch = cam.followPitch;
      },
    });
  },

  /**
   * Scene teardown: reclaim every parked map — its runtime here, its Level from the pool — then
   * drop the park index (the caller drops the pool itself). Park the live map FIRST, so no map is
   * missed. No global input/weather teardown — those are scene-scoped. renderer.destroy() frees
   * the terrain VBOs.
   */
  reset() {
    const ids = Object.keys(RpgMap._parked);
    for (let i = 0; i < ids.length; i++) {
      const b = RpgMap._parked[ids[i]];
      if (b.chunks) b.chunks.destroy();
      if (b.camera) b.camera.destroy();
      if (b.renderer) b.renderer.destroy();
      const level = World.get(ids[i]);
      if (level !== null) level.destroy();
    }
    RpgMap._parked = {};
  },

  /**
   * Walk-onto door: travel to the first portal the player overlaps. Runs after physics; on a hit,
   * go() swaps the store out so we return immediately.
   */
  checkPortals(scene) {
    const p = AABB.of(scene.level.entities, scene.playerId);
    // live query every doorway (Portal component) — no stored list to dangle as chunks stream
    const ids = scene.level.entities.query(Portal);
    let over = -1;
    for (let i = 0; i < ids.length; i++) {
      const z = AABB.of(scene.level.entities, ids[i]);
      if (p.x2 > z.x1 && p.x1 < z.x2 && p.y2 > z.y1 && p.y1 < z.y2) {
        over = ids[i];
        break;
      }
    }
    // clear of all portals → arm; standing on one while locked (just arrived) → don't re-trigger
    if (over === -1) {
      scene._portalLock = false;
      return;
    }
    if (scene._portalLock) return;
    const portal = scene.level.entities.get(Portal, over);
    Log.info(`portal → ${portal.toMap} (${portal.toEntry})`);
    RpgMap.go(scene, portal.toMap, portal.toEntry);
  },

  /**
   * Reach-quest zone from a chunked map's authored "reach" spawn. A region, not an entity, so
   * it's resolved once here rather than chunk-streamed.
   */
  _authoredReach(scene, data) {
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++)
      if (spawns[i].preset === "reach")
        return RpgSpawn.reachZone(scene.level.grid, spawns[i]);
    return undefined;
  },
};

// 2.5D adopted: camera pitch in degrees (0 = flat top-down, debug only — front-view art reads
// wrong flat). Assigned after the object literal — GMRT static-field-init quirk. Read by
// _buildRenderer (billboard vs flat entity pass) + _buildCamera (pitch + framing zoom).
// With the upright-sprite camera this is the frame-0 seed + the pitched-map GATE only —
// the LIVE pitch is _pitchCurve below (42° zoomed out → 58° zoomed in).
RpgMap.BB_PITCH = 42;
// Pitch-by-zoom curve (upright-sprite camera): shallow 42° at the zoom-out floor (~1.25 on
// a 1920 surface) easing to 58° at max zoom-in (2.625) — "look further = flatter".
// Thresholds are the spike values HALVED for the 32px-cell world (zoom seeds halved, same
// screen framing); the 42–58° outputs are angles, unchanged.
// Shared with the Debug Camera section's "Pitch by zoom" toggle.
RpgMap._pitchCurve = (z) => 42 + 16 * clamp((z - 1.25) / 1.375, 0, 1);
