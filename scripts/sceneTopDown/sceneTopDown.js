const TOPDOWN_NPC_RADIUS = 60; // interact range to the elder NPC
const TOPDOWN_TOAST_SECS = 2.5; // how long an achievement toast stays up

SceneRegistry.add(() => new _SceneTopDownClass(), {
  label: I18n.textRef("TOPDOWN_NAME"),
  category: "SCENE_CAT_RPG",
});

class _SceneTopDownClass extends Scene {
  label = "TopDown";

  create(openScene) {
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
    const built = TopDownLevel.build(this.world, TopDownLevels[0]);
    this.level = built.level;
    this.spawn = built.spawn; // remembered for player respawn on death
    this.ctrl = TopDownController.create(this.world, built.spawn);

    // ── Enemies: each carries its own Inventory, which IS its loot table ────
    this.enemies = [];
    const enemyCells = [
      [8, 3],
      [14, 3],
      [3, 11],
      [17, 11],
    ];
    const enemyLoot = [
      [
        { itemId: "slime_gel", qty: 2 },
        { itemId: "wood_sword", qty: 1 },
        { itemId: "backpack", qty: 1 },
      ],
      [
        { itemId: "slime_gel", qty: 1 },
        { itemId: "potion", qty: 1 },
        { itemId: "leather_armor", qty: 1 },
      ],
      [
        { itemId: "gem", qty: 1 },
        { itemId: "blaster", qty: 1 },
      ],
      [
        { itemId: "slime_gel", qty: 1 },
        { itemId: "key", qty: 1 },
        { itemId: "swift_ring", qty: 1 },
      ],
    ];
    for (let i = 0; i < enemyCells.length; i++) {
      const w = this.level.gridToWorld(enemyCells[i][0], enemyCells[i][1]);
      const id = this.world.create();
      this.world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      this.world.add(id, BBox, { x: -12, y: -12, width: 24, height: 24 });
      // Dynamic (non-kinematic) so SolidSystem integrates the velocity SlimeAI
      // sets and collides them against the kinematic walls.
      this.world.add(id, Collision, {
        solid: true,
        kinematic: false,
        mask: null,
        hits: [],
      });
      this.world.add(id, Health, { hp: 3 });
      this.world.add(id, Tag, { tags: new Set(["enemy", "slime"]) });
      this.world.add(id, Name, { name: "Slime" });
      // Loot table — no maxWeight (loot is authored, never weight-gated).
      this.world.add(id, Inventory, { slots: enemyLoot[i], capacity: 8 });
      this.world.add(id, Visual, {
        visible: true,
        sprite: spr_choo,
        subimg: 0,
        xscale: 1,
        yscale: 1,
        rot: 0,
        color: make_colour_rgb(120, 220, 130),
        alpha: 1,
        speed: 0,
        time: 0,
      });
      SlimeAI.attach(this.world, id, this.ctrl.id); // adds Velocity + Brain + State
      this.enemies.push(id);
    }

    // ── NPC: the elder, who offers + turns in the kill quest ───────────────
    const nw = this.level.gridToWorld(5, 2);
    this.npc = this.world.create();
    this.world.add(this.npc, Position, { x: nw.x, y: nw.y, z: 0 });
    this.world.add(this.npc, BBox, { x: -14, y: -14, width: 28, height: 28 });
    this.world.add(this.npc, Collision, {
      solid: true,
      kinematic: true,
      mask: null,
      hits: [],
    });
    this.world.add(this.npc, Tag, { tags: new Set(["npc"]) });
    this.world.add(this.npc, Name, { name: "Elder" });
    this.world.add(this.npc, NPC, {
      name: "NPC_ELDER_NAME",
      lines: [],
      questId: TopDownContent.QUEST_SLIMES,
    });
    this.world.add(this.npc, Visual, {
      visible: true,
      sprite: spr_hana,
      subimg: 0,
      xscale: 0.6,
      yscale: 0.6,
      rot: 0,
      color: c_white,
      alpha: 1,
      speed: 0,
      time: 0,
    });

    // ── Reach-quest zone (north-east "ruins") ──────────────────────────────
    const rz = this.level.gridToWorld(17, 2);
    this.reachZone = {
      x1: rz.x - 44,
      y1: rz.y - 44,
      x2: rz.x + 44,
      y2: rz.y + 44,
    };
    this.reachDone = false;

    // ── Pipeline: AI decides velocity → collide → detect triggers (pickups) →
    //    projectiles → expire ─
    this.physics = new Pipeline()
      .add(StateSystem) // drives the slime Idle/Chase/Attack schemas
      .add(SolidSystem)
      .add(TriggerSystem)
      .add(ProjectileSystem)
      .add(LifetimeSystem);

    // Entities are drawn as colored boxes in draw() (TopDownUI.drawEntities) —
    // GMRT 0.19 can't render the SVG character sprites. No Renderer pass needed yet.
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
    this.invSel = 0; // selected inventory row (arrow keys); equip with Enter
    this.nearNpc = false;
    this.dialogueName = "";
    this.dialogueLine = "";
    this.dialogueAction = "";
    this.toastTimer = 0;
    this.toastName = "";
    this.toastQueue = [];

    // ── Lobby back button + hint (flexpanel, GUI layer) ────────────────────
    this.ui = gemsRoot();
    UI.insert(this.ui);
    this.ui.insertChild(
      gemsButton(I18n.textRef("TOPDOWN_BACK"), () => openScene(SCENES.lobby)),
    );
    this.ui.insertChild(
      gemsLabel(I18n.textRef("TOPDOWN_HINT"), { color: "#888888" }),
    );

    Log.info(
      `TopDown RPG ready — items=${Item.all().length} quests=${QuestLog.defOrder.length} ` +
        `achievements=${Achievement.all().length} kills(saved)=${Profile.get("enemiesKilled")}`,
    );
  }

  step() {
    // Edge-triggered toggles — sampled once per frame, outside the tick loop.
    if (Input.get("inventory").pressed()) this.invOpen = !this.invOpen;
    if (this.invOpen) this._handleInventoryInput();

    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // pre-move positions for render lerp
      TopDownController.update(this.world, this.ctrl);
      this.physics.update(this.world);

      this._resolveDeaths(); // spill loot + count kills (before flush removes them)
      this._checkPlayerDeath(); // slimes can kill the player → respawn at spawn
      this._collectDrops(); // pick up ground items into the player's inventory
      this._checkReach(); // reach-quest zone
      this._tryTurnIn(TopDownContent.QUEST_GATHER); // passive quests auto-complete
      this._tryTurnIn(TopDownContent.QUEST_REACH);
      this._checkAchievements();

      this.world.flush();
    }

    AnimationSystem.update(this.world); // advance sprite frames (per frame)
    this._updateNpc(); // proximity + E interaction
    this.camera.update();

    if (this.toastTimer > 0) this.toastTimer -= Time.delta;
    else if (this.toastQueue.length > 0) {
      this.toastName = this.toastQueue.shift();
      this.toastTimer = TOPDOWN_TOAST_SECS;
    }
  }

  // ProjectileSystem zeroes a hit enemy's hp and queues its removal; this runs
  // before flush so the entity is still readable — spill its inventory as drops.
  _resolveDeaths() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const id = this.enemies[i];
      if (!this.world.isValid(id)) {
        this.enemies.splice(i, 1);
        continue;
      }
      const hp = this.world.get(Health, id);
      if (hp !== undefined && hp.hp <= 0) {
        this._spillLoot(id);
        Profile.add("enemiesKilled", 1);
        QuestLog.report("kill", "slime", 1);
        this.world.remove(id);
        this.enemies.splice(i, 1);
        Log.info(`slime killed — kills=${Profile.get("enemiesKilled")}`);
      }
    }
  }

  // Slime ATTACK states drain the player's Health. On death, respawn at the
  // level's spawn point with full hp (no progress lost — kept deliberately soft).
  _checkPlayerDeath() {
    const hp = this.world.get(Health, this.ctrl.id);
    if (hp === undefined || hp.hp > 0) return;
    const st = this.world.get(Stats, this.ctrl.id);
    const pos = this.world.get(Position, this.ctrl.id);
    const vel = this.world.get(Velocity, this.ctrl.id);
    hp.hp = st !== undefined ? st.maxHp : 10;
    pos.x = this.spawn.x;
    pos.y = this.spawn.y;
    vel.x = 0;
    vel.y = 0;
    Log.info("player died — respawned at spawn");
  }

  _spillLoot(enemyId) {
    const inv = this.world.get(Inventory, enemyId);
    const pos = this.world.get(Position, enemyId);
    if (inv === undefined || pos === undefined) return;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const ox = (i % 2 === 0 ? -1 : 1) * 16;
      const oy = (i < 2 ? -1 : 1) * 14;
      this._spawnDrop(s.itemId, s.qty, pos.x + ox, pos.y + oy);
    }
  }

  _spawnDrop(itemId, qty, x, y) {
    const id = this.world.create();
    this.world.add(id, Position, { x: x, y: y, z: 0 });
    this.world.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
    this.world.add(id, Collision, {
      solid: false,
      kinematic: false,
      mask: null,
      hits: [],
    });
    this.world.add(id, ItemDrop, { itemId: itemId, qty: qty });
  }

  // TriggerSystem filled the player's hits with overlapping non-solid sensors
  // (the only non-solids here are item drops).
  _collectDrops() {
    const hits = this.world.get(Collision, this.ctrl.id).hits;
    const inv = this.world.get(Inventory, this.ctrl.id);
    for (let i = 0; i < hits.length; i++) {
      const id = hits[i];
      const d = this.world.get(ItemDrop, id);
      if (d === undefined) continue;
      const left = InventorySystem.add(inv, d.itemId, d.qty);
      const got = d.qty - left;
      if (got > 0) {
        Profile.add("itemsCollected", got);
        QuestLog.report("collect", d.itemId, got);
        Log.info(
          `picked up ${got}x ${d.itemId} — items=${Profile.get("itemsCollected")}`,
        );
      }
      if (left <= 0) this.world.remove(id);
      else d.qty = left; // inventory full — leave the remainder on the ground
    }
  }

  // While the bag is open, Up/Down move the selection cursor and Enter acts on
  // the selected line: equippable items toggle equip/unequip (equipped items stay
  // in the bag; EquipmentSystem auto-swaps an occupied slot), consumables are used
  // (one unit spent on its effect). Direct keyboard read — transient UI input,
  // not a rebindable gameplay action.
  _handleInventoryInput() {
    const inv = this.world.get(Inventory, this.ctrl.id);
    const n = inv.slots.length;
    if (n === 0) {
      this.invSel = 0;
      return;
    }

    // Move the cursor, clamped to the list (handles rows removed since last frame).
    if (keyboard_check_pressed(vk_up)) this.invSel--;
    if (keyboard_check_pressed(vk_down)) this.invSel++;
    if (this.invSel < 0) this.invSel = 0;
    if (this.invSel >= n) this.invSel = n - 1;

    if (!keyboard_check_pressed(vk_enter)) return;
    const itemId = inv.slots[this.invSel].itemId;
    const item = Item.get(itemId);
    if (item === undefined) return;
    if (item.hasComponent(Equippable)) {
      const eq = this.world.get(Equipment, this.ctrl.id);
      const eqp = item.getComponent(Equippable);
      if (eq.slots[eqp.slot] === itemId) {
        EquipmentSystem.unequip(this.world, this.ctrl.id, eqp.slot);
        Log.info(`unequipped ${itemId}`);
      } else if (EquipmentSystem.equip(this.world, this.ctrl.id, itemId)) {
        Log.info(`equipped ${itemId}`);
      }
    } else if (item.hasComponent(Consumable)) {
      if (ConsumableSystem.use(this.world, this.ctrl.id, itemId)) {
        Log.info(`used ${itemId}`);
      }
    }
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
    }
  }

  _checkAchievements() {
    const newly = Achievement.evaluate(Profile.counters());
    for (let i = 0; i < newly.length; i++) {
      const a = Achievement.get(newly[i]);
      this.toastQueue.push(a.name);
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
    TopDownUI.drawWorld(this); // walls, drops, bullets, reach zone (world space)
    TopDownUI.drawEntities(this); // player / slimes / elder as colored boxes (interpolated)

    const cam = this.camera.id; // camera handle (view_camera[] isn't exposed in GMRT JS)
    const vx = camera_get_view_x(cam);
    const vy = camera_get_view_y(cam);
    const vw = camera_get_view_width(cam);
    const vh = camera_get_view_height(cam);

    const col = draw_get_colour();
    const ha = draw_get_halign();
    const va = draw_get_valign();
    const fnt = draw_get_font();

    TopDownUI.drawHud(this, vx, vy, vw, vh);
    if (this.nearNpc) TopDownUI.drawDialogue(this, vx, vy, vw, vh);
    if (this.invOpen) TopDownUI.drawInventory(this, vx, vy, vw, vh);
    if (this.toastTimer > 0) TopDownUI.drawToast(this, vx, vy, vw, vh);

    draw_set_colour(col);
    draw_set_halign(ha);
    draw_set_valign(va);
    draw_set_font(fnt);
  }

  destroy() {
    Profile.save(); // persist lifetime records (achievements persist on unlock)
    TopDownController.destroy();
    this.level.destroy();
    teardownScene(this);
  }
}
