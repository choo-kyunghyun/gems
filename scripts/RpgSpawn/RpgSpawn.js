// Entity construction for the RPG levels. The archetypes are EntityPreset DEFS (register(),
// called by RpgContent.register) — component data + design scale + a `post` hook for the wiring
// data can't express (CombatAI.attach). spawnEntity is the DESCRIPTOR ADAPTER — the single place
// a spawn descriptor becomes an entity: grid→world, per-spawn overrides (field-merged onto the
// def like a variant). Up-front map spawns (RpgSpawn.spawn), the chunk
// streamer (ChunkManager's spawn adapter), BuildMode, and the Trader all route through it. A variant preset
// (e.g. `extends: "raider"`) spawns through the same path with zero adapter changes when its
// descriptor fields match its base's.
//
// Presets (grid coords gx/gy; sprites + box sizes are archetype, kept in the defs):
//   raider   hp? loot[]   (hostile human — camp + quest enemy)
//   rat      hp? loot[]   (wildlife — the overworld ambient mobile-melee creature)
//   npc      label nameKey questId merchant?
//   chest    capacity items[]
//   prop     label color material? kind?   (material → tint over color; kind → Interaction, else furniture)
//   torch    label? color?        (decorative light prop — small solid post; carries a Light)
//   turret   label? color?        (auto-firing defense — immovable player-faction stationary ranged CombatAI)
//   reach    half?                (quest zone marker — no entity)
//   portal   toMap toEntry? label? color?  (walk-onto door → RpgMap.go; non-solid sensor)
//   follower label? color? speed? range?   (companion; starts in "follow")
// Every descriptor also takes `scale?` — a per-spawn size multiplier over the def's design scale
// (the Alpha/boss knob; see EntityPreset — SpriteMeta density divides the DRAW scale separately).
globalThis.RpgSpawn = {
  // Register the RPG archetypes as EntityPreset defs (idempotent; called by RpgContent).
  // Register-time evaluation (Color.parse / RpgPlayer.animGraph) is safe here — this runs from a
  // scene's create(), never at script load. Defs are deep-copied per spawn (sprite refs pass
  // through by reference — see EntityPreset._clone).
  register() {
    EntityPreset.register([
      {
        id: "raider",
        scale: 0.85,
        components: {
          BBox: { x: -6, y: -6, width: 12, height: 12 },
          // dynamic (non-kinematic) so SolidSystem integrates CombatAI's velocity + collides vs walls
          Collision: { solid: true, kinematic: false, mask: null, hits: [] },
          Health: { hp: 3 },
          // Stats-driven damage/toughness like every combatant. maxHp mirrors hp; stamina vestigial.
          Stats: { maxHp: 3, maxStamina: 0, attack: 1, defense: 0, speed: 45 },
          Mortal: { kind: "corpse" }, // hp 0 → lootable body, reaped when emptied (RpgScene)
          Raider: {}, // species marker (radar color + kill-quest type)
          Faction: { id: "monster" }, // hostile to "player" → CombatAI aggro target
          Name: { name: "Raider" },
          // loot table — no maxWeight (authored loot, never weight-gated)
          Inventory: { slots: [], capacity: 8 },
          // paper-doll bandit: the white humanoid template — color = per-spawn skin (adapter)
          Visual: { sprite: spr_human },
          Animator: {
            graph: RpgPlayer.animGraph(),
            state: "idle",
            frame: 0,
            time: 0,
          },
          // AUTHORED outfit (no Equipment, so AppearanceSystem.rebuild leaves these layers alone)
          Appearance: {
            back: [],
            front: [
              { sprite: spr_wear_blackShirt, color: c_white },
              { sprite: spr_wear_blackSneakers, color: c_white },
              { sprite: spr_wear_redBandana, color: c_white },
            ],
          },
        },
        post(world, id, ctx) {
          CombatAI.attach(world, id, ctx.opts.level); // Velocity + Brain + State (mobile melee)
        },
      },
      {
        // Wildlife (OverworldGen scatter): a weaker raider — smaller/less hp/quicker — but the
        // SAME mobile-melee CombatAI + corpse Mortal.
        id: "rat",
        scale: 0.7,
        components: {
          BBox: { x: -5, y: -5, width: 10, height: 10 },
          Collision: { solid: true, kinematic: false, mask: null, hits: [] },
          Health: { hp: 2 },
          Stats: { maxHp: 2, maxStamina: 0, attack: 1, defense: 0, speed: 60 },
          Mortal: { kind: "corpse" },
          Rat: {}, // species marker (radar color + kill-quest type)
          Faction: { id: "monster" },
          Name: { name: "Rat" },
          Inventory: { slots: [], capacity: 4 },
          Visual: { sprite: spr_rat, speed: 6 }, // looping scuttle cycle
        },
        post(world, id, ctx) {
          CombatAI.attach(world, id, ctx.opts.level); // mobile melee, acquires target by faction
        },
      },
      {
        id: "npc",
        scale: 0.8,
        components: {
          BBox: { x: -7, y: -7, width: 14, height: 14 },
          Collision: { solid: true, kinematic: true, mask: null, hits: [] },
          Name: { name: "" },
          NPC: { name: "", lines: [] }, // NPC presence = "is an NPC" (radar/query)
          // paper-doll civilian: skin + TINTED white shirt/shoes (colors from the adapter);
          // static, so the idle bob just loops
          Visual: { sprite: spr_human },
          Animator: {
            graph: RpgPlayer.animGraph(),
            state: "idle",
            frame: 0,
            time: 0,
          },
          Appearance: RpgSpawn._outfit("#7a8a66"),
        },
      },
      {
        id: "chest",
        components: {
          BBox: { x: -7, y: -7, width: 14, height: 14 },
          Collision: { solid: true, kinematic: true, mask: null, hits: [] },
          Interaction: { kind: "storage" },
          Name: { name: "Footlocker" },
          Inventory: { slots: [], capacity: 12 },
          Visual: { sprite: spr_chest },
        },
      },
      {
        // Solid kinematic prop. The adapter resolves sprite/tint/Interaction from the descriptor
        // (kind → station sprite + Interaction; furn → furniture sprite; color/material → tint).
        id: "prop",
        components: {
          BBox: { x: -7, y: -7, width: 14, height: 14 },
          Collision: { solid: true, kinematic: true, mask: null, hits: [] },
          Name: { name: "" },
          Visual: { sprite: spr_crate },
        },
      },
      {
        // Decorative LIGHT prop: a small solid post carrying a Light (drawn by RenderLighting).
        // EntitySnapshot copies every component, so the Light round-trips a map reload for free.
        id: "torch",
        components: {
          BBox: { x: -4, y: -4, width: 8, height: 8 }, // small footprint
          Collision: { solid: true, kinematic: true, mask: null, hits: [] },
          Name: { name: "Lamp" },
          Visual: { sprite: spr_torch },
          // warm, gently flickering torch light (archetype values)
          Light: {
            radius: 75,
            color: Color.parse("#ffd09a"),
            intensity: 0.9,
            flicker: 0.18,
          },
        },
      },
      {
        // Auto-firing defense post: an immovable player-faction ACTOR — a stationary ranged
        // CombatAI (mobile:false, ranged:true), no dedicated component. Carries Health + player
        // faction so enemies target/damage it (two-sided combat). Built-only today (BuildMode).
        id: "turret",
        components: {
          BBox: { x: -6, y: -6, width: 12, height: 12 },
          Collision: { solid: true, kinematic: true, mask: null, hits: [] },
          Health: { hp: 8 },
          // shot damage is Stats.attack
          Stats: { maxHp: 8, maxStamina: 0, attack: 2, defense: 0, speed: 0 },
          Faction: { id: "player" }, // player ally; a hostile target for enemies
          Name: { name: "Turret" },
          Visual: { sprite: spr_lightTurret },
        },
        post(world, id, ctx) {
          // stationary ranged brain: aggro == fire range; fires an instant hitscan at the nearest hostile
          CombatAI.attach(world, id, ctx.opts.level, {
            mobile: false,
            ranged: true,
            aggro: 110,
            deAggro: 110,
            attackRange: 110,
            cdMax: 30,
            bulletSpeed: 190,
            speed: 0,
          });
        },
      },
      {
        // A doorway: a non-solid sensor the player walks onto to travel. The destination rides on
        // the entity (Portal component), so a streamed portal resolves via a live world.query(Portal).
        id: "portal",
        components: {
          BBox: { x: -7, y: -7, width: 14, height: 14 },
          Name: { name: "Door" },
          Visual: { sprite: spr_door },
          Portal: { toMap: "", toEntry: "default" },
        },
      },
      {
        // Companion (a dynamic solid body). Spawns UNHIRED — a map resident with a "rehire"
        // Interaction (talk to hire into the squad; FollowerSystem.hire adds Squad + drops the
        // Interaction). Mortal-but-recoverable: at 0 hp it goes Down, then revives at the
        // recovery spot (see RpgScene.resolveHealth/updateDowned). No AI attach — FollowerSystem
        // drives every Follower entity by query.
        id: "follower",
        scale: 0.75,
        components: {
          Velocity: { x: 0, y: 0, z: 0 },
          BBox: { x: -5, y: -5, width: 10, height: 10 },
          Collision: { solid: true, kinematic: false, mask: null, hits: [] },
          Faction: { id: "player" }, // party ally; friendly fire skips it, but enemies aggro it (it has Health)
          Health: { hp: 6 },
          // a companion is a combatant, so it carries defense + attack like every other actor
          Stats: { maxHp: 6, maxStamina: 0, attack: 1, defense: 0, speed: 130 },
          Mortal: { kind: "down", recoverSecs: 6, reviveHp: 6 },
          Name: { name: "Companion" },
          Visual: { sprite: spr_human },
          Animator: {
            graph: RpgPlayer.animGraph(),
            state: "idle",
            frame: 0,
            time: 0,
          },
          Appearance: RpgSpawn._outfit("#9fe0c0"),
          Follower: {
            state: "wait", // unhired residents hold still; hire() flips to follow
            speed: 130, // > player speed (110) so it can catch up when it lags
            range: 20,
            // Carry bonus to the player's Inventory while following (0 = none). The `follower`
            // preset doesn't pass these, so file-authored followers stay benefit-free; only the
            // programmatic seed grants one.
            bonusCapacity: 0,
            bonusWeight: 0,
          },
          Interaction: { kind: "rehire" }, // talk (E) to hire; hire() detaches this
        },
      },
    ]);
  },

  /**
   * Spawn the level's entities from data.spawns. Enemies acquire targets live by faction and
   * stations are discovered live by Interactable, so only the handles the scene's logic needs
   * are returned:
   *   { enemies: id[], npc: id, reach: {x1,y1,x2,y2}|undefined,
   *     portals: [{ id, toMap, toEntry }], followers: id[] }
   */
  spawn(world, level, data) {
    const spawns = data.spawns ?? [];
    const enemies = [];
    const portals = [];
    const followers = [];
    let npc = -1;
    let reach;

    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
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
  // The descriptor adapter over the EntityPreset defs: builds the per-spawn component overrides
  // (field-merged onto the def) and passes `level` through opts for the post hooks (CombatAI).
  // `gx/gy` are absolute grid coords (gridToWorld handles negatives, so chunk-streamed
  // entities work too).
  spawnEntity(world, level, s) {
    const w = level.gridToWorld(s.gx, s.gy);

    if (s.preset === "follower")
      return RpgSpawn.spawnFollower(world, w.x, w.y, {
        label: s.label,
        color: s.color,
        speed: s.speed,
        range: s.range,
        scale: s.scale, // per-spawn override; spawnFollower folds in the def base
      });
    if (!EntityPreset.has(s.preset)) return -1;

    const over = {};
    if (s.preset === "raider" || s.preset === "rat") {
      if (s.hp !== undefined) {
        over.Health = { hp: s.hp };
        over.Stats = { maxHp: s.hp };
      }
      if (s.loot !== undefined) over.Inventory = { slots: s.loot };
      // deterministic skin over the white doll template (rat keeps its own art untinted)
      if (s.preset === "raider") over.Visual = { color: RpgSpawn._skin(s) };
    } else if (s.preset === "npc") {
      over.Name = { name: s.label };
      over.NPC = { name: s.nameKey, questId: s.questId };
      over.Visual = { color: RpgSpawn._skin(s) };
      // outfit color from the descriptor so elder/merchants read distinct
      over.Appearance = RpgSpawn._outfit(s.color ?? "#7a8a66");
    } else if (s.preset === "chest") {
      const inv = {};
      if (s.items !== undefined) inv.slots = s.items;
      if (s.capacity !== undefined) inv.capacity = s.capacity;
      if (Object.keys(inv).length > 0) over.Inventory = inv;
    } else if (s.preset === "prop") {
      // Sprite per Interaction `kind` (workbench/claim/bed) or furniture `furn` (crate/barrel/
      // fence, default crate). Pre-colored art draws untinted unless the descriptor authors
      // color/material.
      let sprite;
      let color;
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
      over.Visual = color !== undefined ? { sprite, color } : { sprite };
      over.Name = { name: s.label };
      if (s.kind !== undefined) over.Interaction = { kind: s.kind };
    } else if (s.preset === "torch") {
      if (s.label !== undefined) over.Name = { name: s.label };
    } else if (s.preset === "turret") {
      if (s.label !== undefined) over.Name = { name: s.label };
    } else if (s.preset === "portal") {
      if (s.label !== undefined) over.Name = { name: s.label };
      over.Portal = { toMap: s.toMap, toEntry: s.toEntry ?? "default" };
    }

    const id = EntityPreset.spawn(s.preset, world, w.x, w.y, 0, {
      scale: s.scale,
      components: over,
      level, // post hooks (CombatAI.attach) read ctx.opts.level
    });

    // Merchant NPC (Gameplay/Trade): a `merchant` descriptor attaches the trade config + a stock
    // Inventory (its OWN goods); the scene opens TradeUI on E. Stock built via InventorySystem.add
    // so instanced gear gets a uid/mods; weightless (no maxWeight) so a vendor isn't encumbered.
    if (s.preset === "npc" && s.merchant !== undefined) {
      const mc = s.merchant;
      const mInv = { slots: [], capacity: mc.capacity ?? 32 };
      const stock = mc.stock ?? [];
      for (let i = 0; i < stock.length; i++)
        InventorySystem.add(mInv, stock[i].itemId, stock[i].qty);
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

    return id;
  },

  // Spawn a companion at world coords, via the `follower` preset. Shared by the `follower`
  // descriptor + the scene's programmatic party seed.
  spawnFollower(world, wx, wy, opt = {}) {
    // per-spawn overrides (field-merged onto the def). Skin hashed from the spawn spot;
    // `opt.color` is the OUTFIT tint, not a whole-body wash.
    const over = {
      Visual: {
        color: RpgSpawn._skin({ gx: Math.round(wx), gy: Math.round(wy) }),
      },
      Appearance: RpgSpawn._outfit(opt.color ?? "#9fe0c0"),
    };
    if (opt.hp !== undefined) {
      over.Health = { hp: opt.hp };
      over.Mortal = { reviveHp: opt.hp };
    }
    if (opt.recoverSecs !== undefined)
      over.Mortal = { ...(over.Mortal ?? {}), recoverSecs: opt.recoverSecs };
    const stats = {};
    if (opt.hp !== undefined) stats.maxHp = opt.hp;
    if (opt.speed !== undefined) stats.speed = opt.speed;
    if (Object.keys(stats).length > 0) over.Stats = stats;
    if (opt.label !== undefined) over.Name = { name: opt.label };
    const fol = {};
    if (opt.state !== undefined) fol.state = opt.state;
    if (opt.speed !== undefined) fol.speed = opt.speed;
    if (opt.range !== undefined) fol.range = opt.range;
    if (opt.bonusCapacity !== undefined) fol.bonusCapacity = opt.bonusCapacity;
    if (opt.bonusWeight !== undefined) fol.bonusWeight = opt.bonusWeight;
    if (Object.keys(fol).length > 0) over.Follower = fol;
    return EntityPreset.spawn("follower", world, wx, wy, 0, {
      scale: opt.scale,
      components: over,
    });
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

  // Authored civilian outfit: the WHITE tintable garments colored per entity via the layer
  // color (one sheet, any outfit). Shoes stay a fixed dark neutral so any shirt color reads.
  _outfit(shirtColor) {
    return {
      back: [],
      front: [
        { sprite: spr_wear_shirt, color: Color.parse(shirtColor) },
        { sprite: spr_wear_shoes, color: Color.parse("#55565e") },
      ],
    };
  },
};
