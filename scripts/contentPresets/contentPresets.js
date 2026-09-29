/**
 * The colony's entity kinds.
 *
 * A def is component data + design scale + two hooks: `adapt` turns the descriptor's own fields
 * into per-spawn overrides, `post` wires what data can't express once the id exists. Descriptors
 * place on grid coords gx/gy; `entry` is a marker, not an entity.
 */
globalThis.contentPresets = {
  registered: false,

  // A prop's mesh model: `furn` names the piece, `kind` a station's default piece.
  FURN_MODELS: {
    barrel: "woodenBarrel",
    crate: "woodenCrate",
    table: "woodenTable",
    table_small: "woodenTableSmall",
    table_coffee: "woodenTableCoffee",
    dresser: "woodenDresserSingle",
    dresser_double: "woodenDresserDouble",
    stool: "woodenStoolSquare",
    stool_round: "woodenStoolRound",
    nightstand: "woodenNightStand",
    cot: "prisonBed",
  },
  KIND_MODELS: {
    workbench: "woodenWorkbench",
    modbench: "woodenWorkbench",
    bed: "woodenBed",
    claim: "woodenSign",
    settlement: "woodenSign", // a claimed survey post stands on as the centre
    door: "woodenDoor",
    hydrate: "woodenTub",
    feed: "woodenBin",
    buff: "woodenAltar",
    travel: "portal",
  },

  /**
   * Register the colony entity kinds (idempotent). Register-time evaluation (Color.parse,
   * Doll.rest) is safe: this runs from a scene's create(), never at script load.
   */
  register() {
    if (contentPresets.registered) return;
    contentPresets.registered = true;
    // the authored base outfits; a spawn grooms its own hair onto one
    const raiderOutfit = Looks.outfit(pixShirtRedwine, pixShoeDarkBrown, pixHatRedBandana);
    const plainOutfit = Looks.outfit(pixShirtWhite, pixShoeBrown);
    EntityPreset.register([
      {
        id: "raider",
        scale: 1.5,
        components: {
          // 16 design × 1.5 = 24 world px — near the doll's visual body, so sprites don't bury
          // into walls or each other; under one cell
          BBox: { x: -8, y: -8, width: 16, height: 16 },
          // dynamic, so its brain's velocity is integrated and collides with walls
          Collision: { solid: true, kinematic: false },
          Health: { hp: 3 },
          // maxHp mirrors hp; stamina is vestigial
          Stats: { maxHp: 3, maxStamina: 0, attack: 1, defense: 0, speed: 90 },
          Mortal: { kind: "corpse" },
          Raider: {}, // species marker
          Faction: { id: "monster" },
          Name: { name: "Raider" },
          Persona: { sex: "male", age: 30 }, // baseline — adapt re-picks per spawn
          // authored loot, never weight-gated
          Inventory: {},
          Sprite: {
            sprite: spineHuman,
            anim: Doll.rest(spineHuman),
          },
          // the authored base layer; no Equipment, so no gear overlay
          Appearance: raiderOutfit,
        },
        adapt(s, over) {
          ColonySpawn.adaptMob(s, over);
          // skin as body-slot tints, so garments keep their authored colours
          over.Sprite = { tints: Looks.skinTints(Looks.skin(s)) };
          over.Appearance = Looks.groom(raiderOutfit, s);
          over.Persona = ColonySpawn.persona(s, 18, 45); // fighters — no children, no elders
        },
        post(entities, id, ctx) {
          CombatAI.attach(entities, id);
        },
      },
      {
        // wildlife: a weaker, quicker raider with the same melee brain and corpse
        id: "rat",
        scale: 1.4,
        components: {
          BBox: { x: -6, y: -6, width: 12, height: 12 }, // ×1.4 ≈ 16.8 world px
          Collision: { solid: true, kinematic: false },
          Health: { hp: 2 },
          Stats: { maxHp: 2, maxStamina: 0, attack: 1, defense: 0, speed: 120 },
          Mortal: { kind: "corpse" },
          Rat: {}, // species marker
          Faction: { id: "monster" },
          Name: { name: "Rat" },
          Inventory: {},
          Sprite: { sprite: spineRat, anim: Doll.rest(spineRat) },
        },
        adapt(s, over) {
          ColonySpawn.adaptMob(s, over);
          over.Sprite = { tints: Looks.coat(s) };
        },
        post(entities, id, ctx) {
          CombatAI.attach(entities, id);
        },
      },
      {
        id: "npc",
        scale: 1.5,
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // ×1.5 = 24 world px; the doll draws 1:1
          Collision: { solid: true, kinematic: true },
          Name: { name: "" },
          Persona: { sex: "male", age: 30 }, // baseline — adapt re-picks per spawn
          NPC: { name: "", lines: [] },
          Sprite: {
            sprite: spineHuman,
            anim: Doll.rest(spineHuman),
          },
          Appearance: plainOutfit,
        },
        adapt(s, over) {
          over.NPC = { name: s.nameKey, questId: s.questId };
          // the E action: a merchant trades, any other NPC talks
          over.Interaction = { kind: s.merchant !== undefined ? "trade" : "talk" };
          over.Sprite = { tints: Looks.skinTints(Looks.skin(s)) };
          over.Appearance = Looks.groom(plainOutfit, s);
          over.Persona = ColonySpawn.persona(s, 18, 64); // the full working-age span
          // TODO: the descriptor's `color` doesn't reach the outfit — route it through
          // Sprite.tints on the garment slots.
        },
        post(entities, id, ctx) {
          const mc = ctx.opts.descriptor.merchant;
          if (mc !== undefined) ColonySpawn.merchant(entities, id, mc);
        },
      },
      {
        id: "chest",
        components: {
          BBox: { x: -11, y: -9, width: 22, height: 18 }, // militaryCrate content 22×18 units
          Collision: { solid: true, kinematic: true },
          Interaction: { kind: "storage" },
          Name: { name: "Footlocker" },
          Inventory: {},
          Mesh: { model: "militaryCrate" },
        },
        adapt(s, over) {
          if (s.items !== undefined) over.Inventory = { slots: s.items };
        },
      },
      {
        // Solid kinematic prop; adapt always adds its Mesh (by `furn`, else `kind`, else the
        // crate) and the Interaction for a kind, carrying a bench's `tags` and `title`.
        id: "prop",
        components: {
          BBox: { x: -14, y: -14, width: 28, height: 28 }, // 1-cell default, overridden per model
          Collision: { solid: true, kinematic: true },
          Name: { name: "" },
        },
        adapt(s, over) {
          const model =
            contentPresets.FURN_MODELS[s.furn] ??
            contentPresets.KIND_MODELS[s.kind] ??
            "woodenCrate";
          over.Mesh = { model };
          // collider matched to the model's content footprint; a door in a N-S wall run stands
          // vertical (the toggle keeps yaw relative to this base)
          const fp = ColonySpawn.footprint(model);
          const vertical = s.kind === "door" && s.vertical === true;
          if (fp !== undefined)
            over.BBox = vertical
              ? { x: -fp.h / 2, y: -fp.w / 2, width: fp.h, height: fp.w }
              : { x: -fp.w / 2, y: -fp.h / 2, width: fp.w, height: fp.h };
          if (vertical) over.Mesh.yaw = 90;
          if (s.kind !== undefined) {
            over.Interaction =
              s.kind === "door"
                ? { kind: "door", open: 0 } // toggle state rides the component, so it saves
                : { kind: s.kind };
            if (s.tags !== undefined) over.Interaction.tags = s.tags.slice();
            if (s.title !== undefined) over.Interaction.title = s.title;
          }
          // TODO: a stream particle marks a travel beacon again once stream particles are
          // authorable
        },
      },
      {
        // a small solid post carrying a light and heat
        id: "torch",
        components: {
          BBox: { x: -3, y: -3, width: 6, height: 6 }, // thin post (content 2×2 units, padded)
          Collision: { solid: true, kinematic: true },
          Name: { name: "Lamp" },
          Mesh: { model: "torch" },
          Light: {
            radius: 150,
            color: Color.parse("#ffd09a"),
            intensity: 0.9,
            flicker: 0.18,
          },
          Heat: { power: 300 },
        },
      },
      {
        // standing lamp: a steadier, wider, whiter light than the torch
        id: "lantern",
        components: {
          BBox: { x: -5, y: -5, width: 10, height: 10 }, // lanternFloor content 10×10 units
          Collision: { solid: true, kinematic: true },
          Name: { name: "Lantern" },
          Mesh: { model: "lanternFloor" },
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
        // spatial-audio test source: re-fires its cue on a timer, to hear falloff and pan
        id: "radio",
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // stand content 18×18 units
          Collision: { solid: true, kinematic: true },
          Name: { name: "Radio" },
          Mesh: { model: "stand" },
          SoundEmitter: { sound: "sndGunFire", every: 1.2 },
        },
        adapt(s, over) {
          const se = {};
          if (s.sound !== undefined) se.sound = s.sound;
          if (s.every !== undefined) se.every = s.every;
          if (s.gain !== undefined) se.gain = s.gain;
          if (Object.keys(se).length > 0) over.SoundEmitter = se;
        },
      },
      {
        // an immovable player-faction gunner: it fires the first gun its bag holds, fed from the
        // same bag, and holds fire without one; its Health and faction make it a target for
        // enemies
        id: "turret",
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // militaryTurret content 16×16 units
          Collision: { solid: true, kinematic: true },
          Health: { hp: 8 },
          // attack is added to each round's power
          Stats: { maxHp: 8, maxStamina: 0, attack: 2, defense: 0, speed: 0 },
          Faction: { id: "player" },
          Name: { name: "Turret" },
          Mesh: { model: "militaryTurret" },
          Inventory: {},
          Equipment: {},
          Interaction: { kind: "turret" },
        },
        post(entities, id, ctx) {
          // aggro range == fire range; cdMax paces only a gun that sets no cadence, and a dry retry
          CombatAI.attach(entities, id, {
            mobile: false,
            ranged: true,
            aggro: 220,
            deAggro: 220,
            attackRange: 220,
            cdMax: 0.5,
          });
        },
      },
      {
        // a crewed mount: its one seat, behind it, fires the first gun its bag holds, fed from
        // the same bag; its Health and faction make it a target for enemies
        id: "gun_mount",
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // militaryTurret content 16×16 units
          Collision: { solid: true, kinematic: true },
          Health: { hp: 12 },
          Stats: { maxHp: 12, maxStamina: 0, attack: 0, defense: 1, speed: 0 },
          Faction: { id: "player" },
          Name: { name: "Gun Mount" },
          Mesh: { model: "militaryTurret" },
          Mount: { seats: [{ x: 0, y: -18, role: "gun" }] },
          Inventory: {},
          Equipment: {},
          Interaction: { kind: "mount" },
        },
      },
      {
        // a driven carrier whose riders sit out of sight; with no Health, it is cover, never a
        // target. Each exit clears the box's side by a player's half-width.
        id: "buggy",
        components: {
          BBox: { x: -28, y: -20, width: 56, height: 40 },
          Collision: { solid: true, pushable: false },
          Velocity: {},
          Name: { name: "Buggy" },
          Mesh: {
            width: 56,
            depth: 40,
            height: 22,
            topColor: Color.parse("#a08662"),
            frontColor: Color.parse("#5a4e44"),
          },
          Mount: {
            seats: [
              { x: -12, y: -8, role: "drive", hidden: true, exit: { x: -42, y: -8 } },
              { x: 12, y: -8, hidden: true, exit: { x: 42, y: -8 } },
              { x: -12, y: 10, hidden: true, exit: { x: -42, y: 14 } },
              { x: 12, y: 10, hidden: true, exit: { x: 42, y: 14 } },
            ],
          },
          Vehicle: { speed: 340, accel: 520 },
          Interaction: { kind: "mount" },
        },
      },
      {
        // A solid trunk under a canopy that visually overhangs it, so the tree reads big while
        // bodies path around the trunk. The mature frame by default; a species makes it grow.
        id: "tree",
        components: {
          BBox: { x: -7, y: -7, width: 14, height: 14 }, // trunk, not the 48-wide canopy
          Collision: { solid: true, kinematic: true },
          Name: { name: "Pine" },
          Sprite: { sprite: pixPine, index: 3, speed: 0 }, // a frame per growth stage
        },
        adapt: ColonySpawn.adaptFlora,
        post: ColonySpawn.postFlora,
      },
      {
        // a crop or shrub: walk-through, with a pick box for the cursor; the rest comes off its
        // species
        id: "plant",
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 },
          Name: { name: "" },
        },
        adapt: ColonySpawn.adaptFlora,
        post: ColonySpawn.postFlora,
      },
      {
        // One immovable boulder per cluster of w×h cells.
        id: "rock",
        components: {
          BBox: { x: -16, y: -16, width: 32, height: 32 }, // always overridden per cluster
          Collision: { solid: true, kinematic: true },
          Name: { name: "Rock" },
          Sprite: { sprite: pixRock, speed: 0 },
        },
        adapt(s, over, ctx) {
          // centered on the cluster's rect; the sheet carries one frame per cluster shape
          // (1×1, 2×1, 1×2, 2×2 — a deeper cluster reads as a taller boulder)
          const cw = s.w ?? 1;
          const ch = s.h ?? 1;
          const grid = ctx.grid;
          ctx.w.x += ((cw - 1) * grid.cellWidth) / 2;
          ctx.w.y += ((ch - 1) * grid.cellHeight) / 2;
          over.BBox = {
            x: (-cw * grid.cellWidth) / 2,
            y: (-ch * grid.cellHeight) / 2,
            width: cw * grid.cellWidth,
            height: ch * grid.cellHeight,
          };
          over.Sprite = { sprite: pixRock, index: cw - 1 + (ch - 1) * 2 };
        },
        post(entities, id, ctx) {
          ColonySpawn.mirror(entities, id, ctx.opts.descriptor);
        },
      },
      {
        // The input-driven player: a new game's only, as a trip transfers it whole.
        id: "player",
        // a 24 world px bbox (16 × 1.5): near the visual body so the sprite can't bury into
        // walls, and under one cell so 1-cell doorways stay passable
        scale: 1.5,
        components: {
          Velocity: {},
          BBox: { x: -8, y: -8, width: 16, height: 16 },
          Collision: {}, // a dynamic solid
          Direction: { x: 0, y: 1, z: 0 },
          Name: { name: "Player" },
          // authored like the name, not hashed like a spawned colonist
          Persona: { sex: "male", age: 34 },
          Faction: { id: "player" },
          Health: { hp: 10 },
          Mortal: { kind: "respawn" },
          // ~3 s from full, ~4.5 s back
          Stamina: { value: 100, exhausted: false, drain: 34, regen: 22, recover: 0.3 },
          Attributes: StatModel.defaults(),
          // seeds only: post's recompute overwrites them from the attributes; speed in world px/s
          Stats: { maxHp: 10, maxStamina: 100, attack: 1, defense: 0, speed: 220 },
          Inventory: { maxWeight: 50 },
          Encumbrance: {},
          Equipment: {},
          Hotbar: {},
          Favorites: {},
          // the body art is a white template, so the skin is a tint over its body slots
          Sprite: {
            sprite: spineHuman,
            anim: Doll.rest(spineHuman),
            tints: Looks.skinTints(Color.parse(Looks.SKINS[0])),
          },
          Appearance: { slots: { hair: pixHairShort } },
          // the lantern, revealing night
          Light: { radius: 180, color: make_colour_rgb(255, 226, 168), intensity: 0.85 },
          // the camera's target marker, resolved live so no stored id dangles across a map transfer
          CameraFocus: {},
        },
        post(entities, id, ctx) {
          // hired companions copy this id; a trip transfers every member with it
          entities.add(id, Squad, { id: uuid() });
          const needs = Need.all();
          for (let i = 0; i < needs.length; i++)
            entities.add(id, needs[i].id, Object.assign({}, needs[i].seed));
          // marks the input-driven entity; flat scalars so its state rides the map transfer
          entities.add(id, Playable, { cursorX: ctx.x, cursorY: ctx.y });
          StatModel.recompute(entities, id);
        },
      },
      {
        // Companion: spawns unhired, a map resident that talking to recruits. At 0 hp it goes
        // down, then revives at the recovery spot. No brain attach: followers are driven by query.
        id: "follower",
        scale: 1.5,
        components: {
          Velocity: { x: 0, y: 0, z: 0 },
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // ×1.5 = 24 world px — matches the player
          Collision: { solid: true, kinematic: false },
          Faction: { id: "player" }, // friendly fire skips it; enemies aggro it
          Health: { hp: 6 },
          Stats: { maxHp: 6, maxStamina: 0, attack: 1, defense: 0, speed: 260 },
          Mortal: { kind: "down", recoverSecs: 6, reviveHp: 6 },
          Name: { name: "Companion" },
          Persona: { sex: "male", age: 30 }, // baseline — adapt re-picks per spawn
          Sprite: {
            sprite: spineHuman,
            anim: Doll.rest(spineHuman),
          },
          Appearance: plainOutfit,
          Follower: {
            state: "wait", // unhired residents hold still
            // TODO: slower than the player's derived walk, so a lagging follower never catches up
            speed: 260,
            range: 40,
            // carry bonus while following (0 = none); a file-authored follower grants none
            bonusWeight: 0,
          },
          Interaction: { kind: "rehire" },
        },
        adapt(s, over) {
          // skin on the body slots alone — garments keep their authored colours
          over.Sprite = { tints: Looks.skinTints(Looks.skin(s)) };
          over.Appearance = Looks.groom(plainOutfit, s);
          over.Persona = ColonySpawn.persona(s, 20, 45); // able-bodied party members
          if (s.hp !== undefined) {
            over.Health = { hp: s.hp };
            over.Mortal = { reviveHp: s.hp };
          }
          if (s.recoverSecs !== undefined)
            over.Mortal = { ...(over.Mortal ?? {}), recoverSecs: s.recoverSecs };
          const stats = {};
          if (s.hp !== undefined) stats.maxHp = s.hp;
          if (s.speed !== undefined) stats.speed = s.speed;
          if (Object.keys(stats).length > 0) over.Stats = stats;
          const fol = {};
          if (s.state !== undefined) fol.state = s.state;
          if (s.speed !== undefined) fol.speed = s.speed;
          if (s.range !== undefined) fol.range = s.range;
          if (s.bonusWeight !== undefined) fol.bonusWeight = s.bonusWeight;
          if (Object.keys(fol).length > 0) over.Follower = fol;
        },
      },
      {
        // a walk-through region; `half` is its half-extent in world px
        id: "reach",
        components: {
          BBox: { x: -44, y: -44, width: 88, height: 88 },
          Reach: { target: "" },
        },
        adapt(s, over) {
          if (s.target !== undefined) over.Reach = { target: s.target };
          if (s.half !== undefined)
            over.BBox = {
              x: -s.half,
              y: -s.half,
              width: s.half * 2,
              height: s.half * 2,
            };
        },
      },
    ]);
  },
};
