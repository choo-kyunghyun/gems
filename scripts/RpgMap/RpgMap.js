// Map-graph engine for the RPG scene — the world-loading, teardown, persistence-cache, and
// portal-travel half of sceneRpg, extracted as free functions taking the scene (composition;
// GMRT has no usable class inheritance — same pattern as RpgScene). The scene owns the fields
// these read/write (world, level, ctrl, followers, renderer, camera, _mapCache, _built/_builtEnts, _gone,
// physics, _tilePasses/_gridPass, etc.); RpgMap just orchestrates building/tearing them down.
//
// Maps are discrete level files connected by portals (not one streamed world — the deliberate
// fit for the JSON.parse-on-large-files limit and the one-World-per-scene model). A chunked map
// (meta.chunked) streams its terrain + entities around the player via a ChunkManager; a plain map
// builds everything up front. Persistent maps (meta.persistent, default true) cache their player
// edits (built tiles + claimed zone) + stationed companions so a door trip can't wipe a base.
globalThis.RpgMap = {
  // Build (or rebuild) the live map. Tears down the previous map, carries the player's
  // character sheet across the swap, then constructs the world / level / player / renderer /
  // camera for `mapId`, spawning the player at the named `entryId`. Called from the scene's
  // create() (first map) and from checkPortals() when the player walks through a door.
  load(scene, mapId, entryId) {
    // 1. Carry the player's character sheet across (null on first load). World.destroy() only
    //    drops storage references, so these component objects stay valid to re-attach.
    let carry = null;
    let travelers = []; // "follow" companions captured to re-spawn in the new map (party scope)
    if (scene.ctrl !== undefined) {
      // The player's character sheet travels with the party (it's party member 0). Capture
      // just the sheet components — NOT Position/Visual/Collision/Animator, which the
      // controller rebuilds fresh in the new map. Equip mods are baked into the carried Stats.
      carry = EntitySnapshot.capture(scene.world, scene.ctrl.id, [
        Stats,
        Health,
        Stamina,
        Inventory,
        Equipment,
        Encumbrance,
      ]);
      // Partition the followers: a "follow" companion travels with us (re-spawned near the new
      // entry below); a "wait" companion is stationed in THIS map (map scope) and rides in its
      // persistence cache, re-spawned where it was left when the player returns.
      const stationed = [];
      for (let i = 0; i < scene.followers.length; i++) {
        const fid = scene.followers[i];
        const f = scene.world.get(Follower, fid);
        if (f === undefined) continue;
        const snap = EntitySnapshot.capture(scene.world, fid);
        if (f.state === "follow") travelers.push(snap);
        else stationed.push(snap);
      }
      // Built ENTITIES (placed furniture/stations) are scene-tracked, not chunk-managed, so
      // they live in the World until teardown — capture each as a snapshot keyed by its cell +
      // catalog item id, so the map cache restores it (with its contents, e.g. a stocked chest)
      // on revisit. Built TILES ride along in Level.export below.
      const builtEnts = [];
      for (const key in scene._builtEnts) {
        const e = scene._builtEnts[key];
        if (e === undefined || !scene.world.isValid(e.ent)) continue;
        builtEnts.push({
          key,
          itemId: e.itemId,
          snap: EntitySnapshot.capture(scene.world, e.ent),
        });
      }
      // Cache the OUTGOING map's player edits if it's persistent (the default) so they're
      // restored on revisit instead of rebuilt fresh — the claimed buildable zone + built tiles
      // (Level.export captures both as a detached snapshot that survives the destroy below),
      // the built entities, and the stationed companions. Captured before teardown.
      if (scene._mapPersistent && scene.mapId !== undefined) {
        scene._mapCache[scene.mapId] = {
          level: scene.level.export(),
          built: { ...scene._built },
          builtEnts,
          entities: stationed,
          gone: scene._gone, // uids removed this map → not re-spawned (file-scope reconcile)
        };
      }
      RpgMap.teardown(scene);
    }

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
    scene._hpTrack = {}; // id → last-seen Health.hp, for floating combat numbers
    scene._buildActive = false;
    BuildMode.active = false;
    scene.nearNpc = false;
    scene._climateZone = 0; // climate-zone id the player is in (0 = none); _updateClimate tracks it
    // If the inventory window is open across the swap, refresh its body against the new world
    // next frame (its labels already read scene.world live, so this frame's draw is safe).
    if (scene.invOpen) scene._invDirty = true;

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

    // 8. Pipeline: AI decides velocity → resolve paths → collide → triggers (pickups) →
    //    projectiles → expire. PathfindingSystem resolves the PathRequests SlimeAI queues this
    //    tick (over scene.nav) into PathResponses the slime follows next tick.
    scene.physics = new Pipeline()
      .add(StateSystem) // drives the slime Idle/Chase/Attack schemas
      .add(PathfindingSystem) // slime PathRequest → PathResponse over scene.nav
      .add(SolidSystem)
      .add(TriggerSystem)
      .add(TurretSystem) // built turrets auto-fire at the nearest hostile (before bullets move)
      .add(ProjectileSystem)
      .add(LifetimeSystem);

    // 9. Renderer: one RenderTileMap (real sprites) per resident layer — terrain (dual-grid),
    //    floor (single), wall (blob47), fence (blob16) — from the RpgLevel.LAYERS config (swap
    //    type/sprite/color there to re-skin), then grid lines + the buildable-zone overlay; all
    //    world-space, drawn UNDER the entities. Entities are colored boxes (Visual.color) + Name
    //    labels (RenderDebugBox/Name), lime bbox overlay on top (GMRT can't render the SVG
    //    character sprites — still unsupported on 0.20).
    scene.renderer = new Renderer();
    // Chunk-streamed terrain draws UNDER everything; the resident-grid passes below then draw
    // player builds + zones on top. The streamed ground is the windowed dual-grid TerrainStream
    // (value-noise biomes) inserted FIRST, then RenderChunks for walls + frozen-entity snapshots
    // (its own ground checker off — terrain replaces it).
    if (scene._chunked) {
      scene.terrain = new TerrainStream(scene.chunks);
      for (let i = 0; i < scene.terrain.passes.length; i++)
        scene.renderer.insert(scene.terrain.passes[i]);
      scene.terrain.rebuild(scene.chunks); // initial stamp (chunks.update already ran in step 5)
      scene.renderer.insert(
        new RenderChunks(scene.chunks, {
          font: I18n.font("default"),
          ground: false,
        }),
      );
    }
    // Tile passes are VBO-cached and start dirty, so this first build reflects whatever the
    // layers hold now (incl. the persistence import in step 4b); runtime build-mode edits
    // markDirty the matching pass (see BuildMode). Keyed by layer for that lookup.
    scene._tilePasses = {};
    for (let i = 0; i < RpgLevel.LAYERS.length; i++) {
      const cfg = RpgLevel.LAYERS[i];
      const spr = asset_get_index(cfg.sprite);
      if (!sprite_exists(spr)) {
        Log.warn(`tile sprite missing: ${cfg.sprite}`); // GMRT: validate via sprite_exists, not >=0
        continue;
      }
      const pass = new RenderTileMap(
        scene[cfg.key + "Layer"],
        scene.level,
        spr,
        {
          autotile: cfg.type,
          color: Color.parse(cfg.color),
        },
      );
      scene.renderer.insert(pass);
      scene._tilePasses[cfg.key] = pass;
    }
    scene._gridPass = new RenderGrid(scene.level); // cell boundary lines
    scene.renderer.insert(scene._gridPass);
    scene.renderer.insert(new RenderZone(scene.level, "buildable"));
    scene.renderer.insert(
      new RenderZoneLabel(scene.level, "buildable", {
        font: I18n.font("default"),
      }),
    );
    scene.renderer.insert(new RenderDebugBox());
    scene.renderer.insert(new RenderDebugName());
    scene.renderer.insert(new RenderDebugDirection()); // facing dot (player Direction)
    scene.renderer.insert(new RenderDebugAnimator()); // animator-state label
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
          component: Turret,
          field: "range",
          color: make_colour_rgb(255, 150, 60),
        },
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
    // player's lantern reveal the night. Replaces the flat RenderDayNight tint (now unused by the
    // RPG scene). Its camera is assigned with the others below.
    scene._lighting = new RenderLighting();
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
    if (scene._weather !== undefined) scene._weather.camera = scene.camera; // weather tint + particles cover the view rect
    scene._lighting.camera = scene.camera; // light map covers the camera view rect

    // The player-centered radar (RadarArrows, drawn in scene.draw) reads world/ctrl live, so it
    // needs no per-map rebuild — nothing to do here for it.

    FloatingText.clear(); // drop combat numbers from the previous map
    ParticleFx.clear(); // drop live particles from the previous map (world coords are map-local)
  },

  // Release the current map's resources (world / level / renderer / camera / controller),
  // leaving the persistent UI in place. Mirrors teardownScene's order, minus the UI.
  teardown(scene) {
    RpgController.destroy();
    Weather.exitRegion(); // leave any climate region (the new map re-detects on its first step)
    // Drop the chunk streamer (its entities/colliders die with the world below); clearing the
    // ref means the next map's step() skips chunk streaming until a chunked map sets it again.
    if (scene.chunks) {
      scene.chunks.destroy();
      scene.chunks = undefined;
    }
    // The windowed terrain layers (its RenderTileMap passes are freed by renderer.destroy below).
    if (scene.terrain) {
      scene.terrain.destroy();
      scene.terrain = undefined;
    }
    scene.source = undefined;
    scene.nav = undefined; // the next load() rebuilds it + re-points MotionPlanner
    if (scene.camera) scene.camera.destroy();
    if (scene.renderer) scene.renderer.destroy();
    if (scene.world) scene.world.destroy();
    if (scene.level) scene.level.destroy();
  },

  // Walk-onto door: travel to the first portal whose BBox the player overlaps. Runs once
  // per frame, after physics (the player is settled). On a hit, load() rebuilds everything
  // and we return immediately — the old world is gone.
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
        RpgMap.load(scene, portal.toMap, portal.toEntry);
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
