const TOPDOWN_NPC_RADIUS = 60; // interact range to the elder NPC

SceneRegistry.add(() => new _SceneTopDownClass(), {
  label: I18n.textRef("TOPDOWN_NAME"),
  category: "SCENE_CAT_RPG",
});

class _SceneTopDownClass extends Scene {
  label = "TopDown";

  create() {
    // ── Persistence + content (load before building anything) ──────────────
    SaveData.load();
    TopDownContent.register();
    Profile.load();
    Achievement.load();
    QuestLog.reset();
    QuestLog.accept(TopDownContent.QUEST_GATHER); // collect — tracked passively
    QuestLog.accept(TopDownContent.QUEST_REACH); // reach — tracked passively

    // ── World, level, player ───────────────────────────────────────────────
    this.world = new World(256, 60);
    const levelData = LevelSerializer.load("levels/topdown_1.json", {
      genre: "topdown",
    });
    const built = TopDownLevel.build(this.world, levelData);
    this.level = built.level;
    this.spawn = built.spawn; // remembered for player respawn on death
    // Tilemap handles kept for build mode (place/remove tiles + remesh wall colliders).
    this.wallLayer = built.wallLayer;
    this.floorLayer = built.floorLayer;
    this.wallType = built.wallType;
    this.floorType = built.floorType;
    this.colliders = built.colliders;
    this.ctrl = TopDownController.create(this.world, built.spawn);

    // ── Buildable zone channel: one zone the Claim Post paints cells into; build mode
    //    only allows placement inside it. RenderZone visualizes the claimed area. ─────
    const bmap = this.level.addZoneMap("buildable");
    this.buildZoneId = bmap.define({
      name: I18n.text("BUILD_ZONE"),
      tags: ["buildable"],
      data: { color: "#55aa55" },
    }).id;

    // ── Entity instances from the level file's `spawns` (enemies, NPC, chest, props,
    //    reach marker). Stations are discovered live by Interactable, so only the handles
    //    the scene's own logic needs come back. Spawned after the controller — slimes need
    //    the player id for their AI. ───────────────────────────────────────────────────
    const ents = TopDownLevel.spawn(
      this.world,
      this.level,
      levelData,
      this.ctrl.id,
    );
    this.enemies = ents.enemies;
    this.npc = ents.npc;
    this.reachZone = ents.reach;
    this.reachDone = false;

    // ── Pipeline: AI decides velocity → collide → detect triggers (pickups) →
    //    projectiles → expire ─
    this.physics = new Pipeline()
      .add(StateSystem) // drives the slime Idle/Chase/Attack schemas
      .add(SolidSystem)
      .add(TriggerSystem)
      .add(ProjectileSystem)
      .add(LifetimeSystem);

    // Tilemap (walls + built floors) shown via the debug render pass — grid lines,
    // blocking-cost shading (walls red), and tile id/name labels. The buildable zone
    // overlay (RenderZone) sits above it. Both are world-space and draw UNDER the
    // entities. Entities are colored boxes (Visual.color) + Name labels via
    // RenderDebugBox, with a lime bbox overlay on top — GMRT 0.19 can't render the
    // SVG character sprites.
    this.renderer = new Renderer();
    this.renderer.insert(
      new RenderDebugTileMap(this.level, {
        names: true,
        coords: false,
        font: I18n.font("default"),
      }),
    );
    this.renderer.insert(
      new RenderZone(this.level, "buildable", {
        labels: true,
        font: I18n.font("default"),
      }),
    );
    this.renderer.insert(new RenderDebugBox());
    this.renderer.insert(new RenderDebugEntity());

    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.ctrl.id,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    this.camera.assign(0);

    // ── Overlay / interaction state ────────────────────────────────────────
    this.invOpen = false;
    this._invDirty = false; // rebuild the inventory window body next step when set
    this.nearNpc = false;
    this.dialogueName = "";
    this.dialogueLine = "";
    this.dialogueAction = "";
    this._hpTrack = {}; // id → last-seen Health.hp, for floating combat numbers

    // ── SystemMenu overlay owns pause + exit (Esc / Start / F1) and suspends menu nav
    // while playing. Flag it (a subclass field initializer wouldn't run on GMRT). ─────
    this.gameplay = true;

    // ── Hint (flexpanel, GUI layer) ────────────────────────────────────────
    this.ui = gemsRoot();
    UI.insert(this.ui);
    this.ui.insertChild(
      gemsLabel(I18n.textRef("TOPDOWN_HINT"), { color: "#888888" }),
    );

    // Corner minimap (bottom-right — the HP/quest HUD owns the top-right): a framed
    // radar of nearby slimes (red) + the elder NPC (gold) around the player marker.
    // Absolute-positioned so it floats over the scene instead of stacking in the column.
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
        ],
      }),
    );
    this.ui.insertChild(miniWrap);

    // Manager-drawn panels (GUI layer, screen-pinned): HUD + quest tracker (top-right),
    // NPC dialogue (bottom-center, toggled), and the draggable inventory window.
    this._buildHud();
    this._buildDialogue();
    RpgInventoryUI.build(this);
    Interactable.build(this); // station prompt + storage + crafting windows
    BuildMode.build(this); // grid build mode (HUD + per-scene state)

    Log.info(
      `TopDown RPG ready — items=${Item.all().length} quests=${QuestLog.defOrder.length} ` +
        `achievements=${Achievement.all().length} kills(saved)=${Profile.get("enemiesKilled")}`,
    );
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
      TopDownController.update(this.world, this.ctrl);
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
      this._tryTurnIn(TopDownContent.QUEST_GATHER); // passive quests auto-complete
      this._tryTurnIn(TopDownContent.QUEST_REACH);
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
          return I18n.text("TOPDOWN_HUD", st.level, hp, st.maxHp);
        },
        { color: GemsTheme.text, font: I18n.font("header") },
      ),
    );
    card.insertChild(hpRow);
    card.insertChild(gemsDivider());
    card.insertChild(
      gemsQuestTracker({ emptyText: I18n.textRef("TOPDOWN_NO_QUEST") }),
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
    if (this.reachDone) return;
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
      Toast.push(I18n.text("TOPDOWN_UNLOCKED", I18n.text(a.name)), {
        type: "success",
      });
      Log.info(`achievement unlocked: ${newly[i]}`);
    }
  }

  // Proximity to the elder + E to accept / turn in the kill quest.
  _updateNpc() {
    const p = this.world.get(Position, this.ctrl.id);
    const np = this.world.get(Position, this.npc);
    const dx = np.x - p.x;
    const dy = np.y - p.y;
    this.nearNpc = dx * dx + dy * dy < TOPDOWN_NPC_RADIUS * TOPDOWN_NPC_RADIUS;
    if (!this.nearNpc) return;

    const npc = this.world.get(NPC, this.npc);
    const qid = npc.questId;
    this.dialogueName = npc.name;
    if (QuestLog.isDone(qid)) {
      this.dialogueLine = "NPC_ELDER_THANKS";
      this.dialogueAction = "";
    } else if (QuestLog.isReady(qid)) {
      this.dialogueLine = "NPC_ELDER_DONE";
      this.dialogueAction = "TOPDOWN_TURNIN";
    } else if (QuestLog.isActive(qid)) {
      this.dialogueLine = "NPC_ELDER_WIP";
      this.dialogueAction = "";
    } else {
      this.dialogueLine = "NPC_ELDER_OFFER";
      this.dialogueAction = "TOPDOWN_ACCEPT";
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
    TopDownController.destroy();
    this.level.destroy();
    teardownScene(this);
  }
}
