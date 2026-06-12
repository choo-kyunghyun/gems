const TOPDOWN_NPC_RADIUS = 60; // interact range to the elder NPC

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

    // Entities are drawn as colored boxes (Visual.color) + Name labels via
    // RenderDebugBox, with a lime bbox overlay on top — GMRT 0.19 can't render
    // the SVG character sprites.
    this.renderer = new Renderer();
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

    // ── Pause menu owns the exit (Esc / Start); no in-world Back button ─────
    PauseMenu.arm(openScene);

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
    this._buildInventoryWindow();

    Log.info(
      `TopDown RPG ready — items=${Item.all().length} quests=${QuestLog.defOrder.length} ` +
        `achievements=${Achievement.all().length} kills(saved)=${Profile.get("enemiesKilled")}`,
    );
  }

  step() {
    if (PauseMenu.update()) return; // paused — freeze the sim

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

      this._trackDamage(); // pop floating numbers for any hp change this tick
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
    this._dlg.enabled = this.nearNpc; // show/hide the dialogue panel
    this.camera.update();

    // Rebuild the inventory window body only when its contents changed (open + dirty),
    // not every frame. UI.update ran before this step(), so a click this frame is in.
    if (this.invOpen && this._invDirty) {
      this._rebuildInventory();
      this._invDirty = false;
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

  // Floating combat text: diff each combatant's Health against last tick and pop a
  // number on any change — damage (white over slimes, red over the player) falls, heals
  // (green "+N") rise. Runs after physics (bullet hits + slime-attack drain are both in)
  // and before _resolveDeaths removes the killed slime, so the killing blow still pops.
  _trackDamage() {
    this._diffHp(this.ctrl.id, true);
    for (let i = 0; i < this.enemies.length; i++)
      this._diffHp(this.enemies[i], false);
  }

  _diffHp(id, isPlayer) {
    if (!this.world.isValid(id)) return;
    const hp = this.world.get(Health, id);
    if (hp === undefined) return;
    const prev = this._hpTrack[id];
    if (prev !== undefined && hp.hp !== prev) {
      const pos = this.world.get(Position, id);
      if (pos !== undefined) {
        const d = hp.hp - prev; // <0 = damage, >0 = heal
        if (d < 0)
          FloatingText.push(pos.x, pos.y - 14, -d, {
            type: isPlayer ? "hurt" : "damage",
          });
        else FloatingText.push(pos.x, pos.y - 14, "+" + d, { type: "heal" });
      }
    }
    this._hpTrack[id] = hp.hp;
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
    this._hpTrack[this.ctrl.id] = hp.hp; // don't pop a "+heal" for the respawn refill
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
        this._invDirty = true; // bag changed — refresh the window if open
        Log.info(
          `picked up ${got}x ${d.itemId} — items=${Profile.get("itemsCollected")}`,
        );
      }
      if (left <= 0) this.world.remove(id);
      else d.qty = left; // inventory full — leave the remainder on the ground
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

  // Draggable inventory/equipment/stats window (body filled by _rebuildInventory).
  _buildInventoryWindow() {
    const gw = display_get_gui_width();
    const left = gw > 0 ? gw / 2 - 220 : 60;
    this._invWin = gemsWindow(I18n.textRef("TOPDOWN_INVENTORY"), {
      left,
      top: 50,
      width: 440,
      onClose: () => {
        this.invOpen = false;
        this._invWin.enabled = false;
      },
    });
    this._invWin.enabled = false;
    this.ui.insertChild(this._invWin);
  }

  // Repopulate the window body from the live Inventory/Equipment/Stats. Called only
  // when the bag changed (open + _invDirty), not per frame — child tree edits are
  // safe (it's flexpanel *style* mutation that's unreliable on GMRT 0.19).
  _rebuildInventory() {
    const body = this._invWin.body;
    const kids = [...body.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    const world = this.world;
    const inv = world.get(Inventory, this.ctrl.id);

    // Slot / weight usage.
    const usage = new UIElement({ width: "100%", height: 22 });
    usage.insertChild(
      gemsLabel(
        () => {
          const v = world.get(Inventory, this.ctrl.id);
          let s =
            I18n.text("TOPDOWN_SLOTS") + " " + v.slots.length + "/" + v.capacity;
          if (v.maxWeight !== undefined)
            s +=
              "   " +
              I18n.text("TOPDOWN_WEIGHT") +
              " " +
              InventorySystem.weight(v) +
              "/" +
              v.maxWeight;
          return s;
        },
        { color: GemsTheme.textMuted },
      ),
    );
    body.insertChild(usage);

    // Item rows (clickable: equip/unequip or use).
    const scroll = gemsScroll({ height: 180 });
    if (inv.slots.length === 0) {
      const r = new UIElement({ width: "100%", height: 24 });
      r.insertChild(
        gemsLabel(I18n.textRef("TOPDOWN_EMPTY"), { color: GemsTheme.textDim }),
      );
      scroll.scrollBody.insertChild(r);
    }
    for (let i = 0; i < inv.slots.length; i++)
      scroll.scrollBody.insertChild(this._itemRow(inv.slots[i]));
    body.insertChild(scroll);

    // Equipment (clickable rows unequip).
    body.insertChild(gemsDivider());
    const eqTitle = new UIElement({ width: "100%", height: 22 });
    eqTitle.insertChild(
      gemsLabel(I18n.textRef("TOPDOWN_EQUIPMENT"), { color: "#ffd166" }),
    );
    body.insertChild(eqTitle);
    body.insertChild(this._equipRow("weapon", "SLOT_WEAPON"));
    body.insertChild(this._equipRow("armor", "SLOT_ARMOR"));
    body.insertChild(this._equipRow("trinket", "SLOT_TRINKET"));
    body.insertChild(this._equipRow("backpack", "SLOT_BACKPACK"));

    // Stats + records (live).
    body.insertChild(gemsDivider());
    const stats = new UIElement({ width: "100%", height: 22 });
    stats.insertChild(
      gemsLabel(
        () => {
          const st = world.get(Stats, this.ctrl.id);
          return (
            I18n.text("STAT_LEVEL") +
            ": " +
            st.level +
            "   " +
            I18n.text("STAT_ATK") +
            ": " +
            st.attack +
            "   " +
            I18n.text("STAT_DEF") +
            ": " +
            st.defense +
            "   " +
            I18n.text("STAT_SPD") +
            ": " +
            Math.round(st.speed)
          );
        },
        { color: GemsTheme.text },
      ),
    );
    body.insertChild(stats);
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
  }

  // One inventory row: a button labeled "name xN value [equipped]", tinted by rarity.
  _itemRow(slot) {
    const itemId = slot.itemId;
    const it = Item.get(itemId);
    const eq = this.world.get(Equipment, this.ctrl.id);
    let worn = false;
    if (it !== undefined && it.hasComponent(Equippable)) {
      const eqp = it.getComponent(Equippable);
      worn = eq.slots[eqp.slot] === itemId;
    }
    const name = it !== undefined ? I18n.text(it.name) : itemId;
    const val =
      it !== undefined ? Math.round(Rarity.modify(it.rarity, it.value)) : 0;
    const label =
      name +
      "  x" +
      slot.qty +
      "  " +
      val +
      (worn ? "  " + I18n.text("TOPDOWN_EQUIPPED") : "");
    return gemsButton(label, () => this._useItem(itemId), {
      height: 32,
      textColor: TopDownUI._rarityColor(itemId),
    });
  }

  // One equipment slot: a button (click unequips) when worn, else a muted label row.
  _equipRow(slot, labelKey) {
    const eq = this.world.get(Equipment, this.ctrl.id);
    const itemId = eq !== undefined ? eq.slots[slot] : "";
    if (itemId !== undefined && itemId !== "") {
      const it = Item.get(itemId);
      const nm = it !== undefined ? I18n.text(it.name) : itemId;
      return gemsButton(
        I18n.text(labelKey) + ": " + nm,
        () => {
          EquipmentSystem.unequip(this.world, this.ctrl.id, slot);
          this._invDirty = true;
          Log.info(`unequipped ${itemId}`);
        },
        { height: 30, textColor: TopDownUI._rarityColor(itemId) },
      );
    }
    const row = new UIElement({ width: "100%", height: 26 });
    row.insertChild(
      gemsLabel(I18n.text(labelKey) + ": " + I18n.text("SLOT_EMPTY"), {
        color: GemsTheme.textDim,
      }),
    );
    return row;
  }

  // Click action on an inventory item: equippables toggle equip/unequip, consumables
  // are used (one unit). Mirrors the old keyboard handler; marks the window dirty.
  _useItem(itemId) {
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
    this._invDirty = true;
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
    TopDownUI.drawWorld(this); // walls, drops, bullets, reach zone (world space)
    this.renderer.draw(this.world); // player / slimes / elder: colored boxes + labels + bbox
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
