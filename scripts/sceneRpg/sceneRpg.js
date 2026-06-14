const RPG_NPC_RADIUS = 60; // interact range to the elder NPC

// Exposed as a factory so another scene (the level editor's Test Play) can open this scene
// directly; SceneRegistry.add uses the SAME reference so SceneManager._apply resolves its label.
globalThis.SceneRpg = () => new _SceneRpgClass();
SceneRegistry.add(SceneRpg, {
  label: I18n.textRef("RPG_NAME"),
  category: "SCENE_CAT_RPG",
});

class _SceneRpgClass extends Scene {
  label = "RPG";

  create() {
    // ── Persistence + content (load before building anything) ──────────────
    SaveData.load();
    RpgQuests.register();
    Profile.load();
    Achievement.load();
    QuestLog.reset();
    QuestLog.accept(RpgQuests.QUEST_GATHER); // collect — tracked passively
    QuestLog.accept(RpgQuests.QUEST_REACH); // reach — tracked passively

    // ── Map-state cache: mapId → { level: Level.export(), built } of a persistent map's
    //    player edits, saved on leave + restored on revisit by loadMap. In-memory for the
    //    play session (a future save would serialize this alongside the character sheet). ──
    this._mapCache = {};

    // ── Overlay / interaction state (scene-wide — survives map changes) ─────
    this.invOpen = false;
    this._invDirty = false; // rebuild the inventory window body next step when set
    this.nearNpc = false;
    this.dialogueName = "";
    this.dialogueLine = "";
    this.dialogueAction = "";

    // ── SystemMenu overlay owns pause + exit (Esc / Start / F1) and suspends menu nav
    // while playing. Flag it (a subclass field initializer wouldn't run on GMRT). ─────
    this.gameplay = true;

    // ── Persistent UI (built once). These widgets read this.world / this.ctrl LIVE each
    //    frame, so they keep working after loadMap() swaps the world on a map change. The
    //    corner minimap is the exception — gemsMinimap captures world/target by value, so
    //    loadMap() rebuilds it (_buildMinimap). Hint, then manager-drawn panels: HUD +
    //    quest tracker (top-right), NPC dialogue (bottom-center, toggled), inventory window,
    //    station prompt/storage/crafting windows, build-mode HUD. ──────────────────────────
    this.ui = gemsRoot();
    UI.insert(this.ui);
    this.ui.insertChild(
      gemsLabel(I18n.textRef("RPG_HINT"), { color: "#888888" }),
    );
    this._buildHud();
    this._buildDialogue();
    RpgInventoryUI.build(this);
    Interactable.build(this); // station prompt + storage + crafting windows
    BuildMode.build(this); // grid build mode (HUD + per-scene state)

    // ── World graph boot: a normal launch starts at the overworld hub; the editor's Test
    //    Play overrides with a single playtest file (registered under a synthetic id — it
    //    has no portals, so the door system stays inert there). loadMap() builds the world,
    //    level, player, renderer, camera, and minimap. ─────────────────────────────────────
    let bootMap = RpgLevel.START;
    if (RpgLevel.playtestFile !== undefined) {
      RpgLevel.MAPS._playtest = RpgLevel.playtestFile;
      RpgLevel.playtestFile = undefined;
      bootMap = "_playtest";
    }
    this.loadMap(bootMap, "default");

    // Seed one starting companion into the party (programmatic, not file-authored — so
    // reloading a persistent map never re-creates it; from here the travel/station persistence
    // in loadMap owns it). create() runs once per scene, so this seeds exactly once.
    const pp = this.world.get(Position, this.ctrl.id);
    this.followers.push(
      RpgLevel.spawnFollower(this.world, pp.x - 28, pp.y + 22, {
        label: "Companion",
      }),
    );

    // The scene takes over gameplay input: push its base context. step() replaces it each
    // frame via _resolveContext; destroy() resets to "default" for the next scene.
    InputContext.push("play");

    Log.info(
      `RPG ready — items=${Item.all().length} quests=${QuestLog.defOrder.length} ` +
        `achievements=${Achievement.all().length} kills(saved)=${Profile.get("enemiesKilled")}`,
    );
  }

  // Build (or rebuild) the live map. Tears down the previous map, carries the player's
  // character sheet across the swap, then constructs the world / level / player / renderer /
  // camera for `mapId`, spawning the player at the named `entryId`. Called from create()
  // (first map) and from _checkPortals() when the player walks through a door.
  loadMap(mapId, entryId) {
    // 1. Carry the player's character sheet across (null on first load). World.destroy() only
    //    drops storage references, so these component objects stay valid to re-attach.
    let carry = null;
    let travelers = []; // "follow" companions captured to re-spawn in the new map (party scope)
    if (this.ctrl !== undefined) {
      // The player's character sheet travels with the party (it's party member 0). Capture
      // just the sheet components — NOT Position/Visual/Collision/Animator, which the
      // controller rebuilds fresh in the new map. Equip mods are baked into the carried Stats.
      carry = EntitySnapshot.capture(this.world, this.ctrl.id, [
        Stats,
        Health,
        Inventory,
        Equipment,
        Encumbrance,
      ]);
      // Partition the followers: a "follow" companion travels with us (re-spawned near the new
      // entry below); a "wait" companion is stationed in THIS map (map scope) and rides in its
      // persistence cache, re-spawned where it was left when the player returns.
      const stationed = [];
      for (let i = 0; i < this.followers.length; i++) {
        const fid = this.followers[i];
        const f = this.world.get(Follower, fid);
        if (f === undefined) continue;
        const snap = EntitySnapshot.capture(this.world, fid);
        if (f.state === "follow") travelers.push(snap);
        else stationed.push(snap);
      }
      // Cache the OUTGOING map's player edits if it's persistent (the default) so they're
      // restored on revisit instead of rebuilt fresh — the claimed buildable zone + built tiles
      // (Level.export captures both as a detached snapshot that survives the destroy below) and
      // the stationed companions. Captured before _teardownMap (which destroys the level).
      if (this._mapPersistent && this.mapId !== undefined) {
        this._mapCache[this.mapId] = {
          level: this.level.export(),
          built: { ...this._built },
          entities: stationed,
          gone: this._gone, // uids removed this map → not re-spawned (file-scope reconcile)
        };
      }
      this._teardownMap();
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
    this.mapId = mapId;
    // A chunked map streams its terrain + entities around the player (overworld); a plain map
    // builds everything up front (interiors). Branches below key off this.
    this._chunked = data.meta.chunked === true;
    // Persistent (default true): the map's player edits are cached on leave + restored on
    // revisit (see step 1 and 4b). Set `meta.persistent: false` in a level file to opt out
    // (e.g. a dungeon that should reset each entry).
    this._mapPersistent = data.meta.persistent !== false;
    Log.info(
      `RPG map: ${mapId} (entry ${entryId})${this._chunked ? " [chunked]" : ""}`,
    );

    // 3. World + level + player. A chunked map needs a bigger entity cap (a window of chunks'
    //    worth of entities + colliders + transient drops) and an empty resident grid (player
    //    builds only); a plain map sizes the grid from the file's cols/rows.
    this.world = new World(this._chunked ? 1024 : 256, 60);
    const built = this._chunked
      ? RpgLevel.buildChunked(this.world, data, entryId)
      : RpgLevel.build(this.world, data, entryId);
    this.level = built.level;
    this.spawn = built.spawn; // remembered for player respawn on death
    this.wallLayer = built.wallLayer; // tilemap handles for build mode
    this.floorLayer = built.floorLayer;
    this.wallType = built.wallType;
    this.floorType = built.floorType;
    this.colliders = built.colliders;
    this.ctrl = RpgController.create(this.world, built.spawn);

    // Re-attach the carried character sheet onto the new player entity (no re-equip pass —
    // equip mods are already baked into the carried Stats).
    if (carry !== null) EntitySnapshot.apply(this.world, this.ctrl.id, carry);

    // 4. Buildable zone channel (one per map) — the Claim Post paints into it; build mode
    //    only allows placement inside it; RenderZone visualizes the claimed area.
    const bmap = this.level.addZoneMap("buildable");
    this.buildZoneId = bmap.define({
      name: I18n.text("BUILD_ZONE"),
      tags: ["buildable"],
      data: { color: "#55aa55" },
    }).id;

    // 4b. Restore a persistent map's player edits on revisit. Level.import overlays the
    //     cached TileLayers + buildable ZoneMap onto the freshly built level (same dims/layer
    //     order, so it round-trips; the cached buildable zone keeps id 1, matching the define
    //     above). Re-mesh wall colliders from the restored layer, and bring back the
    //     deconstruct tracking so built tiles stay removable. No cache → fresh _built.
    const saved = this._mapCache[mapId];
    if (saved !== undefined) {
      this.level.import(saved.level); // also syncs nav (Level.import → syncAll)
      TileEdit.remesh(this.world, this.level, this.wallLayer, this.colliders);
      this._built = { ...saved.built };
    } else {
      this._built = {}; // player-built deconstructable cells, fresh on first visit
    }
    // File-scope reconcile ledger for THIS map: uids of unique entities removed during play.
    // Loaded from the cache (persists across revisits), passed to RpgLevel.spawn below to skip
    // their file spawns, and written back on leave. Empty on a first visit / non-persistent map.
    this._gone =
      saved !== undefined && saved.gone !== undefined ? saved.gone : {};

    // 5. Entities. A chunked map STREAMS them via the ChunkManager (authored hub + procedural
    //    wilderness, windowed around the player); a plain map spawns them all up front. Either
    //    way the scene reads NPC / portal / enemy handles LIVE by tag (Query / world.query), so
    //    no stored id lists are kept here — they'd dangle as chunks stream in and out.
    if (this._chunked) {
      this.source = new ChunkSource({
        seed: data.meta.seed ?? 1337,
        chunkCols: data.meta.chunkCols ?? 16,
        chunkRows: data.meta.chunkRows ?? 16,
        authored: data, // hand-built hub overlaid onto its chunks; procedural elsewhere
      });
      this.chunks = new ChunkManager(this.world, this.level, this.source, {
        chunkCols: data.meta.chunkCols ?? 16,
        chunkRows: data.meta.chunkRows ?? 16,
        simRadius: 1,
        loadRadius: 2,
        playerId: this.ctrl.id,
      });
      const sp = this.world.get(Position, this.ctrl.id);
      this.chunks.update(sp.x, sp.y); // populate the rings around the spawn
      this.reachZone = this._authoredReach(data); // origin-area quest zone (not chunk-managed)
      this.followers = [];
    } else {
      const ents = RpgLevel.spawn(this.world, this.level, data, this.ctrl.id, {
        gone: this._gone, // file-scope reconcile (unique entities removed on a prior visit)
      });
      this.reachZone = ents.reach; // undefined when the map has no reach marker
      this.followers = ents.followers; // this map's file-spawned companions
    }
    this.reachDone = this.reachZone === undefined; // nothing to reach on this map
    this._npcId = -1; // resolved live each frame by _updateNpc (nearest "npc" in range)

    // Companions (continued): the traveling party re-spawned around the player's entry (fresh
    // Position/Velocity so they don't keep old-map coords), then this map's cached stationed
    // companions (restored where they were left — full snapshot).
    const ep = this.world.get(Position, this.ctrl.id);
    for (let i = 0; i < travelers.length; i++)
      this.followers.push(
        EntitySnapshot.restore(this.world, travelers[i], {
          [Position]: { x: ep.x - 24 - i * 22, y: ep.y + 24, z: 0 },
          [Velocity]: { x: 0, y: 0, z: 0 },
        }),
      );
    if (saved !== undefined && saved.entities !== undefined)
      for (let i = 0; i < saved.entities.length; i++)
        this.followers.push(
          EntitySnapshot.restore(this.world, saved.entities[i]),
        );

    // 6. Per-map resets (old ids belonged to the previous map; _built handled in 4b).
    this._hpTrack = {}; // id → last-seen Health.hp, for floating combat numbers
    this._buildActive = false;
    BuildMode.active = false;
    this.nearNpc = false;
    // If the inventory window is open across the swap, refresh its body against the new world
    // next frame (its labels already read scene.world live, so this frame's draw is safe).
    if (this.invOpen) this._invDirty = true;

    // 7. Pipeline: AI decides velocity → collide → detect triggers (pickups) → projectiles
    //    → expire.
    this.physics = new Pipeline()
      .add(StateSystem) // drives the slime Idle/Chase/Attack schemas
      .add(SolidSystem)
      .add(TriggerSystem)
      .add(ProjectileSystem)
      .add(LifetimeSystem);

    // 8. Renderer: tilemap (walls + built floors) via the debug pass — grid lines, cost
    //    shading (walls red), tile id/name labels — then the buildable-zone overlay; both
    //    world-space, drawn UNDER the entities. Entities are colored boxes (Visual.color) +
    //    Name labels (RenderDebugBox/Name), lime bbox overlay on top (GMRT 0.19 can't render
    //    the SVG character sprites).
    this.renderer = new Renderer();
    // Chunk-streamed terrain (ground checker + walls + frozen-entity snapshots) draws UNDER
    // everything; the resident-grid passes below then draw player builds + zones on top.
    if (this._chunked)
      this.renderer.insert(
        new RenderChunks(this.chunks, { font: I18n.font("default") }),
      );
    this._tilePass = new RenderDebugTileMap(this.level, {
      names: true,
      coords: false,
      font: I18n.font("default"),
    });
    this.renderer.insert(this._tilePass);
    this._gridPass = new RenderGrid(this.level); // cell boundary lines
    this.renderer.insert(this._gridPass);
    this.renderer.insert(new RenderZone(this.level, "buildable"));
    this.renderer.insert(
      new RenderZoneLabel(this.level, "buildable", {
        font: I18n.font("default"),
      }),
    );
    this.renderer.insert(new RenderDebugBox());
    this.renderer.insert(new RenderDebugName());
    const bbox = new RenderDebugEntity(); // lime bbox outlines, off until toggled (Debug menu)
    bbox.enabled = false;
    this.renderer.insert(bbox);

    // 9. Follow camera on the (new) player.
    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.ctrl.id,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    this.camera.assign(0);
    // Cull the resident-grid tile/grid passes to the camera view (essential for the chunked
    // map's large home grid; harmless for a small interior).
    this._tilePass.camera = this.camera;
    this._gridPass.camera = this.camera;

    // 10. Corner minimap — rebuilt per map (captures world/target by value).
    this._buildMinimap();

    FloatingText.clear(); // drop combat numbers from the previous map
  }

  // Release the current map's resources (world / level / renderer / camera / controller),
  // leaving the persistent UI in place. Mirrors teardownScene's order, minus the UI.
  _teardownMap() {
    RpgController.destroy();
    // Drop the chunk streamer (its entities/colliders die with the world below); clearing the
    // ref means the next map's step() skips chunk streaming until a chunked map sets it again.
    if (this.chunks) {
      this.chunks.destroy();
      this.chunks = undefined;
    }
    this.source = undefined;
    if (this.camera) this.camera.destroy();
    if (this.renderer) this.renderer.destroy();
    if (this.world) this.world.destroy();
    if (this.level) this.level.destroy();
  }

  // (Re)build the bottom-right minimap: a framed radar of nearby slimes (red), the NPC
  // (gold), and doors (violet) around the player marker. gemsMinimap captures world/target
  // by value, so it's rebuilt whenever loadMap() creates a new world; old wrapper removed
  // first. Absolute-positioned so it floats over the scene instead of stacking in the column.
  _buildMinimap() {
    if (this._miniWrap !== undefined) this._miniWrap.destroy(); // self-removes from this.ui
    const miniWrap = new UIElement({
      positionType: "absolute",
      bottom: 16,
      right: 16,
      width: 150,
      height: 150,
    });
    miniWrap.insertChild(
      gemsMinimap({
        world: this.world,
        target: this.ctrl.id,
        range: 460,
        size: 150,
        rules: [
          { tag: "enemy", color: "#e0584f" },
          { tag: "npc", color: "#ffd166" },
          { tag: "portal", color: "#9b8cff" },
          { tag: "follower", color: "#6fd0a0" },
        ],
      }),
    );
    this._miniWrap = miniWrap;
    this.ui.insertChild(miniWrap);
  }

  step() {
    // No pause gate — obj_game skips scene.step() while the SystemMenu is open.

    // Edge-triggered toggle — sampled once per frame, outside the tick loop. The
    // window's widgets are clicked/navigated directly; no keyboard cursor anymore.
    if (Input.get("inventory").pressed()) {
      this.invOpen = !this.invOpen;
      this._invWin.enabled = this.invOpen;
      if (this.invOpen) this._invDirty = true;
    }

    // Resolve the active input context for this frame BEFORE the tick loop, so the
    // movement/fire reads inside it (RpgController.update) see it. Window beats build beats
    // play: a gameplay window open mutes fire (clicks don't shoot) but keeps movement;
    // build mode mutes fire too (LMB places tiles). See InputContext + RpgController tags.
    this._resolveContext();

    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // pre-move positions for render lerp
      RpgController.update(this.world, this.ctrl);
      FollowerSystem.update(this.world, this.ctrl.id, this.followers); // seek (before physics)
      this.physics.update(this.world);

      RpgScene.trackDamage(this, 14); // floating numbers for any hp change this tick
      RpgScene.resolveDeaths(this, {
        spill: { yBase: 0, ySpread: 14 },
        onKill: (id) => {
          Profile.add("enemiesKilled", 1);
          QuestLog.report("kill", "slime", 1);
          this._markGone(id); // a unique (id'd) enemy won't re-spawn on revisit
          Log.info(`slime killed — kills=${Profile.get("enemiesKilled")}`);
        },
      });
      RpgScene.checkPlayerDeath(this, () => {
        const pos = this.world.get(Position, this.ctrl.id);
        const vel = this.world.get(Velocity, this.ctrl.id);
        pos.x = this.spawn.x;
        pos.y = this.spawn.y;
        vel.x = 0;
        vel.y = 0;
      });
      RpgScene.collectDrops(this, (itemId, got) => {
        Profile.add("itemsCollected", got);
        QuestLog.report("collect", itemId, got);
        Log.info(
          `picked up ${got}x ${itemId} — items=${Profile.get("itemsCollected")}`,
        );
      });
      this._checkReach(); // reach-quest zone
      this._tryTurnIn(RpgQuests.QUEST_GATHER); // passive quests auto-complete
      this._tryTurnIn(RpgQuests.QUEST_REACH);
      this._checkAchievements();

      this.world.flush();
    }

    AnimationSystem.update(this.world); // advance sprite frames (per frame)
    this._updateNpc(); // proximity + dialogue text (no input here)
    this._dlg.enabled = this.nearNpc; // show/hide the dialogue panel
    Interactable.update(this); // station select + range-close + transfers/crafting (no E here)
    this._dispatchInteract(); // single E press → station OR NPC (cursor, else nearest)
    BuildMode.update(this); // build-mode toggle + place/deconstruct (outside tick loop)
    this._toggleFollower(); // F: nearest companion wait <-> follow (outside tick loop)
    this.camera.update();

    // Stream chunks around the player (chunked maps only; outside the tick loop). Loads/unloads
    // entities + colliders as the player crosses chunk borders; runs before the portal check,
    // which can swap the whole map out from under everything.
    if (this.chunks !== undefined) {
      const pp = this.world.get(Position, this.ctrl.id);
      this.chunks.update(pp.x, pp.y);
    }

    // Rebuild the inventory window body only when its contents changed (open + dirty),
    // not every frame. UI.update ran before this step(), so a click this frame is in.
    if (this.invOpen && this._invDirty) {
      RpgInventoryUI.rebuild(this, {
        equipSlots: [
          { slot: "weapon", labelKey: "SLOT_WEAPON" },
          { slot: "armor", labelKey: "SLOT_ARMOR" },
          { slot: "trinket", labelKey: "SLOT_TRINKET" },
          { slot: "backpack", labelKey: "SLOT_BACKPACK" },
        ],
        // Top-down adds a kills/items/quests records line below the stats.
        extraRows: (scene, body) => {
          const rec = new UIElement({ width: "100%", height: 22 });
          rec.insertChild(
            gemsLabel(
              () =>
                I18n.text("REC_KILLS") +
                ": " +
                Profile.get("enemiesKilled") +
                "   " +
                I18n.text("REC_ITEMS") +
                ": " +
                Profile.get("itemsCollected") +
                "   " +
                I18n.text("REC_QUESTS") +
                ": " +
                Profile.get("questsCompleted"),
              { color: GemsTheme.textMuted },
            ),
          );
          body.insertChild(rec);
        },
      });
      this._invDirty = false;
    }

    // Door check LAST — loadMap() swaps this.world/level/renderer/camera out from under the
    // scene, so nothing below it may touch the old map.
    this._checkPortals();
  }

  // Walk-onto door: travel to the first portal whose BBox the player overlaps. Runs once
  // per frame, after physics (the player is settled). On a hit, loadMap rebuilds everything
  // and we return immediately — the old world is gone.
  _checkPortals() {
    const p = AABB.of(this.world, this.ctrl.id);
    // Live query every doorway in the world (entities carrying a Portal component) — works for
    // both a chunk-streamed portal and a plain map's, with no stored list to dangle.
    const ids = this.world.query(Portal);
    for (let i = 0; i < ids.length; i++) {
      const z = AABB.of(this.world, ids[i]);
      if (p.x2 > z.x1 && p.x1 < z.x2 && p.y2 > z.y1 && p.y1 < z.y2) {
        const portal = this.world.get(Portal, ids[i]);
        Log.info(`portal → ${portal.toMap} (${portal.toEntry})`);
        this.loadMap(portal.toMap, portal.toEntry);
        return;
      }
    }
  }

  // Mark a unique (Persistent) entity as removed in the current map so it won't re-spawn from
  // the file on revisit (file-scope reconcile). No-op for an anonymous (id-less) entity — those
  // are meant to respawn. Read the uid while the entity is still alive (before world.remove).
  _markGone(id) {
    const pc = this.world.get(Persistent, id);
    if (pc !== undefined) this._gone[pc.uid] = true;
  }

  // F: toggle the nearest companion (within reach) between follow and wait. A "wait" companion
  // is stationed in the current map (homeMap), so it persists there via the map cache instead
  // of traveling. Edge-sampled once per frame, outside the tick loop.
  _toggleFollower() {
    if (!Input.get("follow").pressed()) return;
    const p = this.world.get(Position, this.ctrl.id);
    if (p === undefined) return;
    let best = -1;
    let bestSq = 80 * 80; // reach to a companion (px)
    for (let i = 0; i < this.followers.length; i++) {
      const pos = this.world.get(Position, this.followers[i]);
      if (pos === undefined) continue;
      const d = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (d < bestSq) {
        bestSq = d;
        best = this.followers[i];
      }
    }
    if (best === -1) return;
    const f = this.world.get(Follower, best);
    if (f.state === "follow") {
      f.state = "wait";
      f.homeMap = this.mapId;
      Toast.push(I18n.text("FOLLOWER_WAIT"), { type: "info" });
    } else {
      f.state = "follow";
      f.homeMap = "";
      Toast.push(I18n.text("FOLLOWER_FOLLOW"), { type: "success" });
    }
  }

  // ── UI panels (manager-drawn, GUI layer) ─────────────────────────────────

  // Top-right HUD card: HP/level line (live) + the QuestLog-bound quest tracker.
  _buildHud() {
    const hud = new UIElement({
      positionType: "absolute",
      top: 16,
      right: 16,
      width: 300,
    });
    const card = gemsCard({ padding: GemsTheme.padSm, gap: GemsTheme.gapSm });
    const hpRow = new UIElement({ width: "100%", height: 24 });
    hpRow.insertChild(
      gemsLabel(
        () => {
          const st = this.world.get(Stats, this.ctrl.id);
          const hpC = this.world.get(Health, this.ctrl.id);
          const hp = hpC !== undefined ? hpC.hp : 0;
          return I18n.text("RPG_HUD", st.level, hp, st.maxHp);
        },
        { color: GemsTheme.text, font: I18n.font("header") },
      ),
    );
    card.insertChild(hpRow);
    card.insertChild(gemsDivider());
    card.insertChild(
      gemsQuestTracker({ emptyText: I18n.textRef("RPG_NO_QUEST") }),
    );
    hud.insertChild(card);
    this.ui.insertChild(hud);
  }

  // Bottom-center dialogue card, toggled via its element's .enabled from step().
  _buildDialogue() {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 24,
      alignItems: "center",
    });
    const card = gemsCard({ width: 640, padding: GemsTheme.pad });
    const name = new UIElement({ width: "100%", height: 26 });
    name.insertChild(
      gemsLabel(() => I18n.text(this.dialogueName), {
        color: "#ffd166",
        font: I18n.font("header"),
      }),
    );
    const line = new UIElement({ width: "100%", height: 26 });
    line.insertChild(
      gemsLabel(() => I18n.text(this.dialogueLine), { color: GemsTheme.text }),
    );
    const action = new UIElement({ width: "100%", height: 22 });
    action.insertChild(
      gemsLabel(
        () =>
          this.dialogueAction !== ""
            ? "[E] " + I18n.text(this.dialogueAction)
            : "",
        { color: "#54c98a" },
      ),
    );
    card.insertChild(name);
    card.insertChild(line);
    card.insertChild(action);
    wrap.insertChild(card);
    wrap.enabled = false;
    this._dlg = wrap;
    this.ui.insertChild(wrap);
  }

  _checkReach() {
    if (this.reachDone || this.reachZone === undefined) return;
    const p = AABB.of(this.world, this.ctrl.id);
    const z = this.reachZone;
    if (p.x2 > z.x1 && p.x1 < z.x2 && p.y2 > z.y1 && p.y1 < z.y2) {
      this.reachDone = true;
      QuestLog.report("reach", "ruins", 1);
      Log.info("reached the ruins");
    }
  }

  // Reach-quest zone from a chunked map's authored data (the "reach" spawn). The marker is an
  // origin-area region, not an entity, so it's resolved once here rather than chunk-streamed.
  _authoredReach(data) {
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++)
      if (spawns[i].preset === "reach")
        return RpgLevel.reachZone(this.level, spawns[i]);
    return undefined;
  }

  // Auto turn-in for the passive (non-NPC) quests once their objectives are met.
  _tryTurnIn(qid) {
    if (!QuestLog.isReady(qid)) return;
    const reward = QuestLog.complete(qid);
    this._applyReward(reward);
    Profile.add("questsCompleted", 1);
    Log.info(
      `quest complete: ${qid} — questsCompleted=${Profile.get("questsCompleted")}`,
    );
  }

  _applyReward(reward) {
    if (reward === undefined) return;
    const st = this.world.get(Stats, this.ctrl.id);
    const inv = this.world.get(Inventory, this.ctrl.id);
    if (reward.xp) {
      st.xp += reward.xp;
      while (st.xp >= st.xpNext) {
        st.xp -= st.xpNext;
        st.level++;
        st.xpNext = Math.round(st.xpNext * 1.5);
        st.maxHp += 2;
        st.attack += 1;
        const hp = this.world.get(Health, this.ctrl.id);
        if (hp !== undefined) hp.hp = st.maxHp; // heal to full on level-up
        Log.info(`level up! now Lv ${st.level}`);
      }
    }
    if (reward.items !== undefined) {
      for (let i = 0; i < reward.items.length; i++) {
        const it = reward.items[i];
        InventorySystem.add(inv, it.itemId, it.qty);
        Profile.add("itemsCollected", it.qty);
      }
      this._invDirty = true;
    }
  }

  _checkAchievements() {
    const newly = Achievement.evaluate(Profile.counters());
    for (let i = 0; i < newly.length; i++) {
      const a = Achievement.get(newly[i]);
      Toast.push(I18n.text("RPG_UNLOCKED", I18n.text(a.name)), {
        type: "success",
      });
      Log.info(`achievement unlocked: ${newly[i]}`);
    }
  }

  // Proximity to an NPC + dialogue text for accept / turn in. No-op on maps with no NPC in
  // reach (e.g. interiors); the target is resolved live each frame (this._npcId).
  _updateNpc() {
    this._npcId = -1;
    this.nearNpc = false;
    const p = this.world.get(Position, this.ctrl.id);
    if (p === undefined) return;
    // Live: nearest "npc"-tagged entity within reach (works whether the NPC is streamed or
    // spawned up front). No NPC in range → no dialogue this frame.
    const id = Query.nearest(this.world, p.x, p.y, {
      tag: "npc",
      maxDist: RPG_NPC_RADIUS,
    });
    if (id === -1) return;
    this._npcId = id;
    this.nearNpc = true;

    const npc = this.world.get(NPC, id);
    const qid = npc.questId;
    this.dialogueName = npc.name;
    if (QuestLog.isDone(qid)) {
      this.dialogueLine = "NPC_ELDER_THANKS";
      this.dialogueAction = "";
    } else if (QuestLog.isReady(qid)) {
      this.dialogueLine = "NPC_ELDER_DONE";
      this.dialogueAction = "RPG_TURNIN";
    } else if (QuestLog.isActive(qid)) {
      this.dialogueLine = "NPC_ELDER_WIP";
      this.dialogueAction = "";
    } else {
      this.dialogueLine = "NPC_ELDER_OFFER";
      this.dialogueAction = "RPG_ACCEPT";
    }
  }

  // Derive this frame's input context from the open-window / build-mode flags. Window beats
  // build beats play (a window pauses build). Pushed once in create(); replaced here each
  // frame. InputContext then gates the action tags (fire muted off "play"; etc.).
  _resolveContext() {
    let ctx = "play";
    if (this.invOpen || this._storeOpen || this._craftOpen) ctx = "window";
    else if (this._buildActive) ctx = "build";
    InputContext.set(ctx);
  }

  // Single interact (E) dispatch — replaces the two independent E reads that used to fire
  // together. Priority: a station window open → E closes it; else pick the world target
  // (station vs NPC) by cursor-then-distance and activate the winner. interact is muted in
  // the "build" context (tag), so this only runs in play / window.
  _dispatchInteract() {
    if (!Input.get("interact").pressed()) return;
    if (this.invOpen) return; // inventory owns the window; I toggles it, E is inert
    if (this._storeOpen || this._craftOpen) {
      Interactable.closeAll(this); // E closes an open station window
      return;
    }
    const stationId = this._interTarget; // -1 when no station in range
    const npcId = this._npcId; // -1 when no NPC nearby (resolved live in _updateNpc)
    if (stationId === -1 && npcId === -1) return;

    let toStation;
    if (npcId === -1) toStation = true;
    else if (stationId === -1) toStation = false;
    else {
      // Both in reach: the one under the cursor wins; on a tie, the nearer to the player.
      const sCur = Interactable.isCursorOver(this, stationId);
      const nCur = Interactable.isCursorOver(this, npcId);
      if (sCur !== nCur) {
        toStation = sCur;
      } else {
        const p = this.world.get(Position, this.ctrl.id);
        const sp = this.world.get(Position, stationId);
        const np = this.world.get(Position, npcId);
        toStation =
          (sp.x - p.x) ** 2 + (sp.y - p.y) ** 2 <=
          (np.x - p.x) ** 2 + (np.y - p.y) ** 2;
      }
    }
    if (toStation) Interactable.activate(this);
    else this._npcActivate();
  }

  // The NPC side of the interact dispatch: accept the offered quest or turn it in when
  // ready. Called by _dispatchInteract only — never reads input itself.
  _npcActivate() {
    if (this._npcId === -1 || !this.nearNpc) return;
    const npc = this.world.get(NPC, this._npcId);
    const qid = npc.questId;
    if (QuestLog.isReady(qid)) {
      this._applyReward(QuestLog.complete(qid));
      Profile.add("questsCompleted", 1);
      this._checkAchievements();
      Log.info(
        `turned in ${qid} — questsCompleted=${Profile.get("questsCompleted")}`,
      );
    } else if (!QuestLog.isActive(qid) && !QuestLog.isDone(qid)) {
      QuestLog.accept(qid);
      Log.info(`accepted ${qid}`);
    }
  }

  // Esc back-out — SystemMenu calls this (before it would open the pause menu) so Esc closes
  // the active context instead of pausing: an open window first, then build mode. Returns
  // true if it consumed the press; false lets Esc fall through to the pause menu (F1 / gamepad
  // Start always open it regardless). Same window > build priority as _resolveContext.
  handleEscape() {
    if (this.invOpen) {
      this.invOpen = false;
      this._invWin.enabled = false;
      return true;
    }
    if (this._storeOpen || this._craftOpen) {
      Interactable.closeAll(this); // closes whichever station window is open
      return true;
    }
    if (this._buildActive) {
      this._buildActive = false; // _resolveContext drops to "play" next frame; HUD hides
      return true;
    }
    return false;
  }

  draw() {
    RpgWorldOverlay.drawWorld(this); // drops, bullets, reach zone (world space)
    this.renderer.draw(this.world); // tilemap + zone + player / slimes / elder: boxes + labels
    Interactable.drawTarget(this); // highlight the targeted station (world space)
    BuildMode.drawWorld(this); // build-cursor cell highlight (world space)
    FloatingText.draw(); // damage/heal numbers over entities (world space)
    // HUD / dialogue / inventory are now manager-drawn UI panels (GUI layer, Draw_75),
    // built in create() — nothing more to draw here.
  }

  destroy() {
    Profile.save(); // persist lifetime records (achievements persist on unlock)
    InputContext.reset(); // hand input back to "default" for the next scene
    RpgController.destroy();
    this.level.destroy();
    teardownScene(this);
  }
}
