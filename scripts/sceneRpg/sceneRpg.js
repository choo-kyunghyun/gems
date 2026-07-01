const RPG_NPC_RADIUS = 30; // interact range to the elder NPC (16px-cell scale; see GEMS.md)
const RPG_TRADE_RANGE = 64; // a merchant's TradeUI stays open within this range; auto-closes if you walk off
const RPG_START_CREDITS = 1000; // coins the player starts with (carried across maps via the inventory snapshot)
const RPG_SLEEP_SCALE = 6; // Time.scale while sleeping in a bed (fast-forward; capped by World.sim.maxTicks)
const RPG_SLEEP_RECOVER = 40; // Drowsiness drained per sim-second while sleeping
const RPG_HOTBAR_HUD_SECS = 3; // wall-clock seconds the hotbar HUD stays up after a hotbar keypress
const RPG_HOTBAR_SLIDE = 150; // GUI px the hotbar bar slides DOWN (off the bottom edge) when hidden
const RPG_HOTBAR_SLIDE_SPD = 16; // Tween.approach speed for the slide (higher = snappier pop)
const RPG_NAV_REBUILD_EVERY = 6; // frames between forced nav rebuilds (safety net for in-place collider edits)

// factory so the level editor's Test Play can open this scene; same ref SceneManager labels use
globalThis.SceneRpg = () => new _SceneRpgClass();
SceneRegistry.add(SceneRpg, {
  label: I18n.textRef("RPG_NAME"),
  category: "SCENE_CAT_RPG",
});

class _SceneRpgClass extends Level {
  label = "RPG";

  create() {
    // load before building anything
    SaveData.load();
    RpgQuests.register();
    Profile.load();
    Achievement.load();
    QuestLog.reset();
    QuestLog.accept(RpgQuests.QUEST_GATHER); // collect — tracked passively
    QuestLog.accept(RpgQuests.QUEST_REACH); // reach — tracked passively

    // inject stat-driven mitigation into the kit's stat-agnostic Combat applier (static hook, survives map reloads)
    Combat.mitigate = function (world, targetId, amount, penetration = 0) {
      const s = world.get(Stats, targetId);
      const defense = s !== undefined ? s.defense : 0;
      // clamp so penetration never adds damage; min-1 floor so every hit registers
      const effDef = Math.max(0, defense - penetration);
      return Math.max(1, amount - effDef);
    };
    // inject how a *_serum consumable raises an attribute; false → use() refuses (no waste)
    ConsumableSystem.grantAttr = function (world, id, attr, amount) {
      const a = world.get(Attributes, id);
      if (a === undefined || a[attr] === undefined) return false;
      a[attr] += amount;
      StatModel.recompute(world, id);
      return true;
    };
    // inject re-derive into StatusSystem so mods-bearing status buffs fold in/out on apply/expire;
    // dot/hot + live `mult` (encumbrance/speed) need no recompute — read directly / live
    StatusSystem.onStatsChanged = function (world, id) {
      StatModel.recompute(world, id);
    };

    // map pool: visited maps stay alive/suspended here (see RpgMap.go); _mapOrder is LRU order for
    // eviction past POOL_MAX; _mapCache holds cold-serialized evicted maps (Level.export + entities)
    this._maps = {};
    this._mapOrder = [];
    this._mapCache = {};

    // world event queue + level manager + wandering traders — reset per scene create so a fresh RPG
    // session can't inherit the previous one's schedule/records (Trader.reset re-installs handlers).
    World.levels.reset();
    WorldEvents.reset();
    Trader.reset();

    this.invOpen = false;
    this._invDirty = false; // rebuild the inventory window body next step when set
    this._hotbarTimer = RPG_HOTBAR_HUD_SECS; // counts down on Time.raw; hotbar HUD shows while > 0
    this._hotbarSlide = 0; // 0 = tucked below the screen, 1 = fully up; eased toward show/hide
    this._sleeping = false; // true while resting in a bed (Time.scale fast-forwarded — see _sleep)
    this.nearNpc = false;
    this.dialogueName = "";
    this.dialogueLine = "";
    this.dialogueAction = "";

    // flag gameplay so SystemMenu suspends nav while playing; can't be a field initializer (GMRT)
    this.gameplay = true;

    // persistent UI built once; reads world/ctrl live so it survives RpgMap.go's world swap
    this.ui = gemsRoot();
    UI.insert(this.ui);

    // RadarArrows component→color rules (first match wins); built here (not top level) so Color is
    // loaded; read live so it survives a world swap. `has` is a component token — presence = a blip.
    // Both enemy species share the enemy color; allies/props with none of these get no arrow.
    this._radarRules = [
      { has: Raider, color: Color.parse("#e0584f") },
      { has: Rat, color: Color.parse("#e0584f") },
      { has: NPC, color: Color.parse("#ffd166") },
      { has: Portal, color: Color.parse("#9b8cff") },
      { has: Follower, color: Color.parse("#6fd0a0") },
    ];
    // binding-driven key hints; bar reads each action's live binding (ready for remap) and
    // `contexts` gates entries per InputContext. `text` entries are non-rebindable keys.
    this.ui.insertChild(
      gemsKeyHints(
        [
          {
            actions: ["moveUp", "moveLeft", "moveDown", "moveRight"],
            label: "RPG_HINT_MOVE",
            contexts: ["play", "build", "window"],
          },
          {
            actions: ["sprint"],
            label: "RPG_HINT_SPRINT",
            contexts: ["play", "build"],
          },
          { actions: ["fire"], label: "RPG_HINT_ATTACK", contexts: ["play"] },
          { text: "LMB", label: "RPG_HINT_PLACE", contexts: ["build"] },
          { text: "RMB", label: "RPG_HINT_REMOVE", contexts: ["build"] },
          {
            actions: ["inventory"],
            label: "RPG_HINT_BAG",
            contexts: ["play", "build"],
          },
          { text: "1-5", label: "RPG_HINT_HOTBAR", contexts: ["play"] },
          { actions: ["interact"], label: "RPG_HINT_TALK", contexts: ["play"] },
          { actions: ["build"], label: "RPG_HINT_BUILD", contexts: ["play"] },
          {
            actions: ["build"],
            label: "RPG_HINT_EXIT_BUILD",
            contexts: ["build"],
          },
          {
            actions: ["follow"],
            label: "RPG_HINT_COMPANION",
            contexts: ["play", "build"],
          },
          { text: "Esc", label: "RPG_HINT_CLOSE", contexts: ["window"] },
        ],
        { color: "#888888" },
      ),
    );
    RpgHud.build(this); // top-right HP/quest card + bottom-center dialogue box
    RpgInventoryUI.build(this);
    Interactable.build(this); // station prompt + storage + crafting windows
    TradeUI.build(this); // near-fullscreen merchant shop (opened on a merchant NPC)
    BuildMode.build(this); // grid build mode (HUD + per-scene state)

    // boot at the overworld hub; the editor's Test Play overrides with a portal-less playtest file
    let bootMap = RpgLevel.START;
    if (RpgLevel.playtestFile !== undefined) {
      RpgLevel.MAPS._playtest = RpgLevel.playtestFile;
      RpgLevel.playtestFile = undefined;
      bootMap = "_playtest";
    }
    WorldClock.reset(); // once — survives map changes below
    Weather.reset(); // once — survives map changes, like the clock
    RpgMap.go(this, bootMap, "default");
    Audio.bgm("mus_overworld"); // carries across map changes (only _apply's reset stops it)

    // starting loadout, equipped so the attack is item-driven from frame one; travels with the
    // carried inventory across maps
    const startInv = this.world.get(Inventory, this.ctrl.id);
    InventorySystem.add(startInv, "lead_pipe", 1); // mints a uid instance (equippable gear)
    EquipmentSystem.equipFirst(this.world, this.ctrl.id, "lead_pipe"); // equip that instance by uid
    InventorySystem.add(startInv, "coin", RPG_START_CREDITS); // starting credits (coin stacks high → 1 slot)

    // seed one companion programmatically (not file-authored, so a persistent-map reload won't
    // dup it). spawns following → apply its carry bonus now; balanced thereafter by F-toggle/dismiss.
    const pp = this.world.get(Position, this.ctrl.id);
    const companion = RpgSpawn.spawnFollower(this.world, pp.x - 14, pp.y + 11, {
      label: "Companion",
      bonusCapacity: 4,
      bonusWeight: 15,
    });
    this.followers.push(companion);
    FollowerSystem.applyBenefit(
      this.world,
      this.ctrl.id,
      this.world.get(Follower, companion),
      1,
    );

    // a wandering trader (Trader/WorldEvents/Universe): crosses overworld <-> interior_01 off-focus on
    // the WorldClock timeline, embodied as a real Merchant NPC only in whatever map the player is in.
    Trader.register(this, {
      id: "peddler",
      name: "NPC_TRADER_NAME", // reused shop name (a dedicated i18n key is polish, not needed for demo)
      travelH: 2, // in-game hours in transit between stops
      route: [
        { map: "overworld", dwellH: 6 },
        { map: "interior_01", dwellH: 6 },
      ],
      merchant: {
        infinite: true,
        currencyId: "coin",
        buyMargin: 1.2,
        sellMargin: 0.5,
        stock: [
          { itemId: "medkit", qty: 1 },
          { itemId: "water_bottle", qty: 1 },
          { itemId: "ration_pack", qty: 1 },
          { itemId: "ammo_light", qty: 1 },
          { itemId: "wood", qty: 1 },
          { itemId: "scrap_metal", qty: 1 },
        ],
      },
    });

    // arcade cabinet: E launches the platformer as a guest minigame (Interaction kind
    // "arcade" → the "arcade" InteractAction → _openArcade). Lives directly in the world (not chunk-managed) so it persists.
    const sg = this.level.worldToGrid(this.spawn.x, this.spawn.y);
    RpgSpawn.spawnEntity(this.world, this.level, {
      preset: "prop",
      gx: sg.x + 2,
      gy: sg.y - 2,
      label: "Arcade",
      color: "#9b8cff",
      kind: "arcade",
    });

    // push the base gameplay context; step() replaces it each frame, destroy() resets to "default"
    InputContext.push("play");

    Log.info(
      `RPG ready — items=${Item.all().length} quests=${QuestLog.defOrder.length} ` +
        `achievements=${Achievement.all().length} kills(saved)=${Profile.get("enemiesKilled")}`,
    );
  }

  step() {
    // no pause gate — obj_game skips scene.step() while the SystemMenu is open

    // sleeping (bed): fast-forward Time.scale while Drowsiness drains; any input wakes. Checked
    // BEFORE the tick loop so the waking press wakes instead of moving this frame.
    if (this._sleeping) {
      if (this._wakeInput()) {
        this._sleeping = false;
        Time.scale = 1;
      } else {
        Time.scale = RPG_SLEEP_SCALE;
      }
    }
    this._sleepOverlay.enabled = this._sleeping;

    // edge toggle — once per frame, outside the tick loop
    if (Input.get("inventory").pressed()) {
      this.invOpen = !this.invOpen;
      this._invWin.enabled = this.invOpen;
      if (this.invOpen) this._invDirty = true;
    }

    // resolve input context BEFORE the tick loop so the tick's movement/fire reads see it.
    // window > build > play (see InputContext + RpgController tags).
    this._resolveContext();

    // hotbar number keys — after the context is set ("play"-only, so inert with a window/building)
    this._useHotbar();

    // auto-hide hotbar HUD: slides up on a keypress, back down after RPG_HOTBAR_HUD_SECS. Timer +
    // ease on Time.raw (UI timing); dragY is offset-not-mutation (see UIElement.getLayoutPosition).
    if (this._hotbarTimer > 0) this._hotbarTimer -= Time.raw;
    const show = !this._buildActive && this._hotbarTimer > 0;
    this._hotbarSlide = Tween.approach(
      this._hotbarSlide,
      show ? 1 : 0,
      RPG_HOTBAR_SLIDE_SPD,
    );
    this._hotbarBar.dragY = (1 - this._hotbarSlide) * RPG_HOTBAR_SLIDE;
    this._hotbarBar.enabled = this._hotbarSlide > 0.001; // skip drawing once fully tucked away

    // recenter the nav window on the player BEFORE the tick loop (PathfindingSystem plans over it);
    // same NavGrid MotionPlanner points at, only occupancy/origin change → cheap. Rebuild only when
    // the player changed cell (window + occupancy are otherwise stable), with a periodic safety
    // rebuild to pick up in-place collider edits (build mode) that don't move the player a cell.
    const np = this.world.get(Position, this.ctrl.id);
    const nc = this.level.worldToGrid(np.x, np.y);
    this._navTick = (this._navTick + 1) % RPG_NAV_REBUILD_EVERY;
    if (nc.x !== this._navGx || nc.y !== this._navGy || this._navTick === 0) {
      this.nav.rebuild(this.world, nc.x, nc.y);
      this._navGx = nc.x;
      this._navGy = nc.y;
    }

    const ticks = World.sim.advance();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // pre-move positions for render lerp
      StatusSystem.update(this.world); // tick buffs/debuffs (dot/hot + duration), then ↓
      EncumbranceSystem.update(this.world); // refresh the "encumbered" status from carried weight
      // survival needs rise; drowsiness DRAINS while sleeping (else rises)
      ThirstSystem.update(this.world);
      HungerSystem.update(this.world);
      if (this._sleeping)
        DrowsinessSystem.restore(
          this.world,
          this.ctrl.id,
          RPG_SLEEP_RECOVER * World.sim.tickDuration,
        );
      else DrowsinessSystem.update(this.world);
      RpgController.update(this.world, this.ctrl); // reads StatusSystem.scale("speed")
      FollowerSystem.update(this.world, this.ctrl.id, this.followers); // seek (before physics)
      this.physics.update(this.world);

      RpgScene.trackDamage(this, 7); // floating numbers for any hp change this tick
      // hp-0 reactions by each entity's Mortal kind: despawn / respawn / down (recovers below)
      RpgScene.resolveHealth(this, {
        spill: { yBase: 0, ySpread: 14 },
        onDespawn: (id) => {
          const dp = this.world.get(Position, id);
          if (dp !== undefined) Audio.playAt("snd_explosion", dp.x, dp.y); // death pop (spatial)
          Profile.add("enemiesKilled", 1); // any enemy counts toward the Slayer achievement
          // report by species so only raiders advance the "Raider Cull" quest (rats have no target)
          const kind = this.world.get(Rat, id) !== undefined ? "rat" : "raider";
          QuestLog.report("kill", kind, 1);
          this._markGone(id); // a unique (id'd) enemy won't re-spawn on revisit
          Log.info(`${kind} killed — kills=${Profile.get("enemiesKilled")}`);
        },
        onRespawn: (id) => {
          const pos = this.world.get(Position, id);
          const vel = this.world.get(Velocity, id);
          pos.x = this.spawn.x;
          pos.y = this.spawn.y;
          vel.x = 0;
          vel.y = 0;
          Log.info("player died — respawned at spawn");
        },
        onDown: (id) => {
          Toast.push(I18n.text("FOLLOWER_DOWN", this._followerName(id)), {
            type: "warn",
          });
        },
      });
      // revive a downed companion at the recovery spot (claimed build area, else map spawn)
      RpgScene.updateDowned(this, {
        downSpot: () => this._recoverSpot(),
        onRecover: (id) => {
          Toast.push(I18n.text("FOLLOWER_RECOVERED", this._followerName(id)), {
            type: "success",
          });
        },
      });
      RpgScene.collectDrops(this, (itemId, got) => {
        const pp = this.world.get(Position, this.ctrl.id);
        if (pp !== undefined) Audio.playAt("snd_coin", pp.x, pp.y); // pickup blip (spatial, ~centred)
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
    BuildMode.reapDestroyed(this); // remove built entities enemies destroyed (e.g. turrets at 0 HP)
    this._toggleFollower(); // F: nearest companion wait <-> follow (outside tick loop)
    WorldClock.update(Time.delta); // advance in-game time (sim time → pauses with the game)
    WorldEvents.update(WorldClock.absHours()); // fire due world events (trader travel) on the clock timeline
    Weather.update(Time.delta); // advance weather transition (sim time, like the clock)
    TradeSystem.update(this.world, Time.delta); // finite merchants restock toward their template (sim time)
    ParticleFx.update(); // advance muzzle-flash particles (once per frame; freezes when paused)
    this._updateClimate(); // climate-zone enter/exit → Weather region override
    // free-cam updates in draw() (runs while paused — the point of the debug free-fly); follow updates here
    if (!this.camera.freeCam) this.camera.update();
    Audio.listener(this.camera.toX, this.camera.toY); // ears follow the view → spatial SFX pan/attenuate

    // stream chunks (chunked maps only); before the portal check, which can swap the whole map out
    if (this.chunks !== undefined) {
      const pp = this.world.get(Position, this.ctrl.id);
      this.chunks.update(pp.x, pp.y);
      // rebuild newly-streamed terrain VBOs (diff-based; cheap when unchanged)
      if (this.terrain !== undefined) this.terrain.rebuild(this.chunks);
    }

    // rebuild the inventory body only when open + dirty (UI.update already ran this frame)
    if (this.invOpen && this._invDirty) {
      RpgInventoryUI.rebuild(this, {
        equipSlots: [
          { slot: "weapon", labelKey: "SLOT_WEAPON" },
          { slot: "armor", labelKey: "SLOT_ARMOR" },
          { slot: "trinket", labelKey: "SLOT_TRINKET" },
          { slot: "backpack", labelKey: "SLOT_BACKPACK" },
        ],
        // genre extraRows hook: a kills/items/quests records line below the stats
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

    // merchant shop: refresh when dirty; auto-close if the player walked out of range (no station range-close)
    if (this._tradeOpen) {
      const mp = this.world.get(Position, this._tradeMerchantId);
      const tp = this.world.get(Position, this.ctrl.id);
      if (
        mp === undefined ||
        tp === undefined ||
        (mp.x - tp.x) ** 2 + (mp.y - tp.y) ** 2 >
          RPG_TRADE_RANGE * RPG_TRADE_RANGE
      ) {
        TradeUI.close(this);
      } else if (this._tradeDirty) {
        TradeUI.refresh(this);
        this._tradeDirty = false;
      }
    }

    // door check LAST — RpgMap.go() swaps world/level/renderer/camera, so nothing below may touch the old map
    RpgMap.checkPortals(this);
  }

  // number-key hotbar: use the item bound to each pressed slot (useItem handles use/equip toggle)
  _useHotbar() {
    const hb = this.world.get(Hotbar, this.ctrl.id);
    if (hb === undefined) return;
    for (let i = 0; i < hb.size; i++) {
      if (!Input.get("hotbar" + (i + 1)).pressed()) continue;
      this._showHotbar(); // any hotbar keypress reveals the bar (even an empty slot)
      const itemId = hb.slots[i];
      if (itemId === "") continue;
      RpgInventoryUI.useItem(this, itemId, this._itemWorn(itemId));
    }
  }

  // reveal the hotbar HUD and refresh its auto-hide countdown
  _showHotbar() {
    this._hotbarTimer = RPG_HOTBAR_HUD_SECS;
  }

  // is an instance of itemId equipped? (drives useItem's equip/unequip toggle; resolves the worn uid back to itemId)
  _itemWorn(itemId) {
    const it = Item.get(itemId);
    if (it === undefined || !it.hasComponent(Equippable)) return false;
    const eq = this.world.get(Equipment, this.ctrl.id);
    if (eq === undefined) return false;
    const uid = eq.slots[it.getComponent(Equippable).slot];
    if (uid === undefined || uid === "") return false;
    const inv = this.world.get(Inventory, this.ctrl.id);
    const inst =
      inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
    return inst !== undefined && inst.itemId === itemId;
  }

  // mark a unique (Persistent) entity gone so it won't re-spawn on revisit (file-scope reconcile);
  // no-op for id-less entities. Read the uid while still alive (before world.remove).
  _markGone(id) {
    const pc = this.world.get(Persistent, id);
    if (pc !== undefined) this._gone[pc.uid] = true;
  }

  // F: toggle the nearest in-reach companion between follow and wait (a "wait" one stays stationed in this map)
  _toggleFollower() {
    if (!Input.get("follow").pressed()) return;
    const p = this.world.get(Position, this.ctrl.id);
    if (p === undefined) return;
    let best = -1;
    let bestSq = 40 * 40; // reach to a companion (px)
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
      FollowerSystem.applyBenefit(this.world, this.ctrl.id, f, -1); // stops carrying
      f.state = "wait";
      f.homeMap = this.mapId;
      Toast.push(I18n.text("FOLLOWER_WAIT"), { type: "info" });
    } else {
      f.state = "follow";
      f.homeMap = "";
      FollowerSystem.applyBenefit(this.world, this.ctrl.id, f, 1); // carries again
      Toast.push(I18n.text("FOLLOWER_FOLLOW"), { type: "success" });
    }
  }

  // dismiss a following companion to the claimed build-zone centroid: drop its carry bonus + station
  // it there for recall. No-op unless it's following and a build area is claimed.
  _dismissFollower(fid) {
    const f = this.world.get(Follower, fid);
    if (f === undefined || f.state !== "follow") return;
    if (this.world.get(Downed, fid) !== undefined) return; // downed → it's already recovering to base
    const spot = this._buildZoneSpot();
    if (spot === null) {
      Toast.push(I18n.text("FOLLOWER_NO_ZONE"), { type: "warn" });
      return;
    }
    FollowerSystem.applyBenefit(this.world, this.ctrl.id, f, -1); // stops carrying
    f.state = "wait";
    f.homeMap = this.mapId;
    const pos = this.world.get(Position, fid);
    const vel = this.world.get(Velocity, fid);
    if (pos !== undefined) {
      pos.x = spot.x;
      pos.y = spot.y;
    }
    if (vel !== undefined) {
      vel.x = 0;
      vel.y = 0;
    }
    Toast.push(I18n.text("FOLLOWER_DISMISSED"), { type: "info" });
  }

  // world-coord centroid of this map's claimed build area, or null if none (rect zone → centroid lands inside)
  _buildZoneSpot() {
    const zmap = this.level.zoneMap("buildable");
    if (zmap === undefined) return null;
    const cells = zmap.cells(this.buildZoneId);
    if (cells.length === 0) return null;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < cells.length; i++) {
      sx += cells[i].x;
      sy += cells[i].y;
    }
    return this.level.gridToWorld(
      Math.round(sx / cells.length),
      Math.round(sy / cells.length),
    );
  }

  // start sleeping (the "bed" InteractAction's E routes here); step() fast-forwards time until _wakeInput.
  // costs water/food (those needs keep rising at the accelerated rate).
  _sleep() {
    this._sleeping = true;
  }

  // any input wakes the sleeper. Raw queries (not InputAction) so it fires regardless of context;
  // UIPointer.pressed is the latched LMB edge for the frame.
  _wakeInput() {
    return (
      keyboard_check_pressed(vk_anykey) ||
      UIPointer.pressed ||
      mouse_check_button_pressed(mb_right) ||
      gamepad_button_check_pressed(0, gp_face1) ||
      gamepad_button_check_pressed(0, gp_face2)
    );
  }

  // where a downed companion revives: claimed build area, else map spawn
  _recoverSpot() {
    return this._buildZoneSpot() ?? { x: this.spawn.x, y: this.spawn.y };
  }

  // Display name of a companion (for the down/recover toasts).
  _followerName(id) {
    const nm = this.world.get(Name, id);
    return nm !== undefined ? nm.name : I18n.text("FOLLOWER_DEFAULT");
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

  // track the player's climate cell (direct lookup beats ZoneSystem's sweep) and push/clear the
  // Weather override on a border cross. No-op without a "climate" channel.
  _updateClimate() {
    const cmap = this.level.zoneMap("climate");
    if (cmap === undefined) return;
    const pos = this.world.get(Position, this.ctrl.id);
    const g = this.level.worldToGrid(pos.x, pos.y);
    const id = cmap.idAt(g.x, g.y);
    if (id === this._climateZone) return; // no border crossed this frame
    this._climateZone = id;
    if (id === 0) Weather.exitRegion();
    else Weather.enterRegion(cmap.zone(id));
  }

  // Auto turn-in for the passive (non-NPC) quests once their objectives are met.
  _tryTurnIn(qid) {
    if (!QuestLog.isReady(qid)) return;
    const reward = QuestLog.complete(qid);
    RpgProgression.applyReward(this, reward);
    Profile.add("questsCompleted", 1);
    Log.info(
      `quest complete: ${qid} — questsCompleted=${Profile.get("questsCompleted")}`,
    );
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

  // proximity to an NPC + dialogue text for accept/turn-in; target resolved live each frame (this._npcId)
  _updateNpc() {
    this._npcId = -1;
    this.nearNpc = false;
    const p = this.world.get(Position, this.ctrl.id);
    if (p === undefined) return;
    // nearest in-reach NPC (streamed or up-front); none → no dialogue this frame
    const id = Query.nearest(this.world, p.x, p.y, {
      has: NPC,
      maxDist: RPG_NPC_RADIUS,
    });
    if (id === -1) return;
    this._npcId = id;
    this.nearNpc = true;

    const npc = this.world.get(NPC, id);
    this.dialogueName = npc.name;
    // a merchant NPC shows a shop greeting + Trade action instead of the quest flow
    if (this.world.get(Merchant, id) !== undefined) {
      this.dialogueLine = "NPC_MERCHANT_GREET";
      this.dialogueAction = "MERCHANT_TRADE";
      return;
    }
    const qid = npc.questId;
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

  // derive this frame's input context: window > build > play (a window pauses build)
  _resolveContext() {
    let ctx = "play";
    if (this.invOpen || this._storeOpen || this._craftOpen || this._tradeOpen)
      ctx = "window";
    else if (this._buildActive) ctx = "build";
    InputContext.set(ctx);
  }

  // single E dispatch: an open station window → E closes it; else pick station-vs-NPC by
  // cursor-then-distance and activate. interact is muted in "build", so this runs only in play/window.
  _dispatchInteract() {
    if (!Input.get("interact").pressed()) return;
    if (this.invOpen) return; // inventory owns the window; I toggles it, E is inert
    if (this._tradeOpen) {
      TradeUI.close(this); // E closes the merchant shop
      return;
    }
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

  // NPC side of the interact dispatch: accept/turn-in the quest (called by _dispatchInteract only)
  _npcActivate() {
    if (this._npcId === -1 || !this.nearNpc) return;
    // a merchant NPC opens its shop instead of the quest flow
    if (this.world.get(Merchant, this._npcId) !== undefined) {
      TradeUI.open(this, this._npcId);
      return;
    }
    const npc = this.world.get(NPC, this._npcId);
    const qid = npc.questId;
    if (QuestLog.isReady(qid)) {
      RpgProgression.applyReward(this, QuestLog.complete(qid));
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

  // Esc back-out (SystemMenu calls this before pausing): close the active context — window, then
  // build. Returns true if consumed; false falls through to the pause menu. window > build priority.
  handleEscape() {
    if (this._sleeping) {
      this._sleeping = false; // Esc wakes from a bed (don't fall through to the pause menu)
      Time.scale = 1;
      return true;
    }
    if (this._storeQtyModal !== null && this._storeQtyModal !== undefined) {
      this._storeQtyModal.close(); // first Esc cancels the storage amount picker only
      return true;
    }
    if (this._tradeQtyModal !== null && this._tradeQtyModal !== undefined) {
      this._tradeQtyModal.close(); // first Esc cancels the trade amount picker only
      return true;
    }
    if (this.invOpen) {
      this.invOpen = false;
      this._invWin.enabled = false;
      return true;
    }
    if (this._tradeOpen) {
      TradeUI.close(this); // close the merchant shop
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

  // SceneManager stack host pause/resume while a guest runs in front.
  // suspend: hide the UI root. obj_game won't step a non-top scene, so step() naturally pauses
  // BuildMode/Interactable/WorldClock/Weather — nothing else to do.
  suspend() {
    UI.setEnabled(this.ui, false);
  }

  // resume: re-show UI, re-claim viewport 0, RE-BIND the keymap — a guest's destroy unbinds shared
  // action names (PlatformerController drops moveLeft/moveRight) so the RPG must re-register. Idempotent.
  resume() {
    UI.setEnabled(this.ui, true);
    this.camera.assign(0);
    RpgController.bindKeys();
    Audio.bgm("mus_overworld"); // restore the RPG theme after a guest crossfaded its own
  }

  // launch the platformer as a guest minigame; on return its result() score becomes a coin reward
  _openArcade() {
    this.manager.push(ScenePlatformer, {
      onResult: (r) => {
        const n = r !== undefined && r.stomps !== undefined ? r.stomps : 0;
        if (n > 0) {
          InventorySystem.add(
            this.world.get(Inventory, this.ctrl.id),
            "coin",
            n,
          );
          this._invDirty = true;
        }
        Toast.push(I18n.text("ARCADE_REWARD", n), { type: "success" });
      },
    });
  }

  draw() {
    // free-cam updates here so it pans while the sim is paused (step() is skipped then); apply before the renderer reads it
    if (this.camera.freeCam) this.camera.update();
    this.renderer.draw(this.world); // tilemap + zone + player / enemies / elder: boxes + labels
    // overlay AFTER the renderer: RenderChunks paints an OPAQUE ground fill that would cover it if drawn first
    RpgWorldOverlay.drawWorld(this); // drops, bullets, reach zone (world space)
    if (Settings.get("rpgRadar"))
      // directional radar (Settings toggle, default off). 2.5D: lift to ~body height under a pitched camera
      RadarArrows.draw(this.world, this.ctrl.id, this._radarRules, {
        lift:
          this.camera !== undefined && this.camera.followPitch !== 0 ? 16 : 0,
      });
    Interactable.drawTarget(this); // highlight the targeted station (world space)
    BuildMode.drawWorld(this); // build-cursor cell highlight (world space)
    ParticleFx.draw(); // muzzle flash (world space, additive — bright over the day/night tint)
    // damage/heal numbers (world space); pass the camera pitch (rad→deg) so they stand up under 2.5D
    FloatingText.draw(
      this.camera ? (this.camera.followPitch * 180) / Math.PI : 0,
    );
    // HUD/dialogue/inventory are manager-drawn UI panels — nothing more here
  }

  destroy() {
    Profile.save(); // persist lifetime records (achievements persist on unlock)
    InputContext.reset(); // hand input back to "default" for the next scene
    Debug.remove("Camera"); // the live 2.5D-camera tuning panel is RPG-only (RpgMap registers it)
    RpgController.destroy();
    RpgWorldOverlay.clearTracers(); // drop any in-flight hitscan streaks (world coords are scene-local)
    Weather.exitRegion();
    // free every parked pooled map, then the active map (its fields live on `this`); UI root removed last
    for (const id in this._maps) RpgMap._free(this._maps[id]);
    this._maps = {};
    RpgMap._free(this);
    World.levels.reset(); // drop the manager index (all stores freed above)
    WorldEvents.reset(); // clear the world event queue
    Trader.reset(); // drop trader records + queued trader events
    if (this.ui) {
      UI.remove(this.ui);
      this.ui.destroy();
    }
  }
}
