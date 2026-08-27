const NPC_RADIUS = 60; // interact range to the elder NPC (32px-cell scale)
const TRADE_RANGE = 128; // a merchant's TradeUI stays open within this range; auto-closes if you walk off
const START_CREDITS = 1000; // coins the player starts with (carried across maps via the inventory snapshot)
const SLEEP_SCALE_MAX = 50; // Time.scale ceiling while sleeping
const SLEEP_ACCEL = 0.5; // ramp growth per wall-second (multiplicative, on Time.raw)
const SLEEP_RECOVER = 40; // Drowsiness drained per sim-second while sleeping
const HOTBAR_HUD_SECS = 3; // wall-clock seconds the hotbar HUD stays up after a hotbar keypress
const HOTBAR_SLIDE = 150; // GUI px the hotbar bar slides DOWN (off the bottom edge) when hidden
const HOTBAR_SLIDE_SPD = 16; // Tween.approach speed for the slide (higher = snappier pop)

/**
 * factory so the scene editor's Test Play can open this scene; same ref SceneRegistry labels use
 */
globalThis.SceneColony = () => new _SceneColonyClass();
SceneRegistry.add(SceneColony, {
  label: I18n.textRef("RPG_NAME"),
  category: "SCENE_CAT_RPG",
});

/**
 * standalone SCREEN class satisfying the duck-typed screen contract the Game object drives (see Scene).
 */
class _SceneColonyClass {
  label = "Colony";

  create(openScene) {
    contentQuests.register();
    contentAchievements.register(); // achievement defs + trigger rules (separate from quest data)
    // the whole progression starts blank; a LOAD's sim pass replaces it wholesale further down
    Tracker.reset();
    // inject the colony's rules into the rule-free Tracker: which counter an event kind feeds, and
    // which thresholds that counter's new total meets (the same seam as Combat.mitigate below)
    Tracker.rules = contentAchievements;

    // inject stat-driven mitigation into the stat-agnostic Combat applier (static hook, survives map reloads)
    Combat.mitigate = function (entities, targetId, amount, penetration = 0) {
      const s = entities.get(targetId, Stats);
      const defense = s !== undefined ? s.defense : 0;
      // clamp so penetration never adds damage; min-1 floor so every hit registers
      const effDef = Math.max(0, defense - penetration);
      return Math.max(1, amount - effDef);
    };
    // inject how a *_serum consumable raises an attribute; false → use() refuses (no waste)
    ConsumableSystem.grantAttr = function (entities, id, attr, amount) {
      const a = entities.get(id, Attributes);
      if (a === undefined || a[attr] === undefined) return false;
      a[attr] += amount;
      StatModel.recompute(entities, id);
      return true;
    };
    // inject re-derive into StatusSystem so mods-bearing status buffs fold in/out on apply/expire;
    // dot/hot + live `mult` (encumbrance/speed) need no recompute — read directly / live
    StatusSystem.onStatsChanged = function (entities, id) {
      StatModel.recompute(entities, id);
    };
    // the static-collider change signal → re-stamp the active map's nav grid and drop every
    // planned path (a new wall may cut one; the walkers re-request on their own throttle).
    // `this.nav` is read live, so the one hook serves every map the scene activates.
    SolidSystem.onStatics = (entities, statics) => {
      this.nav.stamp(statics);
      PathfindingSystem.invalidate(entities);
    };

    // the world (its level pool is the map pool — every visited map stays alive/suspended there
    // for the whole session, see ColonyMap.go) + wandering traders — reset per scene create so a
    // fresh colony session can't inherit the previous one's maps/schedule/records (Trader.reset
    // re-installs handlers).
    World.reset();
    Trader.reset();

    // quests that close themselves the instant their objectives are met — what the report seam's
    // `ready` is filtered through. td_humans is absent: its giver turns it in (see _interactNpc).
    this._passiveQuests = [
      contentQuests.QUEST_GATHER,
      contentQuests.QUEST_REACH,
    ];

    this.invOpen = false;
    this._invDirty = false; // rebuild the inventory window body next step when set
    this._hotbarTimer = HOTBAR_HUD_SECS; // counts down on Time.raw; hotbar HUD shows while > 0
    this._hotbarSlide = 0; // 0 = tucked below the screen, 1 = fully up; eased toward show/hide
    this._sleeping = false; // true while resting in a bed (Time.scale fast-forwarded — see _sleep)
    this._sleepPeaked = false; // this sleep session already hit the Time.scale ceiling (td_time_skip)
    this.nearNpc = false;
    this.dialogueName = "";
    this.dialogueLine = "";
    this.dialogueAction = "";

    // flag gameplay so GameOverlay suspends nav while playing; can't be a field initializer (GMRT)
    this.gameplay = true;

    // RadarArrows component→color rules (first match wins); built here (not top level) so Color is
    // loaded; read live so it survives a store swap. `has` is a component token — presence = a blip.
    // Both enemy species share the enemy color; allies/props with none of these get no arrow.
    this._radarRules = [
      { has: Raider, color: Color.parse("#e0584f") },
      { has: Rat, color: Color.parse("#e0584f") },
      { has: NPC, color: gemsColor("warn") },
      // the site's travel beacon (the extraction point) — one kind of the shared Interaction
      {
        has: Interaction,
        where: (c) => c.kind === "travel",
        color: Color.parse("#9b8cff"),
      },
      { has: Follower, color: Color.parse("#6fd0a0") },
    ];
    // persistent UI (key-hints bar + HUD/inventory/interaction/trade/build managers) — extracted to
    // _buildUI() so retheme() can rebuild it in place on a live theme swap, no world regen.
    this._buildUI();

    // boot at the colony's home site; the editor's Test Play overrides with its playtest file
    let bootMap = ColonyLevel.START;
    if (ColonyLevel.playtestFile !== undefined) {
      ColonyLevel.playtest = ColonyLevel.playtestFile;
      ColonyLevel.playtestFile = undefined;
      bootMap = ColonyLevel.PLAYTEST;
    }
    WorldClock.reset(); // once — survives map changes below
    Weather.reset(); // once — survives map changes, like the clock
    // LOAD vs NEW GAME: a parked SaveGame bundle rebuilds the saved active map + character +
    // world-sim in place of the fresh map + starting-loadout + companion seeding below.
    const loaded = SaveGame.pending();
    if (loaded)
      SaveGame.restore(this); // restore() drives the map build + squad arrival itself
    else {
      SaveGame.clearPending(); // a NEW game must not inherit a prior load's stashed map state
      // the starting quests — NEW GAME only; a load brings back its own accepted set + progress
      Tracker.accept(contentQuests.QUEST_GATHER); // collect — tracked passively
      Tracker.accept(contentQuests.QUEST_REACH); // reach — tracked passively
      ColonyMap.go(this, bootMap, "default");
    }
    Music.play(musAmbientTense); // carries across map changes (only _apply's reset stops it)

    // starting loadout + companion — NEW GAME only (a load restores the saved character instead).
    if (!loaded) {
      // equipped so the attack is item-driven from frame one; travels with the carried inventory
      const startInv = this.level.entities.get(this.playerId, Inventory);
      InventorySystem.add(startInv, "lead_pipe", 1); // mints a uid instance (equippable gear)
      EquipmentSystem.equipFirst(
        this.level.entities,
        this.playerId,
        "lead_pipe",
      ); // equip that instance by uid
      InventorySystem.add(startInv, "coin", START_CREDITS); // starting credits (coin stacks high → 1 slot)

      // seed one companion programmatically (not file-authored, so a persistent-map reload won't
      // dup it). Spawns unhired (a "rehire" resident) → hire() joins it to the squad: membership +
      // follow + carry bonus in one call, balanced thereafter by the F-toggle / kick.
      const pp = this.level.entities.get(this.playerId, Position);
      const companion = ColonySpawn.spawnFollower(
        this.level.entities,
        pp.x - 28,
        pp.y + 22,
        {
          label: "Companion",
          bonusCapacity: 4,
          bonusWeight: 15,
        },
      );
      FollowerSystem.hire(this.level.entities, this.playerId, companion);
    }

    // a wandering trader (Trader/WorldEvents/Universe): crosses hub <-> cave off-focus on the
    // WorldClock timeline, embodied as a real Merchant NPC only in whatever map the player is in.
    // NEW GAME only — a load brings back its records + schedule (and its embodied entity with the
    // active map's store), so registering again would land a second peddler.
    if (!loaded)
      Trader.register(this, {
        id: "peddler",
        name: "NPC_TRADER_NAME", // reused shop name (a dedicated i18n key is polish, not needed for demo)
        travelH: 2, // in-game hours in transit between stops
        route: [
          { map: "hub", dwellH: 6 },
          { map: "cave", dwellH: 6 },
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

    // push the base gameplay context; step() replaces it each frame, destroy() resets to "default"
    InputContext.push("play");

    Log.info(
      `colony ready — items=${Item.all().length} quests=${QuestLog.all().length} ` +
        `achievements=${Achievement.all().length} kills=${Tracker.count("enemiesKilled")}`,
    );
  }

  /**
   * Build the persistent UI tree. Reads entities/playerId LIVE (survives ColonyMap.go's store swap) and
   * holds no gameplay state, so retheme() can tear it down + rebuild it to re-bake the palette.
   */
  _buildUI() {
    this.ui = gemsRoot();
    UI.insert(this.ui);
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
    Hud.build(this); // top-right HP/quest card + bottom-center dialogue box
    InventoryUI.build(this);
    Interactable.build(this); // station prompt + storage + crafting windows
    TradeUI.build(this); // near-fullscreen merchant shop (opened on a merchant NPC)
    BuildMode.build(this); // grid build mode (HUD + per-scene state)
  }

  /**
   * Live theme swap (the Game object's retheme): close any open transient window/build/sleep via the
   * existing Esc chain — cheaper + safer than re-applying each window's state onto fresh elements —
   * then rebuild this.ui so it bakes the new palette. World/gameplay state is untouched.
   */
  retheme() {
    // BOUNDED: a qty-picker modal's close() doesn't null its field synchronously, so an unbounded
    // loop could spin (GMRT hangs, no crash). 8 covers every stacked window type; close() is idempotent.
    let guard = 8;
    while (guard-- > 0 && this.handleEscape()) {} // window → build → sleep, until nothing is open
    if (this.ui) {
      UI.remove(this.ui);
      this.ui.destroy();
    }
    this._buildUI();
  }

  /**
   * THE reference orchestration for a genre scene — the shape, not just this game's order:
   *   once per frame   window edge-toggles, input context, sleep check (all before the loop)
   *   per tick         snapshot -> the physics sequence (headed by the player brain) -> damage,
   *                    death, drops, quest/achievement checks -> flush
   *   once per frame   animation, dialogue/interaction, build mode, camera, dirty UI rebuilds
   * Tick-rate work goes in the loop, edge/input/UI work outside it (SimClock owns that rule). A
   * map swap (a world-map trip) never runs in here — it fires at SceneTransition's cover, between
   * frames, so nothing in this frame touches a swapped-out map.
   */
  update() {
    // no pause gate — Game skips scene.update() while the GameOverlay is open

    // re-latch the player id from the live Playable query (derived, not stored — ColonyMap.go's
    // boot/arrival also set it, so this is the per-frame self-heal, never the only source)
    this.playerId = PlayerSystem.id(this.level.entities);

    // sleeping (bed): fast-forward Time.scale while Drowsiness drains; any input wakes. Checked
    // BEFORE the tick loop so the waking press wakes instead of moving this frame.
    // WHY THIS SKIPS TIME CHEAPLY: the world-sim clocks (WorldClock/Weather, updated once per
    // frame off Time.delta) consume the whole scaled delta, while the fixed-step sim behind them
    // is capped at SimClock.maxTicks per frame. Hours pass; the tick loop does not run 50x.
    if (this._sleeping) {
      if (this._wakeInput()) {
        this._sleeping = false;
        Time.scale = 1;
      } else {
        // ramp on Time.raw (wall clock — Time.delta is itself scaled): the fast-forward eases in
        // instead of snapping, peaking at the ceiling in a few seconds
        const s = Math.max(1, Time.scale) * (1 + SLEEP_ACCEL * Time.raw);
        if (s >= SLEEP_SCALE_MAX) {
          Time.scale = SLEEP_SCALE_MAX;
          // hitting the ceiling IS the td_time_skip trigger — once per sleep session
          if (!this._sleepPeaked) {
            this._sleepPeaked = true;
            this._track("sleepSkip", "", 1);
          }
        } else {
          Time.scale = s;
        }
      }
    }
    this._sleepOverlay.enabled = this._sleeping;

    // world cursor: latch ONCE per frame (GMRT samples mouse live) via the pitch-aware ground-plane
    // unprojection (see Camera.unproject). Read by PlayerSystem (via Playable), BuildMode, Interactable.
    this.mouseWorld = this.camera.cursorWorld();
    const pl = this.level.entities.get(this.playerId, Playable);
    pl.cursorX = this.mouseWorld.x;
    pl.cursorY = this.mouseWorld.y;

    // edge toggle — once per frame, outside the tick loop
    if (Input.get("inventory").pressed()) {
      this.invOpen = !this.invOpen;
      this._invWin.enabled = this.invOpen;
      if (this.invOpen) this._invDirty = true;
    }

    // resolve input context BEFORE the tick loop so the tick's movement/fire reads see it.
    // window > build > play (see InputContext + PlayerSystem tags).
    this._resolveContext();

    // hotbar number keys — after the context is set ("play"-only, so inert with a window/building)
    this._useHotbar();

    // auto-hide hotbar HUD: slides up on a keypress, back down after HOTBAR_HUD_SECS. Timer +
    // ease on Time.raw (UI timing); dragY is offset-not-mutation (see UIElement.getLayoutPosition).
    if (this._hotbarTimer > 0) this._hotbarTimer -= Time.raw;
    const show = !this._buildActive && this._hotbarTimer > 0;
    this._hotbarSlide = Tween.approach(
      this._hotbarSlide,
      show ? 1 : 0,
      HOTBAR_SLIDE_SPD,
    );
    this._hotbarBar.dragY = (1 - this._hotbarSlide) * HOTBAR_SLIDE;
    this._hotbarBar.enabled = this._hotbarSlide > 0.001; // skip drawing once fully tucked away

    // mirror any tile-cost edits into the nav grid BEFORE the tick loop (PathfindingSystem plans
    // over it); a no-op while the layers' edit count is unchanged. Colliders reach it through
    // SolidSystem.onStatics instead (create).
    this.nav.sync();

    const ticks = SimClock.advance();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.level.entities); // pre-move positions for render lerp
      StatusSystem.update(this.level.entities); // tick buffs/debuffs (dot/hot + duration), then ↓
      EncumbranceSystem.update(this.level.entities); // refresh the "encumbered" status from carried weight
      // survival needs rise; drowsiness DRAINS while sleeping (else rises)
      ThirstSystem.update(this.level.entities);
      HungerSystem.update(this.level.entities);
      if (this._sleeping)
        DrowsinessSystem.restore(
          this.level.entities,
          this.playerId,
          SLEEP_RECOVER * SimClock.tickDuration,
        );
      else DrowsinessSystem.update(this.level.entities);
      FollowerSystem.update(this.level.entities, this.playerId); // seek, by live Follower query (before physics)
      // physics: brains decide velocity (player input, then AI) → resolve paths → collide → push
      // crowders apart → projectiles → expire.
      PlayerSystem.update(this.level.entities); // the player brain: input → Velocity/fire
      StateSystem.update(this.level.entities); // CombatAI Idle/Chase/Attack schemas (enemies AND turrets)
      PathfindingSystem.update(this.level.entities); // enemy PathRequest → PathResponse over this.nav
      SolidSystem.update(this.level.entities);
      SeparationSystem.update(this.level.entities); // unstack dynamic bodies (crowding), after SolidSystem
      ProjectileSystem.update(this.level.entities);
      LifetimeSystem.update(this.level.entities);

      ColonyCombat.trackDamage(this, 14); // floating numbers for any hp change this tick
      // hp-0 reactions by each entity's Mortal kind: corpse / respawn / down (recovers below)
      ColonyCombat.resolveHealth(this, {
        spill: { yBase: 0, ySpread: 28 },
        onKill: (id) => {
          const dp = this.level.entities.get(id, Position);
          // death pop (spatial)
          if (dp !== undefined)
            Audio.play({
              sound: sndExplosionSmall,
              position: { x: dp.x, y: dp.y },
            });
          // by species so only raiders advance the "Raider Cull" quest (rats have no target); the
          // kill counter behind the Slayer rules doesn't discriminate (contentAchievements.COUNTERS)
          const kind = this.level.entities.has(id, Rat) ? "rat" : "raider";
          this._track("kill", kind, 1);
          // the "corpse" kind leaves the body in the world — drop its species marker so the
          // radar stops blipping it as an enemy ("despawn" removes the id anyway; harmless)
          this.level.entities.detach(id, Raider);
          this.level.entities.detach(id, Rat);
          Log.info(`${kind} killed — kills=${Tracker.count("enemiesKilled")}`);
        },
        onRespawn: (id) => {
          const pos = this.level.entities.get(id, Position);
          const vel = this.level.entities.get(id, Velocity);
          pos.x = this.spawn.x;
          pos.y = this.spawn.y;
          vel.x = 0;
          vel.y = 0;
          // respawn half-hydrated/-fed/-slept: each need to mid-meter, refresh so a
          // critical debuff (dehydrated/starving/drowsy) clears at once
          for (const token of [Thirst, Hunger, Drowsiness]) {
            const need = this.level.entities.get(id, token);
            need.value = need.max * 0.5;
            Survival.refresh(this.level.entities, id, need);
          }
          Log.info("player died — respawned at spawn");
        },
        onDown: (id) => {
          Toast.push(I18n.text("FOLLOWER_DOWN", this._followerName(id)), {
            type: "warn",
          });
        },
      });
      // revive a downed companion at the recovery spot (player's settlement, else map spawn)
      ColonyCombat.updateDowned(this, {
        downSpot: () => this._recoverSpot(),
        onRecover: (id) => {
          Toast.push(I18n.text("FOLLOWER_RECOVERED", this._followerName(id)), {
            type: "success",
          });
        },
      });
      ColonyCombat.reapCorpses(this); // looted-empty corpses vanish (lootless kills reap at once)
      ColonyCombat.collectDrops(this, (itemId, got) =>
        this._onCollect(itemId, got),
      );
      this._checkReach(); // reach-quest zone

      this.level.entities.flush();
    }

    SkeletonSystem.update(this.level.entities); // pose skeletal bodies into their puppets (per frame)
    AppearanceSystem.update(this.level.entities); // dress the puppets SkeletonSystem just minted
    InstanceSystem.update(); // reap the puppets of entities that died this frame
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
    TradeSystem.update(this.level.entities, Time.delta); // finite merchants restock toward their template (sim time)
    ParticleFx.update(); // advance muzzle-flash particles (once per frame; freezes when paused)
    // a sim-clock camera control updates here; a Time.raw one (the debug free-fly) updates in
    // draw() instead, so it keeps moving while the sim is paused (Camera's `raw` contract)
    if (!this.camera.control.raw) this.camera.update();
    // ears on the body of the entity the camera TRACKS (the CameraFocus marker, live-queried),
    // not the view: CameraFollow clamps its look-at at map edges (and debug free-cam flies away
    // entirely), parking the view center off the tracked body — spatial SFX pan/attenuate from
    // where it stands; camera center is the no-marker fallback
    const ep = this.level.entities.get(
      this.level.entities.first(CameraFocus),
      Position,
    );
    if (ep !== undefined) AudioListener.position(ep.x, ep.y);
    else AudioListener.position(this.camera.toX, this.camera.toY);
    SoundEmitterSystem.update(this.level.entities); // timed world cues (the radio prop) re-fire their spatial SFX

    // rebuild the inventory body only when open + dirty (UI.update already ran this frame)
    if (this.invOpen && this._invDirty) {
      InventoryUI.rebuild(this, {
        equipSlots: [
          { slot: "weapon", labelKey: "SLOT_WEAPON" },
          { slot: "armor", labelKey: "SLOT_ARMOR" },
          { slot: "trinket", labelKey: "SLOT_TRINKET" },
          { slot: "backpack", labelKey: "SLOT_BACKPACK" },
        ],
        /**
         * genre extraRows hook: a kills/items/quests records line below the stats
         */
        extraRows: (scene, body) => {
          const rec = new UIElement({ width: "100%", height: 22 });
          rec.insertChild(
            gemsLabel(
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
      const mp = this.level.entities.get(this._tradeMerchantId, Position);
      const tp = this.level.entities.get(this.playerId, Position);
      if (
        mp === undefined ||
        tp === undefined ||
        (mp.x - tp.x) ** 2 + (mp.y - tp.y) ** 2 > TRADE_RANGE * TRADE_RANGE
      ) {
        TradeUI.close(this);
      } else if (this._tradeDirty) {
        TradeUI.refresh(this);
        this._tradeDirty = false;
      }
    }
  }

  /**
   * number-key hotbar: use the item bound to each pressed slot (useItem handles use/equip toggle)
   */
  _useHotbar() {
    const hb = this.level.entities.get(this.playerId, Hotbar);
    if (hb === undefined) return;
    for (let i = 0; i < hb.size; i++) {
      if (!Input.get("hotbar" + (i + 1)).pressed()) continue;
      this._showHotbar(); // any hotbar keypress reveals the bar (even an empty slot)
      const itemId = hb.slots[i];
      if (itemId === "") continue;
      InventoryUI.useItem(this, itemId, this._itemWorn(itemId));
    }
  }

  /** reveal the hotbar HUD and refresh its auto-hide countdown */
  _showHotbar() {
    this._hotbarTimer = HOTBAR_HUD_SECS;
  }

  /**
   * is an instance of itemId equipped? (drives useItem's equip/unequip toggle; resolves the worn uid back to itemId)
   */
  _itemWorn(itemId) {
    const it = Item.get(itemId);
    if (it === undefined || !it.hasComponent(Equippable)) return false;
    const eq = this.level.entities.get(this.playerId, Equipment);
    if (eq === undefined) return false;
    const uid = eq.slots[it.getComponent(Equippable).slot];
    if (uid === undefined || uid === "") return false;
    const inv = this.level.entities.get(this.playerId, Inventory);
    const inst =
      inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
    return inst !== undefined && inst.itemId === itemId;
  }

  /**
   * pickup credit — ground-drop collection AND corpse looting (StorageUI's take hook, set by the
   * "corpse" InteractAction) land here so collect quests/achievements can't diverge by loot path
   */
  _onCollect(itemId, got) {
    const pp = this.level.entities.get(this.playerId, Position);
    // pickup blip (spatial, ~centred)
    if (pp !== undefined)
      Audio.play({ sound: sndCoin, position: { x: pp.x, y: pp.y } });
    this._track("collect", itemId, got);
    Log.info(
      `picked up ${got}x ${itemId} — items=${Tracker.count("itemsCollected")}`,
    );
  }

  /**
   * F: toggle the nearest in-reach SQUAD companion between follow and wait. Waiting is map-local
   * ("hold here for now") — a trip forces every member back to follow (see ColonyMap.go).
   */
  _toggleFollower() {
    if (!Input.get("follow").pressed()) return;
    const p = this.level.entities.get(this.playerId, Position);
    const squad = this.level.entities.get(this.playerId, Squad);
    if (p === undefined || squad === undefined) return;
    const members = FollowerSystem.members(
      this.level.entities,
      squad.id,
      this.playerId,
    );
    let best = -1;
    let bestSq = 80 * 80; // reach to a companion (px)
    for (let i = 1; i < members.length; i++) {
      // [0] is the player
      const pos = this.level.entities.get(members[i], Position);
      if (pos === undefined) continue;
      const d = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (d < bestSq) {
        bestSq = d;
        best = members[i];
      }
    }
    if (best === -1) return;
    const f = this.level.entities.get(best, Follower);
    if (f.state === "follow") {
      FollowerSystem.setState(this.level.entities, this.playerId, best, "wait");
      Toast.push(I18n.text("FOLLOWER_WAIT"), { type: "info" });
    } else {
      FollowerSystem.setState(
        this.level.entities,
        this.playerId,
        best,
        "follow",
      );
      Toast.push(I18n.text("FOLLOWER_FOLLOW"), { type: "success" });
    }
  }

  /**
   * Kick a companion out of the squad PERMANENTLY, in place — it stays a resident of this map
   * with a "rehire" prompt (walk up + talk to re-hire). Downed members finish recovering first.
   */
  _kickFollower(fid) {
    if (!this.level.entities.has(fid, Squad)) return; // not a member
    if (this.level.entities.has(fid, Downed)) return; // recovering — can't kick mid-revive
    FollowerSystem.kick(this.level.entities, this.playerId, fid);
    this._invDirty = true; // squad roster changed
    Toast.push(I18n.text("SQUAD_KICKED"), { type: "info" });
  }

  /**
   * world-coord centroid of the player's OWN settlement on this map, or null if none founded yet
   * (rect settlement → centroid lands inside). The downed-companion recovery anchor.
   */
  _settlementSpot() {
    const owned = Settlement.all(this.level.grid);
    for (let i = 0; i < owned.length; i++)
      if (owned[i].data.factionId === BuildMode.OWNER)
        return Settlement.centroidWorld(this.level.grid, owned[i]);
    return null;
  }

  /**
   * start sleeping (the "bed" InteractAction's E routes here); step() ramps the fast-forward until
   * _wakeInput. costs water/food (those needs keep rising at the accelerated rate).
   */
  _sleep() {
    this._sleeping = true;
    this._sleepPeaked = false; // each sleep session may peak (and trigger td_time_skip) once
  }

  /**
   * any input wakes the sleeper. Raw queries (not InputAction) so it fires regardless of context;
   * UIPointer.pressed is the latched LMB edge for the frame.
   */
  _wakeInput() {
    return (
      keyboard_check_pressed(vk_anykey) ||
      UIPointer.pressed ||
      mouse_check_button_pressed(mb_right) ||
      gamepad_button_check_pressed(0, gp_face1) ||
      gamepad_button_check_pressed(0, gp_face2)
    );
  }

  /**
   * where a downed companion revives: the player's settlement, else map spawn
   */
  _recoverSpot() {
    return this._settlementSpot() ?? { x: this.spawn.x, y: this.spawn.y };
  }

  /**
   * Display name of a companion (for the down/recover toasts).
   */
  _followerName(id) {
    const nm = this.level.entities.get(id, Name);
    return nm !== undefined ? nm.name : I18n.text("FOLLOWER_DEFAULT");
  }

  _checkReach() {
    if (this.reachDone || this.reachZone === undefined) return;
    const p = AABB.of(this.level.entities, this.playerId);
    const z = this.reachZone;
    if (p.x2 > z.x1 && p.x1 < z.x2 && p.y2 > z.y1 && p.y1 < z.y2) {
      this.reachDone = true;
      this._track("reach", "ruins", 1);
      Log.info("reached the ruins");
    }
  }

  /**
   * THE turn-in ceremony — reward, counter, achievement report, log — for both paths that can
   * close a quest (the passive auto turn-in below and the NPC dispatch), so they can't drift.
   * Caller checks isReady first; complete() is what marks it done.
   */
  _completeQuest(qid) {
    Progression.applyReward(this, Tracker.complete(qid));
    this._track("quest", qid, 1);
    Log.info(
      `quest complete: ${qid} — questsCompleted=${Tracker.count("questsCompleted")}`,
    );
  }

  /**
   * THE report seam: every gameplay chokepoint tells the Tracker what happened ONCE, and the
   * counter/achievement/quest fan-out follows from that single call — no site can bump a tally and
   * forget a consumer. Handles what comes back: toast each unlock, close each passive quest that
   * just became ready.
   *
   * Turn-in re-enters here (the reward items report as collects, the completion reports as a
   * quest); that terminates because Tracker.complete marks a quest done BEFORE handing over its
   * rewards, so a quest can never re-fire itself.
   */
  _track(kind, target, n = 1) {
    const r = Tracker.report(kind, target, n);
    for (let i = 0; i < r.unlocked.length; i++) {
      const a = Achievement.get(r.unlocked[i]);
      Toast.push(I18n.text("RPG_UNLOCKED", I18n.text(a.name)), {
        type: "success",
      });
      Log.info(`achievement unlocked: ${r.unlocked[i]}`);
    }
    for (let i = 0; i < r.ready.length; i++)
      if (this._passiveQuests.indexOf(r.ready[i]) !== -1)
        this._completeQuest(r.ready[i]);
    return r;
  }

  /**
   * proximity to an NPC + dialogue text for accept/turn-in; target resolved live each frame (this._npcId)
   */
  _updateNpc() {
    this._npcId = -1;
    this.nearNpc = false;
    const p = this.level.entities.get(this.playerId, Position);
    if (p === undefined) return;
    // nearest in-reach NPC (streamed or up-front); none → no dialogue this frame
    const id = Query.nearest(this.level.entities, p.x, p.y, {
      has: NPC,
      maxDist: NPC_RADIUS,
    });
    if (id === -1) return;
    this._npcId = id;
    this.nearNpc = true;

    const npc = this.level.entities.get(id, NPC);
    this.dialogueName = npc.name;
    // a merchant NPC shows a shop greeting + Trade action instead of the quest flow
    if (this.level.entities.has(id, Merchant)) {
      this.dialogueLine = "NPC_MERCHANT_GREET";
      this.dialogueAction = "MERCHANT_TRADE";
      return;
    }
    const qid = npc.questId;
    if (Tracker.isDone(qid)) {
      this.dialogueLine = "NPC_ELDER_THANKS";
      this.dialogueAction = "";
    } else if (Tracker.isReady(qid)) {
      this.dialogueLine = "NPC_ELDER_DONE";
      this.dialogueAction = "RPG_TURNIN";
    } else if (Tracker.isActive(qid)) {
      this.dialogueLine = "NPC_ELDER_WIP";
      this.dialogueAction = "";
    } else {
      this.dialogueLine = "NPC_ELDER_OFFER";
      this.dialogueAction = "RPG_ACCEPT";
    }
  }

  /** derive this frame's input context: window > build > play (a window pauses build) */
  _resolveContext() {
    let ctx = "play";
    if (
      this.invOpen ||
      this._storeOpen ||
      this._craftOpen ||
      this._tradeOpen ||
      this._mapOpen
    )
      ctx = "window";
    else if (this._buildActive) ctx = "build";
    InputContext.set(ctx);
  }

  /**
   * single E dispatch: an open station window → E closes it; else pick station-vs-NPC by
   * cursor-then-distance and activate. interact is muted in "build", so this runs only in play/window.
   */
  _dispatchInteract() {
    if (!Input.get("interact").pressed()) return;
    if (this.invOpen) return; // inventory owns the window; I toggles it, E is inert
    if (this._tradeOpen) {
      TradeUI.close(this); // E closes the merchant shop
      return;
    }
    if (this._storeOpen || this._craftOpen || this._mapOpen) {
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
        const p = this.level.entities.get(this.playerId, Position);
        const sp = this.level.entities.get(stationId, Position);
        const np = this.level.entities.get(npcId, Position);
        toStation =
          (sp.x - p.x) ** 2 + (sp.y - p.y) ** 2 <=
          (np.x - p.x) ** 2 + (np.y - p.y) ** 2;
      }
    }
    if (toStation) Interactable.activate(this);
    else this._npcActivate();
  }

  /**
   * NPC side of the interact dispatch: accept/turn-in the quest (called by _dispatchInteract only)
   */
  _npcActivate() {
    if (this._npcId === -1 || !this.nearNpc) return;
    // a merchant NPC opens its shop instead of the quest flow
    if (this.level.entities.has(this._npcId, Merchant)) {
      TradeUI.open(this, this._npcId);
      return;
    }
    const npc = this.level.entities.get(this._npcId, NPC);
    const qid = npc.questId;
    if (Tracker.isReady(qid)) {
      this._completeQuest(qid);
    } else if (!Tracker.isActive(qid) && !Tracker.isDone(qid)) {
      Tracker.accept(qid);
      Log.info(`accepted ${qid}`);
    }
  }

  /**
   * Esc back-out (GameOverlay calls this before pausing): close the active context — window, then
   * build. Returns true if consumed; false falls through to the pause menu. window > build priority.
   */
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
    if (this._storeOpen || this._craftOpen || this._mapOpen) {
      Interactable.closeAll(this); // closes whichever station window is open
      return true;
    }
    if (this._buildActive) {
      this._buildActive = false; // _resolveContext drops to "play" next frame; HUD hides
      return true;
    }
    return false;
  }

  draw() {
    // a Time.raw camera control updates here so it keeps panning while the sim is paused (step()
    // is skipped then); apply before the renderer reads it
    if (this.camera.control.raw) this.camera.update();
    this.renderer.draw(this.level.entities); // tilemap + zone + player / enemies / elder: boxes + labels
    // overlay AFTER the renderer: the ground passes paint an OPAQUE fill that would cover it if drawn first
    WorldOverlay.drawWorld(this); // drops, bullets, reach zone (world space)
    if (Settings.get("hudRadar"))
      // directional radar (Settings toggle, default off). 2.5D: lift to ~body height under a pitched camera
      RadarArrows.draw(this.level.entities, this.playerId, this._radarRules, {
        lift: this.camera !== undefined && this.camera.pitch !== 0 ? 32 : 0,
      });
    Interactable.drawTarget(this); // highlight the targeted station (world space)
    BuildMode.drawWorld(this); // build-cursor cell highlight (world space)
    ParticleFx.draw(); // muzzle flash (world space, additive — bright over the day/night tint)
    // damage/heal numbers (world space); pass the camera pitch (rad→deg) so they stand up under 2.5D
    FloatingText.draw(this.camera ? (this.camera.pitch * 180) / Math.PI : 0);
    // HUD/dialogue/inventory are manager-drawn UI panels — nothing more here
  }

  destroy() {
    InputContext.reset(); // hand input back to "default" for the next scene
    PlayerSystem.unbind();
    WorldOverlay.clearTracers(); // drop any in-flight hitscan streaks (world coords are map-local)
    PathFollow.bind(null); // drop the terrain pricing (the next scene binds its own or none)
    SolidSystem.onStatics = null; // the nav grids go with the maps below
    // park the active map first (its runtime lives flat on `this`), so ColonyMap.reset can reclaim
    // every map's runtime + pooled Level in one pass
    ColonyMap.suspend(this);
    ColonyMap.reset();
    World.reset(); // drop the level pool + world timeline (every Level freed above)
    Trader.reset(); // drop trader records + queued trader events
    SaveGame.clearPending(); // free the grid blobs of loaded maps never visited
    if (this.ui) {
      UI.remove(this.ui);
      this.ui.destroy();
    }
  }
}
