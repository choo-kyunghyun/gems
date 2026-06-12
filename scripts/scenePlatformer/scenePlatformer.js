const PLATF_GRAVITY = 1200;
const PLATF_MAX_FALL = 900;
const PLATF_DEATH_Y = 900; // fall past this (off a platform edge into the void) → reset to spawn
const PLATF_TOUCH_DMG = 2; // hp drained per enemy contact (reduced by defense, min 1)
const PLATF_HIT_IFRAMES = 60; // invincibility ticks after taking a hit (1 s at 60 Hz)

SceneRegistry.add(() => new _ScenePlatformerClass(), {
  label: I18n.textRef("PLAT_NAME"),
  category: "SCENE_CAT_ACTION",
});

// Side-scrolling action-RPG: platformer movement + the shared Item/Inventory/
// Equipment/Stats stack. Enemies are killed with melee/ranged weapons and drop
// loot; the player levels via Stats. One open level (no goal/level-clear loop).
class _ScenePlatformerClass extends Scene {
  label = "Platformer";

  create(openScene) {
    PlatformerContent.register(); // rarity tiers + item set (idempotent)

    this.world = new World(256, 60, { gravity: PLATF_GRAVITY });
    const levelData = LevelSerializer.load("levels/platformer_1.json", {
      genre: "platformer",
    });
    this.spawn = PlatformerLevel.build(this.world, levelData);
    this.ctrl = PlatformerController.create(this.world, this.spawn);

    // Enemy roster (for the death scan that spills loot) — every Enemy entity.
    this.enemies = this.world.query(Enemy).slice();

    // Storage chest: a kinematic-solid container resting on the ground near spawn.
    // Open it with E to transfer items between bag and chest. BBox anchored at the
    // feet (bottom = Position.y) like the player, so it sits on the same ground line.
    const chest = this.world.create();
    this.world.add(chest, Position, { x: this.spawn.x + 120, y: this.spawn.y, z: 0 });
    this.world.add(chest, BBox, { x: -16, y: -28, width: 32, height: 28 });
    this.world.add(chest, Collision, {
      solid: true,
      kinematic: true,
      oneWay: false,
      passThroughTicks: 0,
      mask: null,
      hits: [],
    });
    this.world.add(chest, Tag, { tags: new Set(["storage"]) });
    this.world.add(chest, Name, { name: "Chest" });
    this.world.add(chest, Inventory, {
      slots: [
        { itemId: "potion", qty: 2 },
        { itemId: "wood_sword", qty: 1 },
      ],
      capacity: 12,
    });
    this.world.add(chest, Visual, {
      visible: true,
      sprite: spr_play,
      subimg: 0,
      xscale: 1,
      yscale: 1,
      rot: 0,
      color: make_colour_rgb(200, 160, 70),
      alpha: 1,
      speed: 0,
      time: 0,
    });

    this.physics = new Pipeline()
      .add(GravitySystem)
      .add((world) => {
        const vel = world.get(Velocity, this.ctrl.id);
        if (vel.y > PLATF_MAX_FALL) vel.y = PLATF_MAX_FALL;
      })
      .add(SolidSystem)
      .add(TriggerSystem) // fills col.hits so spikes/drops can be detected
      .add(ProjectileSystem) // moves bullets, raycasts hits, applies damage
      .add(LifetimeSystem); // expires bullets that travel too far

    this.renderer = new Renderer();
    this.renderer.insert(new RenderDebugBox()); // colored boxes + Name labels
    this.renderer.insert(new RenderDebugEntity()); // lime bbox outlines on top

    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.ctrl.id,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    this.camera.assign(0);

    // Overlay / interaction state.
    this.invOpen = false;
    this._invDirty = false; // rebuild the inventory window body next step when set
    this._hpTrack = {};
    this._hpTrack[this.ctrl.id] = this.world.get(Health, this.ctrl.id).hp;

    // Pause menu owns the exit (Esc / Start); no in-world Back button.
    PauseMenu.arm(openScene);

    // Control hint (flexpanel, GUI layer).
    this.ui = gemsRoot();
    UI.insert(this.ui);
    this.ui.insertChild(
      gemsLabel(I18n.textRef("PLAT_HINT"), { color: "#888888" }),
    );

    // Manager-drawn panels (GUI layer, screen-pinned): HUD (top-right) + the draggable
    // inventory window.
    this._buildHud();
    this._buildInventoryWindow();
    StorageUI.build(this); // chest prompt + transfer window

    Log.info(
      `Platformer RPG ready — items=${Item.all().length} enemies=${this.enemies.length}`,
    );
  }

  step() {
    if (PauseMenu.update()) return; // paused — freeze the sim

    // Edge-triggered toggle — the window's widgets are clicked/navigated directly.
    if (Input.get("inventory").pressed()) {
      this.invOpen = !this.invOpen;
      this._invWin.enabled = this.invOpen;
      if (this.invOpen) this._invDirty = true;
    }

    PlatformerController.pollInput(this.ctrl); // jump edges + attack hold, once per frame
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // record pre-move positions for render lerp
      PlatformerController.update(this.world, this.ctrl); // movement/jump → velocity
      this.physics.update(this.world);
      EnemySystem.update(this.world); // patrol/turn (after SolidSystem)
      PlatformerController.attack(this.world, this.ctrl); // melee/ranged vs final positions

      // Player contact + hazard damage (before _trackDamage so the number pops).
      let hurt = EnemySystem.resolveTouch(
        this.world,
        this.ctrl.id,
        this.ctrl.iframes > 0,
      );
      if (
        !hurt &&
        this.ctrl.iframes <= 0 &&
        CollectibleSystem.hitSpike(this.world, this.ctrl.id)
      )
        hurt = true;
      if (hurt) this._takeHit();

      // Fell into the void → reset to spawn (no death/loss, like the old edge respawn).
      if (this.world.get(Position, this.ctrl.id).y > PLATF_DEATH_Y) {
        PlatformerController.respawn(this.world, this.ctrl, this.spawn);
        this._hpTrack[this.ctrl.id] = this.world.get(Health, this.ctrl.id).hp;
      }

      this._trackDamage(); // floating numbers for any hp change this tick
      this._resolveDeaths(); // spill loot for killed enemies (before flush removes them)
      this._collectDrops(); // pick up ground items into the bag
      this._checkPlayerDeath(); // hp ≤ 0 → respawn at spawn, full hp

      this.world.flush();
    }

    StorageUI.update(this); // chest proximity + open/close + transfers
    this.camera.update();

    // Rebuild the inventory window body only when its contents changed (open + dirty).
    if (this.invOpen && this._invDirty) {
      this._rebuildInventory();
      this._invDirty = false;
    }
  }

  // Apply one enemy/spike hit to the player: damage reduced by defense (min 1),
  // then grant i-frames.
  _takeHit() {
    const hp = this.world.get(Health, this.ctrl.id);
    const st = this.world.get(Stats, this.ctrl.id);
    const def = st !== undefined ? st.defense : 0;
    const dmg = Math.max(1, PLATF_TOUCH_DMG - def);
    hp.hp -= dmg;
    this.ctrl.iframes = PLATF_HIT_IFRAMES;
  }

  // Floating combat text: diff each combatant's Health against last tick and pop a
  // number on any change (white over enemies, red over the player; "+N" heals rise).
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
          FloatingText.push(pos.x, pos.y - 28, -d, {
            type: isPlayer ? "hurt" : "damage",
          });
        else FloatingText.push(pos.x, pos.y - 28, "+" + d, { type: "heal" });
      }
    }
    this._hpTrack[id] = hp.hp;
  }

  // Weapons zero a hit enemy's hp and queue its removal; this runs before flush so
  // the entity is still readable — spill its loot Inventory as ground drops.
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
        this.world.remove(id);
        this.enemies.splice(i, 1);
        Log.info("enemy killed");
      }
    }
  }

  _spillLoot(enemyId) {
    const inv = this.world.get(Inventory, enemyId);
    const pos = this.world.get(Position, enemyId);
    if (inv === undefined || pos === undefined) return;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const ox = (i % 2 === 0 ? -1 : 1) * 16;
      const oy = (i < 2 ? -1 : 1) * 12;
      this._spawnDrop(s.itemId, s.qty, pos.x + ox, pos.y - 12 + oy);
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
  // (item drops + spikes); pick up the drops into the bag.
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
        this._invDirty = true; // bag changed — refresh the window if open
        Log.info(`picked up ${got}x ${d.itemId}`);
      }
      if (left <= 0) this.world.remove(id);
      else d.qty = left; // bag full — leave the remainder on the ground
    }
  }

  // Enemy contact / spikes drain Health. On death, respawn at spawn with full hp
  // (kept deliberately soft — no progress lost).
  _checkPlayerDeath() {
    const hp = this.world.get(Health, this.ctrl.id);
    if (hp === undefined || hp.hp > 0) return;
    const st = this.world.get(Stats, this.ctrl.id);
    hp.hp = st !== undefined ? st.maxHp : 10;
    PlatformerController.respawn(this.world, this.ctrl, this.spawn);
    this._hpTrack[this.ctrl.id] = hp.hp; // don't pop a "+heal" for the respawn refill
    Log.info("player died — respawned at spawn");
  }

  // ── UI panels (manager-drawn, GUI layer) ─────────────────────────────────

  // Top-right HUD card: level + HP (live).
  _buildHud() {
    const hud = new UIElement({
      positionType: "absolute",
      top: 16,
      right: 16,
      width: 260,
    });
    const card = gemsCard({ padding: GemsTheme.padSm });
    const row = new UIElement({ width: "100%", height: 24 });
    row.insertChild(
      gemsLabel(
        () => {
          const st = this.world.get(Stats, this.ctrl.id);
          const hpC = this.world.get(Health, this.ctrl.id);
          const hp = hpC !== undefined ? hpC.hp : 0;
          return I18n.text("PLAT_HUD", st.level, hp, st.maxHp);
        },
        { color: GemsTheme.text, font: I18n.font("header") },
      ),
    );
    card.insertChild(row);
    hud.insertChild(card);
    this.ui.insertChild(hud);
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
  // when the bag changed (open + _invDirty), not per frame — child tree edits are safe
  // (it's flexpanel *style* mutation that's unreliable on GMRT 0.19).
  _rebuildInventory() {
    const body = this._invWin.body;
    // Preserve the item-list scroll offset across the rebuild — equipping/using an
    // item marks the bag dirty, and rebuilding the whole body would otherwise snap the
    // list back to the top on every click.
    let savedScroll = 0;
    if (this._invScroll !== undefined) {
      const old = this._invScroll.getComponent(UIScroll);
      if (old !== undefined) savedScroll = old.scroll;
    }
    const kids = [...body.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    const world = this.world;
    const inv = world.get(Inventory, this.ctrl.id);

    const top = new UIElement({
      width: "100%",
      height: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const usageCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    usageCell.insertChild(
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
    top.insertChild(usageCell);
    top.insertChild(
      gemsButton(
        I18n.textRef("SORT"),
        () => {
          InventorySystem.sort(world.get(Inventory, this.ctrl.id));
          this._invDirty = true;
        },
        { width: 90, height: 28 },
      ),
    );
    body.insertChild(top);

    // Item rows (clickable: equip/unequip or use).
    const scroll = gemsScroll({ height: 180 });
    if (inv.slots.length === 0) {
      const r = new UIElement({ width: "100%", height: 24 });
      r.insertChild(
        gemsLabel(I18n.textRef("TOPDOWN_EMPTY"), { color: GemsTheme.textDim }),
      );
      scroll.scrollBody.insertChild(r);
    }
    // Equipment references items by id, so with two of the same equippable only ONE
    // is actually worn — let the first matching row claim the "(equipped)" marker.
    const wornClaimed = {};
    for (let i = 0; i < inv.slots.length; i++)
      scroll.scrollBody.insertChild(this._itemRow(inv.slots[i], wornClaimed));
    body.insertChild(scroll);
    this._invScroll = scroll;
    const sc = scroll.getComponent(UIScroll);
    if (sc !== undefined) {
      sc.scroll = savedScroll; // clamped to the new content height on next update
      scroll.scrollY = savedScroll; // apply now so this frame doesn't flash to top
    }

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

    // Stats (live).
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
  }

  // One inventory row: a button labeled "name xN value [equipped]", tinted by rarity.
  // `wornClaimed` is a per-rebuild map so only the first row of a given equipped item
  // shows the marker (equipment is keyed by itemId, not by slot instance).
  _itemRow(slot, wornClaimed) {
    const itemId = slot.itemId;
    const it = Item.get(itemId);
    const eq = this.world.get(Equipment, this.ctrl.id);
    let worn = false;
    if (it !== undefined && it.hasComponent(Equippable)) {
      const eqp = it.getComponent(Equippable);
      if (eq.slots[eqp.slot] === itemId && !wornClaimed[itemId]) {
        worn = true;
        wornClaimed[itemId] = true;
      }
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
    return gemsButton(label, () => this._useItem(itemId, worn), {
      height: 32,
      textColor: PlatformerUI._rarityColor(itemId),
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
        { height: 30, textColor: PlatformerUI._rarityColor(itemId) },
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
  // are used (one unit). `wasWorn` is the row's displayed equipped-state — acting on it
  // (not on the shared itemId) means that with two identical equippables only the row
  // shown as equipped unequips; clicking the spare falls to equip(), which no-ops for
  // an already-equipped item rather than toggling the worn one off.
  _useItem(itemId, wasWorn) {
    const item = Item.get(itemId);
    if (item === undefined) return;
    if (item.hasComponent(Equippable)) {
      const eqp = item.getComponent(Equippable);
      if (wasWorn) {
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

  draw() {
    PlatformerUI.drawWorld(this); // item drops + bullets (world space)
    this.renderer.draw(this.world); // player / enemies: colored boxes + labels + bbox
    FloatingText.draw(); // damage/heal numbers (world space)
    // HUD + inventory are now manager-drawn UI panels (GUI layer, Draw_75), built in
    // create() — nothing more to draw here.
  }

  destroy() {
    PlatformerController.destroy();
    teardownScene(this);
  }
}
