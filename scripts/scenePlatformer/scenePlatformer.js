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

  create() {
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
    this.world.add(chest, Position, {
      x: this.spawn.x + 120,
      y: this.spawn.y,
      z: 0,
    });
    this.world.add(chest, BBox, { x: -16, y: -28, width: 32, height: 28 });
    this.world.add(chest, Collision, {
      solid: true,
      kinematic: true,
      oneWay: false,
      passThroughTicks: 0,
      mask: null,
      hits: [],
    });
    this.world.add(chest, Station, { kind: "storage" });
    this.world.add(chest, Name, { name: "Chest" });
    this.world.add(chest, Inventory, {
      slots: [
        { itemId: "potion", qty: 2 },
        { itemId: "wood_sword", qty: 1 },
        { itemId: "wood", qty: 5 },
        { itemId: "iron", qty: 3 },
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

    // Furniture: solid kinematic props resting on the ground line (BBox anchored at the
    // feet like the chest/player). A Station `kind` makes it interactable (Interactable
    // picks it by mouse/proximity, E opens its window); a decorative prop omits it.
    const addProp = (dx, name, col, kind) => {
      const e = this.world.create();
      this.world.add(e, Position, {
        x: this.spawn.x + dx,
        y: this.spawn.y,
        z: 0,
      });
      this.world.add(e, BBox, { x: -16, y: -28, width: 32, height: 28 });
      this.world.add(e, Collision, {
        solid: true,
        kinematic: true,
        oneWay: false,
        passThroughTicks: 0,
        mask: null,
        hits: [],
      });
      this.world.add(e, Name, { name });
      this.world.add(e, Visual, {
        visible: true,
        sprite: spr_play,
        subimg: 0,
        xscale: 1,
        yscale: 1,
        rot: 0,
        color: col,
        alpha: 1,
        speed: 0,
        time: 0,
      });
      if (kind !== undefined) this.world.add(e, Station, { kind });
      else this.world.add(e, Tag, { tags: new Set(["furniture"]) });
      return e;
    };
    addProp(200, "Workbench", make_colour_rgb(150, 110, 70), "workbench");
    addProp(64, "Barrel", make_colour_rgb(110, 80, 50)); // decorative

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

    // Gameplay scene: the SystemMenu overlay owns pause + exit (Esc / Start / F1) and
    // suspends menu nav while playing. Flag it here (a subclass field initializer
    // wouldn't run on GMRT).
    this.gameplay = true;

    // Control hint (flexpanel, GUI layer).
    this.ui = gemsRoot();
    UI.insert(this.ui);
    this.ui.insertChild(
      gemsLabel(I18n.textRef("PLAT_HINT"), { color: "#888888" }),
    );

    // Manager-drawn panels (GUI layer, screen-pinned): HUD (top-right) + the draggable
    // inventory window.
    this._buildHud();
    RpgInventoryUI.build(this);
    Interactable.build(this); // station prompt + storage + crafting windows

    Log.info(
      `Platformer RPG ready — items=${Item.all().length} enemies=${this.enemies.length}`,
    );
  }

  step() {
    // No pause gate here — obj_game skips scene.step() entirely while the SystemMenu is
    // open (global pause), so reaching this line means we're live.

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

      RpgScene.trackDamage(this, 28); // floating numbers for any hp change this tick
      RpgScene.resolveDeaths(this, {
        spill: { yBase: -12, ySpread: 12 },
        onKill: () => Log.info("enemy killed"),
      });
      RpgScene.collectDrops(this, (itemId, got) =>
        Log.info(`picked up ${got}x ${itemId}`),
      );
      RpgScene.checkPlayerDeath(this, () =>
        PlatformerController.respawn(this.world, this.ctrl, this.spawn),
      );

      this.world.flush();
    }

    Interactable.update(this); // station select + open/close + transfers/crafting
    this.camera.update();

    // Rebuild the inventory window body only when its contents changed (open + dirty).
    if (this.invOpen && this._invDirty) {
      RpgInventoryUI.rebuild(this, {
        equipSlots: [
          { slot: "weapon", labelKey: "SLOT_WEAPON" },
          { slot: "armor", labelKey: "SLOT_ARMOR" },
          { slot: "trinket", labelKey: "SLOT_TRINKET" },
        ],
      });
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

  draw() {
    RpgWorldOverlay.drawWorld(this); // item drops + bullets (world space)
    this.renderer.draw(this.world); // player / enemies: colored boxes + labels + bbox
    Interactable.drawTarget(this); // highlight the targeted station (world space)
    FloatingText.draw(); // damage/heal numbers (world space)
    // HUD + inventory are now manager-drawn UI panels (GUI layer, Draw_75), built in
    // create() — nothing more to draw here.
  }

  destroy() {
    PlatformerController.destroy();
    teardownScene(this);
  }
}
