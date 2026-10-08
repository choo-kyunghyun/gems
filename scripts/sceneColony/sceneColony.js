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
  create() {
    contentQuests.register();
    contentAchievements.register();
    App.hook(Tracker, "rules", contentAchievements);

    // the stat model behind the combat and item rules
    App.hook(Combat, "mitigate", PlayerSystem.mitigate);
    App.hook(Consumption, "grantAttr", StatModel.grant);
    App.hook(Effects, "onStatsChanged", StatModel.recompute);
    // progress shows as toasts, a reward as a refreshed bag
    App.hook(Progression, "onUnlock", (achId) => {
      const a = Achievement.get(achId);
      Toast.push(I18n.text("ACH_TOAST", I18n.text(a.name)), { type: "success" });
    });
    App.hook(Progression, "onReward", () => {
      this.window.dirty = true;
    });
    // a lost build, a squad member's knock-out and its recovery show as toasts
    App.hook(StructureSystem, "onLost", BuildMode.lost);
    App.hook(Mortality, "onDown", (entities, id) => {
      Toast.push(I18n.text("FOLLOWER_DOWN", this._followerName(entities, id)), {
        type: "warn",
      });
    });
    App.hook(Mortality, "onRecover", (entities, id) => {
      Toast.push(I18n.text("FOLLOWER_RECOVERED", this._followerName(entities, id)), {
        type: "success",
      });
    });
    // a fresh session starts from a blank world; a load imports its records below
    this.world = World.open();
    // the BGM fallback is the active map's bed, read live so one hook serves every map
    App.hook(Radio, "ambient", () => ColonyMap.bed(this.level));

    this.dialogue = Dialogue.make(); // what an NPC is saying

    // marks a gameplay scene, which suspends menu navigation while playing
    this.gameplay = true;

    this._buildUI();

    // a pending save replaces a new game's map, kit and companion
    if (SaveGame.pending()) {
      // the player is already in the restored map's store, so nothing lands or moves
      ColonyTravel.go(this, SaveGame.restore(this), "default");
      if (this.playerId === undefined) Log.error("SaveGame: no player in the restored map");
    } else ColonyStart.begin(this);

    // the base context; _resolveContext sets each frame's own
    InputContext.push("play");

    Log.info(
      `colony ready — items=${Item.all().length} quests=${QuestLog.all().length} ` +
        `achievements=${Achievement.all().length} kills=${Tracker.count("enemiesKilled")}`,
    );
  }

  /**
   * Build the persistent UI tree. It reads the entities and the player live and holds no gameplay
   * state, so retheme() can tear it down and rebuild it.
   */
  _buildUI() {
    this.ui = facetRoot();
    UI.insert(this.ui);
    this.hud = Hud.build(this);
    this.interact = Interactable.build(this);
    this.build = BuildMode.build(this);
    // one window standing in for every panel above, holding every page under the id that opens
    // it; it opens below the key hints
    const pad = FacetTheme.pad;
    this.window = new Window(this.ui, { top: pad + FacetTheme.lineH + FacetTheme.gap });
    const equipSlots = [
      { slot: "weapon", labelKey: "SLOT_WEAPON" },
      { slot: "head", labelKey: "SLOT_HEAD" },
      { slot: "body", labelKey: "SLOT_BODY" },
      { slot: "legs", labelKey: "SLOT_LEGS" },
      { slot: "outer", labelKey: "SLOT_OUTER" },
      { slot: "hands", labelKey: "SLOT_HANDS" },
      { slot: "feet", labelKey: "SLOT_FEET" },
      { slot: "backpack", labelKey: "SLOT_BACKPACK" },
      { slot: "trinket", labelKey: "SLOT_TRINKET" },
    ];
    this.window.add(
      "bag",
      InventoryUI.build(this, {
        equipSlots,
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
    this.window.add("loadout", LoadoutUI.build(this, equipSlots)); // a squad member or a gun
    this.window.add("workbench", CraftingUI.build(this));
    this.window.add("modbench", WeaponModUI.build(this));
    this.window.add("travel", WorldMapUI.build(this));
    this.window.add("trade", TradeUI.build(this));
    this.window.add("settlement", SettlementUI.build(this));
    // after the window, so these stay over it
    const hints = new UIElement({
      positionType: "absolute",
      left: pad,
      right: pad,
      top: pad,
      height: FacetTheme.lineH,
    });
    hints.insertChild(facetKeyHints(contentHud.HINTS, { color: "#888888" }));
    this.ui.insertChild(hints);
    this.ui.insertChild(this.hud.sleep);
    this.dialogueView = DialogueUI.build(this);
  }

  /**
   * Live theme swap: close what is transient rather than carry its state onto fresh elements,
   * then rebuild the UI so it bakes the new palette. World state is untouched.
   */
  retheme() {
    Sleep.wake(this.level.entities, this.playerId);
    Dialogue.clear(this.dialogue);
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
    // the dial's track sets the tempo the next frame runs at
    Radio.update();
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

    // latched once per frame, as the mouse is sampled live; on the ground plane, since cells
    // and footprints are what it names
    this.mouseWorld = CameraSystem.view(this.level).cursorWorld();

    // the bag closes on its own key, and opens over whatever page shows; on a gun seat it is the
    // carrier's gear instead, since E there steps off
    if (Input.get("inventory").pressed()) {
      const store = Boarding.store(this.level.entities, this.playerId);
      const page = store !== -1 ? "loadout" : "bag";
      if (this.window.is(page)) this.window.close();
      else this.window.open(page, { target: store });
    }

    // before the sim, so its input reads see the context
    this._resolveContext();

    // after the context, so it is inert in build mode and binds under the bag
    this._useHotbar();
  }

  /**
   * The map's processes on world hours, then the bodies' on Time.step, then what the frame's
   * hits and deaths resolve to — all before the flush, so every structural change commits this
   * frame.
   */
  _simulate() {
    // before the cold reads shelter
    RoomSystem.update(this.level);
    FloraSystem.update(this.level);
    GrassSystem.update(this.level);
    TradeSystem.update(this.level);

    StatusSystem.update(this.level);
    EncumbranceSystem.update(this.level);
    NeedSystem.update(this.level);
    ColdSystem.update(this.level);
    SleepSystem.update(this.level);
    PuppetSystem.update(this.level);
    FollowerSystem.update(this.level);
    PlayerSystem.update(this.level);
    StateSystem.update(this.level);
    PathfindingSystem.update(this.level);
    VehicleSystem.update(this.level);
    SolidSystem.update(this.level);
    SeparationSystem.update(this.level);
    // once the carriers have moved
    RideSystem.update(this.level);
    ProjectileSystem.update(this.level);
    FuseSystem.update(this.level);
    LifetimeSystem.update(this.level);

    HitFeedbackSystem.update(this.level);
    MortalSystem.update(this.level);
    StructureSystem.update(this.level);
    ReachSystem.update(this.level);
  }

  /** The bodies' poses for this frame, which the pick tests against. */
  _animate() {
    DollSystem.update(this.level);
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
    Hud.update(this, this.hud);
  }

  /** The frame's sight and sound on the sim clock. */
  _present() {
    ParticleFx.update(this.level);
    // the sim-clock camera policies; the wall-clock one runs from draw() so it keeps moving
    // while the sim is paused
    CameraSystem.update(this.level);
    ListenerSystem.update(this.level);
    SoundEmitterSystem.update(this.level);
    ParticleEmitterSystem.update(this.level);
  }

  /**
   * The world's own time — the clock, then the sky. Every passage of world time goes through here,
   * so no world ticker is left behind.
   */
  tickWorld(dt) {
    WorldClock.update(dt);
    Weather.update(dt);
  }

  /**
   * A map arrival: the scene's per-map transients reset, kept off the level so a resume can't
   * restore a stale one.
   */
  arrive() {
    this.build.armed = false;
    this.build.active = false;
    this.window.dirty = true;
  }

  /**
   * A hotbar key uses its slot in play, binds it over the bag, and is idle in another window. The
   * pad, with no key per slot, steps the bar's cursor and uses the slot under it, in play alone.
   */
  _useHotbar() {
    const hb = this.level.entities.require(this.playerId, Hotbar);
    const inv = this.level.entities.require(this.playerId, Inventory);
    for (let i = 0; i < hb.slots.length; i++) {
      if (!Input.get("hotbar" + (i + 1)).pressed()) continue;
      if (this.window.isOpen()) {
        if (this.window.is("bag")) InventoryUI.bindKey(this, this.window.page, i);
        continue;
      }
      this._useSlot(hb, inv, i);
    }
    if (Input.get("hotbarNext").pressed()) Hud.cycleHotbar(this.hud);
    if (Input.get("hotbarUse").pressed())
      this._useSlot(hb, inv, Hud.hotbarSlot(this.hud));
  }

  _useSlot(hb, inv, i) {
    this.showHotbar(i); // even an empty slot reveals the bar
    const itemId = hb.slots[i];
    if (itemId === "") return;
    InventoryUI.use(this, itemId, Belt.instance(hb, inv, i));
  }

  /** Reveal the hotbar HUD and restart its auto-hide countdown; a pressed `slot` takes the cursor. */
  showHotbar(slot = -1) {
    Hud.showHotbar(this.hud, slot);
  }

  _followerName(entities, id) {
    const nm = entities.get(id, Name);
    return nm !== undefined ? nm.name : I18n.text("FOLLOWER_DEFAULT");
  }

  /** A dialogue outranks a window, which outranks build mode, which it pauses. */
  _resolveContext() {
    let ctx = "play";
    if (Dialogue.isOpen(this.dialogue)) ctx = "dialogue";
    else if (this.window.isOpen()) ctx = "window";
    else if (this.build.armed) ctx = "build";
    InputContext.set(ctx);
    // the menu nav drives a window alone, so elsewhere the gamepad plays
    UINav.suspended = ctx !== "window";
  }

  /**
   * One E press pages an open dialogue, else closes a page standing over a target, else activates
   * the frame's pick, so E only acts on what is highlighted. The bag stands over nothing, so E
   * under it opens the pick's page in its place. Interact is muted in build mode. F runs the
   * pick's secondary action in play, and in build mode leaves it.
   */
  _dispatchInteract() {
    if (Input.get("interactAlt").pressed()) {
      if (this.build.armed) this.build.armed = false;
      else Interactable.activateAlt(this, this.interact);
    }
    if (!Input.get("interact").pressed()) return;
    if (Dialogue.isOpen(this.dialogue)) DialogueUI.advance(this.dialogueView);
    else if (this.window.target !== -1) this.window.close();
    else Interactable.activate(this, this.interact);
  }

  /**
   * Esc back-out before the pause menu: wake, else back out of the window, else leave build mode.
   * Returns whether the press was consumed.
   */
  handleEscape() {
    if (Sleep.wake(this.level.entities, this.playerId)) return true;
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
    const stage = ColonyView.stage(this.level);
    CameraSystem.apply(this.level);
    stage.bbox.enabled = Settings.get("debugBBox");
    stage.renderer.draw(this.level.entities);
    // the pick and the build cursor over the world
    Interactable.drawTarget(this, this.interact);
    BuildMode.drawWorld(this, this.build);
  }

  /** Free what this scene made: its world and its UI. */
  destroy() {
    Maps.close(this.world);
    if (this.ui) {
      UI.remove(this.ui);
      this.ui.destroy();
    }
  }
}
