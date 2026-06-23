// Map-graph engine for the RPG scene — the world-loading, teardown, persistence-cache, and
// portal-travel half of sceneRpg, extracted as free functions taking the scene (composition;
// GMRT has no usable class inheritance — same pattern as RpgScene). The scene owns the fields
// these read/write (world, level, ctrl, followers, renderer, camera, _mapCache, _built/_builtEnts, _gone,
// physics, _tilePasses/_gridPass, etc.); RpgMap just orchestrates building/tearing them down.
//
// Maps are discrete level files connected by portals (not one streamed world — the deliberate
// fit for the JSON.parse-on-large-files limit and the one-World-per-scene model). A chunked map
// (meta.chunked) streams its terrain + entities around the player via a ChunkManager; a plain map
// builds everything up front.
//
// A visited map's World is kept ALIVE and suspended in a per-scene POOL (scene._maps), not
// destroyed on a door trip: go() parks the current map (suspend → _stash) and resumes the target
// if already visited (no file reload, no rebuild) or builds it fresh on a first visit. Only the
// PARTY (player sheet + "follow" companions) migrates between worlds (EntitySnapshot); everything
// else — stationed companions, built tiles/entities, the buildable zone, dead enemies — simply
// stays resident in its parked world, so nothing has to be hand-marked for persistence. The old
// per-leave Level.export() cache (scene._mapCache) is now the COLD path: only an LRU eviction
// (_evict, past POOL_MAX parked maps) serializes a map there and frees it; a later revisit then
// rebuilds it from file + imports the cache (enemies respawn on that cold rebuild only).
globalThis.RpgMap = {
  // Max number of PARKED (suspended) maps kept live in the pool before LRU eviction. The active
  // map is on `this` (not counted), so up to POOL_MAX + 1 Worlds are resident. The overworld is
  // chunk-bounded and interiors are tiny, so a handful is cheap; tune for memory vs. revisit cost.
  POOL_MAX: 3,

  // The per-map fields a bundle owns — everything tied to one map's World/Level/render apparatus.
  // _stash copies these off the scene into a parked bundle; _restore copies them back. NOT here:
  // the scene-shell fields (ui, _mapCache, _maps, overlay flags) and the per-activate transients
  // (_hpTrack/_npcId/_climateZone/_buildActive), which _activateReset reseeds each time a map opens.
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

  // Travel to `mapId`@`entryId`: PARK the current map alive in the pool (no destroy/rebuild) and
  // either resume the target's parked world (revisit) or build it from file (first visit). Only the
  // party crosses worlds; stationed companions / built tiles+entities / the buildable zone / dead
  // enemies all just stay resident in their parked world. Called from create() (boot) + checkPortals.
  go(scene, mapId, entryId) {
    let carry = null;
    let travelers = []; // "follow" companions captured to re-spawn in the target (party scope)
    // ── PHASE A — leave the current map, keeping its World ALIVE in the pool ──
    if (scene.ctrl !== undefined) {
      // The character sheet is the one thing that crosses worlds (party member 0). Capture just
      // the sheet — the dormant player entity stays resident in the parked world and is re-synced
      // with this on return; Position/Visual/Animator are the controller's to rebuild. Attributes
      // ride along so a post-crossing recompute re-derives from the grown attributes, not defaults.
      carry = EntitySnapshot.capture(scene.world, scene.ctrl.id, [
        Attributes,
        Stats,
        Health,
        Stamina,
        Inventory,
        Equipment,
        Encumbrance,
        Hotbar, // quick-use bindings + favorited-item set travel with the bag (they reference
        Favorites, // itemIds the carried Inventory holds, so they'd desync if left per-map).
        Thirst, // survival needs are session-scoped player state (like Stamina) — they travel
        Hunger, // with the party, NOT reset/diverge per map (each map's resident player would
        Drowsiness, // otherwise keep its own meter, unsynced across the transition).
      ]);
      // Partition followers: a "follow" companion travels (captured AND removed from the parked
      // world, so it isn't both left behind dormant and re-spawned in the target); a "wait"
      // companion stays resident in this parked world — no cache, no round-trip.
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
      scene.world.flush(); // commit the traveler removals before the world is parked
      RpgMap.suspend(scene); // unassign the camera + stash the live fields into the pool
    }
    // ── PHASE B — enter the target: resume its parked world, else build it from file ──
    const bundle = scene._maps[mapId];
    if (bundle !== undefined)
      RpgMap.resume(scene, bundle, entryId, carry, travelers);
    else RpgMap.build(scene, mapId, entryId, carry, travelers);
    // The now-active map is most-recently-used; evict the LRU parked map if over the cap.
    RpgMap._touch(scene, scene.mapId);
    RpgMap._evict(scene);
  },

  // Park the live map: detach its camera from viewport 0 (NOT destroy — the parked map keeps it for
  // resume; without the unassign the parked Camera still thinks it owns the viewport and its later
  // destroy() would tear down the live view), clear any Weather region override (the next map
  // re-detects its climate on the first step), and stash the per-map fields into the pool.
  suspend(scene) {
    if (scene.camera) scene.camera.unassign();
    Weather.exitRegion();
    scene._maps[scene.mapId] = RpgMap._stash(scene);
  },

  // Resume a parked map: splat its fields back onto the scene, re-claim the viewport, re-sync the
  // carried sheet onto the resident (dormant) player, reposition that player to the portal's named
  // entry (honoring entryId on a revisit exactly like a fresh build), and re-spawn the travelers.
  resume(scene, bundle, entryId, carry, travelers) {
    RpgMap._restore(scene, bundle); // pointer-copy the parked fields back onto the scene
    delete scene._maps[scene.mapId]; // mapId is restored above; it's live now, not parked
    MotionPlanner.setGrid(scene.nav); // re-point the planner at this map's nav window
    if (scene.camera) scene.camera.assign(0);
    if (carry !== null) EntitySnapshot.apply(scene.world, scene.ctrl.id, carry);

    // Reposition the resident player to the resolved entry, then snap the follow camera so there's
    // no pan from the parked position (the camera lerps toX/toY toward the target each update).
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

    // Re-spawn the traveling party around the entry (fresh Position/Velocity so they don't keep
    // old-map coords), exactly as the build path does.
    for (let i = 0; i < travelers.length; i++)
      scene.followers.push(
        EntitySnapshot.restore(scene.world, travelers[i], {
          [Position]: { x: sp.x - 24 - i * 22, y: sp.y + 24, z: 0 },
          [Velocity]: { x: 0, y: 0, z: 0 },
        }),
      );

    // Chunked map: re-center the streaming rings + rebuild any newly-streamed terrain around the
    // entry now (step() does this every frame, but seed it so the first frame back has no ring gap).
    if (scene.chunks !== undefined) {
      scene.chunks.update(sp.x, sp.y);
      if (scene.terrain !== undefined) scene.terrain.rebuild(scene.chunks);
    }

    RpgMap._activateReset(scene);
    FloatingText.clear(); // drop the previous map's combat numbers (world coords are map-local)
    ParticleFx.clear();
  },

  // Copy the per-map fields off the scene into a fresh bundle (pointer copy — world/level/etc. stay
  // alive). _restore copies them back. Plain array index loop (no Map/Set iteration — GMRT).
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

  // Move `mapId` to the most-recently-used end of the activation order (LRU bookkeeping for _evict).
  _touch(scene, mapId) {
    const ord = scene._mapOrder;
    const i = ord.indexOf(mapId);
    if (i !== -1) ord.splice(i, 1);
    ord.push(mapId);
  },

  // Evict parked maps down to POOL_MAX: serialize the least-recently-used one into the COLD cache
  // (_mapCache, the old per-leave shape), free its resources, and drop it. A later revisit then
  // rebuilds it from file + imports the cache. Never touches the active map (it isn't in _maps).
  _evict(scene) {
    let count = 0;
    for (const id in scene._maps) count++;
    while (count > RpgMap.POOL_MAX) {
      // Victim = the earliest map in activation order that is still parked.
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
      delete scene._maps[victim];
      scene._mapOrder.splice(scene._mapOrder.indexOf(victim), 1);
      count--;
    }
  },

  // Serialize a parked map into the cold cache before reclaiming it, in the SAME shape build()
  // restores: level export (tiles + buildable zone), deconstruct tracking, built entities, the
  // stationed companions (a parked bundle's followers are all "wait"), and the gone ledger. Live
  // enemies/loot are deliberately NOT snapshotted — they respawn on the cold rebuild (the accepted
  // degradation once a map is evicted under memory pressure). No-op for a non-persistent map.
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

  // Per-activate transient reset (shared by build + resume): floating-number tracking re-seeds with
  // no delta, build mode never carries across a door, the climate zone is forced to re-fire enter,
  // and an open inventory refreshes against the new world. Kept off the bundle so a resume can't
  // restore a stale transient.
  _activateReset(scene) {
    scene._hpTrack = {};
    scene._buildActive = false;
    BuildMode.active = false;
    scene.nearNpc = false;
    scene._climateZone = 0;
    scene._npcId = -1;
    if (scene.invOpen) scene._invDirty = true;
    // Re-point CombatAI's shared world/level statics at this map. attach() does this for a fresh
    // build, but a resume keeps actors without re-attaching, so bind explicitly (else slimes step
    // against the previously-built world and fault). The one map-context system with statics.
    CombatAI.bind(scene.world, scene.level);
  },

  // World-coord entry points by name (for repositioning the player on a resume, where there's no
  // file reload to re-resolve through RpgLevel._resolveSpawn). Mirrors that resolver's sources:
  // meta.entries, plus the legacy single meta.playerSpawn as "default".
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

  // Build a map fresh from its file (first visit, or an eviction-restore from the cold _mapCache).
  // carry + travelers are captured from the OUTGOING map by go() and handed in (null/[] on boot).
  build(scene, mapId, entryId, carry = null, travelers = []) {
    // 2. Load the map file (fall back to the start map if a referenced file is bad).
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
    scene.mapId = mapId;
    // A chunked map streams its terrain + entities around the player (overworld); a plain map
    // builds everything up front (interiors). Branches below key off this.
    scene._chunked = data.meta.chunked === true;
    // Persistent (default true): the map's player edits are cached on leave + restored on
    // revisit (see step 1 and 4b). Set `meta.persistent: false` in a level file to opt out
    // (e.g. a dungeon that should reset each entry).
    scene._mapPersistent = data.meta.persistent !== false;
    Log.info(
      `RPG map: ${mapId} (entry ${entryId})${scene._chunked ? " [chunked]" : ""}`,
    );

    // 3. World + level + player. A chunked map needs a bigger entity cap (a window of chunks'
    //    worth of entities + colliders + transient drops) and an empty resident grid (player
    //    builds only); a plain map sizes the grid from the file's cols/rows.
    scene.world = new World(scene._chunked ? 1024 : 256, 60);
    const built = scene._chunked
      ? RpgLevel.buildChunked(scene.world, data, entryId)
      : RpgLevel.build(scene.world, data, entryId);
    scene.level = built.level;
    scene.spawn = built.spawn; // remembered for player respawn on death
    scene.entries = RpgMap._entryTable(scene.level, data); // named entries → world coords (resume reposition)
    scene.terrainLayer = built.terrainLayer; // tilemap handles (RenderTileMap passes + build mode)
    scene.floorLayer = built.floorLayer;
    scene.wallLayer = built.wallLayer;
    scene.fenceLayer = built.fenceLayer;
    scene.terrainType = built.terrainType;
    scene.floorType = built.floorType;
    scene.wallType = built.wallType;
    scene.fenceType = built.fenceType;
    scene.colliders = built.colliders;
    scene.ctrl = RpgController.create(scene.world, built.spawn);

    // Re-attach the carried character sheet onto the new player entity (no re-equip pass —
    // equip mods are already baked into the carried Stats).
    if (carry !== null) EntitySnapshot.apply(scene.world, scene.ctrl.id, carry);

    // 4. Buildable zone channel (one per map) — the Claim Post paints into it; build mode
    //    only allows placement inside it; RenderZone visualizes the claimed area.
    const bmap = scene.level.addZoneMap("buildable");
    scene.buildZoneId = bmap.define({
      name: I18n.text("BUILD_ZONE"),
      tags: ["buildable"],
      data: { color: "#55aa55" },
    }).id;

    // 4-climate. Climate zones (optional, data-driven from meta.climate): named regions that
    //    override the open sky — a forced Weather condition + a Kelvin temperature offset — while
    //    the player stands inside (sceneRpg._updateClimate tracks the player's cell → Weather
    //    enter/exitRegion). Static metadata, so building it before 4b round-trips through the
    //    persistence cache like the buildable zone.
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

    // 4b. Restore a persistent map's player edits on revisit. Level.import overlays the
    //     cached TileLayers + buildable ZoneMap onto the freshly built level (same dims/layer
    //     order, so it round-trips; the cached buildable zone keeps id 1, matching the define
    //     above). Re-mesh wall colliders from the restored layer, and bring back the
    //     deconstruct tracking so built tiles stay removable. No cache → fresh _built.
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
    // Restore built entities (furniture/stations) from the cache as fresh world entities,
    // re-keyed by cell for deconstruct. Reset first — _builtEnts persists on the scene across
    // map swaps (BuildMode.build runs once), so the previous map's entries must be cleared.
    scene._builtEnts = {};
    if (saved !== undefined && saved.builtEnts !== undefined) {
      for (let i = 0; i < saved.builtEnts.length; i++) {
        const b = saved.builtEnts[i];
        const id = EntitySnapshot.restore(scene.world, b.snap);
        scene._builtEnts[b.key] = { ent: id, itemId: b.itemId };
      }
    }
    // File-scope reconcile ledger for THIS map: uids of unique entities removed during play.
    // Loaded from the cache (persists across revisits), passed to RpgSpawn.spawn below to skip
    // their file spawns, and written back on leave. Empty on a first visit / non-persistent map.
    scene._gone =
      saved !== undefined && saved.gone !== undefined ? saved.gone : {};

    // 5. Entities. A chunked map STREAMS them via the ChunkManager (authored hub + procedural
    //    wilderness, windowed around the player); a plain map spawns them all up front. Either
    //    way the scene reads NPC / portal / enemy handles LIVE by tag (Query / world.query), so
    //    no stored id lists are kept here — they'd dangle as chunks stream in and out.
    if (scene._chunked) {
      scene.source = new ChunkSource({
        seed: data.meta.seed ?? 1337,
        chunkCols: data.meta.chunkCols ?? 16,
        chunkRows: data.meta.chunkRows ?? 16,
        authored: data, // hand-built hub overlaid onto its chunks; procedural elsewhere
      });
      // Finite world: the overworld is a worldCols × worldRows rectangle (matches the resident
      // grid buildChunked sized). Streaming clamps to it and a wall border rings it, so the world
      // isn't infinite (and the player/slimes can't leave).
      const wc = data.meta.worldCols ?? data.cols ?? 128;
      const wr = data.meta.worldRows ?? data.rows ?? 128;
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
      scene.reachZone = RpgMap._authoredReach(scene, data); // origin-area quest zone (not chunk-managed)
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

    // Companions (continued): the traveling party re-spawned around the player's entry (fresh
    // Position/Velocity so they don't keep old-map coords), then this map's cached stationed
    // companions (restored where they were left — full snapshot).
    const ep = scene.world.get(Position, scene.ctrl.id);
    for (let i = 0; i < travelers.length; i++)
      scene.followers.push(
        EntitySnapshot.restore(scene.world, travelers[i], {
          [Position]: { x: ep.x - 24 - i * 22, y: ep.y + 24, z: 0 },
          [Velocity]: { x: 0, y: 0, z: 0 },
        }),
      );
    if (saved !== undefined && saved.entities !== undefined)
      for (let i = 0; i < saved.entities.length; i++)
        scene.followers.push(
          EntitySnapshot.restore(scene.world, saved.entities[i]),
        );

    // 6. Per-map resets (old ids belonged to the previous map; _built handled in 4b).
    RpgMap._activateReset(scene); // per-activate transients (hp track, build mode, climate, inv)

    // 7. Pathfinding nav window: a windowed occupancy grid built from the live colliders (streamed
    //    terrain + player builds + world border + interior walls), pointed at by MotionPlanner.
    //    Slimes plan over it (PathfindingSystem in the pipeline below); sceneRpg.step rebuilds it
    //    around the player each frame. size() is constant, so setGrid is called once here per map.
    scene.nav = new NavGrid(
      32,
      32,
      scene.level.cellWidth,
      scene.level.cellHeight,
    );
    MotionPlanner.setGrid(scene.nav);

    // 8. Pipeline: AI decides velocity → resolve paths → collide → push crowders apart →
    //    triggers (pickups) → projectiles → expire. PathfindingSystem resolves the PathRequests
    //    CombatAI queues this tick (over scene.nav) into PathResponses the slime follows next tick.
    scene.physics = new Pipeline()
      .add(StateSystem) // drives the CombatAI Idle/Chase/Attack schemas (slimes AND turrets)
      .add(PathfindingSystem) // slime PathRequest → PathResponse over scene.nav
      .add(SolidSystem)
      .add(SeparationSystem) // unstack dynamic bodies (slimes/player/followers) — RTS-style crowding, after SolidSystem
      .add(TriggerSystem)
      .add(ProjectileSystem)
      .add(LifetimeSystem);

    // 9. Renderer — PLACEHOLDER RENDERING. The legacy Demo art (Demo/Sprite/*) is being separated
    //    out for a greenfield 32px set, so nothing here draws a content sprite: tiles + chunked
    //    terrain render as sprite-free debug fills and entities as colored boxes. Restore the real
    //    passes (the per-layer RenderTileMap loop, TerrainStream, RenderEntity) when the new art
    //    lands — see the git history of this file / the inline "Restore …" notes below.
    scene.renderer = new Renderer();
    // Chunk-streamed terrain: TerrainStream draws the real per-material dual-grid tilesets
    // (spr_terrainWater/Sand/Grass, untinted) UNDER everything, so RenderChunks runs with
    // ground:false (its checker is replaced by the terrain) and only draws walls + frozen-entity
    // snapshots. scene.terrain's rebuild calls in resume()/sceneRpg.step() are now live (it's set).
    if (scene._chunked) {
      scene.terrain = new TerrainStream(scene.chunks);
      scene.renderer.insert(scene.terrain); // one set of per-chunk VBOs, under everything
      scene.terrain.rebuild(scene.chunks, Infinity); // initial: build every loaded chunk up front
      scene.renderer.insert(
        new RenderChunks(scene.chunks, {
          font: I18n.font("default"),
          ground: false,
        }),
      );
    }
    // Resident layers: the per-layer RenderTileMap passes (real tile sprites — tile16/47/dual,
    // floorTiles) are replaced by ONE sprite-free RenderDebugTileMap that shades cells by nav cost
    // (walls read as filled). _tilePasses stays empty, so BuildMode._markTileDirty no-ops (guarded
    // for an absent pass). Restore: the RpgLevel.LAYERS RenderTileMap loop, keyed into _tilePasses.
    scene._tilePasses = {};
    scene._tilePass = new RenderDebugTileMap(scene.level, {
      cost: true,
      tiles: false,
      alpha: 0.5,
    });
    scene.renderer.insert(scene._tilePass);
    scene._gridPass = new RenderGrid(scene.level); // cell boundary lines
    scene.renderer.insert(scene._gridPass);
    scene.renderer.insert(new RenderZone(scene.level, "buildable"));
    scene.renderer.insert(
      new RenderZoneLabel(scene.level, "buildable", {
        font: I18n.font("default"),
      }),
    );
    // Entities as colored boxes + labels (placeholder — no content sprites). Restore: replace these
    // four with a single `new RenderEntity()` (the production draw_sprite_ext pass) when art lands.
    scene.renderer.insert(new RenderDebugBox());
    scene.renderer.insert(new RenderDebugName());
    scene.renderer.insert(new RenderDebugDirection()); // facing dot (player Direction)
    scene.renderer.insert(new RenderDebugAnimator()); // animator-state label
    // RenderDebugAnimator reads the Demo-layer Animator, so the RPG (not Core's DebugRender)
    // registers its Debug toggle. add() dedupes, so repeated map loads are no-ops.
    DebugRender.add(RenderDebugAnimator, "Anim");
    const bbox = new RenderDebugEntity(); // lime bbox outlines, off until toggled (Debug menu)
    bbox.enabled = false;
    scene.renderer.insert(bbox);
    // Slime A* paths (yellow), off until toggled (Debug menu → paths). Makes the dormant
    // RenderDebugPath pass + that toggle live now that slimes are a PathRequest consumer.
    const paths = new RenderDebugPath(scene.level);
    paths.enabled = false;
    scene.renderer.insert(paths);
    // Entity "active range" rings (turret fire radius + slime aggro/give-up/attack), off until
    // toggled (Debug menu → Ranges). Generic Core pass; the RPG ranges are configured here.
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
    // Weather (tint + rain/snow) just under the day/night tint, so night darkens the rain too.
    // Skipped on indoor maps (meta.indoor) — no open sky inside a cave.
    scene._weather = undefined;
    if (!data.meta.indoor) {
      scene._weather = new RenderWeather();
      scene.renderer.insert(scene._weather);
    }
    // Lighting LAST — a per-frame light map composited over tiles + entities + weather. It absorbs
    // the day/night cycle as its ambient term (white in daylight → night hue when dark) and adds
    // soft blobs for every Light entity, so day/night is "lighting with no lights" and torches/the
    // player's lantern reveal the night, with a cycle-scaled corner vignette for night framing. Its
    // camera is assigned with the others below.
    scene._lighting = new RenderLighting({ ambient: () => WorldClock.tint() });
    scene.renderer.insert(scene._lighting);

    // 10. Follow camera on the (new) player.
    scene.camera = cameraFollow2d({
      world: scene.world,
      followTarget: scene.ctrl.id,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    scene.camera.assign(0);
    // Cull the resident-grid grid pass to the camera view (essential for the chunked map's
    // large home grid; harmless for a small interior). The RenderTileMap passes are VBO-cached
    // (rebuilt only on markDirty), so they need no per-frame camera cull.
    scene._gridPass.camera = scene.camera;
    scene._tilePass.camera = scene.camera; // view-cull the placeholder tile fill (large chunked grid)
    if (scene._weather !== undefined) scene._weather.camera = scene.camera; // weather tint + particles cover the view rect
    scene._lighting.camera = scene.camera; // light map covers the camera view rect

    // The player-centered radar (RadarArrows, drawn in scene.draw) reads world/ctrl live, so it
    // needs no per-map rebuild — nothing to do here for it.

    FloatingText.clear(); // drop combat numbers from the previous map
    ParticleFx.clear(); // drop live particles from the previous map (world coords are map-local)
  },

  // Reclaim ONE map bundle's owned resources (world / level / renderer / camera / chunks). No
  // global input/weather teardown — those are scene-scoped (RpgController.destroy / Weather in
  // sceneRpg.destroy). Used by eviction (_evict) and scene teardown (sceneRpg.destroy). The
  // terrain-stream pass lives inside the renderer, so renderer.destroy() frees its per-chunk VBOs.
  _free(b) {
    if (b.chunks) b.chunks.destroy();
    if (b.camera) b.camera.destroy();
    if (b.renderer) b.renderer.destroy();
    if (b.world) b.world.destroy();
    if (b.level) b.level.destroy();
  },

  // Walk-onto door: travel to the first portal whose BBox the player overlaps. Runs once
  // per frame, after physics (the player is settled). On a hit, go() parks the current map and
  // resumes/builds the target, then we return immediately — this.world has been swapped out.
  checkPortals(scene) {
    const p = AABB.of(scene.world, scene.ctrl.id);
    // Live query every doorway in the world (entities carrying a Portal component) — works for
    // both a chunk-streamed portal and a plain map's, with no stored list to dangle.
    const ids = scene.world.query(Portal);
    for (let i = 0; i < ids.length; i++) {
      const z = AABB.of(scene.world, ids[i]);
      if (p.x2 > z.x1 && p.x1 < z.x2 && p.y2 > z.y1 && p.y1 < z.y2) {
        const portal = scene.world.get(Portal, ids[i]);
        Log.info(`portal → ${portal.toMap} (${portal.toEntry})`);
        RpgMap.go(scene, portal.toMap, portal.toEntry);
        return;
      }
    }
  },

  // Reach-quest zone from a chunked map's authored data (the "reach" spawn). The marker is an
  // origin-area region, not an entity, so it's resolved once here rather than chunk-streamed.
  _authoredReach(scene, data) {
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++)
      if (spawns[i].preset === "reach")
        return RpgSpawn.reachZone(scene.level, spawns[i]);
    return undefined;
  },
};
