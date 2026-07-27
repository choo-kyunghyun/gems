// Map-graph engine for the RPG level — portal travel, map pool, and persistence.
// Free functions over the level (composition; GMRT has no usable class inheritance).
/**
 * Visited worlds stay ALIVE in the World.levels registry (the map pool — the registry entry IS the
 * park bundle; no level-side pool), so a door trip never destroys/rebuilds. Only the SQUAD migrates:
 * every entity sharing the player's Squad id (player included) moves as a WHOLE entity through
 * World.levels.take/put — a portal forces a "wait" member back to "follow" first, so the squad
 * always travels together. There is no per-map player and no carried component subset; kicked/unhired
 * companions are plain map residents. Everything is persistent for the session: a map builds from
 * file exactly ONCE (first visit), then only freezes/thaws — no eviction, cold serialize, or
 * respawn-from-file reconcile. Disk saves are the follow-up seam.
 */
globalThis.RpgMap = {
  // fields _stash/_restore copy between level and a parked bundle (excludes level-shell +
  // per-activate transients reset by _activateReset on each map open). The per-layer tilemap
  // handles (<key>Layer/<key>Type/<key>Types) are NOT listed — _bundleKeys derives them from
  // RpgGrid.LAYERS, so a new LAYERS entry can't silently miss the bundle.
  // (playerId is NOT bundled — it's DERIVED: set on boot spawn/arrival and re-latched per frame
  // from the Playable query, so the bundle never carries a player handle)
  BUNDLE_KEYS: [
    "entities",
    "grid",
    "spawn",
    "entries",
    "mapId",
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
    "_clouds",
    "_weather",
    "_lighting",
  ],

  // Take the SQUAD through a portal: every member (player FIRST) leaves the current world as a
  // whole entity via World.levels.take, the map parks, and the members land in the target via
  // World.levels.put with entry-position overrides (_arriveSquad). "wait" is map-local — the
  // portal forces it back to "follow" (re-applying its carry bonus) so the squad always travels
  // together; only kicked/unhired companions stay behind. Called from create() + checkPortals.
  go(level, mapId, entryId) {
    let squad = null; // whole-entity snapshots, player first; null = boot (spawn a fresh player)
    // ── PHASE A: pull the squad out, then park the current map (its store stays alive) ──
    if (level.playerId !== undefined) {
      const sid = level.entities.get(Squad, level.playerId).id;
      const members = FollowerSystem.members(
        level.entities,
        sid,
        level.playerId,
      );
      squad = [];
      for (let i = 0; i < members.length; i++) {
        // no member opts out of travel: a "wait" companion snaps back to follow (+carry bonus)
        FollowerSystem.setState(
          level.entities,
          level.playerId,
          members[i],
          "follow",
        );
        squad.push(World.levels.take(level.mapId, members[i]));
      }
      Trader.onSuspend(level); // dehydrate any embodied wandering trader → its record (before park)
      level.entities.flush(); // commit the taken members' removals before parking
      RpgMap.suspend(level);
    }
    // ── PHASE B: enter the target — resume its parked bundle, else build from file ──
    // every resident map is parked at this point (Phase A parked the current one), so a
    // registry hit is always a full park bundle
    const bundle = World.levels.entryOf(mapId);
    if (bundle !== null) RpgMap.resume(level, bundle, entryId, squad);
    else RpgMap.build(level, mapId, entryId, squad);
    World.levels.setActive(level.mapId);
    Trader.onActivate(level); // embody any trader currently in this map
  },

  // Land the traveling squad at the entry: the player (squad[0]) first — level.playerId
  // re-latches to its new id — then companions staggered beside it. Whole-entity restore
  // (World.levels.put), so Appearance/Equipment/Stats arrive intact with no re-derive.
  _arriveSquad(level, squad, sp) {
    if (squad === null || squad.length === 0) return;
    level.playerId = World.levels.put(level.mapId, squad[0], {
      [Position]: { x: sp.x, y: sp.y, z: 0 },
      [Velocity]: { x: 0, y: 0, z: 0 },
    });
    for (let i = 1; i < squad.length; i++)
      World.levels.put(level.mapId, squad[i], {
        [Position]: { x: sp.x - 24 - i * 22, y: sp.y + 24, z: 0 },
        [Velocity]: { x: 0, y: 0, z: 0 },
      });
  },

  // Park the live map: its registry entry becomes the full bundle (was the minimal
  // { entities, grid } from build, or the previous park). Unassign (not destroy) the camera —
  // the parked map keeps it for resume; without the unassign its later destroy() would tear
  // down the live view. exitRegion so the next map re-detects its climate.
  suspend(level) {
    if (level.camera) level.camera.unassign();
    Weather.exitRegion();
    World.levels.register(level.mapId, RpgMap._stash(level));
  },

  // Resume a parked map: restore its fields, re-claim the viewport, and land the traveling squad
  // at the entry (the parked store has no player — the squad left through the portal).
  resume(level, bundle, entryId, squad) {
    RpgMap._restore(level, bundle);
    // the registry entry stays (the map is resident either way); the next suspend overwrites it
    MotionPlanner.setGrid(level.nav);
    if (level.camera) level.camera.assign(0);

    const sp = level.entries[entryId] ?? level.spawn;
    RpgMap._arriveSquad(level, squad, sp);
    // snap the follow camera to the entry so it doesn't pan from the parked position (the
    // TARGET needs no re-aim: the arrived player carries CameraFocus — take/put re-mints its
    // id, but CameraFollow resolves the marker by live query each update)
    if (level.camera) {
      level.camera.toX = sp.x;
      level.camera.toY = sp.y;
    }

    // chunked: seed the streaming rings around the entry so the first frame back has no ring gap
    if (level.chunks !== undefined) {
      level.chunks.update(sp.x, sp.y);
      if (level.terrain !== undefined) level.terrain.rebuild(level.chunks);
    }

    RpgMap._activateReset(level);
    RpgMap._registerCameraDebug(level);
    RpgMap._applyBgm(level); // crossfade to the resumed map's ambient (indoor ⇄ overworld)
    FloatingText.clear(); // drop the previous map's combat numbers (world coords are map-local)
    ParticleFx.clear();
  },

  // Map-appropriate ambient: interiors (meta.indoor) get the cozy loop, the open world the
  // tense one. Called on every map arrival (build + resume); Music.play cross-fades and treats
  // a same-track re-request as a no-op, so this is safe to call unconditionally.
  _applyBgm(level) {
    Music.play(level._indoor === true ? mus_ambient_cozy : mus_ambient_tense);
  },

  // Full bundle key list: BUNDLE_KEYS + the per-layer handles from RpgGrid.LAYERS
  // (<key>Layer/<key>Type, plus <key>Types for a materials-bearing layer). Rebuilt per call
  // (portal-rate, tiny).
  _bundleKeys() {
    const keys = RpgMap.BUNDLE_KEYS.slice();
    for (let i = 0; i < RpgGrid.LAYERS.length; i++) {
      const cfg = RpgGrid.LAYERS[i];
      keys.push(cfg.key + "Layer");
      keys.push(cfg.key + "Type");
      if (cfg.materials !== undefined) keys.push(cfg.key + "Types");
    }
    return keys;
  },

  // Pointer-copy per-map fields level↔bundle. Index loop (no Map/Set iteration — GMRT).
  _stash(level) {
    const b = {};
    const keys = RpgMap._bundleKeys();
    for (let i = 0; i < keys.length; i++) b[keys[i]] = level[keys[i]];
    return b;
  },
  _restore(level, b) {
    const keys = RpgMap._bundleKeys();
    for (let i = 0; i < keys.length; i++) level[keys[i]] = b[keys[i]];
  },

  // Per-activate transient reset (build + resume). Kept off the bundle so a resume can't restore
  // a stale transient.
  _activateReset(level) {
    level._hpTrack = {};
    level._buildActive = false;
    BuildMode.active = false;
    level.nearNpc = false;
    level._climateZone = 0;
    level._npcId = -1;
    // nav-rebuild gate (sceneRpg.step): force a rebuild on the first frame of a (re)activated map
    level._navGx = undefined;
    level._navGy = undefined;
    level._navTick = 0;
    // portal re-entry guard: an arrival entry may overlap a portal, so lock travel until the player
    // has stepped clear of every portal once (checkPortals arms it). Prevents door ping-pong.
    level._portalLock = true;
    if (level.invOpen) level._invDirty = true;
    // Re-point CombatAI's shared store/grid statics. A resume keeps actors without re-attaching,
    // so bind explicitly — else enemies step against the previously-built store and fault.
    CombatAI.bind(level.entities, level.grid);
    // Re-point the terrain movement pricing (mover speed × 1/cost) at the active map, same reason.
    PathFollow.bind(RpgMap._terrainCost(level));
  },

  // Per-map terrain movement-cost provider ((wx, wy) → cost ≥ 1, Infinity = impassable) feeding
  // NavGrid's route weights and PathFollow's speed pricing. Chunked maps price the biome via the
  // manager's STORE-backed costAt (stored terrain — the world is pregenerated, so this is a
  // lookup, not a noise resample); plain maps (interiors) price no terrain → null (cost 1).
  _terrainCost(level) {
    if (!level._chunked || level.chunks === undefined) return null;
    const chunks = level.chunks;
    const cw = level.grid.cellWidth;
    const ch = level.grid.cellHeight;
    return (wx, wy) => chunks.costAt(Math.floor(wx / cw), Math.floor(wy / ch));
  },

  // World-coord entry points by name, for repositioning the player on a resume (no file reload).
  // Mirrors _resolveSpawn's sources: meta.entries, plus legacy meta.playerSpawn as "default".
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
  build(level, mapId, entryId, squad = null) {
    const loaded = RpgMap._loadData(mapId, entryId);
    const data = loaded.data;
    mapId = loaded.mapId;
    entryId = loaded.entryId;
    level.mapId = mapId;
    // On a LOAD, SaveGame stashes each saved map's state; consume this map's here (null for a new
    // game / an unvisited map). Its chunk cache feeds _spawnWorld; its builds apply after scaffolding.
    const mapState = SaveGame.takePendingMap(mapId);
    // chunked: streams terrain + entities around the player (overworld); plain builds up front
    level._chunked = data.meta.chunked === true;
    // indoor maps (meta.indoor): no sky passes, and the cozy interior BGM below
    level._indoor = data.meta.indoor === true;
    Log.info(
      `RPG map: ${mapId} (entry ${entryId})${level._chunked ? " [chunked]" : ""}`,
    );

    RpgMap._buildWorld(level, data, entryId, squad); // entity store + LevelGrid (+ player on boot) + zones
    // register BEFORE the squad lands — World.levels.put targets the registry. Minimal entry;
    // suspend later overwrites it with the full park bundle.
    World.levels.register(level.mapId, {
      entities: level.entities,
      grid: level.grid,
    });
    RpgMap._arriveSquad(level, squad, level.spawn); // level.spawn is already entry-resolved
    // build-mode tracking, fresh per first visit (parks with the bundle thereafter). _builtEnts
    // persists on the level across map swaps (BuildMode.build runs once) — reset explicitly.
    level._built = {};
    level._builtEnts = {};
    // entities (streamed or up-front). A loaded map threads its deep chunk cache in here so touched
    // chunks materialize their saved state instead of fresh spawns.
    RpgMap._spawnWorld(level, data, {
      chunkCache: mapState !== null ? mapState.chunkCache : undefined,
    });
    RpgMap._activateReset(level); // per-activate transients (hp track, build mode, climate, inv)
    RpgMap._buildPipeline(level); // nav window + physics pipeline
    RpgMap._buildRenderer(level, data); // render pass stack
    RpgMap._buildCamera(level, data); // follow camera + view culling + debug
    RpgMap._applyBgm(level); // map-appropriate ambient (re-requesting the same track is a no-op)

    FloatingText.clear(); // drop combat numbers + particles from the previous map (map-local coords)
    ParticleFx.clear();

    // a loaded map's builds + claimed zone (after scaffolding, so the tile layers/colliders exist)
    if (mapState !== null) SaveGame.applyMapState(level, mapState);
  },

  // Load a map file, falling back to the start map if it's bad. Returns resolved ids + parsed data.
  _loadData(mapId, entryId) {
    const file = RpgGrid.mapFile(mapId);
    let data = LevelSerializer.load(file, { genre: "topdown" });
    if (data === null) {
      Log.error(
        `map "${mapId}" (${file}) failed — falling back to ${RpgGrid.START}`,
      );
      mapId = RpgGrid.START;
      entryId = "default";
      data = LevelSerializer.load(RpgGrid.mapFile(mapId), {
        genre: "topdown",
      });
    }
    return { data, mapId, entryId };
  },

  // Entity store + LevelGrid + the buildable/climate zone channels. The player spawns here ONLY on boot
  // (squad === null) — portal arrivals transfer the whole player entity in via _arriveSquad,
  // which re-latches level.playerId. Chunked gets a bigger entity cap (a window of chunks' worth
  // of entities + colliders + drops) and an empty resident grid (player builds only).
  _buildWorld(level, data, entryId, squad) {
    level.entities = new Entity(level._chunked ? 1024 : 256);
    const built = level._chunked
      ? RpgGrid.buildChunked(level.entities, data, entryId)
      : RpgGrid.build(level.entities, data, entryId);
    level.grid = built.grid;
    level.spawn = built.spawn; // for player respawn on death
    level.entries = RpgMap._entryTable(level.grid, data); // named entries → world coords (resume)
    // tilemap handles (render passes + build mode) — one Layer/Type pair per LAYERS entry,
    // plus <key>Types for a materials-bearing layer (wall). Bundled via _bundleKeys.
    for (let i = 0; i < RpgGrid.LAYERS.length; i++) {
      const key = RpgGrid.LAYERS[i].key;
      level[key + "Layer"] = built[key + "Layer"];
      level[key + "Type"] = built[key + "Type"];
      if (built[key + "Types"] !== undefined)
        level[key + "Types"] = built[key + "Types"];
    }
    level.colliders = built.colliders;
    // boot only: bind the keymap + spawn the player (mints the Squad id). A portal arrival
    // instead lands the transferred player in _arriveSquad right after this.
    if (squad === null) {
      PlayerSystem.bindKeys();
      level.playerId = PlayerSystem.spawn(level.entities, built.spawn);
    }

    // settlement channel (one per map) — Survey Posts found player-owned Settlements into it, build
    // mode gates placement to owned land, RenderZone visualizes every settlement's territory. Created
    // empty up front so the persistence import + RenderZone have a target before anything is founded.
    Settlement.channel(level.grid);
    // Authored non-player settlements (optional meta.settlements, mirroring meta.climate below):
    // faction hubs / raider camps. The overworld authors one — the colony "hub", whose NPCs and
    // stockpile chest are its Residents — so the player's own founded settlement and an authored
    // faction's coexist on one map, which is the case the sid-keyed model exists to support.
    const settlements = data.meta.settlements;
    if (settlements !== undefined)
      for (let i = 0; i < settlements.length; i++) {
        const s = settlements[i];
        const r = s.rect;
        Settlement.found(level.grid, r[0], r[1], r[2], r[3], {
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
      const cmap = level.grid.addZoneMap("climate");
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

  // Entities. Chunked STREAMS them via ChunkManager; plain spawns all up front. Either way the
  // level reads NPC/portal/enemy/companion handles LIVE by component query — stored id lists
  // would dangle as chunks stream in/out.
  _spawnWorld(level, data, opts = {}) {
    if (level._chunked) {
      // the pass-composed generator: authored hub overlay + procedural wilderness in one
      level.generator = OverworldGen.create({
        seed: data.meta.seed ?? 1337,
        chunkCols: data.meta.chunkCols ?? 16,
        chunkRows: data.meta.chunkRows ?? 16,
        authored: data, // hand-built hub overlaid onto its chunks (AuthoredStamp)
      });
      // Finite world: a worldCols × worldRows rectangle (matches the resident grid). Streaming
      // clamps to it + a wall border rings it, so the player/enemies can't leave.
      const wc = data.meta.worldCols ?? data.cols ?? 128;
      const wr = data.meta.worldRows ?? data.rows ?? 128;
      // The freeze (LOAD) tier: simRadius 1 keeps only ~9 chunks fully simulated. Historically a
      // wider window was unaffordable — simRadius=loadRadius (25 SIM chunks)
      // tanked the sim to ~260-334ms/step (3fps), dominated by SolidSystem's move-and-collide. That
      // blocker is now lifted: SolidSystem is spatially indexed (its own static grid — see
      // SolidSystem._gridRebuild). simRadius:1 stays the shipped default pending a simRadius:2
      // re-measure with the grid in place.
      level.chunks = new ChunkManager(
        level.entities,
        level.grid,
        level.generator,
        {
          chunkCols: data.meta.chunkCols ?? 16,
          chunkRows: data.meta.chunkRows ?? 16,
          simRadius: 1,
          loadRadius: 2,
          worldCols: wc,
          worldRows: wr,
          // descriptor adapter — streamed spawns build through the same path as file spawns
          spawn: (entities, grid, desc) =>
            RpgSpawn.spawnEntity(entities, grid, desc),
        },
      );
      RpgGrid.buildWorldBorder(level.entities, level.grid, wc, wr); // edge walls (always present)
      // Generate the ENTIRE finite world into the manager's store now (one-time, behind the
      // level fade) — mid-game streaming is pure load/unload; generate() never runs in play.
      const t0 = current_time;
      const pregen = level.chunks.pregenerate();
      Log.info(
        `RpgMap: pregenerated ${pregen} chunks in ${current_time - t0}ms`,
      );
      // deep-save restore: overwrite touched chunks with their saved entity state BEFORE the first
      // stream, so they materialize saved snapshots (dead mobs stay dead) instead of fresh spawns.
      if (opts.chunkCache !== undefined)
        level.chunks.importCache(opts.chunkCache);
      const sp = level.entities.get(Position, level.playerId);
      level.chunks.update(sp.x, sp.y); // populate the rings around the spawn
      level.reachZone = RpgMap._authoredReach(level, data); // origin-area quest zone (not streamed)
    } else {
      const ents = RpgSpawn.spawn(level.entities, level.grid, data);
      level.reachZone = ents.reach; // undefined when the map has no reach marker
    }
    level.reachDone = level.reachZone === undefined; // nothing to reach on this map
    level._npcId = -1; // resolved live each frame by _updateNpc (nearest "npc" in range)
  },

  // Pathfinding nav window + physics pipeline. NavGrid.size() is constant, so MotionPlanner.setGrid
  // runs once here per map (sceneRpg.step rebuilds occupancy around the player each frame).
  _buildPipeline(level) {
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
    level.entities.broadphase = new Broadphase(
      level.grid.cols * level.grid.cellWidth,
      level.grid.rows * level.grid.cellHeight,
      96,
    );

    level.nav = new NavGrid(
      32,
      32,
      level.grid.cellWidth,
      level.grid.cellHeight,
      RpgMap._terrainCost(level), // weight routes by terrain (wade only when it beats going around)
    );
    MotionPlanner.setGrid(level.nav);

    // brains decide velocity (player input, then AI) → resolve paths → collide → push crowders
    // apart → triggers (pickups) → projectiles → expire.
    level.physics = new Pipeline()
      .add(PlayerSystem) // the player brain: input → Velocity/fire (drives Playable entities)
      .add(StateSystem) // drives the CombatAI Idle/Chase/Attack schemas (enemies AND turrets)
      .add(PathfindingSystem) // enemy PathRequest → PathResponse over level.nav
      .add(SolidSystem)
      .add(SeparationSystem) // unstack dynamic bodies (RTS-style crowding), after SolidSystem
      .add(TriggerSystem)
      .add(ProjectileSystem)
      .add(LifetimeSystem);
  },

  // Assemble the renderer pass stack (ground → tiles → zones → shadows → entities → debug →
  // weather → lighting). Tiles are
  // still placeholder: the resident layers render as a sprite-free debug fill (RenderDebugTileMap)
  // rather than the per-layer RenderTileMap loop (restore that loop when tile art lands). Chunked
  // terrain uses its real dual-grid tilesets (TerrainStream).
  _buildRenderer(level, data) {
    const pitch = RpgMap.BB_PITCH;
    level.renderer = new Renderer();
    // Chunk-streamed terrain UNDER everything, so RenderChunks runs ground:false (its checker is
    // replaced by the terrain) and only draws walls + frozen-entity snapshots.
    if (level._chunked) {
      level.terrain = new TerrainStream(level.chunks);
      level.renderer.insert(level.terrain); // one set of per-chunk VBOs, under everything
      level.terrain.rebuild(level.chunks, Infinity); // initial: build every loaded chunk
      level.renderer.insert(
        new RenderChunks(level.chunks, {
          font: I18n.font("default"),
          ground: false,
          // pitched maps draw the streamed walls as lit boxes (the RenderWalls insert
          // below, over chunks.wallLayer()) — the flat rects stay only for the flat fallback
          walls: !(pitch > 0),
        }),
      );
    }
    // Resident tile layers (terrain/floor/fence) as real tilemaps again — bottom→top per
    // RpgGrid.LAYERS; the wall layer joins below as the lit RenderWalls pass on pitched maps
    // (flat fallback keeps its "corner" RenderTileMap). VBO-cached + keyed by layer so a
    // BuildMode edit markDirty's the matching pass. Chunked maps hold these layers EMPTY
    // (streamed terrain is TerrainStream's) — an empty layer emits no quads, so free there.
    level._tilePasses = {};
    for (let i = 0; i < RpgGrid.LAYERS.length; i++) {
      const cfg = RpgGrid.LAYERS[i];
      if (cfg.key === "wall" && pitch > 0) continue; // RenderWalls (lit boxes) below
      const spr = asset_get_index(cfg.sprite);
      if (!sprite_exists(spr)) {
        Log.warn(`tile sprite missing: ${cfg.sprite}`); // GMRT: validate via sprite_exists, not >=0
        continue;
      }
      const pass = new RenderTileMap(
        level[cfg.key + "Layer"],
        level.grid,
        spr,
        {
          autotile: cfg.type,
          color: Color.parse(cfg.color),
        },
      );
      level._tilePasses[cfg.key] = pass;
      level.renderer.insert(pass);
    }
    // the sprite-free cost fill stays as a debug overlay — Debug → Render → Tiles
    level._tilePass = new RenderDebugTileMap(level.grid, {
      cost: true,
      tiles: false,
      alpha: 0.5,
    });
    level._tilePass.enabled = false;
    level.renderer.insert(level._tilePass);
    level._gridPass = new RenderGrid(level.grid); // cell boundary lines
    level._gridPass.enabled = false; // off in normal play; toggle via Debug → Render → Grid
    level.renderer.insert(level._gridPass);
    level.renderer.insert(new RenderZone(level.grid, "settlement"));
    level.renderer.insert(
      new RenderZoneLabel(level.grid, "settlement", {
        font: I18n.font("default"),
      }),
    );
    // Foot shadows UNDER the entities (runtime ellipse per body, not baked into the sprites).
    level.renderer.insert(new RenderEntityShadow());
    // Deep-furniture meshes (VOLUME category of the projection contract — see docs/ROADMAP.md):
    // real depth-writing geometry, so it shares the billboard depth pool. Pitched maps only —
    // a flat map has no depth-writing entity pass to sort against. Sun injected like
    // RenderLighting's ambient (the pass is Core, WorldClock is Demo); camera assigned in
    // _buildCamera (the nearest-point-light selection center).
    if (pitch > 0) {
      level._meshPass = new RenderMesh({ sun: () => WorldClock.sunDir() });
      level.renderer.insert(level._meshPass);
      // GROUND joins the one lit shader: the streamed terrain + every resident tile pass
      // read this pass's light gather (up normal — flat ground). Assigned post-construction
      // because the ground passes are built above, before the mesh pass exists; the wall
      // passes below take it at construction. Flat maps (pitch 0) stay unlit.
      if (level.terrain !== undefined) level.terrain.lights = level._meshPass;
      const tileKeys = Object.keys(level._tilePasses);
      for (let i = 0; i < tileKeys.length; i++)
        level._tilePasses[tileKeys[i]].lights = level._meshPass;
      // WALLS category (art projection contract): the resident wall layer as lit boxes
      // (top + exposed south faces) in the same depth pool, sharing the mesh pass's
      // sun + culled point lights. Keyed into _tilePasses so BuildMode's edit
      // markDirty reaches it (the flat "corner" autotile config stays for the editor).
      // PER-CELL MATERIALS from the wall cfg (near-white face texture × tint per material,
      // bucketed by TileType id — see RenderWalls); materials[0] (brick) doubles as the
      // default bucket for file/streamed walls.
      const wallCfg = RpgGrid.layerCfg("wall");
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
      level._tilePasses.wall = new RenderWalls(level.grid, level.wallLayer, {
        color: wallMats[0].color,
        sprite: wallMats[0].sprite,
        frame: 0,
        lights: level._meshPass,
        materials: wallMats,
      });
      level.renderer.insert(level._tilePasses.wall);
      // The chunked overworld's AUTHORED/streamed walls (hub building, prefab ruins/camps)
      // join the same lit-box pass over the manager's whole-store occupancy view — walls are
      // static after pregeneration, so it's one lazy VBO build with no streaming coupling
      // (RenderChunks' flat rects are disabled above in its favor; never edited, so it's not
      // keyed into _tilePasses). Same brick texture/tint as the resident walls.
      if (level._chunked)
        level.renderer.insert(
          new RenderWalls(level.grid, level.chunks.wallLayer(), {
            color: wallMats[0].color, // occupancy view has no TileTypes — all default brick
            sprite: wallMats[0].sprite,
            frame: 0,
            lights: level._meshPass,
          }),
        );
    }
    // Entities via the production sprite pass (per-entity data — name/facing/animator state —
    // is inspected by clicking the entity in the Debug overlay, not by world-space label passes).
    // Pitched maps hand the billboard pass the mesh pass as its light source (sprite sun
    // response: sprites dim/warm with the sun + catch torchlight like the mesh faces).
    const entityPass =
      pitch > 0
        ? new RenderBillboard({ lights: level._meshPass })
        : new RenderEntity();
    level.renderer.insert(entityPass);
    const bbox = new RenderDebugEntity(); // lime bbox outlines, off until toggled
    bbox.enabled = false;
    level.renderer.insert(bbox);
    const paths = new RenderDebugPath(level.grid); // enemy A* paths, off until toggled
    paths.enabled = false;
    level.renderer.insert(paths);
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
    level.renderer.insert(ranges);
    // Cloud shadows under the weather tint, weather (tint + rain/snow) just under the day/night
    // tint, so night darkens the rain. Skipped indoors (meta.indoor) — no open sky inside a cave.
    level._clouds = undefined;
    level._weather = undefined;
    if (!data.meta.indoor) {
      level._clouds = new RenderCloudShadow();
      level.renderer.insert(level._clouds);
      level._weather = new RenderWeather();
      level.renderer.insert(level._weather);
    }
    // Lighting LAST — a per-frame light map composited over everything. Day/night is its ambient
    // term ("lighting with no lights"); Light entities + a night vignette layer on top.
    level._lighting = new RenderLighting({ ambient: () => WorldClock.tint() });
    level.renderer.insert(level._lighting);
  },

  // Follow camera on the new player + view culling + the live Debug camera section.
  // 32px-cell world: base zoom 1.75 for the pitched 2.5D framing (flat fallback 1) — half the
  // old 16px-cell seeds, so the on-screen framing is unchanged (view shows 2× the world px).
  _buildCamera(level, data) {
    const pitch = RpgMap.BB_PITCH;
    const baseZoom = pitch > 0 ? 1.75 : 1;
    // Cap zoom-OUT to the renderable world (a chunked map only streams a window; past it shows as
    // dark void). viewCap = max view WIDTH (world px); camera derives live minZoom from it + the
    // current surface each frame. Horizontal is the binding axis on a landscape surface.
    const viewCap = level._chunked
      ? // Worst case is a WORLD CORNER (hub spawn): the off-world side streams nothing, so only
        // (loadRadius + 1) chunks load. View any wider → dark void.
        (2 + 1) * (data.meta.chunkCols ?? 16) * level.grid.cellWidth
      : level.grid.cols * level.grid.cellWidth;
    level.camera = CameraFollow.create2d({
      entities: level.entities,
      followTarget: level.playerId, // fallback seed — the live CameraFocus query wins (RpgPlayer)
      followLerp: 0.15,
      pitch: pitch, // frame-0 seed; the pitchCurve below overwrites it every update
      // pitch-by-zoom (upright-sprite camera, ROADMAP art rework) — see RpgMap._pitchCurve
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
        x2: level.grid.cols * level.grid.cellWidth,
        y2: level.grid.rows * level.grid.cellHeight,
      },
    });
    level.camera.assign(0);
    // Cull the grid pass to the camera view (essential for the chunked map's large home grid).
    level._gridPass.camera = level.camera;
    level._tilePass.camera = level.camera; // view-cull the placeholder tile fill
    if (level._clouds !== undefined) level._clouds.camera = level.camera;
    if (level._weather !== undefined) level._weather.camera = level.camera;
    level._lighting.camera = level.camera;
    // (sprites are UPRIGHT constants now — the entity pass no longer tracks camera pitch)
    if (level._meshPass !== undefined) level._meshPass.camera = level.camera;
    RpgMap._registerCameraDebug(level); // Debug/ImGui live camera controls (pitch/zoom)
  },

  // Register the Debug "Camera" section bound to the LIVE level camera (pitch + zoom) for runtime
  // render inspection. Re-added on each build/resume (Debug.add replaces by name) so the sliders
  // drive the ACTIVE map's camera; removed on level destroy. RPG-owned (pitch is a Demo concern).
  _registerCameraDebug(level) {
    const cam = level.camera;
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

  // Reclaim ONE map bundle's owned resources. No global input/weather teardown — those are
  // level-scoped. Used by level teardown. renderer.destroy() frees the terrain VBOs.
  _free(b) {
    if (b.chunks) b.chunks.destroy();
    if (b.camera) b.camera.destroy();
    if (b.renderer) b.renderer.destroy();
    if (b.entities) b.entities.destroy();
    if (b.grid) b.grid.destroy();
  },

  // Walk-onto door: travel to the first portal the player overlaps. Runs after physics; on a hit,
  // go() swaps the store out so we return immediately.
  checkPortals(level) {
    const p = AABB.of(level.entities, level.playerId);
    // live query every doorway (Portal component) — no stored list to dangle as chunks stream
    const ids = level.entities.query(Portal);
    let over = -1;
    for (let i = 0; i < ids.length; i++) {
      const z = AABB.of(level.entities, ids[i]);
      if (p.x2 > z.x1 && p.x1 < z.x2 && p.y2 > z.y1 && p.y1 < z.y2) {
        over = ids[i];
        break;
      }
    }
    // clear of all portals → arm; standing on one while locked (just arrived) → don't re-trigger
    if (over === -1) {
      level._portalLock = false;
      return;
    }
    if (level._portalLock) return;
    const portal = level.entities.get(Portal, over);
    Log.info(`portal → ${portal.toMap} (${portal.toEntry})`);
    RpgMap.go(level, portal.toMap, portal.toEntry);
  },

  // Reach-quest zone from a chunked map's authored "reach" spawn. A region, not an entity, so
  // it's resolved once here rather than chunk-streamed.
  _authoredReach(level, data) {
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++)
      if (spawns[i].preset === "reach")
        return RpgSpawn.reachZone(level.grid, spawns[i]);
    return undefined;
  },
};

// 2.5D adopted: camera pitch in degrees (0 = flat top-down, debug only — front-view art reads
// wrong flat). Assigned after the object literal — GMRT static-field-init quirk. Read by
// _buildRenderer (billboard vs flat entity pass) + _buildCamera (pitch + framing zoom).
// With the upright-sprite camera this is the frame-0 seed + the pitched-map GATE only —
// the LIVE pitch is _pitchCurve below (42° zoomed out → 58° zoomed in).
RpgMap.BB_PITCH = 42;
// Pitch-by-zoom curve (upright-sprite camera, ROADMAP art rework): shallow 42° at the
// zoom-out floor (~1.25 on a 1920 surface) easing to 58° at max zoom-in (2.625) — "look
// further = flatter". Thresholds are the spike values HALVED for the 32px-cell
// world (zoom seeds halved, same screen framing); the 42–58° outputs are angles, unchanged.
// Shared with the Debug Camera section's "Pitch by zoom" toggle.
RpgMap._pitchCurve = (z) => 42 + 16 * clamp((z - 1.25) / 1.375, 0, 1);
