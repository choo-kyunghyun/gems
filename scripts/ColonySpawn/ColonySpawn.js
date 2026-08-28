// Entity construction for the colony levels — spawnEntity is the DESCRIPTOR ADAPTER, the one place a
// spawn descriptor becomes an entity. Archetypes and their descriptor fields are on the JSDoc below.
/**
 * The entity kinds are EntityPreset DEFS (register(), called by content.register) — component data
 * + design scale + a `post` hook for wiring data can't express (CombatAI.attach). spawnEntity does
 * grid→world and per-spawn overrides (field-merged onto the def like a variant). A fresh map's
 * descriptors (ColonyMap._spawnWorld — the file's and the generator's alike), BuildMode, and the
 * Trader all route through it; a variant preset (`extends: "raider"`) uses the same path when its
 * descriptor fields match its base's.
 *
 * Presets (grid coords gx/gy; sprites + box sizes are per-preset, kept in the defs):
 *   raider   hp? loot[]   (hostile human — camp + quest enemy)
 *   rat      hp? loot[]   (wildlife — the overworld ambient mobile-melee creature)
 *   npc      label nameKey questId merchant?
 *   chest    capacity items[]
 *   prop     label kind? furn?  (kind/furn picks the vox MESH — vertex-colored, so a descriptor color/material is ignored; kind → Interaction, else furniture. kind `travel` is a site's departure BEACON — the world map opens on it)
 *   torch    label? color?        (decorative light prop — small solid post; carries a Light and a Heat)
 *   lantern  label?               (standing lamp — steadier, wider light than the torch; vox mesh; a Heat)
 *   radio    label? sound? every? gain?  (spatial-audio test source — re-fires its cue on a timer)
 *   turret   label? color?        (auto-firing defense — immovable player-faction stationary ranged CombatAI)
 *   rock     w? h?                (wilderness boulder — kinematic solid, mesh stretched over its w×h cell cluster)
 *   tree     species? progress? wild? size?  (wilderness pine — trunk collider under an overhanging canopy mesh; with a
 *            contentFlora `species` it GROWS — Growth via _flora, FloraSystem from there)
 *   plant    species progress? wild?         (a crop or shrub — walk-through, grown and harvested by FloraSystem)
 *   reach    half?                (quest zone marker — no entity)
 *   entry    id?                  (arrival-point marker, id default "default" — no entity; ColonyLevel._entries reads it)
 *   follower label? color? speed? range?   (companion; spawns UNHIRED — "wait" + a rehire Interaction, so talking to it recruits)
 * Every descriptor also takes `size?` — the per-spawn SCALAR (Alpha/boss knob) multiplying the def's
 * `scale` across BBox + Visual + Mesh (see EntityPreset.spawn — SpriteMeta density divides the DRAW
 * scale separately) — and, on mesh spawns, `yaw?`, a visual turn in degrees (BBox stays axis-aligned).
 */
globalThis.ColonySpawn = {
  /**
   * Collider footprint for a vox model, derived from its tight voxel content dims (Vox):
   * max(8, content − 2) per axis — BBox ≤ voxel content, erring small for walkability
   * (reproduces the retired hand table; the floor of 8 keeps thin content like the sign's
   * 4px plank robustly solid). 1 vox = 1 world px; big furniture is genuinely multi-cell
   * (a 60px bench = ~2×1 cells at the 32px cell), so the collider must match the art, not
   * the one-size prop preset box. Returns undefined for an unknown model.
   */
  footprint(model) {
    const m = Vox.load(model);
    if (m === undefined) return undefined;
    return {
      w: Math.max(8, m.content[0] - 2),
      h: Math.max(8, m.content[1] - 2),
    };
  },

  // Furniture `furn` → vox model for the prop adapter; an unknown/absent furn falls back to
  // the crate (matching the old behavior). "cot" rides the kind:"bed" branch; the fence is a tile
  // layer, not a prop (BuildMode).
  FURN_MODELS: {
    barrel: "wooden_barrel",
    crate: "wooden_crate",
    table: "wooden_table",
    table_small: "wooden_table_small",
    table_coffee: "wooden_table_coffee",
    dresser: "wooden_dresser_single",
    dresser_double: "wooden_dresser_double",
    stool: "wooden_stool_square",
    stool_round: "wooden_stool_round",
    nightstand: "wooden_night_stand",
  },

  /**
   * Register the colony entity kinds as EntityPreset defs (idempotent; called by content).
   * Register-time evaluation (Color.parse) is safe here — this runs from a
   * scene's create(), never at script load. Defs are deep-copied per spawn (sprite refs pass
   * through by reference — see EntityPreset._clone).
   */
  register() {
    EntityPreset.register([
      {
        id: "raider",
        scale: 1.7,
        components: {
          // 16 design × 1.7 ≈ 27.2 world px — near the doll's visual body (mob bboxes were
          // ~2/3 of the visual, letting sprites bury into walls/each other); < 32px cell
          BBox: { x: -8, y: -8, width: 16, height: 16 },
          // dynamic (non-kinematic) so SolidSystem integrates CombatAI's velocity + collides vs walls
          Collision: { solid: true, kinematic: false },
          Health: { hp: 3 },
          // Stats-driven damage/toughness like every combatant. maxHp mirrors hp; stamina vestigial.
          Stats: { maxHp: 3, maxStamina: 0, attack: 1, defense: 0, speed: 90 },
          Mortal: { kind: "corpse" }, // hp 0 → lootable body, reaped when emptied (ColonyCombat)
          Raider: {}, // species marker (radar color + kill-quest type)
          Faction: { id: "monster" }, // hostile to "player" → CombatAI aggro target
          Name: { name: "Raider" },
          Persona: { sex: "male", age: 30 }, // baseline — the adapter re-picks per spawn (_persona)
          // loot table — no maxWeight (authored loot, never weight-gated)
          Inventory: { slots: [], capacity: 8 },
          // doll bandit: the white humanoid body — color = per-spawn skin (adapter)
          Skeleton: { sprite: spineHuman },
          // AUTHORED outfit (no Equipment, so AppearanceSystem.rebuild leaves it alone)
          Appearance: ColonySpawn._outfit(
            pixShirtRedwine,
            pixShoeDarkBrown,
            pixHatRedBandana,
          ),
        },
        post(entities, id, ctx) {
          CombatAI.attach(entities, id, ctx.opts.grid); // Velocity + Brain + State (mobile melee)
        },
      },
      {
        // Wildlife (OverworldGen scatter): a weaker raider — smaller/less hp/quicker — but the
        // SAME mobile-melee CombatAI + corpse Mortal.
        id: "rat",
        scale: 1.4,
        components: {
          BBox: { x: -6, y: -6, width: 12, height: 12 }, // ×1.4 ≈ 16.8 world px (visual-match bump)
          Collision: { solid: true, kinematic: false },
          Health: { hp: 2 },
          Stats: { maxHp: 2, maxStamina: 0, attack: 1, defense: 0, speed: 120 },
          Mortal: { kind: "corpse" },
          Rat: {}, // species marker (radar color + kill-quest type)
          Faction: { id: "monster" },
          Name: { name: "Rat" },
          Inventory: { slots: [], capacity: 4 },
          Skeleton: { sprite: spineRat }, // the rat rig; its states are ColonyPlayer.RIGS
        },
        post(entities, id, ctx) {
          CombatAI.attach(entities, id, ctx.opts.grid); // mobile melee, acquires target by faction
        },
      },
      {
        id: "npc",
        scale: 1.6,
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // ×1.6 = 25.6 world px (visual-match bump)
          Collision: { solid: true, kinematic: true },
          Name: { name: "" },
          Persona: { sex: "male", age: 30 }, // baseline — the adapter re-picks per spawn (_persona)
          NPC: { name: "", lines: [] }, // NPC presence = "is an NPC" (radar/query)
          // doll civilian: skin tint over the shared civilian outfit; static, so idle just loops
          Skeleton: { sprite: spineHuman },
          Appearance: ColonySpawn._outfit(pixShirtWhite, pixShoeBrownSneakers),
        },
      },
      {
        id: "chest",
        components: {
          BBox: { x: -11, y: -9, width: 22, height: 18 }, // military_crate content 22×18
          Collision: { solid: true, kinematic: true },
          Interaction: { kind: "storage" },
          Name: { name: "Footlocker" },
          Inventory: { slots: [], capacity: 12 },
          Mesh: { model: "military_crate" }, // vox mesh — no Visual, billboard/shadow passes skip it
        },
      },
      {
        // Solid kinematic prop. The adapter resolves the LOOK from the descriptor — a vox Mesh
        // where kind/furn has a model (VOLUME category; RenderMesh draws it, the billboard/shadow
        // passes skip the Visual-less entity), else a sprite (+ color/material tint) — plus the
        // Interaction for a kind. No Visual/Mesh in the def: the adapter always adds one.
        id: "prop",
        components: {
          BBox: { x: -14, y: -14, width: 28, height: 28 }, // 1-cell default; footprint() overrides per mesh model
          Collision: { solid: true, kinematic: true },
          Name: { name: "" },
        },
      },
      {
        // Decorative LIGHT prop: a small solid post carrying a Light (drawn by RenderLighting).
        // EntitySnapshot copies every component, so the Light round-trips a map reload for free.
        id: "torch",
        components: {
          BBox: { x: -3, y: -3, width: 6, height: 6 }, // thin post (content 2×2, padded)
          Collision: { solid: true, kinematic: true },
          Name: { name: "Lamp" },
          Mesh: { model: "torch" }, // vox mesh — no Visual, billboard/shadow passes skip it
          // warm, gently flickering torch light (preset values)
          Light: {
            radius: 150,
            color: Color.parse("#ffd09a"),
            intensity: 0.9,
            flicker: 0.18,
          },
          Heat: { power: 300 }, // warms the room it stands in (RoomSystem)
        },
      },
      {
        // Standing lamp: the lantern mesh with a steadier, wider, whiter light than the torch.
        id: "lantern",
        components: {
          BBox: { x: -5, y: -5, width: 10, height: 10 }, // lantern_floor content 10×10
          Collision: { solid: true, kinematic: true },
          Name: { name: "Lantern" },
          Mesh: { model: "lantern_floor" },
          Light: {
            radius: 190,
            color: Color.parse("#ffedc9"),
            intensity: 0.95,
            flicker: 0.04,
          },
          Heat: { power: 400 },
        },
      },
      {
        // Spatial-audio test source (Audio + AudioListener): SoundEmitterSystem re-fires the
        // cue at its Position — walk around it to hear the falloff window + L/R pan.
        id: "radio",
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // stand content 18×18
          Collision: { solid: true, kinematic: true },
          Name: { name: "Radio" },
          Mesh: { model: "stand" },
          SoundEmitter: { sound: "sndGunFire", every: 1.2 },
        },
      },
      {
        // Auto-firing defense post: an immovable player-faction ACTOR — a stationary ranged
        // CombatAI (mobile:false, ranged:true), no dedicated component. Carries Health + player
        // faction so enemies target/damage it (two-sided combat). Built-only today (BuildMode).
        id: "turret",
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // military_turret content 16×16
          Collision: { solid: true, kinematic: true },
          Health: { hp: 8 },
          // shot damage is Stats.attack
          Stats: { maxHp: 8, maxStamina: 0, attack: 2, defense: 0, speed: 0 },
          Faction: { id: "player" }, // player ally; a hostile target for enemies
          Name: { name: "Turret" },
          Mesh: { model: "military_turret" }, // vox mesh (CombatAI's Visual reads are all guarded)
        },
        post(entities, id, ctx) {
          // stationary ranged brain: aggro == fire range; fires an instant hitscan at the nearest hostile
          CombatAI.attach(entities, id, ctx.opts.grid, {
            mobile: false,
            ranged: true,
            aggro: 220,
            deAggro: 220,
            attackRange: 220,
            cdMax: 30,
            bulletSpeed: 380,
            speed: 0,
          });
        },
      },
      {
        // Wilderness pine (OverworldGen scatter): a solid TRUNK collider under a canopy that
        // visually overhangs it (Mesh is visual-only) — the tree reads big while bodies path
        // around the trunk; a spawn descriptor's `size` scalar varies specimens.
        id: "tree",
        components: {
          BBox: { x: -7, y: -7, width: 14, height: 14 }, // trunk, not the 48×48 canopy
          Collision: { solid: true, kinematic: true },
          Name: { name: "Pine" },
          Mesh: { model: "tree_pine" },
        },
      },
      {
        // A crop or shrub (a contentFlora species with preset "plant"): walk-through — no
        // Collision — with a pick box for the cursor; the model, name and Growth come off the
        // species (_flora), the harvest Interaction from FloraSystem once ripe.
        id: "plant",
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 },
          Name: { name: "" },
        },
      },
      {
        // Wilderness boulder (OverworldGen scatter): an immovable solid the rock mesh is drawn
        // over. One entity per cluster — the adapter stretches Mesh + BBox to the w×h cell rect,
        // so the collider matches the old scatter wall rect exactly (NavGrid/pathing unchanged).
        id: "rock",
        components: {
          BBox: { x: -16, y: -16, width: 32, height: 32 }, // always overridden per-cluster (adapter)
          Collision: { solid: true, kinematic: true },
          Name: { name: "Rock" },
          Mesh: { model: "rock" },
        },
      },
      {
        // Companion (a dynamic solid body). Spawns UNHIRED — a map resident with a "rehire"
        // Interaction (talk to hire into the squad; FollowerSystem.hire adds Squad + drops the
        // Interaction). Mortal-but-recoverable: at 0 hp it goes Down, then revives at the
        // recovery spot (see ColonyCombat.resolveHealth/updateDowned). No AI attach — FollowerSystem
        // drives every Follower entity by query.
        id: "follower",
        scale: 1.5,
        components: {
          Velocity: { x: 0, y: 0, z: 0 },
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // ×1.5 = 24 world px — matches the player
          Collision: { solid: true, kinematic: false },
          Faction: { id: "player" }, // party ally; friendly fire skips it, but enemies aggro it (it has Health)
          Health: { hp: 6 },
          // a companion is a combatant, so it carries defense + attack like every other actor
          Stats: { maxHp: 6, maxStamina: 0, attack: 1, defense: 0, speed: 260 },
          Mortal: { kind: "down", recoverSecs: 6, reviveHp: 6 },
          Name: { name: "Companion" },
          Persona: { sex: "male", age: 30 }, // baseline — spawnFollower re-picks per spawn (_persona)
          Skeleton: { sprite: spineHuman },
          Appearance: ColonySpawn._outfit(pixShirtWhite, pixShoeBrownSneakers),
          Follower: {
            state: "wait", // unhired residents hold still; hire() flips to follow
            speed: 260, // > player speed (220) so it can catch up when it lags
            range: 40,
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
   * Reach-quest zone rect (world coords) for a "reach" spawn — a region, not an entity.
   */
  reachZone(grid, s) {
    const w = grid.gridToWorld(s.gx, s.gy);
    const half = s.half ?? 44;
    return { x1: w.x - half, y1: w.y - half, x2: w.x + half, y2: w.y + half };
  },

  /**
   * Construct ONE spawn descriptor's entity, returning its id (-1 for non-entity presets).
   * The descriptor adapter over the EntityPreset defs: builds the per-spawn component overrides
   * (field-merged onto the def) and passes `grid` through opts for the post hooks (CombatAI).
   * `gx/gy` are grid coords (gridToWorld handles negatives, so an off-grid descriptor works too).
   */
  spawnEntity(entities, grid, s) {
    const w = grid.gridToWorld(s.gx, s.gy);

    if (s.preset === "follower")
      return ColonySpawn.spawnFollower(entities, w.x, w.y, {
        label: s.label,
        color: s.color,
        speed: s.speed,
        range: s.range,
        size: s.size, // per-spawn scalar; spawnFollower folds in the def base
      });
    if (!EntityPreset.has(s.preset)) return -1;

    const over = {};
    if (s.preset === "raider" || s.preset === "rat") {
      if (s.hp !== undefined) {
        over.Health = { hp: s.hp };
        over.Stats = { maxHp: s.hp };
      }
      if (s.loot !== undefined) over.Inventory = { slots: s.loot };
      // deterministic skin over the white doll template; a rat's coat the same way, per slot
      if (s.preset === "raider") {
        over.Skeleton = { color: ColonySpawn._skin(s) };
        over.Persona = ColonySpawn._persona(s, 18, 45); // outlaw fighters — no children, no elders
      } else over.Skeleton = { tints: ColonySpawn._coat(s) };
    } else if (s.preset === "npc") {
      over.Name = { name: s.label };
      over.NPC = { name: s.nameKey, questId: s.questId };
      over.Skeleton = { color: ColonySpawn._skin(s) };
      over.Persona = ColonySpawn._persona(s, 18, 64); // colony civilians — the full working-age span
      // TODO: the descriptor's `color` no longer reaches the outfit — route it through
      // Skeleton.tints on the garment slots (a slot colour composes under the skin `color`).
    } else if (s.preset === "chest") {
      const inv = {};
      if (s.items !== undefined) inv.slots = s.items;
      if (s.capacity !== undefined) inv.capacity = s.capacity;
      if (Object.keys(inv).length > 0) over.Inventory = inv;
    } else if (s.preset === "prop") {
      // Vox MESH per Interaction `kind` (workbench/bed/claim/the survival stations — furn
      // "cot" picks the cot bunk) or furniture `furn` (FURN_MODELS, crate fallback) —
      // vertex-colored, so color/material don't apply.
      let model;
      if (s.kind === "workbench") model = "wooden_workbench";
      else if (s.kind === "bed")
        model = s.furn === "cot" ? "prison_bed" : "wooden_bed";
      else if (s.kind === "claim") model = "wooden_sign";
      else if (s.kind === "door") model = "wooden_door";
      else if (s.kind === "hydrate") model = "wooden_tub";
      else if (s.kind === "feed") model = "wooden_bin";
      else if (s.kind === "buff") model = "wooden_altar";
      else if (s.kind === "travel")
        model = "portal"; // the gate mesh as the site's beacon
      else model = ColonySpawn.FURN_MODELS[s.furn] ?? "wooden_crate";
      over.Mesh = { model };
      // collider matched to the model's voxel footprint (big furniture is multi-cell)
      const fp = ColonySpawn.footprint(model);
      if (fp !== undefined)
        over.BBox = { x: -fp.w / 2, y: -fp.h / 2, width: fp.w, height: fp.h };
      // a door in a N-S wall run stands VERTICAL: swapped footprint + turned slab
      // (`vertical` from BuildMode's auto-orient; the toggle keeps yaw relative to this base)
      if (s.kind === "door" && s.vertical === true) {
        over.Mesh.yaw = 90;
        if (fp !== undefined)
          over.BBox = {
            x: -fp.h / 2,
            y: -fp.w / 2,
            width: fp.h,
            height: fp.w,
          };
      }
      over.Name = { name: s.label };
      if (s.kind !== undefined)
        over.Interaction =
          s.kind === "door"
            ? { kind: "door", open: 0 } // toggle state rides the component (EntitySnapshot-safe)
            : { kind: s.kind };
    } else if (s.preset === "torch" || s.preset === "lantern") {
      if (s.label !== undefined) over.Name = { name: s.label };
    } else if (s.preset === "radio") {
      if (s.label !== undefined) over.Name = { name: s.label };
      const se = {};
      if (s.sound !== undefined) se.sound = s.sound;
      if (s.every !== undefined) se.every = s.every;
      if (s.gain !== undefined) se.gain = s.gain;
      if (Object.keys(se).length > 0) over.SoundEmitter = se;
    } else if (s.preset === "rock") {
      // cluster footprint (w×h cells, from the overworld scatter): center the entity on the
      // rect and stretch Mesh + BBox over it — the collider equals the old scatter wall rect
      const cw = s.w ?? 1;
      const ch = s.h ?? 1;
      w.x += ((cw - 1) * grid.cellWidth) / 2;
      w.y += ((ch - 1) * grid.cellHeight) / 2;
      over.BBox = {
        x: (-cw * grid.cellWidth) / 2,
        y: (-ch * grid.cellHeight) / 2,
        width: cw * grid.cellWidth,
        height: ch * grid.cellHeight,
      };
      over.Mesh = {
        model: "rock",
        xscale: cw,
        yscale: ch,
        zscale: (cw + ch) / 2, // bigger clusters read as taller boulders
      };
    } else if (s.preset === "turret") {
      if (s.label !== undefined) over.Name = { name: s.label };
    }

    // a flora species (contentFlora) on a tree/plant spawn: its model, name and Growth record
    if (s.species !== undefined) ColonySpawn._flora(s, over);

    // visual yaw for any mesh look (`yaw?`, degrees — vox meshes carry all four sides, so any
    // facing is solid). Gated to mesh-bearing spawns: on a sprite entity (fence) a bare
    // Mesh {yaw} would send RenderMesh's box path NaN dims. BBox stays axis-aligned —
    // author the swapped footprint for 90° turns of oblong furniture.
    if (s.yaw !== undefined) {
      const def = EntityPreset.get(s.preset);
      if (
        over.Mesh !== undefined ||
        (def.components !== undefined && def.components[Mesh] !== undefined)
      )
        over.Mesh = { ...(over.Mesh ?? {}), yaw: s.yaw };
    }

    // Settlement membership (any preset): `settlement: <map id>` tags the entity a Resident of that
    // level's settlement (SettlementSystem resolves inhabitants by live query). Explicit — no auto-by-location.
    if (s.settlement !== undefined)
      over.Resident = { settlementId: s.settlement };

    const id = EntityPreset.spawn(entities, s.preset, w.x, w.y, 0, {
      size: s.size,
      components: over,
      grid, // post hooks (CombatAI.attach) read ctx.opts.grid
    });

    // a plant's stage, base size and (if ripe) Interaction, off the spawned components
    if (s.species !== undefined) FloraSystem.attach(entities, id);

    // Merchant NPC: a `merchant` descriptor attaches the trade config + a stock
    // Inventory (its OWN goods); the scene opens TradeUI on E. Stock built via InventorySystem.add
    // so instanced gear gets a uid/mods; weightless (no maxWeight) so a vendor isn't encumbered.
    if (s.preset === "npc" && s.merchant !== undefined) {
      const mc = s.merchant;
      const mInv = { slots: [], capacity: mc.capacity ?? 32 };
      const stock = mc.stock ?? [];
      for (let i = 0; i < stock.length; i++)
        InventorySystem.add(mInv, stock[i].itemId, stock[i].qty);
      entities.add(id, Inventory, mInv);
      entities.add(id, Merchant, {
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

  /**
   * A flora species' per-spawn overrides: the species' vox model and name, and its Growth record
   * (progress as authored, default a seedling; `wild` marks the generator's and the spread's).
   * Stage, base size and the ripe Interaction are FloraSystem.attach's, after the spawn.
   */
  _flora(s, over) {
    const def = contentFlora.get(s.species);
    if (def === undefined)
      throw new Error(`ColonySpawn: unknown flora species "${s.species}"`);
    over.Mesh = { model: def.model };
    over.Name = { name: I18n.text(def.name) };
    over.Growth = {
      species: s.species,
      progress: s.progress ?? 0,
      stage: -1,
      base: 1,
      wild: s.wild === true,
    };
  },

  // Spawn a companion at world coords, via the `follower` preset. Shared by the `follower`
  // descriptor + the scene's programmatic party seed.
  spawnFollower(entities, wx, wy, opt = {}) {
    // per-spawn overrides (field-merged onto the def). Skin hashed from the spawn spot — it
    // washes the WHOLE doll, garments included (Skeleton.tints is the per-slot axis).
    const spot = { gx: Math.round(wx), gy: Math.round(wy) };
    const over = {
      Skeleton: { color: ColonySpawn._skin(spot) },
      Persona: ColonySpawn._persona(spot, 20, 45), // able-bodied party members
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
    return EntityPreset.spawn(entities, "follower", wx, wy, 0, {
      size: opt.size,
      components: over,
    });
  },

  // Skin tones for doll humanoids (Skeleton.color over the white spineHuman body art).
  SKINS: ["#e8b890", "#d19a6b", "#a2714c"],

  /**
   * deterministic skin pick — hashed from the spawn CELL so a regenerated level's humanoid
   * keeps the same face (a seed must rebuild the same level — see LevelGen)
   */
  _skin(s) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const i = Math.abs(gx * 7 + gy * 13) % ColonySpawn.SKINS.length;
    return Color.parse(ColonySpawn.SKINS[i]);
  },

  // Coat colours for rats (Skeleton.tints over the white spineRat body art; white = as authored).
  COATS: ["#ffffff", "#b4b4b4", "#a06a3c", "#585858"],
  // the slots a coat covers: every body part but `ear` (pink art of its own) and `tail` (outline only)
  COAT_SLOTS: ["body", "head", "footFront", "footBack"],

  /** deterministic coat pick, cell-hashed like _skin — the slot -> colour map for Skeleton.tints */
  _coat(s) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const i = Math.abs(gx * 11 + gy * 17) % ColonySpawn.COATS.length;
    const color = Color.parse(ColonySpawn.COATS[i]);
    const tints = {};
    for (let j = 0; j < ColonySpawn.COAT_SLOTS.length; j++)
      tints[ColonySpawn.COAT_SLOTS[j]] = color;
    return tints;
  },

  /**
   * Deterministic persona pick, banded by the caller's role — hashed from the spawn CELL like
   * _skin, so a regenerated level keeps the same colonist. Two distinct hash2 seeds so sex and age
   * are independent of each other and of the skin tone.
   */
  _persona(s, minAge, maxAge) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    return {
      sex: hash2(gx, gy, 7717) < 0.5 ? "male" : "female",
      age: minAge + Math.floor(hash2(gx, gy, 3373) * (maxAge - minAge + 1)),
    };
  },

  /**
   * Authored outfit as a spineHuman slot map — one sprite per slot, in its own colours (a Spine
   * slot has no tint of its own, so an outfit varies by ART, never by colour). `hat` is optional;
   * both shoes take the one sprite, mirrored by their bones.
   */
  _outfit(shirt, shoe, hat) {
    const slots = { shirt: shirt, shoeLeft: shoe, shoeRight: shoe };
    if (hat !== undefined) slots.hat = hat;
    return { slots: slots, dirty: true };
  },
};
