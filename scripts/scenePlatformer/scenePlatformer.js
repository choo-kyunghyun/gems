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
    this.invSel = 0;
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

    Log.info(
      `Platformer RPG ready — items=${Item.all().length} enemies=${this.enemies.length}`,
    );
  }

  step() {
    if (PauseMenu.update()) return; // paused — freeze the sim

    if (Input.get("inventory").pressed()) this.invOpen = !this.invOpen;
    if (this.invOpen) this._handleInventoryInput();

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

    this.camera.update();
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
      if (got > 0) Log.info(`picked up ${got}x ${d.itemId}`);
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

  // While the bag is open, Up/Down move the cursor and Enter acts on the selected
  // line: equippables toggle equip/unequip, consumables are used. Direct keyboard
  // read — transient UI input, not a rebindable gameplay action.
  _handleInventoryInput() {
    const inv = this.world.get(Inventory, this.ctrl.id);
    const n = inv.slots.length;
    if (n === 0) {
      this.invSel = 0;
      return;
    }
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
        // Refill tracker so the heal pops as a "+N" rather than being swallowed.
        Log.info(`used ${itemId}`);
      }
    }
  }

  draw() {
    PlatformerUI.drawWorld(this); // item drops + bullets (world space)
    this.renderer.draw(this.world); // player / enemies: colored boxes + labels + bbox
    FloatingText.draw(); // damage/heal numbers (world space, before HUD)

    const cam = this.camera.id; // view_camera[] isn't exposed in GMRT JS
    const vx = camera_get_view_x(cam);
    const vy = camera_get_view_y(cam);
    const vw = camera_get_view_width(cam);
    const vh = camera_get_view_height(cam);

    const col = draw_get_colour();
    const ha = draw_get_halign();
    const va = draw_get_valign();
    const fnt = draw_get_font();

    PlatformerUI.drawHud(this, vx, vy, vw, vh);
    if (this.invOpen) PlatformerUI.drawInventory(this, vx, vy, vw, vh);

    draw_set_colour(col);
    draw_set_halign(ha);
    draw_set_valign(va);
    draw_set_font(fnt);
  }

  destroy() {
    PlatformerController.destroy();
    teardownScene(this);
  }
}
