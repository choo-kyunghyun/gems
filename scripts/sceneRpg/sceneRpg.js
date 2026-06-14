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
    if (this.ctrl !== undefined) {
      carry = {
        stats: this.world.get(Stats, this.ctrl.id),
        health: this.world.get(Health, this.ctrl.id),
        inventory: this.world.get(Inventory, this.ctrl.id),
        equipment: this.world.get(Equipment, this.ctrl.id),
        encumbrance: this.world.get(Encumbrance, this.ctrl.id),
      };
      // Cache the OUTGOING map's player edits if it's persistent (the default) so they're
      // restored on revisit instead of rebuilt fresh — chiefly the claimed buildable zone and
      // built tiles. Level.export() captures both (TileLayers + the buildable ZoneMap) as a
      // detached snapshot that survives the world/level destroy below; _built carries the
      // deconstruct tracking. Captured before _teardownMap (which destroys the level).
      if (this._mapPersistent && this.mapId !== undefined) {
        this._mapCache[this.mapId] = {
          level: this.level.export(),
          built: { ...this._built },
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
    // Persistent (default true): the map's player edits are cached on leave + restored on
    // revisit (see step 1 and 4b). Set `meta.persistent: false` in a level file to opt out
    // (e.g. a dungeon that should reset each entry).
    this._mapPersistent = data.meta.persistent !== false;
    Log.info(`RPG map: ${mapId} (entry ${entryId})`);

    // 3. World + level + player. The level is sized from the file's cols/rows, so each map
    //    has its own extent and the follow camera scrolls across it.
    this.world = new World(256, 60);
    const built = RpgLevel.build(this.world, data, entryId);
    this.level = built.level;
    this.spawn = built.spawn; // remembered for player respawn on death
    this.wallLayer = built.wallLayer; // tilemap handles for build mode
    this.floorLayer = built.floorLayer;
    this.wallType = built.wallType;
    this.floorType = built.floorType;
    this.colliders = built.colliders;
    this.ctrl = RpgController.create(this.world, built.spawn);

    // Re-attach the carried character sheet onto the new player entity. Equip mods are
    // already baked into the carried Stats, so no re-equip pass is needed.
    if (carry !== null) {
      this.world.add(this.ctrl.id, Stats, carry.stats);
      this.world.add(this.ctrl.id, Health, carry.health);
      this.world.add(this.ctrl.id, Inventory, carry.inventory);
      this.world.add(this.ctrl.id, Equipment, carry.equipment);
      this.world.add(this.ctrl.id, Encumbrance, carry.encumbrance);
    }

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

    // 5. Entity instances from the file's `spawns` (enemies, NPC, chest, props, reach
    //    marker, portals). Stations are discovered live by Interactable; only the handles the
    //    scene's own logic needs come back. Spawned after the controller — slimes need the
    //    player id for their AI.
    const ents = RpgLevel.spawn(this.world, this.level, data, this.ctrl.id);
    this.enemies = ents.enemies;
    this.npc = ents.npc; // -1 when the map has no NPC (guarded in _updateNpc)
    this.reachZone = ents.reach; // undefined when the map has no reach marker
    this.reachDone = this.reachZone === undefined; // nothing to reach on this map
    this.portals = ents.portals; // walk-onto doors → other maps (see _checkPortals)

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
    this.renderer.insert(
      new RenderDebugTileMap(this.level, {
        names: true,
        coords: false,
        font: I18n.font("default"),
      }),
    );
    this.renderer.insert(new RenderGrid(this.level)); // cell boundary lines
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

    // 10. Corner minimap — rebuilt per map (captures world/target by value).
    this._buildMinimap();

    FloatingText.clear(); // drop combat numbers from the previous map
  }

  // Release the current map's resources (world / level / renderer / camera / controller),
  // leaving the persistent UI in place. Mirrors teardownScene's order, minus the UI.
  _teardownMap() {
    RpgController.destroy();
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

    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // pre-move positions for render lerp
      RpgController.update(this.world, this.ctrl);
      this.physics.update(this.world);

      RpgScene.trackDamage(this, 14); // floating numbers for any hp change this tick
      RpgScene.resolveDeaths(this, {
        spill: { yBase: 0, ySpread: 14 },
        onKill: () => {
          Profile.add("enemiesKilled", 1);
          QuestLog.report("kill", "slime", 1);
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
    this._updateNpc(); // proximity + E interaction
    this._dlg.enabled = this.nearNpc; // show/hide the dialogue panel
    Interactable.update(this); // station select + open/close + transfers/crafting
    BuildMode.update(this); // build-mode toggle + place/deconstruct (outside tick loop)
    this.camera.update();

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
    for (let i = 0; i < this.portals.length; i++) {
      const portal = this.portals[i];
      const z = AABB.of(this.world, portal.id);
      if (p.x2 > z.x1 && p.x1 < z.x2 && p.y2 > z.y1 && p.y1 < z.y2) {
        Log.info(`portal → ${portal.toMap} (${portal.toEntry})`);
        this.loadMap(portal.toMap, portal.toEntry);
        return;
      }
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

  // Proximity to the elder + E to accept / turn in the kill quest. No-op on maps without
  // an NPC (this.npc === -1, e.g. interiors).
  _updateNpc() {
    if (this.npc === -1) {
      this.nearNpc = false;
      return;
    }
    const p = this.world.get(Position, this.ctrl.id);
    const np = this.world.get(Position, this.npc);
    const dx = np.x - p.x;
    const dy = np.y - p.y;
    this.nearNpc = dx * dx + dy * dy < RPG_NPC_RADIUS * RPG_NPC_RADIUS;
    if (!this.nearNpc) return;

    const npc = this.world.get(NPC, this.npc);
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

    if (Input.get("interact").pressed()) {
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
    RpgController.destroy();
    this.level.destroy();
    teardownScene(this);
  }
}
