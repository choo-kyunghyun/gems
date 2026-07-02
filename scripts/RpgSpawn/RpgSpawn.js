// Entity construction for the RPG levels. spawnEntity is the SINGLE place an entity is built —
// up-front map spawns (RpgSpawn.spawn) and the chunk streamer (ChunkSource.spawn) both route
// through it, so adding a preset touches one switch. Pure factories over world/level; no state.
//
// Presets (grid coords gx/gy; sprites + box sizes are archetype, kept in code):
//   raider   hp? loot[]   (hostile human — camp + quest enemy)
//   rat      hp? loot[]   (wildlife — the overworld ambient mobile-melee creature)
//   npc      label nameKey questId
//   chest    capacity items[]
//   prop     label color material? kind?   (material → tint over color; kind → Interaction, else furniture)
//   torch    label? color?        (decorative light prop — small solid post; carries a Light)
//   turret   label? color?        (auto-firing defense — immovable player-faction stationary ranged CombatAI)
//   reach    half?                (quest zone marker — no entity)
//   portal   toMap toEntry? label? color?  (walk-onto door → RpgMap.go; non-solid sensor)
//   follower label? color? speed? range?   (companion; starts in "follow")
// Every descriptor also takes `scale?` — a per-spawn size multiplier over the preset base (SCALE).
globalThis.RpgSpawn = {
  // Per-preset base size factor (1 = art-native), BAKED at spawn into both Visual.xscale/yscale
  // and the BBox — so the foot shadow (BBox-driven) and paper-doll layers (Visual-driven) follow
  // for free. Presets absent here spawn at 1. A descriptor's `scale` multiplies on top.
  SCALE: {
    raider: 0.85,
    rat: 0.7,
    npc: 0.8,
    follower: 0.75,
  },
  /**
   * Spawn the level's entities from data.spawns. Enemies acquire targets live by faction and
   * stations are discovered live by Interactable, so only the handles the scene's logic needs
   * are returned:
   *   { enemies: id[], npc: id, reach: {x1,y1,x2,y2}|undefined,
   *     portals: [{ id, toMap, toEntry }], followers: id[] }
   */
  spawn(world, level, data, reconcile) {
    const spawns = data.spawns ?? [];
    const enemies = [];
    const portals = [];
    const followers = [];
    let npc = -1;
    let reach;

    // File-scope reconcile: a spawn with an `id` is UNIQUE (spawn-once). `gone` = uids removed
    // during play — skip those so they don't re-spawn; id-less spawns always (re)spawn. Spawned
    // unique entities get a Persistent{uid} tag so the scene can remember their fate (_markGone).
    const gone = (reconcile && reconcile.gone) || {};

    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      if (s.id !== undefined && gone[s.id]) continue; // removed this map — don't re-spawn
      if (s.preset === "reach") {
        reach = RpgSpawn.reachZone(level, s); // a region, not an entity
        continue;
      }
      const id = RpgSpawn.spawnEntity(world, level, s);
      if (id === -1) continue;
      // classify into the scene's typed handles by preset
      if (s.preset === "raider" || s.preset === "rat") enemies.push(id);
      else if (s.preset === "npc") npc = id;
      else if (s.preset === "portal")
        portals.push({ id, toMap: s.toMap, toEntry: s.toEntry ?? "default" });
      else if (s.preset === "follower") followers.push(id);
    }

    return { enemies, npc, reach, portals, followers };
  },

  // Reach-quest zone rect (world coords) for a "reach" spawn — a region, not an entity.
  reachZone(level, s) {
    const w = level.gridToWorld(s.gx, s.gy);
    const half = s.half ?? 22;
    return { x1: w.x - half, y1: w.y - half, x2: w.x + half, y2: w.y + half };
  },

  // Construct ONE spawn descriptor's entity, returning its id (-1 for non-entity presets).
  // The single place entity construction lives. `gx/gy` are absolute grid coords (gridToWorld
  // handles negatives, so chunk-streamed entities work too).
  spawnEntity(world, level, s) {
    const w = level.gridToWorld(s.gx, s.gy);
    // baked size factor: preset base × optional per-spawn override (see SCALE)
    const k = (RpgSpawn.SCALE[s.preset] ?? 1) * (s.scale ?? 1);

    if (s.preset === "raider") {
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, RpgSpawn._box(-6, -6, 12, 12, k));
      // dynamic (non-kinematic) so SolidSystem integrates CombatAI's velocity + collides vs walls
      world.add(id, Collision, {
        solid: true,
        kinematic: false,
        mask: null,
        hits: [],
      });
      world.add(id, Health, { hp: s.hp ?? 3 });
      // Stats-driven damage/toughness like every combatant. maxHp mirrors hp; stamina vestigial.
      world.add(id, Stats, {
        maxHp: s.hp ?? 3,
        maxStamina: 0,
        attack: 1,
        defense: 0,
        speed: 45,
      });
      world.add(id, Mortal, { kind: "despawn" }); // hp 0 → spill loot + remove (RpgScene)
      world.add(id, Raider, {}); // species marker (radar color + kill-quest type)
      world.add(id, Faction, { id: "monster" }); // hostile to "player" → CombatAI aggro target
      world.add(id, Name, { name: "Raider" });
      // loot table — no maxWeight (authored loot, never weight-gated)
      world.add(id, Inventory, { slots: s.loot ?? [], capacity: 8 });
      // paper-doll bandit: the same white humanoid template as the player — skin-tinted Visual,
      // the shared strip graph (CombatAI drives idle/walk/attack + facing), and an AUTHORED
      // outfit (no Equipment, so AppearanceSystem.rebuild leaves these layers alone)
      world.add(id, Visual, RpgSpawn._visual(spr_human, RpgSpawn._skin(s), k));
      world.add(id, Animator, {
        graph: RpgPlayer.animGraph(),
        state: "idle",
        frame: 0,
        time: 0,
      });
      world.add(id, Appearance, {
        back: [],
        front: [
          { sprite: spr_wear_blackShirt, color: c_white },
          { sprite: spr_wear_blackSneakers, color: c_white },
          { sprite: spr_wear_redBandana, color: c_white },
        ],
      });
      CombatAI.attach(world, id, level); // adds Velocity + Brain + State (acquires target by faction)
      if (s.id !== undefined) world.add(id, Persistent, { uid: s.id }); // unique → reconcile
      return id;
    } else if (s.preset === "rat") {
      // Wildlife (OverworldGen scatter): a weaker raider — smaller/less hp/quicker — but the SAME
      // mobile-melee CombatAI + despawn Mortal.
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, RpgSpawn._box(-5, -5, 10, 10, k));
      world.add(id, Collision, {
        solid: true,
        kinematic: false,
        mask: null,
        hits: [],
      });
      world.add(id, Health, { hp: s.hp ?? 2 });
      world.add(id, Stats, {
        maxHp: s.hp ?? 2,
        maxStamina: 0,
        attack: 1,
        defense: 0,
        speed: 60,
      });
      world.add(id, Mortal, { kind: "despawn" }); // hp 0 → spill loot + remove (RpgScene)
      world.add(id, Rat, {}); // species marker (radar color + kill-quest type)
      world.add(id, Faction, { id: "monster" }); // hostile to "player" → CombatAI aggro target
      world.add(id, Name, { name: "Rat" });
      world.add(id, Inventory, { slots: s.loot ?? [], capacity: 4 });
      const vis = RpgSpawn._visual(spr_rat, c_white, k);
      vis.speed = 6; // looping scuttle cycle
      world.add(id, Visual, vis);
      CombatAI.attach(world, id, level); // mobile melee, acquires target by faction
      if (s.id !== undefined) world.add(id, Persistent, { uid: s.id });
      return id;
    } else if (s.preset === "npc") {
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, RpgSpawn._box(-7, -7, 14, 14, k));
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Name, { name: s.label });
      world.add(id, NPC, { name: s.nameKey, lines: [], questId: s.questId }); // NPC presence = "is an NPC" (radar/query)
      world.add(id, Visual, RpgSpawn._visual(spr_hero, c_white, k));
      // Merchant NPC (Gameplay/Trade): a `merchant` descriptor attaches the trade config + a stock
      // Inventory (its OWN goods); the scene opens TradeUI on E. Stock built via InventorySystem.add
      // so instanced gear gets a uid/mods; weightless (no maxWeight) so a vendor isn't encumbered.
      if (s.merchant !== undefined) {
        const mc = s.merchant;
        const mInv = { slots: [], capacity: mc.capacity ?? 32 };
        const stock = mc.stock ?? [];
        for (let k = 0; k < stock.length; k++)
          InventorySystem.add(mInv, stock[k].itemId, stock[k].qty);
        world.add(id, Inventory, mInv);
        world.add(id, Merchant, {
          currencyId: mc.currencyId ?? "coin",
          buyMargin: mc.buyMargin ?? 1.25,
          sellMargin: mc.sellMargin ?? 0.5,
          infinite: mc.infinite ?? false,
          credits: mc.credits ?? 0,
          restockSecs: mc.restockSecs ?? 0,
          restockTimer: mc.restockSecs ?? 0,
          template: mc.template,
        });
      }
      if (s.id !== undefined) world.add(id, Persistent, { uid: s.id }); // unique → reconcile
      return id;
    } else if (s.preset === "chest") {
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, RpgSpawn._box(-7, -7, 14, 14, k));
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Interaction, { kind: "storage" });
      world.add(id, Name, { name: "Footlocker" });
      world.add(id, Inventory, {
        slots: s.items ?? [],
        capacity: s.capacity ?? 12,
      });
      world.add(id, Visual, RpgSpawn._visual(spr_chest, c_white, k));
      return id;
    } else if (s.preset === "prop") {
      // Solid kinematic prop. An Interaction `kind` makes it interactable (E runs its InteractAction);
      // a decorative prop omits it.
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, RpgSpawn._box(-7, -7, 14, 14, k));
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Name, { name: s.label });
      // Sprite per Interaction `kind` (workbench/claim/bed) or furniture `furn` (crate/barrel/fence,
      // default crate). Pre-colored art draws untinted unless the descriptor authors color/material.
      let sprite;
      let color = c_white;
      if (s.kind === "workbench") sprite = spr_workbench;
      else if (s.kind === "claim") sprite = spr_surveyPost;
      else if (s.kind === "bed") sprite = spr_simpleBed;
      else {
        if (s.furn === "barrel") sprite = spr_woodenBarrel;
        else if (s.furn === "fence") sprite = spr_fenceSquare;
        else sprite = spr_crate;
        if (s.color !== undefined || s.material !== undefined)
          color = RpgSpawn._tint(s);
      }
      world.add(id, Visual, RpgSpawn._visual(sprite, color, k));
      if (s.kind !== undefined) world.add(id, Interaction, { kind: s.kind });
      return id;
    } else if (s.preset === "torch") {
      // Decorative LIGHT prop: a small solid post carrying a Light (drawn by RenderLighting).
      // EntitySnapshot copies every component, so the Light round-trips a map reload for free.
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, RpgSpawn._box(-4, -4, 8, 8, k)); // small footprint
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Name, { name: s.label ?? "Lamp" });
      world.add(id, Visual, RpgSpawn._visual(spr_torch, c_white, k));
      // warm, gently flickering torch light (archetype values)
      world.add(id, Light, {
        radius: 75,
        color: Color.parse("#ffd09a"),
        intensity: 0.9,
        flicker: 0.18,
      });
      return id;
    } else if (s.preset === "turret") {
      // Auto-firing defense post: an immovable player-faction ACTOR — a stationary ranged CombatAI
      // (mobile:false, ranged:true), no dedicated component. Carries Health + player faction so
      // enemies target/damage it (two-sided combat). Built-only today (BuildMode "Defense").
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, RpgSpawn._box(-6, -6, 12, 12, k));
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Health, { hp: 8 });
      // shot damage is Stats.attack
      world.add(id, Stats, {
        maxHp: 8,
        maxStamina: 0,
        attack: 2,
        defense: 0,
        speed: 0,
      });
      world.add(id, Faction, { id: "player" }); // player ally; a hostile target for enemies
      world.add(id, Name, { name: s.label ?? "Turret" });
      world.add(id, Visual, RpgSpawn._visual(spr_lightTurret, c_white, k));
      // stationary ranged brain: aggro == fire range; fires an instant hitscan at the nearest hostile
      CombatAI.attach(world, id, level, {
        mobile: false,
        ranged: true,
        aggro: 110,
        deAggro: 110,
        attackRange: 110,
        cdMax: 30,
        bulletSpeed: 190,
        speed: 0,
      });
      return id;
    } else if (s.preset === "portal") {
      // A doorway: a non-solid sensor the player walks onto to travel. The destination rides on
      // the entity (Portal component), so a streamed portal resolves via a live world.query(Portal).
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, RpgSpawn._box(-7, -7, 14, 14, k));
      world.add(id, Name, { name: s.label ?? "Door" });
      world.add(id, Visual, RpgSpawn._visual(spr_door, c_white, k));
      world.add(id, Portal, {
        toMap: s.toMap,
        toEntry: s.toEntry ?? "default",
      });
      return id;
    } else if (s.preset === "follower") {
      return RpgSpawn.spawnFollower(world, w.x, w.y, {
        label: s.label,
        color: s.color,
        speed: s.speed,
        range: s.range,
        scale: s.scale, // per-spawn override; spawnFollower folds in the preset base
      });
    }
    return -1;
  },

  // Spawn a companion (a dynamic solid body) at world coords. Shared by the `follower` preset +
  // the scene's programmatic party seed. NOTE: a companion is persistent (travels/stations via
  // EntitySnapshot), so prefer the programmatic seed over a file spawn in a PERSISTENT map — a
  // file spawn re-runs every revisit and would duplicate the restored copy. Preset is fine for
  // non-persistent maps.
  spawnFollower(world, wx, wy, opt = {}) {
    const id = world.create();
    // baked size factor, like spawnEntity (preset base × optional override)
    const k = (RpgSpawn.SCALE.follower ?? 1) * (opt.scale ?? 1);
    world.add(id, Position, { x: wx, y: wy, z: 0 });
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, BBox, RpgSpawn._box(-5, -5, 10, 10, k));
    world.add(id, Collision, {
      solid: true,
      kinematic: false,
      mask: null,
      hits: [],
    });
    world.add(id, Faction, { id: "player" }); // party ally; friendly fire skips it, but enemies aggro it (it has Health)
    // mortal but recoverable: at 0 hp it goes Down, then revives at the recovery spot after
    // Mortal.recoverSecs (see RpgScene.resolveHealth/updateDowned). Not removed like an enemy.
    world.add(id, Health, { hp: opt.hp ?? 6 });
    // a companion is a combatant, so it carries defense + attack like every other actor
    world.add(id, Stats, {
      maxHp: opt.hp ?? 6,
      maxStamina: 0,
      attack: 1,
      defense: 0,
      speed: opt.speed ?? 130,
    });
    world.add(id, Mortal, {
      kind: "down",
      recoverSecs: opt.recoverSecs ?? 6,
      reviveHp: opt.hp ?? 6,
    });
    world.add(id, Name, { name: opt.label ?? "Companion" });
    // hero sprite tinted green so it reads as an ally
    world.add(
      id,
      Visual,
      RpgSpawn._visual(spr_hero, Color.parse(opt.color ?? "#9fe0c0"), k),
    );
    world.add(id, Follower, {
      state: opt.state ?? "follow",
      speed: opt.speed ?? 130, // > player speed (110) so it can catch up when it lags
      range: opt.range ?? 20,
      homeMap: "",
      // Carry bonus to the player's Inventory while following (0 = none). The `follower` preset
      // doesn't pass these, so file-authored followers stay benefit-free; only the seed grants one.
      bonusCapacity: opt.bonusCapacity ?? 0,
      bonusWeight: opt.bonusWeight ?? 0,
    });
    return id;
  },

  // Resolve a spawn's tint: a `material` id's Item.Material color wins (per-material tinting, one
  // source of truth), else `color` (#hex), else `fallback`, else white. Returns a colour int.
  _tint(s, fallback) {
    if (s.material !== undefined) {
      const item = Item.get(s.material);
      const mat = item !== undefined ? item.getComponent(Material) : undefined;
      if (mat !== undefined) return mat.color;
    }
    const hex = s.color ?? fallback;
    return hex !== undefined ? Color.parse(hex) : c_white;
  },

  // Scaled BBox for a preset's baked size factor. Fractional extents are fine — collision math
  // is float throughout (AABB).
  _box(x, y, w, h, k) {
    return { x: x * k, y: y * k, width: w * k, height: h * k };
  },

  // Skin tones for doll humanoids (Visual.color over the white spr_human template).
  SKINS: ["#e8b890", "#d19a6b", "#a2714c"],

  // deterministic skin pick — hashed from the spawn CELL so a regenerated chunk's humanoid
  // keeps the same face (OverworldGen chunks must regenerate identically)
  _skin(s) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const i = Math.abs(gx * 7 + gy * 13) % RpgSpawn.SKINS.length;
    return Color.parse(RpgSpawn.SKINS[i]);
  },

  // Shared Visual shape. `scale` is the entity's baked size factor (preset base × per-spawn
  // override — see SCALE). Sprites are foot-anchored so this draws standing up from Position.
  // Caller may set `speed`.
  _visual(sprite, color, scale = 1) {
    return {
      visible: true,
      sprite: sprite,
      subimg: 0,
      xscale: scale,
      yscale: scale,
      rot: 0,
      color: color,
      alpha: 1,
      speed: 0,
      time: 0,
    };
  },
};
