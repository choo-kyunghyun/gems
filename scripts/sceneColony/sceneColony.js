globalThis.sceneColony = () => new _SceneColonyClass();
Scene.register(sceneColony, {
  label: I18n.textRef("COLONY_NAME"),
  category: "SCENE_CAT_GAME",
});

/**
 * The colony game scene: wires the colony's rules into the rule-free Core areas, owns the
 * persistent UI, and states the order of every system in a frame.
 */
class _SceneColonyClass {
  constructor() {
    this.label = "Colony"; // in the constructor, never a class field (docs/GMRT.md)
  }

  create(openScene) {
    contentQuests.register();
    contentAchievements.register();
    Tracker.rules = contentAchievements;

    // static hooks: they survive map reloads
    Combat.mitigate = StatModel.mitigate;
    Consumption.grantAttr = StatModel.grant;
    Effects.onStatsChanged = StatModel.recompute;
    // progress shows as toasts, a reward as a refreshed bag
    Progression.onUnlock = (achId) => {
      const a = Achievement.get(achId);
      Toast.push(I18n.text("ACH_TOAST", I18n.text(a.name)), { type: "success" });
    };
    Progression.onReward = () => {
      this.window.dirty = true;
    };
    // a squad member's knock-out and recovery show as toasts
    Mortality.onDown = (entities, id) => {
      Toast.push(I18n.text("FOLLOWER_DOWN", this._followerName(entities, id)), {
        type: "warn",
      });
    };
    Mortality.onRecover = (entities, id) => {
      Toast.push(I18n.text("FOLLOWER_RECOVERED", this._followerName(entities, id)), {
        type: "success",
      });
    };
    // a fresh session starts from a blank world; a load imports its records below
    this.world = new World();
    World.active = this.world;
    // the BGM fallback is the active map's bed, read live so one hook serves every map
    Radio.reset();
    Radio.ambient = () => ColonyMap.bed(this.level);

    this.sleep = Sleep.make(); // resting in a bed, time fast-forwarded

    // marks a gameplay scene, which suspends menu navigation while playing
    this.gameplay = true;

    this._radarRules = contentHud.radar();

    this._buildUI();

    this.stages = {}; // map id -> its ColonyStage, built on the map's first activation
    // a pending save replaces the fresh map, loadout and seeding below
    const loaded = SaveGame.pending();
    if (loaded) {
      // the player is already in the restored map's store, so nothing lands or moves
      ColonyTravel.go(this, SaveGame.restore(this), "default");
      if (this.playerId === undefined) Log.error("SaveGame: no player in the restored map");
    } else {
      for (let i = 0; i < contentStart.QUESTS.length; i++)
        Tracker.accept(contentStart.QUESTS[i]);
      ColonyTravel.go(this, ColonyLevel.START, "default");
    }
    // the restored station, else the map's bed; it carries across map changes
    const station = Radio.station();
    Music.play(station !== -1 ? station : ColonyMap.bed(this.level));

    if (!loaded) this._seed();

    // the base context; _resolveContext sets each frame's own
    InputContext.push("play");

    Log.info(
      `colony ready — items=${Item.all().length} quests=${QuestLog.all().length} ` +
        `achievements=${Achievement.all().length} kills=${Tracker.count("enemiesKilled")}`,
    );
  }

  /**
   * A new game's player kit and companion. Seeded in code, not the map file, so a
   * persistent-map reload can't duplicate them; a load restores their records instead.
   */
  _seed() {
    const entities = this.level.entities;
    const inv = entities.require(this.playerId, Inventory);
    const kit = contentStart.KIT;
    for (let i = 0; i < kit.length; i++) {
      Bag.add(inv, kit[i].itemId, kit[i].qty);
      if (kit[i].equip === true) Loadout.equipFirst(entities, this.playerId, kit[i].itemId);
    }
    const c = contentStart.COMPANION;
    const pp = entities.require(this.playerId, Position);
    const companion = ColonySpawn.spawnFollower(entities, pp.x + c.x, pp.y + c.y, c.follower);
    Companions.hire(entities, this.playerId, companion);
  }

  /**
   * Build the persistent UI tree. It reads the entities and the player live and holds no gameplay
   * state, so retheme() can tear it down and rebuild it.
   */
  _buildUI() {
    this.ui = facetRoot();
    UI.insert(this.ui);
    this.ui.body.insertChild(facetKeyHints(contentHud.HINTS, { color: "#888888" }));
    this.hud = Hud.build(this);
    // one window after the HUD, whose veil covers it, holding every page under the id that opens it
    this.window = new Window(this.ui);
    this.window.add(
      "bag",
      InventoryUI.build(this, {
        equipSlots: [
          { slot: "weapon", labelKey: "SLOT_WEAPON" },
          { slot: "armor", labelKey: "SLOT_ARMOR" },
          { slot: "trinket", labelKey: "SLOT_TRINKET" },
          { slot: "backpack", labelKey: "SLOT_BACKPACK" },
        ],
        extraRows: (scene, body) => {
          const rec = new UIElement({ width: "100%", height: 22 });
          rec.insertChild(
            facetLabel(
              () =>
                I18n.text("REC_KILLS") +
                ": " +
                Tracker.count("enemiesKilled") +
                "   " +
                I18n.text("REC_ITEMS") +
                ": " +
                Tracker.count("itemsCollected") +
                "   " +
                I18n.text("REC_QUESTS") +
                ": " +
                Tracker.count("questsCompleted"),
              { color: FacetTheme.textMuted },
            ),
          );
          body.insertChild(rec);
        },
      }),
    );
    this.window.add("storage", StorageUI.build(this)); // a chest, or a corpse's loot
    this.window.add("workbench", CraftingUI.build(this));
    this.window.add("travel", WorldMapUI.build(this));
    this.window.add("trade", TradeUI.build(this));
    this.interact = Interactable.build(this);
    this.build = BuildMode.build(this);
  }

  /**
   * Live theme swap: close what is transient rather than carry its state onto fresh elements,
   * then rebuild the UI so it bakes the new palette. World state is untouched.
   */
  retheme() {
    Sleep.wake(this.sleep);
    this.window.close();
    if (this.ui) {
      UI.remove(this.ui);
      this.ui.destroy();
    }
    this._buildUI();
  }

  /**
   * The frame's order, one phase per line. A map swap never runs in here — it lands between
   * frames, so nothing in a frame touches a swapped-out map. What the scene shows of a gameplay
   * reaction is a hook wired at create, so the phases state order alone.
   */
  update() {
    // no pause gate: a paused scene is not updated
    this._input();
    // the world first, on sim time so it pauses with the game: every system below reads one
    // now, and what a due event spawns simulates this frame
    this.tickWorld(Time.delta);
    this._simulate();
    this.level.entities.flush();
    this._animate();
    this._ui();
    this._present();
    // last, so every write above lands this frame; after the UI update, so a rebuild never
    // lands inside the click that requested it
    this.window.update();
  }

  /** The frame's reads of the player's intent, latched before anything simulates. */
  _input() {
    // derived each frame, the self-heal after a store swap
    this.playerId = ColonyPlayer.id(this.level.entities);

    // before the sim, so the waking press wakes instead of moving this frame; any press wakes,
    // claimed or not — not an action
    if (Input.anyPressed()) Sleep.wake(this.sleep);
    else Sleep.ramp(this.sleep, this.level.entities);

    // a timed track runs the whole world at its beat, from the next frame on
    Time.tempo = Radio.tempo(Music.track());

    // latched once per frame, as the mouse is sampled live; on the ground plane, since cells
    // and footprints are what it names
    const view = CameraSystem.view(this.level);
    this.mouseWorld = view.cursorWorld();
    // the aim: the same cursor resolved against what it visibly covers, so a shot at a body
    // reaches the footprint the sim tests
    const aim = ColonyPlayer.aim(this.level.entities, this.playerId, view);
    const pl = this.level.entities.get(this.playerId, Playable);
    pl.cursorX = aim.x;
    pl.cursorY = aim.y;

    // the bag closes on its own key, and opens over whatever page shows
    if (Input.get("inventory").pressed()) {
      if (this.window.is("bag")) this.window.close();
      else this.window.open("bag");
    }

    // before the sim, so its input reads see the context
    this._resolveContext();

    // after the context, so it is inert under a window or in build mode
    this._useHotbar();
  }

  /**
   * The map's processes on world hours, then the bodies' on Time.step, then what the frame's
   * hits and deaths resolve to — all before the flush, so every structural change commits this
   * frame.
   */
  _simulate() {
    // before the needs read shelter
    RoomSystem.update(this.level);
    FloraSystem.update(this.level);
    GrassSystem.update(this.level);
    TradeSystem.update(this.level);

    StatusSystem.update(this.level);
    EncumbranceSystem.update(this.level);
    NeedSystem.update(this.level);
    Sleep.rest(this.sleep, this.level.entities, this.playerId);
    PuppetSystem.update(this.level);
    FollowerSystem.update(this.level);
    PlayerSystem.update(this.level);
    StateSystem.update(this.level);
    PathfindingSystem.update(this.level);
    SolidSystem.update(this.level);
    SeparationSystem.update(this.level);
    ProjectileSystem.update(this.level);
    FuseSystem.update(this.level);
    LifetimeSystem.update(this.level);

    HitFeedbackSystem.update(this.level);
    MortalSystem.update(this.level);
    Progression.reach(this.level);
  }

  /** The bodies' poses for this frame, which the pick tests against. */
  _animate() {
    Doll.pace(this.level.entities);
    SpriteSystem.update(this.level);
    AppearanceSystem.update(this.level);
  }

  /**
   * The pick and what acts on it, then the HUD that reports both. Ahead of the camera, so the
   * pick reads the view the cursor was latched through.
   */
  _ui() {
    Interactable.update(this, this.interact);
    this._dispatchInteract();
    BuildMode.update(this, this.build);
    BuildMode.reapDestroyed(this);
    Hud.update(this, this.hud);
  }

  /** The frame's sight and sound on the sim clock. */
  _present() {
    ParticleFx.update();
    // the sim-clock camera policies; the wall-clock one runs from draw() so it keeps moving
    // while the sim is paused
    CameraSystem.update(this.level);
    this._listen();
    SoundEmitterSystem.update(this.level);
    ParticleEmitterSystem.update(this.level);
  }

  /**
   * Hear from the tracked body, not the view: the view clamps at map edges and a free camera
   * flies away from it; the view's look-at is the fallback without a tracked body.
   */
  _listen() {
    const entities = this.level.entities;
    const ep = entities.get(entities.first(CameraFocus), Position);
    if (ep !== undefined) Audio.listen(ep.x, ep.y);
    else {
      const view = CameraSystem.view(this.level);
      Audio.listen(view.toX, view.toY);
    }
  }

  /**
   * The world's own time — the clock, then the sky and the events due by it. Every passage of
   * world time goes through here, so no world ticker is left behind.
   */
  tickWorld(dt) {
    WorldClock.update(dt);
    Weather.update(dt);
    WorldEvents.update(WorldClock.absHours());
  }

  /**
   * A map arrival: the scene's per-map transients reset, kept off the level so a resume can't
   * restore a stale one; the previous map's world-space effects drop, as their coordinates are
   * map-local; and the new map's bed, unless the radio plays through it, and its climate take over.
   */
  arrive() {
    this.build.armed = false;
    this.build.active = false;
    this.window.dirty = true;
    if (!Radio.on()) Music.play(ColonyMap.bed(this.level));
    Weather.setClimate(this.level.entities.get(this.level.self, ColonyMap.CLIMATE));
    FloatingText.clear();
    ParticleFx.clear();
    WorldOverlay.clearTracers();
  }

  _useHotbar() {
    const hb = this.level.entities.require(this.playerId, Hotbar);
    for (let i = 0; i < hb.slots.length; i++) {
      if (!Input.get("hotbar" + (i + 1)).pressed()) continue;
      this.showHotbar(); // even an empty slot reveals the bar
      const itemId = hb.slots[i];
      if (itemId === "") continue;
      const worn = Loadout.worn(this.level.entities, this.playerId, itemId);
      InventoryUI.useItem(this, itemId, worn);
    }
  }

  /** Reveal the hotbar HUD and restart its auto-hide countdown. */
  showHotbar() {
    Hud.showHotbar(this.hud);
  }

  _followerName(entities, id) {
    const nm = entities.get(id, Name);
    return nm !== undefined ? nm.name : I18n.text("FOLLOWER_DEFAULT");
  }

  /** A window outranks build mode, which it pauses. */
  _resolveContext() {
    let ctx = "play";
    if (this.window.isOpen()) ctx = "window";
    else if (this.build.armed) ctx = "build";
    InputContext.set(ctx);
  }

  /**
   * One E press closes a page standing over a target, else activates the frame's pick, so E only
   * acts on what is highlighted. The bag stands over nothing, so E under it opens the pick's page
   * in its place. Interact is muted in build mode.
   */
  _dispatchInteract() {
    if (!Input.get("interact").pressed()) return;
    if (this.window.target !== -1) this.window.close();
    else Interactable.activate(this, this.interact);
  }

  /**
   * Esc back-out before the pause menu: wake, else back out of the window, else leave build mode.
   * Returns whether the press was consumed.
   */
  handleEscape() {
    if (Sleep.wake(this.sleep)) return true;
    if (this.window.back()) return true;
    if (this.build.armed) {
      this.build.armed = false;
      return true;
    }
    return false;
  }

  draw() {
    // the camera's wall-clock policy, so a free camera keeps moving while the sim is paused,
    // then this frame's matrices — before the renderer reads the view
    const stage = this.stages[this.level.id];
    CameraSystem.apply(this.level);
    const camera = CameraSystem.view(this.level);
    stage.bbox.enabled = Settings.get("debugBBox");
    stage.renderer.draw(this.level.entities);
    // after the renderer: the ground passes paint an opaque fill that would cover it
    WorldOverlay.drawWorld(this);
    if (Settings.get("hudRadar"))
      // lifted to body height under a pitched camera
      RadarArrows.draw(this.level.entities, this.playerId, this._radarRules, {
        lift: camera.pitch !== 0 ? 32 : 0,
      });
    Interactable.drawTarget(this, this.interact);
    BuildMode.drawWorld(this, this.build);
    // additive, so bright over the day/night tint
    ParticleEmitterSystem.draw(
      this.level.entities,
      (camera.pitch * 180) / Math.PI,
    );
    ParticleFx.draw();
    // pitch in degrees, so the numbers stand up under a pitched camera
    FloatingText.draw((camera.pitch * 180) / Math.PI);
  }

  /** Release only what this scene wired. */
  destroy() {
    Radio.reset();
    Progression.reset();
    Mortality.reset();
    WorldEvents.reset();
    ColonyTravel.suspend(this); // release the view before its camera is freed with the level
    for (const id in this.stages) this.stages[id].renderer.destroy();
    World.active = null;
    this.world.destroy();
    if (this.ui) {
      UI.remove(this.ui);
      this.ui.destroy();
    }
  }
}
