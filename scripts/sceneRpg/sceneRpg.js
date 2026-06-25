const RPG_NPC_RADIUS = 30; // interact range to the elder NPC (16px-cell scale; see GEMS.md)
const RPG_SLEEP_SCALE = 6; // Time.scale while sleeping in a bed (fast-forward; capped by World.maxTicks)
const RPG_SLEEP_RECOVER = 40; // Drowsiness drained per sim-second while sleeping
const RPG_HOTBAR_HUD_SECS = 3; // wall-clock seconds the hotbar HUD stays up after a hotbar keypress
const RPG_HOTBAR_SLIDE = 150; // GUI px the hotbar bar slides DOWN (off the bottom edge) when hidden
const RPG_HOTBAR_SLIDE_SPD = 16; // Tween.approach speed for the slide (higher = snappier pop)

// Exposed as a factory so another scene (the level editor's Test Play) can open this scene
// directly; SceneRegistry.add uses the SAME reference so SceneManager._apply resolves its label.
globalThis.SceneRpg = () => new _SceneRpgClass();
SceneRegistry.add(SceneRpg, {
  label: I18n.textRef("RPG_NAME"),
  category: "SCENE_CAT_RPG",
});

class _SceneRpgClass extends Scene {
  label = "RPG";

  create() {
    // ── Persistence + content (load before building anything) ──────────────
    SaveData.load();
    RpgQuests.register();
    Profile.load();
    Achievement.load();
    QuestLog.reset();
    QuestLog.accept(RpgQuests.QUEST_GATHER); // collect — tracked passively
    QuestLog.accept(RpgQuests.QUEST_REACH); // reach — tracked passively

    // Combat policy: inject the RPG's stat-driven mitigation into the kit's stat-agnostic Combat
    // applier (default is identity). Every damage path (MeleeSystem/ProjectileSystem/CombatAI) folds
    // in the target's defense + a min-1 floor through this; the attack side (weapon + Stats.attack)
    // is composed by the callers. Set once per scene — survives map reloads (a static hook).
    Combat.mitigate = function (world, targetId, amount, penetration = 0) {
      const s = world.get(Stats, targetId);
      const defense = s !== undefined ? s.defense : 0;
      // Armor penetration (an ammo-driven gun's round) eats into defense before it mitigates; clamp
      // so a round never ADDS damage, and keep the min-1 floor so any hit still registers.
      const effDef = Math.max(0, defense - penetration);
      return Math.max(1, amount - effDef);
    };
    // Consumable policy: inject how a *_shard consumable grows an attribute (the item-driven
    // progression that replaced leveling). Raise the bag key, then re-derive Stats from source.
    // No-op (false → use() refuses, no waste) if the target has no Attributes or no such key.
    ConsumableSystem.grantAttr = function (world, id, attr, amount) {
      const a = world.get(Attributes, id);
      if (a === undefined || a[attr] === undefined) return false;
      a[attr] += amount;
      StatModel.recompute(world, id);
      return true;
    };
    // Status policy: a buff/debuff carrying flat `mods` (e.g. fortify's +attack) only reaches the
    // derived Stats when the sheet re-derives. Inject that re-derive into the kit's StatusSystem
    // (default no-op) so apply/expire of a mods-bearing status folds it in/out (StatModel._foldStatuses).
    // dot/hot + live `mult` (encumbrance/speed) need no recompute — they act directly / are read live.
    StatusSystem.onStatsChanged = function (world, id) {
      StatModel.recompute(world, id);
    };

    // ── Map pool: visited maps are kept ALIVE + suspended here (mapId → bundle of
    //    world/level/renderer/camera/...), so a door trip PARKS the current map instead of
    //    destroying it — only the party migrates (RpgMap.go). _mapOrder tracks activation order
    //    for LRU eviction past RpgMap.POOL_MAX, which serializes the evicted map into the COLD
    //    _mapCache (Level.export() + stationed companions) and frees it (a future save would
    //    serialize the pool + cache alongside the character sheet). ──
    this._maps = {};
    this._mapOrder = [];
    this._mapCache = {};

    // ── Overlay / interaction state (scene-wide — survives map changes) ─────
    this.invOpen = false;
    this._invDirty = false; // rebuild the inventory window body next step when set
    this._hotbarTimer = RPG_HOTBAR_HUD_SECS; // counts down on Time.raw; hotbar HUD shows while > 0
    this._hotbarSlide = 0; // 0 = tucked below the screen, 1 = fully up; eased toward show/hide
    this._sleeping = false; // true while resting in a bed (Time.scale fast-forwarded — see _sleep)
    this.nearNpc = false;
    this.dialogueName = "";
    this.dialogueLine = "";
    this.dialogueAction = "";

    // ── SystemMenu overlay owns pause + exit (Esc / Start / F1) and suspends menu nav
    // while playing. Flag it (a subclass field initializer wouldn't run on GMRT). ─────
    this.gameplay = true;

    // ── Persistent UI (built once). These widgets read this.world / this.ctrl LIVE each
    //    frame, so they keep working after RpgMap.go() swaps the world on a map change. Hint,
    //    then manager-drawn panels: HUD + quest tracker (top-right), NPC dialogue (bottom-center,
    //    toggled), inventory window, station prompt/storage/crafting windows, build-mode HUD. ──
    this.ui = gemsRoot();
    UI.insert(this.ui);

    // Radar rules for RadarArrows (drawn in draw()): which tags get a directional arrow around
    // the player, and in what color. Built here (not at top level) so Color is loaded. Read live
    // each frame, so the radar survives a map/world swap with no rebuild (unlike the old minimap).
    this._radarRules = [
      { tag: "enemy", color: Color.parse("#e0584f") },
      { tag: "npc", color: Color.parse("#ffd166") },
      { tag: "portal", color: Color.parse("#9b8cff") },
      { tag: "follower", color: Color.parse("#6fd0a0") },
    ];
    // Context-aware, binding-driven key hints (the bar reads each action's CURRENT binding
    // live, so it's ready for key remapping — a rebind updates the hint with no extra wiring).
    // `contexts` gates each entry to the matching InputContext (play / build / window), so the
    // bar swaps its hints as the scene changes context. `text` entries are non-rebindable keys
    // (raw build-mode mouse, Esc-to-close).
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
    BuildMode.build(this); // grid build mode (HUD + per-scene state)

    // ── World graph boot: a normal launch starts at the overworld hub; the editor's Test
    //    Play overrides with a single playtest file (registered under a synthetic id — it
    //    has no portals, so the door system stays inert there). RpgMap.go() builds the world,
    //    level, player, renderer, camera, and minimap. ─────────────────────────────────────
    let bootMap = RpgLevel.START;
    if (RpgLevel.playtestFile !== undefined) {
      RpgLevel.MAPS._playtest = RpgLevel.playtestFile;
      RpgLevel.playtestFile = undefined;
      bootMap = "_playtest";
    }
    WorldClock.reset(); // start at morning, day 1 (once — survives map changes below)
    Weather.reset(); // settled clear sky (once — survives map changes, like the clock)
    RpgMap.go(this, bootMap, "default");

    // Starting loadout: a melee Wooden Sword, equipped — so the attack is item-driven from frame
    // one (unarmed is only a weak fist; this is a real swing). Granted once at scene start; from
    // here it travels with the carried inventory across map changes (RpgMap.go re-applies it).
    const startInv = this.world.get(Inventory, this.ctrl.id);
    InventorySystem.add(startInv, "wood_sword", 1); // mints a uid instance (equippable gear)
    EquipmentSystem.equipFirst(this.world, this.ctrl.id, "wood_sword"); // equip that instance by uid

    // Seed one starting companion into the party (programmatic, not file-authored — so
    // reloading a persistent map never re-creates it; from here the travel/station persistence
    // in RpgMap.go owns it). create() runs once per scene, so this seeds exactly once. It
    // carries a bag bonus (+slots / +weight cap) applied while it follows; apply it now since
    // it spawns in "follow" state. From here the bonus is balanced by the F-toggle / dismiss
    // transitions, and rides the carried Inventory snapshot across map changes (no re-apply).
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

    // Seed an arcade cabinet near spawn (programmatic, like the companion): a Station the player
    // interacts with (E) to launch the platformer as a minigame ON TOP of the RPG via the
    // SceneManager stack (Interactable routes kind "arcade" → _openArcade). create() runs once,
    // and this lives directly in the world (not chunk-managed), so it persists while the overworld
    // world does. Authoring it into overworld.json would also survive portal round-trips (future).
    const sg = this.level.worldToGrid(this.spawn.x, this.spawn.y);
    RpgSpawn.spawnEntity(this.world, this.level, {
      preset: "prop",
      gx: sg.x + 2,
      gy: sg.y - 2,
      label: "Arcade",
      color: "#9b8cff",
      kind: "arcade",
    });

    // The scene takes over gameplay input: push its base context. step() replaces it each
    // frame via _resolveContext; destroy() resets to "default" for the next scene.
    InputContext.push("play");

    Log.info(
      `RPG ready — items=${Item.all().length} quests=${QuestLog.defOrder.length} ` +
        `achievements=${Achievement.all().length} kills(saved)=${Profile.get("enemiesKilled")}`,
    );
  }

  step() {
    // No pause gate — obj_game skips scene.step() while the SystemMenu is open.

    // Sleeping (bed): fast-forward Time.scale so the night/needs race by while Drowsiness drains
    // (the tick loop above). Manual wake — any key/click/face-button gets the player up. Checked
    // BEFORE the tick loop so the waking press wakes instead of moving/acting this frame.
    if (this._sleeping) {
      if (this._wakeInput()) {
        this._sleeping = false;
        Time.scale = 1;
      } else {
        Time.scale = RPG_SLEEP_SCALE;
      }
    }
    this._sleepOverlay.enabled = this._sleeping;

    // Edge-triggered toggle — sampled once per frame, outside the tick loop. The
    // window's widgets are clicked/navigated directly; no keyboard cursor anymore.
    if (Input.get("inventory").pressed()) {
      this.invOpen = !this.invOpen;
      this._invWin.enabled = this.invOpen;
      if (this.invOpen) this._invDirty = true;
    }

    // Resolve the active input context for this frame BEFORE the tick loop, so the
    // movement/fire reads inside it (RpgController.update) see it. Window beats build beats
    // play: a gameplay window open mutes fire (clicks don't shoot) but keeps movement;
    // build mode mutes fire too (LMB places tiles). See InputContext + RpgController tags.
    this._resolveContext();

    // Hotbar number keys (1..N) — edge-checked once per frame, after the context is set (the
    // hotbar actions are "play"-only, so this is inert while a window is open or building). A
    // keypress (in _useHotbar) refreshes the reveal timer below.
    this._useHotbar();

    // Auto-hide the hotbar HUD with a slide: the bar pops UP on a hotbar keypress / bind-or-clear
    // (which reset _hotbarTimer via _showHotbar) and slides back DOWN below the screen edge after
    // RPG_HOTBAR_HUD_SECS. The timer counts down on Time.raw (wall-clock, like all UI timing —
    // unaffected by sim pause/dilation); _hotbarSlide eases 0..1 toward the target via Tween.approach
    // (also Time.raw) and drives the bar's draw-time dragY offset (offset-not-mutation, the idiom for
    // animated UI position — see UIElement.getLayoutPosition). Build mode owns the bottom-center HUD,
    // so the bar slides away while it's active.
    if (this._hotbarTimer > 0) this._hotbarTimer -= Time.raw;
    const show = !this._buildActive && this._hotbarTimer > 0;
    this._hotbarSlide = Tween.approach(
      this._hotbarSlide,
      show ? 1 : 0,
      RPG_HOTBAR_SLIDE_SPD,
    );
    this._hotbarBar.dragY = (1 - this._hotbarSlide) * RPG_HOTBAR_SLIDE;
    this._hotbarBar.enabled = this._hotbarSlide > 0.001; // skip drawing once fully tucked away

    // Rebuild the pathfinding nav window around the player BEFORE the tick loop — the per-tick
    // PathfindingSystem (in the physics pipeline) plans slime paths over it. It's the same NavGrid
    // MotionPlanner already points at; only occupancy/origin change, so this is cheap.
    const np = this.world.get(Position, this.ctrl.id);
    const nc = this.level.worldToGrid(np.x, np.y);
    this.nav.rebuild(this.world, nc.x, nc.y);

    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // pre-move positions for render lerp
      StatusSystem.update(this.world); // tick buffs/debuffs (dot/hot + duration), then ↓
      EncumbranceSystem.update(this.world); // refresh the "encumbered" status from carried weight
      // Survival needs: thirst/hunger rise (and apply their critical debuff); drowsiness rises while
      // awake, but DRAINS while sleeping in a bed (the scene fast-forwards Time.scale — see _sleep).
      ThirstSystem.update(this.world);
      HungerSystem.update(this.world);
      if (this._sleeping)
        DrowsinessSystem.restore(
          this.world,
          this.ctrl.id,
          RPG_SLEEP_RECOVER * this.world.tickDuration,
        );
      else DrowsinessSystem.update(this.world);
      RpgController.update(this.world, this.ctrl); // reads StatusSystem.scale("speed")
      FollowerSystem.update(this.world, this.ctrl.id, this.followers); // seek (before physics)
      this.physics.update(this.world);

      RpgScene.trackDamage(this, 7); // floating numbers for any hp change this tick
      // Configurable hp-0 reactions by each entity's Mortal kind: bandits despawn (spill loot),
      // the player respawns at spawn, a companion goes Down (then recovers — updateDowned below).
      RpgScene.resolveHealth(this, {
        spill: { yBase: 0, ySpread: 14 },
        onDespawn: (id) => {
          Profile.add("enemiesKilled", 1);
          QuestLog.report("kill", "human", 1);
          this._markGone(id); // a unique (id'd) enemy won't re-spawn on revisit
          Log.info(`bandit killed — kills=${Profile.get("enemiesKilled")}`);
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
      // Down-timer: revive a downed companion at the recovery spot — its claimed build area if
      // one exists, else the map spawn ("nearest/pre-defined build zone or spawn area").
      RpgScene.updateDowned(this, {
        downSpot: () => this._recoverSpot(),
        onRecover: (id) => {
          Toast.push(I18n.text("FOLLOWER_RECOVERED", this._followerName(id)), {
            type: "success",
          });
        },
      });
      RpgScene.collectDrops(this, (itemId, got) => {
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
    BuildMode.reapDestroyed(this); // remove built entities slimes destroyed (e.g. turrets at 0 HP)
    this._toggleFollower(); // F: nearest companion wait <-> follow (outside tick loop)
    WorldClock.update(Time.delta); // advance in-game time (sim time → pauses with the game)
    Weather.update(Time.delta); // advance weather transition (sim time, like the clock)
    ParticleFx.update(); // advance muzzle-flash particles (once per frame; freezes when paused)
    this._updateClimate(); // climate-zone enter/exit → Weather region override
    this.camera.update();
    Audio.listener(this.camera.toX, this.camera.toY); // ears follow the view → spatial SFX pan/attenuate

    // Stream chunks around the player (chunked maps only; outside the tick loop). Loads/unloads
    // entities + colliders as the player crosses chunk borders; runs before the portal check,
    // which can swap the whole map out from under everything.
    if (this.chunks !== undefined) {
      const pp = this.world.get(Position, this.ctrl.id);
      this.chunks.update(pp.x, pp.y);
      // Re-build any newly-streamed chunks' terrain VBOs (diff-based; cheap when nothing changed).
      if (this.terrain !== undefined) this.terrain.rebuild(this.chunks);
    }

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
        // A kills/items/quests records line below the stats (the genre's extraRows hook).
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

    // Door check LAST — RpgMap.go() swaps this.world/level/renderer/camera out from under the
    // scene, so nothing below it may touch the old map.
    RpgMap.checkPortals(this);
  }

  // Number-key hotbar: use the item bound to each pressed slot. Edge-sampled once per frame,
  // outside the tick loop. useItem handles both consumable use and equip/unequip toggle (and
  // no-ops when the player doesn't own the bound item), so a slot can stay armed across uses.
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

  // Reveal the bottom hotbar HUD and refresh its Time.raw auto-hide countdown. Called on a hotbar
  // keypress (_useHotbar) and on a bind/clear from the inventory strip (RpgInventoryUI), so the bar
  // pops into view then fades after RPG_HOTBAR_HUD_SECS.
  _showHotbar() {
    this._hotbarTimer = RPG_HOTBAR_HUD_SECS;
  }

  // Whether the player currently has an instance of itemId equipped (drives useItem's
  // equip-vs-unequip toggle for a hotbarred equippable). Equipment keys by instance uid now, so
  // resolve the equipped uid back to its itemId. False for non-equippables / when not worn.
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

  // Mark a unique (Persistent) entity as removed in the current map so it won't re-spawn from
  // the file on revisit (file-scope reconcile). No-op for an anonymous (id-less) entity — those
  // are meant to respawn. Read the uid while the entity is still alive (before world.remove).
  _markGone(id) {
    const pc = this.world.get(Persistent, id);
    if (pc !== undefined) this._gone[pc.uid] = true;
  }

  // F: toggle the nearest companion (within reach) between follow and wait. A "wait" companion
  // is stationed in the current map (homeMap), so it persists there via the map cache instead
  // of traveling. Edge-sampled once per frame, outside the tick loop.
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

  // Dismiss a following companion to the player's claimed build area: stop its carry bonus,
  // station it (state "wait", homeMap = this map → it persists there via the map cache), and
  // relocate it to the build-zone centroid so the player can find + recall it (walk up + the
  // follow key). Called from the inventory Party tab's Dismiss button. No-op unless the
  // companion is currently following and a build area has been claimed in this map.
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

  // World-coord center of this map's claimed build area, or null when nothing is claimed yet.
  // The zone is painted as a rect (BuildMode.claim), so the cell-average centroid lands inside
  // it. cells() scans the resident grid, but a dismiss is a rare one-shot click — cheap enough.
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

  // Start sleeping in a bed (Interactable routes a "bed" Station's E here). step() then fast-forwards
  // Time.scale and drains Drowsiness each tick until the player wakes (_wakeInput). No-op if already
  // asleep. Sleeping costs water/food (their needs keep rising at the accelerated rate).
  _sleep() {
    this._sleeping = true;
  }

  // Any input that wakes the sleeper: a key, a mouse click, or a gamepad face button. Raw queries
  // (not InputAction) so it fires regardless of context; checked at the top of step() before the
  // tick loop, so the waking press wakes instead of moving/acting. UIPointer.pressed is the latched
  // LMB edge for the frame.
  _wakeInput() {
    return (
      keyboard_check_pressed(vk_anykey) ||
      UIPointer.pressed ||
      mouse_check_button_pressed(mb_right) ||
      gamepad_button_check_pressed(0, gp_face1) ||
      gamepad_button_check_pressed(0, gp_face2)
    );
  }

  // Where a downed companion revives: its claimed build area if one exists, else the map spawn
  // ("nearest/pre-defined build zone or spawn area"). Handed to RpgScene.updateDowned.
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

  // Track which climate zone the player stands in (single-entity, so a direct cell lookup beats
  // ZoneSystem's all-entity sweep) and push/clear the Weather region override on a border cross.
  // No-op on maps without a "climate" channel (interiors, plain maps).
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

  // Proximity to an NPC + dialogue text for accept / turn in. No-op on maps with no NPC in
  // reach (e.g. interiors); the target is resolved live each frame (this._npcId).
  _updateNpc() {
    this._npcId = -1;
    this.nearNpc = false;
    const p = this.world.get(Position, this.ctrl.id);
    if (p === undefined) return;
    // Live: nearest "npc"-tagged entity within reach (works whether the NPC is streamed or
    // spawned up front). No NPC in range → no dialogue this frame.
    const id = Query.nearest(this.world, p.x, p.y, {
      tag: "npc",
      maxDist: RPG_NPC_RADIUS,
    });
    if (id === -1) return;
    this._npcId = id;
    this.nearNpc = true;

    const npc = this.world.get(NPC, id);
    const qid = npc.questId;
    this.dialogueName = npc.name;
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

  // Derive this frame's input context from the open-window / build-mode flags. Window beats
  // build beats play (a window pauses build). Pushed once in create(); replaced here each
  // frame. InputContext then gates the action tags (fire muted off "play"; etc.).
  _resolveContext() {
    let ctx = "play";
    if (this.invOpen || this._storeOpen || this._craftOpen) ctx = "window";
    else if (this._buildActive) ctx = "build";
    InputContext.set(ctx);
  }

  // Single interact (E) dispatch — replaces the two independent E reads that used to fire
  // together. Priority: a station window open → E closes it; else pick the world target
  // (station vs NPC) by cursor-then-distance and activate the winner. interact is muted in
  // the "build" context (tag), so this only runs in play / window.
  _dispatchInteract() {
    if (!Input.get("interact").pressed()) return;
    if (this.invOpen) return; // inventory owns the window; I toggles it, E is inert
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

  // The NPC side of the interact dispatch: accept the offered quest or turn it in when
  // ready. Called by _dispatchInteract only — never reads input itself.
  _npcActivate() {
    if (this._npcId === -1 || !this.nearNpc) return;
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

  // Esc back-out — SystemMenu calls this (before it would open the pause menu) so Esc closes
  // the active context instead of pausing: an open window first, then build mode. Returns
  // true if it consumed the press; false lets Esc fall through to the pause menu (F1 / gamepad
  // Start always open it regardless). Same window > build priority as _resolveContext.
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
    if (this.invOpen) {
      this.invOpen = false;
      this._invWin.enabled = false;
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

  // ── SceneManager stack: host pause/resume while a guest minigame runs in front ──────────
  // Suspend: hide the single RPG UI root. obj_game won't step a non-top scene, so the frozen
  // step() naturally pauses BuildMode/Interactable/WorldClock/Weather — nothing else to do
  // (the in-game clock + weather resume at the same time the player left them).
  suspend() {
    UI.setEnabled(this.ui, false);
  }

  // Resume: re-show the UI, re-claim viewport 0, and RE-BIND the keymap. A guest minigame's
  // controller unbinds shared action names on destroy (PlatformerController.destroy drops
  // moveLeft/moveRight, which the RPG also uses), so the RPG must re-register its keys to keep
  // walking. RpgController.bindKeys is idempotent (bindAll/register overwrite).
  resume() {
    UI.setEnabled(this.ui, true);
    this.camera.assign(0);
    RpgController.bindKeys();
  }

  // Launch the platformer as a minigame on top of the RPG (pushed by the arcade Station via
  // Interactable._open). On return, the guest's result() score becomes a coin reward.
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
    this.renderer.draw(this.world); // tilemap + zone + player / slimes / elder: boxes + labels
    // Drops / bullets / reach zone AFTER the renderer: the chunked overworld's RenderChunks
    // pass paints an OPAQUE ground fill that would cover them if drawn first (they were
    // invisible on the overworld, fine in plain interiors with no ground fill). Drawn here
    // they sit with the other post-renderer world cues (build cursor, floating numbers).
    RpgWorldOverlay.drawWorld(this); // drops, bullets, reach zone (world space)
    if (Settings.get("rpgRadar"))
      RadarArrows.draw(this.world, this.ctrl.id, this._radarRules); // directional radar around player (inventory Settings toggle, default off)
    Interactable.drawTarget(this); // highlight the targeted station (world space)
    BuildMode.drawWorld(this); // build-cursor cell highlight (world space)
    ParticleFx.draw(); // muzzle flash (world space, additive — bright over the day/night tint)
    FloatingText.draw(); // damage/heal numbers over entities (world space)
    // HUD / dialogue / inventory are now manager-drawn UI panels (GUI layer, Draw_75),
    // built in create() — nothing more to draw here.
  }

  destroy() {
    Profile.save(); // persist lifetime records (achievements persist on unlock)
    InputContext.reset(); // hand input back to "default" for the next scene
    RpgController.destroy();
    Weather.exitRegion();
    // Free every PARKED pooled map, then the active map (its fields live on `this`). RpgMap._free
    // reclaims each bundle's world/level/renderer/camera/chunks; the shared UI root is removed last.
    for (const id in this._maps) RpgMap._free(this._maps[id]);
    this._maps = {};
    RpgMap._free(this);
    if (this.ui) {
      UI.remove(this.ui);
      this.ui.destroy();
    }
  }
}
