// Map-graph engine for the RPG scene — portal travel, map pool, and persistence.
// Free functions over the scene (composition; GMRT has no usable class inheritance).
//
// Visited worlds are kept ALIVE in the World.levels registry (the map pool — the registry
// entry IS the park bundle; there is no scene-side pool) — no destroy/rebuild on a door
// trip. Only the SQUAD migrates: every entity sharing the player's Squad id (player
// included) moves as a WHOLE entity through World.levels.take/put — a portal forces a "wait"
// member back to "follow" first, so the squad always travels together. There is no per-map
// player and no carried component subset; kicked/unhired companions are plain map residents.
// EVERYTHING is persistent for the session: a map builds from file exactly ONCE (first visit),
// then only freezes/thaws as-is — there is no eviction, no cold serialize, and no respawn-from-
// file reconcile (the old Persistent/gone ledger). Disk saves are the follow-up seam.
globalThis.RpgMap = {
  // fields _stash/_restore copy between scene and a parked bundle (excludes scene-shell +
  // per-activate transients reset by _activateReset on each map open)
  // (playerId is NOT bundled — it's DERIVED: set on boot spawn/arrival and re-latched per frame
  // from the Playable query, so the bundle never carries a player handle)
  BUNDLE_KEYS: [
    "world",
    "level",
    "spawn",
    "entries",
    "mapId",
    "_chunked",
    "terrainLayer",
    "floorLayer",
    "wallLayer",
    "fenceLayer",
    "terrainType",
    "floorType",
    "wallType",
    "fenceType",
    "colliders",
    "buildZoneId",
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
  go(scene, mapId, entryId) {
    let squad = null; // whole-entity snapshots, player first; null = boot (spawn a fresh player)
    // ── PHASE A: pull the squad out, then park the current map (its World stays alive) ──
    if (scene.playerId !== undefined) {
      const sid = scene.world.get(Squad, scene.playerId).id;
      const members = FollowerSystem.members(scene.world, sid, scene.playerId);
      squad = [];
      for (let i = 0; i < members.length; i++) {
        // no member opts out of travel: a "wait" companion snaps back to follow (+carry bonus)
        FollowerSystem.setState(
          scene.world,
          scene.playerId,
          members[i],
          "follow",
        );
        squad.push(World.levels.take(scene.mapId, members[i]));
      }
      Trader.onSuspend(scene); // dehydrate any embodied wandering trader → its record (before park)
      scene.world.flush(); // commit the taken members' removals before parking
      RpgMap.suspend(scene);
    }
    // ── PHASE B: enter the target — resume its parked world, else build from file ──
    // every resident map is parked at this point (Phase A parked the current one), so a
    // registry hit is always a full park bundle
    const bundle = World.levels.entryOf(mapId);
    if (bundle !== null) RpgMap.resume(scene, bundle, entryId, squad);
    else RpgMap.build(scene, mapId, entryId, squad);
    World.levels.setActive(scene.mapId);
    Trader.onActivate(scene); // embody any trader currently in this map
  },

  // Land the traveling squad at the entry: the player (squad[0]) first — scene.playerId
  // re-latches to its new id — then companions staggered beside it. Whole-entity restore
  // (World.levels.put), so Appearance/Equipment/Stats arrive intact with no re-derive.
  _arriveSquad(scene, squad, sp) {
    if (squad === null || squad.length === 0) return;
    scene.playerId = World.levels.put(scene.mapId, squad[0], {
      [Position]: { x: sp.x, y: sp.y, z: 0 },
      [Velocity]: { x: 0, y: 0, z: 0 },
    });
    for (let i = 1; i < squad.length; i++)
      World.levels.put(scene.mapId, squad[i], {
        [Position]: { x: sp.x - 12 - i * 11, y: sp.y + 12, z: 0 },
        [Velocity]: { x: 0, y: 0, z: 0 },
      });
  },

  // Park the live map: its registry entry becomes the full bundle (was the minimal
  // { world, level } from build, or the previous park). Unassign (not destroy) the camera —
  // the parked map keeps it for resume; without the unassign its later destroy() would tear
  // down the live view. exitRegion so the next map re-detects its climate.
  suspend(scene) {
    if (scene.camera) scene.camera.unassign();
    Weather.exitRegion();
    World.levels.register(scene.mapId, RpgMap._stash(scene));
  },

  // Resume a parked map: restore its fields, re-claim the viewport, and land the traveling squad
  // at the entry (the parked world has no player — the squad left through the portal).
  resume(scene, bundle, entryId, squad) {
    RpgMap._restore(scene, bundle);
    // the registry entry stays (the map is resident either way); the next suspend overwrites it
    MotionPlanner.setGrid(scene.nav);
    if (scene.camera) scene.camera.assign(0);

    const sp = scene.entries[entryId] ?? scene.spawn;
    RpgMap._arriveSquad(scene, squad, sp);
    // snap the follow camera to the entry so it doesn't pan from the parked position
    if (scene.camera) {
      scene.camera.toX = sp.x;
      scene.camera.toY = sp.y;
    }

    // chunked: seed the streaming rings around the entry so the first frame back has no ring gap
    if (scene.chunks !== undefined) {
      scene.chunks.update(sp.x, sp.y);
      if (scene.terrain !== undefined) scene.terrain.rebuild(scene.chunks);
    }

    RpgMap._activateReset(scene);
    RpgMap._registerCameraDebug(scene);
    FloatingText.clear(); // drop the previous map's combat numbers (world coords are map-local)
    ParticleFx.clear();
  },

  // Pointer-copy per-map fields scene↔bundle. Index loop (no Map/Set iteration — GMRT).
  _stash(scene) {
    const b = {};
    const keys = RpgMap.BUNDLE_KEYS;
    for (let i = 0; i < keys.length; i++) b[keys[i]] = scene[keys[i]];
    return b;
  },
  _restore(scene, b) {
    const keys = RpgMap.BUNDLE_KEYS;
    for (let i = 0; i < keys.length; i++) scene[keys[i]] = b[keys[i]];
  },

  // Per-activate transient reset (build + resume). Kept off the bundle so a resume can't restore
  // a stale transient.
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
    // Re-point CombatAI's shared world/level statics. A resume keeps actors without re-attaching,
    // so bind explicitly — else enemies step against the previously-built world and fault.
    CombatAI.bind(scene.world, scene.level);
    // Re-point the terrain movement pricing (mover speed × 1/cost) at the active map, same reason.
    PathFollow.bind(RpgMap._terrainCost(scene));
  },

  // Per-map terrain movement-cost provider ((wx, wy) → cost ≥ 1, Infinity = impassable) feeding
  // NavGrid's route weights and PathFollow's speed pricing. Chunked maps price the biome via the
  // manager's STORE-backed costAt (stored terrain — the world is pregenerated, so this is a
  // lookup, not a noise resample); plain maps (interiors) price no terrain → null (cost 1).
  _terrainCost(scene) {
    if (!scene._chunked || scene.chunks === undefined) return null;
    const chunks = scene.chunks;
    const cw = scene.level.cellWidth;
    const ch = scene.level.cellHeight;
    return (wx, wy) => chunks.costAt(Math.floor(wx / cw), Math.floor(wy / ch));
  },

  // World-coord entry points by name, for repositioning the player on a resume (no file reload).
  // Mirrors _resolveSpawn's sources: meta.entries, plus legacy meta.playerSpawn as "default".
  _entryTable(level, data) {
    const out = {};
    const e = data.meta.entries;
    if (e !== undefined)
      for (const k in e) out[k] = level.gridToWorld(e[k].gx, e[k].gy);
    if (data.meta.playerSpawn !== undefined && out.default === undefined)
      out.default = level.gridToWorld(
        data.meta.playerSpawn.gx,
        data.meta.playerSpawn.gy,
      );
    return out;
  },

  // Build a map fresh from file — first visit ONLY (a revisit always resumes its live parked
  // world; nothing is ever rebuilt). `squad` is handed in by go() (null on boot → spawn a fresh
  // player). Orchestrates the helpers below.
  build(scene, mapId, entryId, squad = null) {
    const loaded = RpgMap._loadData(mapId, entryId);
    const data = loaded.data;
    mapId = loaded.mapId;
    entryId = loaded.entryId;
    scene.mapId = mapId;
    // chunked: streams terrain + entities around the player (overworld); plain builds up front
    scene._chunked = data.meta.chunked === true;
    Log.info(
      `RPG map: ${mapId} (entry ${entryId})${scene._chunked ? " [chunked]" : ""}`,
    );

    RpgMap._buildWorld(scene, data, entryId, squad); // World + Level (+ player on boot) + zones
    // register BEFORE the squad lands — World.levels.put targets the registry. Minimal entry;
    // suspend later overwrites it with the full park bundle.
    World.levels.register(scene.mapId, {
      world: scene.world,
      level: scene.level,
    });
    RpgMap._arriveSquad(scene, squad, scene.spawn); // scene.spawn is already entry-resolved
    // build-mode tracking, fresh per first visit (parks with the bundle thereafter). _builtEnts
    // persists on the scene across map swaps (BuildMode.build runs once) — reset explicitly.
    scene._built = {};
    scene._builtEnts = {};
    RpgMap._spawnWorld(scene, data); // entities (streamed or up-front)
    RpgMap._activateReset(scene); // per-activate transients (hp track, build mode, climate, inv)
    RpgMap._buildPipeline(scene); // nav window + physics pipeline
    RpgMap._buildRenderer(scene, data); // render pass stack
    RpgMap._buildCamera(scene, data); // follow camera + view culling + debug

    FloatingText.clear(); // drop combat numbers + particles from the previous map (map-local coords)
    ParticleFx.clear();
  },

  // Load a map file, falling back to the start map if it's bad. Returns resolved ids + parsed data.
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

  // World + Level + the buildable/climate zone channels. The player spawns here ONLY on boot
  // (squad === null) — portal arrivals transfer the whole player entity in via _arriveSquad,
  // which re-latches scene.playerId. Chunked gets a bigger entity cap (a window of chunks' worth
  // of entities + colliders + drops) and an empty resident grid (player builds only).
  _buildWorld(scene, data, entryId, squad) {
    scene.world = new ECS(scene._chunked ? 1024 : 256);
    const built = scene._chunked
      ? RpgLevel.buildChunked(scene.world, data, entryId)
      : RpgLevel.build(scene.world, data, entryId);
    scene.level = built.level;
    scene.spawn = built.spawn; // for player respawn on death
    scene.entries = RpgMap._entryTable(scene.level, data); // named entries → world coords (resume)
    scene.terrainLayer = built.terrainLayer; // tilemap handles (render passes + build mode)
    scene.floorLayer = built.floorLayer;
    scene.wallLayer = built.wallLayer;
    scene.fenceLayer = built.fenceLayer;
    scene.terrainType = built.terrainType;
    scene.floorType = built.floorType;
    scene.wallType = built.wallType;
    scene.fenceType = built.fenceType;
    scene.colliders = built.colliders;
    // boot only: bind the keymap + spawn the player (mints the Squad id). A portal arrival
    // instead lands the transferred player in _arriveSquad right after this.
    if (squad === null) {
      PlayerSystem.bindKeys();
      scene.playerId = PlayerSystem.spawn(scene.world, built.spawn);
    }

    // buildable zone channel (one per map) — the Claim Post paints into it; build mode gates
    // placement to it; RenderZone visualizes it
    const bmap = scene.level.addZoneMap("buildable");
    scene.buildZoneId = bmap.define({
      name: I18n.text("BUILD_ZONE"),
      tags: ["buildable"],
      data: { color: "#55aa55" },
    }).id;

    // Climate zones (optional, from meta.climate): regions that override the open sky (forced
    // Weather condition + Kelvin temp offset) while the player is inside. Built before the
    // persistence import so it round-trips like the buildable zone.
    const climate = data.meta.climate;
    if (climate !== undefined) {
      const cmap = scene.level.addZoneMap("climate");
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
  // scene reads NPC/portal/enemy/companion handles LIVE by component query — stored id lists
  // would dangle as chunks stream in/out.
  _spawnWorld(scene, data) {
    if (scene._chunked) {
      // the pass-composed generator: authored hub overlay + procedural wilderness in one
      scene.generator = OverworldGen.create({
        seed: data.meta.seed ?? 1337,
        chunkCols: data.meta.chunkCols ?? 16,
        chunkRows: data.meta.chunkRows ?? 16,
        authored: data, // hand-built hub overlaid onto its chunks (AuthoredStamp)
      });
      // Finite world: a worldCols × worldRows rectangle (matches the resident grid). Streaming
      // clamps to it + a wall border rings it, so the player/enemies can't leave.
      const wc = data.meta.worldCols ?? data.cols ?? 128;
      const wr = data.meta.worldRows ?? data.rows ?? 128;
      // The freeze (LOAD) tier earns its keep: simRadius 1 keeps only ~9 chunks fully simulated.
      // Measured 2026-07-02: collapsing to simRadius=loadRadius (25 SIM chunks) tanks the sim to
      // ~260-334ms/step (3fps) — per-tick cost scales ~quadratically with entity count. The
      // broadphase wired in _buildPipeline fixes TriggerSystem's share but NOT the dominant one:
      // SolidSystem's O(bodies×colliders) move-and-collide isn't broadphase-backed (still ~260ms at
      // simRadius:2). So keep the SIM window small until SolidSystem is broadphase-aware.
      scene.chunks = new ChunkManager(
        scene.world,
        scene.level,
        scene.generator,
        {
          chunkCols: data.meta.chunkCols ?? 16,
          chunkRows: data.meta.chunkRows ?? 16,
          simRadius: 1,
          loadRadius: 2,
          worldCols: wc,
          worldRows: wr,
          // descriptor adapter — streamed spawns build through the same path as file spawns
          spawn: (world, level, desc) =>
            RpgSpawn.spawnEntity(world, level, desc),
        },
      );
      RpgLevel.buildWorldBorder(scene.world, scene.level, wc, wr); // edge walls (always present)
      // Generate the ENTIRE finite world into the manager's store now (one-time, behind the
      // scene fade) — mid-game streaming is pure load/unload; generate() never runs in play.
      const t0 = current_time;
      const pregen = scene.chunks.pregenerate();
      Log.info(
        `RpgMap: pregenerated ${pregen} chunks in ${current_time - t0}ms`,
      );
      const sp = scene.world.get(Position, scene.playerId);
      scene.chunks.update(sp.x, sp.y); // populate the rings around the spawn
      scene.reachZone = RpgMap._authoredReach(scene, data); // origin-area quest zone (not streamed)
    } else {
      const ents = RpgSpawn.spawn(scene.world, scene.level, data);
      scene.reachZone = ents.reach; // undefined when the map has no reach marker
    }
    scene.reachDone = scene.reachZone === undefined; // nothing to reach on this map
    scene._npcId = -1; // resolved live each frame by _updateNpc (nearest "npc" in range)
  },

  // Pathfinding nav window + physics pipeline. NavGrid.size() is constant, so MotionPlanner.setGrid
  // runs once here per map (sceneRpg.step rebuilds occupancy around the player each frame).
  _buildPipeline(scene) {
    // O(n) broadphase for SeparationSystem + TriggerSystem (each rebuilds it per tick). It removes
    // TriggerSystem's O(n²) sweep over every collider — measured 2026-07-02 to ~halve the step at
    // the shipping simRadius:1 (≈22-36ms → ≈10-20ms). cellSize (48px) exceeds max dynamic-body /
    // non-solid sensor diameter (~16-24px at 16px cells); huge SOLID colliders (world border, water
    // rects) are exempt — TriggerSystem skips solid-vs-solid and SeparationSystem buckets dynamic
    // bodies only. Rides with the World, so a parked map keeps it across a resume; rebuilt per cold
    // build. NOTE: this does NOT make a wide SIM window affordable — at simRadius:2 the step is still
    // ~260ms because SolidSystem (move-and-collide, O(bodies×colliders), NOT broadphase-backed)
    // dominates; making SolidSystem broadphase-aware is the prerequisite for dropping the freeze tier.
    // UPDATE 2026-07-02 (later): SolidSystem now snapshots static edges+oneWay once per tick, so its
    // resolve loop is flat field reads — measured ~8.5→~1.2ms/tick at simRadius:1 (tick loop
    // ~3-4ms/frame, 60fps+ restored). The loop is still LINEAR over all statics, so the guidance
    // stands: widening simRadius still wants spatial bucketing of the static snapshot first.
    scene.world.broadphase = new Broadphase(
      scene.level.cols * scene.level.cellWidth,
      scene.level.rows * scene.level.cellHeight,
      48,
    );

    scene.nav = new NavGrid(
      32,
      32,
      scene.level.cellWidth,
      scene.level.cellHeight,
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

  // Assemble the renderer pass stack (ground → tiles → zones → shadows → entities → debug →
  // weather → lighting). Tiles are
  // still placeholder: the resident layers render as a sprite-free debug fill (RenderDebugTileMap)
  // rather than the per-layer RenderTileMap loop (restore that loop when tile art lands). Chunked
  // terrain uses its real dual-grid tilesets (TerrainStream).
  _buildRenderer(scene, data) {
    const pitch = RpgMap.BB_PITCH;
    scene.renderer = new Renderer();
    // Chunk-streamed terrain UNDER everything, so RenderChunks runs ground:false (its checker is
    // replaced by the terrain) and only draws walls + frozen-entity snapshots.
    if (scene._chunked) {
      scene.terrain = new TerrainStream(scene.chunks);
      scene.renderer.insert(scene.terrain); // one set of per-chunk VBOs, under everything
      scene.terrain.rebuild(scene.chunks, Infinity); // initial: build every loaded chunk
      scene.renderer.insert(
        new RenderChunks(scene.chunks, {
          font: I18n.font("default"),
          ground: false,
        }),
      );
    }
    // Resident layers drawn by ONE sprite-free RenderDebugTileMap (shades cells by nav cost) in
    // place of the per-layer RenderTileMap passes. _tilePasses holds only the wall layer's
    // RenderWalls mesh pass (inserted below); the other layers' edits no-op in
    // BuildMode._markTileDirty. Restore: the RpgLevel.LAYERS loop keyed into _tilePasses.
    scene._tilePasses = {};
    scene._tilePass = new RenderDebugTileMap(scene.level, {
      cost: true,
      tiles: false,
      alpha: 0.5,
    });
    scene.renderer.insert(scene._tilePass);
    scene._gridPass = new RenderGrid(scene.level); // cell boundary lines
    scene._gridPass.enabled = false; // off in normal play; toggle via Debug → Render → Grid
    scene.renderer.insert(scene._gridPass);
    scene.renderer.insert(new RenderZone(scene.level, "buildable"));
    scene.renderer.insert(
      new RenderZoneLabel(scene.level, "buildable", {
        font: I18n.font("default"),
      }),
    );
    // Foot shadows UNDER the entities (runtime ellipse per body, not baked into the sprites).
    scene.renderer.insert(new RenderEntityShadow());
    // Deep-furniture meshes (VOLUME category of the projection contract — see ROADMAP.md):
    // real depth-writing geometry, so it shares the billboard depth pool. Pitched maps only —
    // a flat map has no depth-writing entity pass to sort against. Sun injected like
    // RenderLighting's ambient (the pass is Core, WorldClock is Demo); camera assigned in
    // _buildCamera (the nearest-point-light selection center).
    if (pitch > 0) {
      scene._meshPass = new RenderMesh({ sun: () => WorldClock.sunDir() });
      scene.renderer.insert(scene._meshPass);
      // WALLS category (art projection contract): the resident wall layer as lit boxes
      // (top + exposed south faces) in the same depth pool, sharing the mesh pass's
      // sun + culled point lights. Keyed into _tilePasses so BuildMode's edit
      // markDirty reaches it (the flat "corner" autotile config stays for the editor).
      // Face texture: spr_floorTiles frame 0 as a stand-in brick (a dedicated wall
      // texture is the art task); the LAYERS tint colors it (texture × tint × light).
      let wallCfg;
      for (let i = 0; i < RpgLevel.LAYERS.length; i++)
        if (RpgLevel.LAYERS[i].key === "wall") wallCfg = RpgLevel.LAYERS[i];
      scene._tilePasses.wall = new RenderWalls(scene.level, scene.wallLayer, {
        color: Color.parse(wallCfg.color),
        sprite: spr_floorTiles,
        frame: 0,
        lights: scene._meshPass,
      });
      scene.renderer.insert(scene._tilePasses.wall);
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
    const paths = new RenderDebugPath(scene.level); // enemy A* paths, off until toggled
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

  // Follow camera on the new player + view culling + the live Debug camera panel.
  // 16px-cell world (GEMS.md): base zoom 3.5 for the pitched 2.5D framing (flat fallback 2).
  _buildCamera(scene, data) {
    const pitch = RpgMap.BB_PITCH;
    const baseZoom = pitch > 0 ? 3.5 : 2;
    // Cap zoom-OUT to the renderable world (a chunked map only streams a window; past it shows as
    // dark void). viewCap = max view WIDTH (world px); camera derives live minZoom from it + the
    // current surface each frame. Horizontal is the binding axis on a landscape surface.
    const viewCap = scene._chunked
      ? // Worst case is a WORLD CORNER (hub spawn): the off-world side streams nothing, so only
        // (loadRadius + 1) chunks load. View any wider → dark void.
        (2 + 1) * (data.meta.chunkCols ?? 16) * scene.level.cellWidth
      : scene.level.cols * scene.level.cellWidth;
    scene.camera = CameraFollow.create2d({
      world: scene.world,
      followTarget: scene.playerId,
      followLerp: 0.15,
      pitch: pitch, // frame-0 seed; the pitchCurve below overwrites it every update
      // pitch-by-zoom (upright-sprite camera, ROADMAP art rework) — see RpgMap._pitchCurve
      pitchCurve: RpgMap._pitchCurve,
      // ortho eye distance: the -100 default near-clips close ground at steep pitch
      // (a black band along the screen bottom); image-identical otherwise under ortho
      followHeight: -1000,
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
        x2: scene.level.cols * scene.level.cellWidth,
        y2: scene.level.rows * scene.level.cellHeight,
      },
    });
    scene.camera.assign(0);
    // Cull the grid pass to the camera view (essential for the chunked map's large home grid).
    scene._gridPass.camera = scene.camera;
    scene._tilePass.camera = scene.camera; // view-cull the placeholder tile fill
    if (scene._clouds !== undefined) scene._clouds.camera = scene.camera;
    if (scene._weather !== undefined) scene._weather.camera = scene.camera;
    scene._lighting.camera = scene.camera;
    // (sprites are UPRIGHT constants now — the entity pass no longer tracks camera pitch)
    if (scene._meshPass !== undefined) scene._meshPass.camera = scene.camera;
    RpgMap._registerCameraDebug(scene); // Debug/ImGui live camera controls (pitch/zoom)
  },

  // Register the Debug "Camera" panel bound to the LIVE scene camera (pitch + zoom) for runtime
  // render inspection. Re-registered on each build/resume (Debug.panel replaces by name) so the
  // sliders drive the ACTIVE map's camera; removed on scene destroy. RPG-owned (pitch is a Demo
  // concern). Surfaces in both the ImGui overlay (F3) and debug.txt.
  _registerCameraDebug(scene) {
    const cam = scene.camera;
    if (cam === undefined) return;
    Debug.panel("Camera", (p) => {
      // pitch is normally the zoom curve's — uncheck to hand-tune with the slider below
      p.checkbox(
        "Pitch by zoom",
        () => cam.followPitchCurve !== undefined,
        (v) => {
          cam.followPitchCurve = v ? RpgMap._pitchCurve : undefined;
        },
      );
      p.slider("Pitch (deg)", cam, "pitchDeg", 0, 85, 1);
      p.slider("Zoom", cam, "followZoomTarget", 1, 8, 0.1);
      // 6DOF free-fly noclip camera (on Time.raw so it works while the sim is paused) — detach
      // from the player to inspect the render from any angle. Switches to perspective projection.
      p.checkbox("Free cam (WASD/RMB)", cam, "freeCam");
      p.slider("Fly speed", cam, "flySpeed", 30, 1200, 10);
      p.button("Recenter on player", () => {
        const pos =
          cam.world !== undefined
            ? cam.world.get(Position, cam.followTarget)
            : undefined;
        if (pos !== undefined) {
          cam.toX = pos.x;
          cam.toY = pos.y;
        }
      });
      p.watch("Zoom (live)", () => cam.followZoom);
      p.watch("Pitch (rad)", () => cam.followPitch);
    });
  },

  // Reclaim ONE map bundle's owned resources. No global input/weather teardown — those are
  // scene-scoped. Used by scene teardown. renderer.destroy() frees the terrain VBOs.
  _free(b) {
    if (b.chunks) b.chunks.destroy();
    if (b.camera) b.camera.destroy();
    if (b.renderer) b.renderer.destroy();
    if (b.world) b.world.destroy();
    if (b.level) b.level.destroy();
  },

  // Walk-onto door: travel to the first portal the player overlaps. Runs after physics; on a hit,
  // go() swaps the world out so we return immediately.
  checkPortals(scene) {
    const p = AABB.of(scene.world, scene.playerId);
    // live query every doorway (Portal component) — no stored list to dangle as chunks stream
    const ids = scene.world.query(Portal);
    let over = -1;
    for (let i = 0; i < ids.length; i++) {
      const z = AABB.of(scene.world, ids[i]);
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
    const portal = scene.world.get(Portal, over);
    Log.info(`portal → ${portal.toMap} (${portal.toEntry})`);
    RpgMap.go(scene, portal.toMap, portal.toEntry);
  },

  // Reach-quest zone from a chunked map's authored "reach" spawn. A region, not an entity, so
  // it's resolved once here rather than chunk-streamed.
  _authoredReach(scene, data) {
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++)
      if (spawns[i].preset === "reach")
        return RpgSpawn.reachZone(scene.level, spawns[i]);
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
// zoom-out floor (~2.5 on a 1920 surface) easing to 58° at max zoom-in (5.25) — "look
// further = flatter". Constants tuned by the 2026-07-05 spike; shared with the Debug
// Camera panel's "Pitch by zoom" toggle.
RpgMap._pitchCurve = (z) => 42 + 16 * clamp((z - 2.5) / 2.75, 0, 1);
