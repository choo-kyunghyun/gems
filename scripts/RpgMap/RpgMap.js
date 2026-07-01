// Map-graph engine for the RPG scene — portal travel, map pool, and persistence.
// Free functions over the scene (composition; GMRT has no usable class inheritance).
//
// Visited worlds are kept ALIVE in a per-scene pool (scene._maps) — no destroy/rebuild on
// a door trip. Only the party (player sheet + "follow" companions) migrates via EntitySnapshot;
// everything else stays resident. Level.export() cache is the COLD path only: LRU eviction
// (_evict, past POOL_MAX) serializes a map and frees it; revisit then rebuilds from file.
globalThis.RpgMap = {
  // max parked worlds in pool before LRU eviction (active map is not counted)
  POOL_MAX: 3,

  // fields _stash/_restore copy between scene and a parked bundle (excludes scene-shell +
  // per-activate transients reset by _activateReset on each map open)
  BUNDLE_KEYS: [
    "world",
    "level",
    "spawn",
    "entries",
    "ctrl",
    "mapId",
    "_chunked",
    "_mapPersistent",
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
    "_gone",
    "followers",
    "reachZone",
    "reachDone",
    "nav",
    "physics",
    "renderer",
    "source",
    "chunks",
    "terrain",
    "camera",
    "_tilePasses",
    "_tilePass",
    "_gridPass",
    "_weather",
    "_lighting",
  ],

  // Park the current map in the pool and resume or build the target. Called from create() + checkPortals.
  go(scene, mapId, entryId) {
    let carry = null;
    let travelers = []; // "follow" companions — captured + re-spawned in the target (party scope)
    // ── PHASE A: leave the current map, keeping its World alive in the pool ──
    if (scene.ctrl !== undefined) {
      // capture the sheet only (position/visual rebuilt by the controller on the new map);
      // Attributes ride along so recompute derives from grown values, not defaults.
      carry = EntitySnapshot.capture(scene.world, scene.ctrl.id, [
        Attributes,
        Stats,
        Health,
        Stamina,
        Inventory,
        Equipment,
        Encumbrance,
        Hotbar, // hotbar/favorites reference itemIds the carried bag holds — desync if left per-map
        Favorites,
        Thirst, // survival needs are session-scoped player state (like Stamina) — travel with
        Hunger, // the party, not reset/diverge per map
        Drowsiness,
      ]);
      // partition followers: "follow" travels (captured + removed); "wait" stays resident
      const stay = [];
      for (let i = 0; i < scene.followers.length; i++) {
        const fid = scene.followers[i];
        const f = scene.world.get(Follower, fid);
        if (f === undefined) continue;
        if (f.state === "follow") {
          travelers.push(EntitySnapshot.capture(scene.world, fid));
          scene.world.remove(fid);
        } else {
          stay.push(fid);
        }
      }
      scene.followers = stay;
      Trader.onSuspend(scene); // dehydrate any embodied wandering trader → its record (before park)
      scene.world.flush(); // commit traveler removals before parking
      RpgMap.suspend(scene);
    }
    // ── PHASE B: enter the target — resume its parked world, else build from file ──
    const bundle = scene._maps[mapId];
    if (bundle !== undefined)
      RpgMap.resume(scene, bundle, entryId, carry, travelers);
    else RpgMap.build(scene, mapId, entryId, carry, travelers);
    RpgMap._touch(scene, scene.mapId);
    RpgMap._evict(scene);
    // index the now-active level in the level manager + embody any trader currently in it
    World.levels.register(scene.mapId, scene.world, scene.level);
    World.levels.setActive(scene.mapId);
    Trader.onActivate(scene);
  },

  // Park the live map. Unassign (not destroy) the camera — the parked map keeps it for resume;
  // without the unassign its later destroy() would tear down the live view. exitRegion so the
  // next map re-detects its climate.
  suspend(scene) {
    if (scene.camera) scene.camera.unassign();
    Weather.exitRegion();
    scene._maps[scene.mapId] = RpgMap._stash(scene);
  },

  // Resume a parked map: restore its fields, re-claim the viewport, re-sync the carried sheet onto
  // the resident (dormant) player, reposition it to the entry, and re-spawn travelers.
  resume(scene, bundle, entryId, carry, travelers) {
    RpgMap._restore(scene, bundle);
    delete scene._maps[scene.mapId]; // mapId restored above; live now, not parked
    MotionPlanner.setGrid(scene.nav);
    if (scene.camera) scene.camera.assign(0);
    if (carry !== null) EntitySnapshot.apply(scene.world, scene.ctrl.id, carry);

    // snap the follow camera to the entry so it doesn't pan from the parked position
    const sp = scene.entries[entryId] ?? scene.spawn;
    const pp = scene.world.get(Position, scene.ctrl.id);
    const pv = scene.world.get(Velocity, scene.ctrl.id);
    pp.x = sp.x;
    pp.y = sp.y;
    pv.x = 0;
    pv.y = 0;
    if (scene.camera) {
      scene.camera.toX = sp.x;
      scene.camera.toY = sp.y;
    }

    // re-spawn the traveling party around the entry (fresh Position/Velocity)
    for (let i = 0; i < travelers.length; i++)
      scene.followers.push(
        EntitySnapshot.restore(scene.world, travelers[i], {
          [Position]: { x: sp.x - 24 - i * 22, y: sp.y + 24, z: 0 },
          [Velocity]: { x: 0, y: 0, z: 0 },
        }),
      );

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

  // move mapId to the MRU end of the activation order (LRU bookkeeping for _evict)
  _touch(scene, mapId) {
    const ord = scene._mapOrder;
    const i = ord.indexOf(mapId);
    if (i !== -1) ord.splice(i, 1);
    ord.push(mapId);
  },

  // Evict parked maps down to POOL_MAX: serialize the LRU one into the cold cache (_mapCache),
  // free it, drop it. Revisit rebuilds from file + cache. Never touches the active map.
  _evict(scene) {
    let count = 0;
    for (const id in scene._maps) count++;
    while (count > RpgMap.POOL_MAX) {
      // earliest still-parked map in activation order
      let victim = null;
      for (let i = 0; i < scene._mapOrder.length; i++) {
        if (scene._maps[scene._mapOrder[i]] !== undefined) {
          victim = scene._mapOrder[i];
          break;
        }
      }
      if (victim === null) break; // safety — nothing parked
      RpgMap._evictSerialize(scene, scene._maps[victim]);
      RpgMap._free(scene._maps[victim]);
      World.levels.unregister(victim); // its store is destroyed — drop it from the manager index
      delete scene._maps[victim];
      scene._mapOrder.splice(scene._mapOrder.indexOf(victim), 1);
      count--;
    }
  },

  // Serialize a parked map into the cold cache in the shape build() restores (level export,
  // deconstruct tracking, built entities, stationed companions, gone ledger). Live enemies/loot
  // are deliberately NOT snapshotted — they respawn on the cold rebuild. No-op if non-persistent.
  _evictSerialize(scene, b) {
    if (!b._mapPersistent) return;
    const builtEnts = [];
    for (const key in b._builtEnts) {
      const e = b._builtEnts[key];
      if (e === undefined || !b.world.isValid(e.ent)) continue;
      builtEnts.push({
        key,
        itemId: e.itemId,
        snap: EntitySnapshot.capture(b.world, e.ent),
      });
    }
    const stationed = [];
    for (let i = 0; i < b.followers.length; i++)
      stationed.push(EntitySnapshot.capture(b.world, b.followers[i]));
    scene._mapCache[b.mapId] = {
      level: b.level.export(),
      built: { ...b._built },
      builtEnts,
      entities: stationed,
      gone: b._gone,
    };
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

  // Build a map fresh from file (first visit, or an eviction-restore from the cold cache).
  // carry + travelers are handed in by go() (null/[] on boot). Orchestrates the build helpers below.
  build(scene, mapId, entryId, carry = null, travelers = []) {
    const loaded = RpgMap._loadData(mapId, entryId);
    const data = loaded.data;
    mapId = loaded.mapId;
    entryId = loaded.entryId;
    scene.mapId = mapId;
    // chunked: streams terrain + entities around the player (overworld); plain builds up front
    scene._chunked = data.meta.chunked === true;
    // persistent (default true): player edits cached on evict + restored on cold rebuild.
    // meta.persistent: false opts out (a dungeon that resets each entry).
    scene._mapPersistent = data.meta.persistent !== false;
    Log.info(
      `RPG map: ${mapId} (entry ${entryId})${scene._chunked ? " [chunked]" : ""}`,
    );

    RpgMap._buildWorld(scene, data, entryId, carry); // World + Level + player + zone channels
    const saved = RpgMap._restoreCold(scene, mapId); // cold-cache player edits (persistent maps)
    RpgMap._spawnWorld(scene, data, travelers, saved); // entities (streamed/up-front) + companions
    RpgMap._activateReset(scene); // per-activate transients (hp track, build mode, climate, inv)
    RpgMap._buildPipeline(scene); // nav window + physics pipeline
    const entityPass = RpgMap._buildRenderer(scene, data); // render pass stack
    RpgMap._buildCamera(scene, data, entityPass); // follow camera + view culling + debug

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

  // World + Level + player + the buildable/climate zone channels. Chunked gets a bigger entity cap
  // (a window of chunks' worth of entities + colliders + drops) and an empty resident grid (player
  // builds only).
  _buildWorld(scene, data, entryId, carry) {
    scene.world = new ECS(scene._chunked ? 1024 : 256, 60);
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
    scene.ctrl = RpgController.create(scene.world, built.spawn);

    // re-attach the carried sheet (no re-equip — equip mods already baked into carried Stats)
    if (carry !== null) EntitySnapshot.apply(scene.world, scene.ctrl.id, carry);

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

  // Restore a persistent map's player edits from the cold cache: Level.import overlays the cached
  // TileLayers + buildable ZoneMap (same dims/layer order, so it round-trips; cached zone keeps
  // id 1), re-mesh wall colliders, restore deconstruct tracking + built entities + the gone ledger.
  // Returns the cache record (or undefined) for _spawnWorld. No cache → fresh state.
  _restoreCold(scene, mapId) {
    const saved = scene._mapCache[mapId];
    if (saved !== undefined) {
      scene.level.import(saved.level); // also syncs nav (Level.import → syncAll)
      TileEdit.remesh(
        scene.world,
        scene.level,
        scene.wallLayer,
        scene.colliders,
      );
      scene._built = { ...saved.built };
    } else {
      scene._built = {}; // player-built deconstructable cells, fresh on first visit
    }
    // Restore built entities from the cache. Reset first — _builtEnts persists on the scene
    // across map swaps (BuildMode.build runs once), so clear the previous map's entries.
    scene._builtEnts = {};
    if (saved !== undefined && saved.builtEnts !== undefined) {
      for (let i = 0; i < saved.builtEnts.length; i++) {
        const b = saved.builtEnts[i];
        const id = EntitySnapshot.restore(scene.world, b.snap);
        scene._builtEnts[b.key] = { ent: id, itemId: b.itemId };
      }
    }
    // File-scope reconcile ledger: uids of unique entities removed during play. Passed to
    // RpgSpawn.spawn to skip their file spawns. Empty on a first visit / non-persistent map.
    scene._gone =
      saved !== undefined && saved.gone !== undefined ? saved.gone : {};
    return saved;
  },

  // Entities + companions. Chunked STREAMS entities via ChunkManager; plain spawns all up front.
  // Either way the scene reads NPC/portal/enemy handles LIVE by tag — stored id lists would dangle
  // as chunks stream in/out. Then re-spawn the traveling party around the entry + restore this
  // map's cached stationed companions.
  _spawnWorld(scene, data, travelers, saved) {
    if (scene._chunked) {
      scene.source = new ChunkSource({
        seed: data.meta.seed ?? 1337,
        chunkCols: data.meta.chunkCols ?? 16,
        chunkRows: data.meta.chunkRows ?? 16,
        authored: data, // hand-built hub overlaid onto its chunks; procedural elsewhere
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
      scene.chunks = new ChunkManager(scene.world, scene.level, scene.source, {
        chunkCols: data.meta.chunkCols ?? 16,
        chunkRows: data.meta.chunkRows ?? 16,
        simRadius: 1,
        loadRadius: 2,
        worldCols: wc,
        worldRows: wr,
      });
      RpgLevel.buildWorldBorder(scene.world, scene.level, wc, wr); // edge walls (always present)
      const sp = scene.world.get(Position, scene.ctrl.id);
      scene.chunks.update(sp.x, sp.y); // populate the rings around the spawn
      scene.reachZone = RpgMap._authoredReach(scene, data); // origin-area quest zone (not streamed)
      scene.followers = [];
    } else {
      const ents = RpgSpawn.spawn(scene.world, scene.level, data, {
        gone: scene._gone, // file-scope reconcile (unique entities removed on a prior visit)
      });
      scene.reachZone = ents.reach; // undefined when the map has no reach marker
      scene.followers = ents.followers; // this map's file-spawned companions
    }
    scene.reachDone = scene.reachZone === undefined; // nothing to reach on this map
    scene._npcId = -1; // resolved live each frame by _updateNpc (nearest "npc" in range)

    // Companions: the traveling party re-spawned around the entry (fresh Position/Velocity), then
    // this map's cached stationed companions (full snapshot, restored where left).
    const ep = scene.world.get(Position, scene.ctrl.id);
    for (let i = 0; i < travelers.length; i++)
      scene.followers.push(
        EntitySnapshot.restore(scene.world, travelers[i], {
          [Position]: { x: ep.x - 12 - i * 11, y: ep.y + 12, z: 0 },
          [Velocity]: { x: 0, y: 0, z: 0 },
        }),
      );
    if (saved !== undefined && saved.entities !== undefined)
      for (let i = 0; i < saved.entities.length; i++)
        scene.followers.push(
          EntitySnapshot.restore(scene.world, saved.entities[i]),
        );
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
    );
    MotionPlanner.setGrid(scene.nav);

    // AI decides velocity → resolve paths → collide → push crowders apart → triggers (pickups) →
    // projectiles → expire.
    scene.physics = new Pipeline()
      .add(StateSystem) // drives the CombatAI Idle/Chase/Attack schemas (enemies AND turrets)
      .add(PathfindingSystem) // enemy PathRequest → PathResponse over scene.nav
      .add(SolidSystem)
      .add(SeparationSystem) // unstack dynamic bodies (RTS-style crowding), after SolidSystem
      .add(TriggerSystem)
      .add(ProjectileSystem)
      .add(LifetimeSystem);
  },

  // Assemble the renderer pass stack (ground → tiles → zones → shadows → entities → debug →
  // weather → lighting). Returns the live entity pass — _buildCamera wires its pitch. Tiles are
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
    // place of the per-layer RenderTileMap passes. _tilePasses stays empty, so
    // BuildMode._markTileDirty no-ops. Restore: the RpgLevel.LAYERS loop keyed into _tilePasses.
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
    // Entities via the production sprite pass. The colored-box + label debug passes stay inserted
    // but DISABLED, so the Debug menu can toggle them over the sprites.
    const entityPass =
      pitch > 0 ? new RenderBillboard({ pitchDeg: pitch }) : new RenderEntity();
    scene.renderer.insert(entityPass);
    const dbgBox = new RenderDebugBox();
    dbgBox.enabled = false;
    scene.renderer.insert(dbgBox);
    const dbgName = new RenderDebugName();
    dbgName.enabled = false;
    scene.renderer.insert(dbgName);
    const dbgDir = new RenderDebugDirection(); // facing dot (player Direction)
    dbgDir.enabled = false;
    scene.renderer.insert(dbgDir);
    const dbgAnim = new RenderDebugAnimator(); // animator-state label
    dbgAnim.enabled = false;
    scene.renderer.insert(dbgAnim);
    // RenderDebugAnimator reads the Demo-layer Animator, so the RPG (not Core's DebugRender)
    // registers its toggle. add() dedupes, so repeated map loads are no-ops.
    DebugRender.add(RenderDebugAnimator, "Anim");
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
    // Weather (tint + rain/snow) just under the day/night tint, so night darkens the rain.
    // Skipped indoors (meta.indoor) — no open sky inside a cave.
    scene._weather = undefined;
    if (!data.meta.indoor) {
      scene._weather = new RenderWeather();
      scene.renderer.insert(scene._weather);
    }
    // Lighting LAST — a per-frame light map composited over everything. Day/night is its ambient
    // term ("lighting with no lights"); Light entities + a night vignette layer on top.
    scene._lighting = new RenderLighting({ ambient: () => WorldClock.tint() });
    scene.renderer.insert(scene._lighting);
    return entityPass;
  },

  // Follow camera on the new player + view culling + the live Debug camera panel.
  // 16px-cell world (GEMS.md): base zoom 3.5 for the pitched 2.5D framing (flat fallback 2).
  _buildCamera(scene, data, entityPass) {
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
      followTarget: scene.ctrl.id,
      followLerp: 0.15,
      pitch: pitch, // 0 = flat top-down, > 0 pitches for standing billboards
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
    if (scene._weather !== undefined) scene._weather.camera = scene.camera;
    scene._lighting.camera = scene.camera;
    // Billboards track the camera's LIVE pitch (Debug pitch slider). RenderEntity flat ignores it.
    entityPass.camera = scene.camera;
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
  // scene-scoped. Used by _evict + scene teardown. renderer.destroy() frees the terrain VBOs.
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
    const p = AABB.of(scene.world, scene.ctrl.id);
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
RpgMap.BB_PITCH = 35;
