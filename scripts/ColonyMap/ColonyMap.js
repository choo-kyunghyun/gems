// Map-graph engine for the colony scene — portal travel, map pool, and persistence.
// Free functions over the scene (composition; GMRT has no usable class inheritance).
/**
 * Visited maps stay ALIVE: the World level pool holds each map's DATA (its Level — grid +
 * entities) and `_parked` below holds the per-map RUNTIME the colony builds over it (renderer,
 * camera, physics, nav, render-pass handles), so a door trip never destroys/rebuilds. Only the
 * SQUAD migrates:
 * every entity sharing the player's Squad id (player included) moves as a WHOLE entity through
 * World.take/put — a portal forces a "wait" member back to "follow" first, so the squad
 * always travels together. There is no per-map player and no carried component subset; kicked/unhired
 * companions are plain map residents. Everything is persistent for the session: a map builds from
 * file exactly ONCE (first visit), then only freezes/thaws — no eviction, cold serialize, or
 * respawn-from-file reconcile. Disk saves are the follow-up seam.
 */
globalThis.ColonyMap = {
  _parked: {}, // mapId -> the park bundle below. The map's DATA is its pooled Level, not this.

  // fields _stash/_restore copy between scene and a parked bundle (excludes scene-shell +
  // per-activate transients reset by _activateReset on each map open). NOT listed: the Level
  // itself (the pool holds it — a resume re-points scene.level at it) and the per-layer tilemap
  // handles (<key>Layer/<key>Type/<key>Types), which _bundleKeys derives from contentTiles.LAYERS so a
  // new LAYERS entry can't silently miss the bundle.
  // (playerId is NOT bundled — it's DERIVED: set on boot spawn/arrival and re-latched per frame
  // from the Playable query, so the bundle never carries a player handle)
  BUNDLE_KEYS: [
    "spawn",
    "entries",
    "_generated",
    "_indoor",
    "colliders",
    "statics",
    "terrainMats",
    "_built",
    "_builtEnts",
    "reachZone",
    "reachDone",
    "nav",
    "physics",
    "renderer",
    "camera",
    "cameraFollow", // the camera's normal control — parks with it, so a resume can put it back
    // NOTE: no "followers"/"playerId" — squad members leave before the park; residents live in the world

    "_tilePasses",
    "_terrainPasses",
    "_tilePass",
    "_gridPass",
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
    // ── PHASE B: enter the target — resume its parked bundle, else build from file ──
    // every resident map is parked at this point (Phase A parked the current one), so a
    // _parked hit is always a full park bundle
    if (ColonyMap._parked[mapId] !== undefined)
      ColonyMap.resume(scene, mapId, entryId, squad);
    else ColonyMap.build(scene, mapId, entryId, squad);
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
    ColonyMap._parked[scene.level.id] = ColonyMap._stash(scene);
  },

  /**
   * Resume a parked map: restore its fields, re-claim the viewport, and land the traveling squad
   * at the entry (the parked store has no player — the squad left through the portal).
   */
  resume(scene, mapId, entryId, squad) {
    scene.level = World.get(mapId); // the pooled data, exactly as it parked
    ColonyMap._restore(scene, ColonyMap._parked[mapId]);
    World.activeId = mapId;
    MotionPlanner.setGrid(scene.nav);
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
    ColonyMap._registerCameraDebug(scene);
    ColonyMap._applyBgm(scene); // crossfade to the resumed map's ambient (indoor ⇄ overworld)
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
   * Full bundle key list: BUNDLE_KEYS + the per-layer handles from contentTiles.LAYERS
   * (<key>Layer/<key>Type, plus <key>Types for a materials-bearing layer). Rebuilt per call
   * (portal-rate, tiny).
   */
  _bundleKeys() {
    const keys = ColonyMap.BUNDLE_KEYS.slice();
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
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
    const keys = ColonyMap._bundleKeys();
    for (let i = 0; i < keys.length; i++) b[keys[i]] = scene[keys[i]];
    return b;
  },
  _restore(scene, b) {
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
    scene._climateZone = 0;
    scene._npcId = -1;
    // nav-rebuild gate (sceneColony.step): force a rebuild on the first frame of a (re)activated map
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
    PathFollow.bind(ColonyMap._terrainCost(scene));
  },

  /**
   * Per-map terrain movement-cost provider ((wx, wy) → cost ≥ 1, Infinity = impassable) feeding
   * NavGrid's route weights and PathFollow's speed pricing. The ground is tile data on every map
   * now — generated biome materials or the authored fill — so this is one grid lookup: the topmost
   * layer's TileType cost, which TileType already normalizes (`pathCost: null` → Infinity).
   */
  _terrainCost(scene) {
    const grid = scene.level.grid;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    return (wx, wy) => grid.costAt(Math.floor(wx / cw), Math.floor(wy / ch));
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
    const loaded = ColonyMap._loadData(mapId, entryId);
    const data = loaded.data;
    mapId = loaded.mapId;
    entryId = loaded.entryId;
    // On a LOAD, SaveGame stashes each saved map's state; consume this map's here (null for a new
    // game / an unvisited map). Its entity export replaces _spawnWorld's fresh spawns; its builds
    // apply after scaffolding.
    const mapState = SaveGame.takePendingMap(mapId);
    // generated maps (meta.generated) build their grid from a seed instead of the file's rects
    scene._generated = data.meta.generated === true;
    // indoor maps (meta.indoor): no sky passes, and the cozy interior BGM below
    scene._indoor = data.meta.indoor === true;
    Log.info(
      `colony map: ${mapId} (entry ${entryId})${scene._generated ? " [generated]" : ""}`,
    );

    const built = ColonyMap._buildWorld(scene, data, mapId, entryId, squad); // the Level (+ player on boot) + zones
    // pool it BEFORE the squad lands — World.put resolves the destination through the pool
    World.add(mapId, scene.level);
    World.activeId = mapId; // building a map activates it (a load boots straight through here)
    ColonyMap._arriveSquad(scene, squad, scene.spawn); // scene.spawn is already entry-resolved
    // build-mode tracking, fresh per first visit (parks with the bundle thereafter). _builtEnts
    // persists on the scene across map swaps (BuildMode.build runs once) — reset explicitly.
    scene._built = {};
    scene._builtEnts = {};
    // residents: a loaded map restores its saved store, everything else spawns fresh
    ColonyMap._spawnWorld(scene, data, built, mapState);
    ColonyMap._activateReset(scene); // per-activate transients (hp track, build mode, climate, inv)
    ColonyMap._buildSpatial(scene); // broadphase + nav window
    ColonyMap._buildRenderer(scene, data); // render pass stack
    ColonyMap._buildCamera(scene, data); // follow camera + view culling + debug
    ColonyMap._applyBgm(scene); // map-appropriate ambient (re-requesting the same track is a no-op)

    FloatingText.clear(); // drop combat numbers + particles from the previous map (map-local coords)
    ParticleFx.clear();

    // a loaded map's builds + claimed zone (after scaffolding, so the tile layers/colliders exist)
    if (mapState !== null) SaveGame.applyMapState(scene, mapState);
  },

  /**
   * Load a map file, falling back to the start map if it's bad. Returns resolved ids + parsed data.
   */
  _loadData(mapId, entryId) {
    const file = ColonyLevel.mapFile(mapId);
    let data = LevelSerializer.load(file, { genre: "topdown" });
    if (data === null) {
      Log.error(
        `map "${mapId}" (${file}) failed — falling back to ${ColonyLevel.START}`,
      );
      mapId = ColonyLevel.START;
      entryId = "default";
      data = LevelSerializer.load(ColonyLevel.mapFile(mapId), {
        genre: "topdown",
      });
    }
    return { data, mapId, entryId };
  },

  /**
   * Entity store + LevelGrid + the settlement/climate zone channels. The player spawns here ONLY on boot
   * (squad === null) — portal arrivals transfer the whole player entity in via _arriveSquad,
   * which re-latches scene.playerId. Returns ColonyLevel's built handles, which the caller threads on
   * to _spawnWorld. A generated map is fully resident (scatter entities + terrain/wall colliders all
   * live at once), so its cap scales with the grid rather than sitting at the authored-map default.
   */
  _buildWorld(scene, data, mapId, entryId, squad) {
    scene.level = new Level({
      id: mapId,
      capacity: scene._generated
        ? Math.max(1024, Math.ceil((data.cols * data.rows) / 4))
        : 256,
    });
    const built = ColonyLevel.build(scene.level.entities, data, entryId);
    scene.level.grid = built.grid;
    scene.spawn = built.spawn; // for player respawn on death
    scene.entries = ColonyMap._entryTable(scene.level.grid, data); // named entries → world coords (resume)
    // tilemap handles (render passes + build mode) — one Layer/Type pair per LAYERS entry,
    // plus <key>Types for a materials-bearing layer (wall). Bundled via _bundleKeys.
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const key = contentTiles.LAYERS[i].key;
      scene[key + "Layer"] = built[key + "Layer"];
      scene[key + "Type"] = built[key + "Type"];
      if (built[key + "Types"] !== undefined)
        scene[key + "Types"] = built[key + "Types"];
    }
    scene.colliders = built.colliders; // the wall layer's — BuildMode remeshes exactly these
    // level-geometry colliders that are NOT the wall layer's (impassable terrain, the level edge):
    // held apart so a build-mode remesh can't free them, and excluded from the save (they rebuild)
    scene.statics = built.statics;
    scene.terrainMats = built.terrainMats; // generated maps only — the stacked ground passes' table
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
    // persistence import so it round-trips like the settlement channel.
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
    return built;
  },

  /**
   * The level's residents, all live at once — a map is fully simulated for its lifetime. Two
   * sources, one adapter (ColonySpawn.spawnEntity): a LOADED map replays its saved store (so a killed
   * mob stays dead and dropped loot stays dropped — its ground already came back from the file or
   * the seed), and a FRESH one spawns the descriptors its build handed back — the file's, the
   * generator's, or both merged, since the builder resolves that. The scene reads NPC/portal/enemy/
   * companion handles LIVE by component query — stored id lists would dangle across a map swap.
   */
  _spawnWorld(scene, data, built, mapState) {
    const entities = scene.level.entities;
    const grid = scene.level.grid;
    if (mapState !== null) {
      const n = SaveGame.restoreResidents(entities, mapState);
      Log.info(`ColonyMap: restored ${n} saved resident(s)`);
    } else {
      for (let i = 0; i < built.spawns.length; i++)
        ColonySpawn.spawnEntity(entities, grid, built.spawns[i]);
    }
    // A region, not an entity, so it is read straight off the file on every path.
    scene.reachZone = ColonyMap._fileReach(scene, data);
    scene.reachDone = scene.reachZone === undefined; // nothing to reach on this map
    scene._npcId = -1; // resolved live each frame by _updateNpc (nearest "npc" in range)
  },

  /**
   * The map's two spatial indexes: the store's broadphase + the pathfinding nav window.
   * NavGrid.size() is constant, so MotionPlanner.setGrid runs once here per map
   * (sceneColony.step rebuilds occupancy around the player each frame).
   */
  _buildSpatial(scene) {
    // O(n) broadphase for SeparationSystem + TriggerSystem (each rebuilds it per tick). It removes
    // TriggerSystem's O(n²) sweep over every collider, which is what makes a whole map's worth of
    // residents affordable in one store. cellSize (48px) exceeds max dynamic-body / non-solid sensor
    // diameter (~16-24px at 16px cells); huge SOLID colliders (level border, water rects) are exempt
    // — TriggerSystem skips solid-vs-solid and SeparationSystem buckets dynamic bodies only. Rides
    // with the store, so a parked map keeps it across a resume; rebuilt per cold build.
    // NOTE: this shared grid serves the DYNAMIC symmetric pair problem (mob↔mob, mob↔sensor).
    // SolidSystem's asymmetric body-vs-static query uses its OWN static grid (SolidSystem._gridRebuild)
    // — a different query shape (range query, multi-cell statics), so it can't reuse this instance.
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
      ColonyMap._terrainCost(scene), // weight routes by terrain (wade only when it beats going around)
    );
    MotionPlanner.setGrid(scene.nav);
  },

  /**
   * Assemble the renderer pass stack (ground → tiles → zones → shadows → entities → debug →
   * weather → lighting).
   *
   * The GROUND is the terrain layer either way — the difference is only how many passes read it. A
   * generated map's biome materials stack as one dual-grid pass per material, lowest first, each
   * taking the cells whose TileType id reaches its threshold: an upper material's transparent
   * corners reveal the one below, which is the A-over-B transition the sets are drawn for. Because
   * the stack is cumulative, `skipAbove` drops the quads the next material covers whole — without it
   * every material would draw its full extent under the ones above.
   */
  _buildRenderer(scene, data) {
    const pitch = ColonyMap.BB_PITCH;
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
        const pass = new RenderTileMap(scene.terrainLayer, scene.level.grid, spr, {
          autotile: "dual",
          minId: mats[i].type.id,
          skipAbove: i < mats.length - 1 ? mats[i + 1].type.id : undefined,
          variants: true, // weighted full-tile picks so a wide field doesn't tile visibly
        });
        scene._terrainPasses.push(pass);
        scene.renderer.insert(pass);
      }
    // Resident tile layers (terrain/floor/fence) as real tilemaps — bottom→top per
    // contentTiles.LAYERS; the wall layer joins below as the lit RenderWalls pass on pitched maps
    // (flat fallback keeps its "corner" RenderTileMap). VBO-cached + keyed by layer so a
    // BuildMode edit markDirty's the matching pass. A generated map holds the floor/fence layers
    // EMPTY until the player builds — an empty layer emits no quads, so they are free there.
    scene._tilePasses = {};
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.key === "wall" && pitch > 0) continue; // RenderWalls (lit boxes) below
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
      const tileKeys = Object.keys(scene._tilePasses);
      for (let i = 0; i < tileKeys.length; i++)
        scene._tilePasses[tileKeys[i]].lights = scene._meshPass;
      // WALLS category (art projection contract): the resident wall layer as lit boxes
      // (top + exposed south faces) in the same depth pool, sharing the mesh pass's
      // sun + culled point lights. Keyed into _tilePasses so BuildMode's edit
      // markDirty reaches it (the flat "corner" autotile config stays for the editor).
      // ONE pass covers every wall on the map — the file's, the generator's, and the player's all
      // paint the same layer. PER-CELL MATERIALS from the wall cfg (near-white face texture × tint
      // per material, bucketed by TileType id — see RenderWalls); materials[0] (brick) doubles as
      // the default bucket for file and generated walls.
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
      scene._tilePasses.wall = new RenderWalls(scene.level.grid, scene.wallLayer, {
        color: wallMats[0].color,
        sprite: wallMats[0].sprite,
        frame: 0,
        lights: scene._meshPass,
        materials: wallMats,
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
    const pitch = ColonyMap.BB_PITCH;
    const baseZoom = pitch > 0 ? 1.75 : 1;
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
      zoomMax: baseZoom * 1.5, // modest zoom-in headroom
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
    scene._lighting.camera = scene.camera;
    // (sprites are UPRIGHT constants now — the entity pass no longer tracks camera pitch)
    if (scene._meshPass !== undefined) scene._meshPass.camera = scene.camera;
    ColonyMap._registerCameraDebug(scene); // Debug/ImGui live camera controls (pitch/zoom)
  },

  /**
   * Register the Debug "Camera" section bound to the LIVE scene camera (pitch + zoom) for runtime
   * render inspection. Re-added on each build/resume (Debug.add replaces by name) so the sliders
   * drive the ACTIVE map's camera. colony-owned (pitch is a Game concern).
   */
  _registerCameraDebug(scene) {
    const cam = scene.camera;
    const follow = scene.cameraFollow;
    if (cam === undefined || follow === undefined) return;
    // A map can park while free cam is flying. This section is rebuilt with a FRESH fly control, so
    // put the follow control back rather than leave the camera on an orphaned one.
    if (cam.control !== follow) cam.setControl(follow);
    const fly = new CameraFly();
    Debug.add({
      name: "Camera",
      scoped: true, // bound to THIS scene's camera — Game drops it at the scene boundary
      // pitchCurve and freeCam are computed toggles — staged (contract: Debug); the plain
      // control fields below ref live, two-way
      build() {
        // pitch is normally the zoom curve's — uncheck to hand-tune with the slider below
        Debug.checkbox(
          "Pitch by zoom",
          () => follow.pitchCurve !== undefined,
          (v) => (follow.pitchCurve = v ? ColonyMap._pitchCurve : undefined),
        );
        dbg_slider(ref_create(follow, "pitchDeg"), 0, 85, "Pitch (deg)", 1);
        dbg_slider(ref_create(follow, "zoomTarget"), 0.5, 4, "Zoom", 0.1);
        // 6DOF free-fly noclip camera (on Time.raw so it works while the sim is paused) — detach
        // from the player to inspect the render from any angle. Swaps in the perspective control.
        // setControl (never a bare assignment) runs the incoming control's enter() seed, which is
        // what makes the fly camera pick up the live view instead of a stale pose.
        Debug.checkbox(
          "Free cam (WASD/RMB)",
          () => cam.control === fly,
          (v) => cam.setControl(v ? fly : follow),
        );
        dbg_slider(ref_create(fly, "speed"), 60, 2400, "Fly speed", 10);
        dbg_button("Recenter on player", () => {
          if (follow.entities === undefined) return;
          const pos = follow.entities.get(follow.targetId(), Position);
          if (pos !== undefined) {
            cam.toX = pos.x;
            cam.toY = pos.y;
          }
        });
        Debug.watch("Zoom (live)", () => follow.zoom);
        Debug.watch("Pitch (rad)", () => cam.pitch);
      },
    });
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
   * Walk-onto door: travel to the first portal the player overlaps. Runs after physics; on a hit,
   * go() swaps the store out so we return immediately.
   */
  checkPortals(scene) {
    const p = AABB.of(scene.level.entities, scene.playerId);
    // live query every doorway (Portal component) — no stored list to dangle across a map swap
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
    const portal = scene.level.entities.get(over, Portal);
    Log.info(`portal → ${portal.toMap} (${portal.toEntry})`);
    ColonyMap.go(scene, portal.toMap, portal.toEntry);
  },

  /**
   * Reach-quest zone from the level file's "reach" spawn (undefined when the map has no marker).
   * A region, not an entity — so it is resolved from the file rather than spawned, which is also
   * what makes it come back on a load without being saved.
   */
  _fileReach(scene, data) {
    const spawns = data.spawns ?? [];
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
// Shared with the Debug Camera section's "Pitch by zoom" toggle.
ColonyMap._pitchCurve = (z) => 42 + 16 * clamp((z - 1.25) / 1.375, 0, 1);
