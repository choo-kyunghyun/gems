// The colony's ENTITY KINDS — the EntityPreset defs a spawn descriptor names. Split out of
// ColonySpawn so that file is logic-only: the adapter and the hook vocabulary stay there, the
// table of kinds lives here.
/**
 * A def is component data + design scale + the two hooks ColonySpawn's contract names: `adapt`
 * turns the descriptor's own fields into per-spawn overrides, `post` wires what data can't
 * express once the id exists. Both call ColonySpawn's helpers (adaptMob, skin, persona, outfit,
 * merchant, mirror, adaptFlora/postFlora), so a kind states its rule in a line.
 *
 * Presets (grid coords gx/gy; sprites + box sizes are per-preset, kept in the defs):
 *   raider   hp? loot[]   (hostile human — camp + quest enemy)
 *   rat      hp? loot[]   (wildlife — the overworld ambient mobile-melee creature)
 *   npc      nameKey questId merchant?
 *   chest    capacity items[]
 *   prop     kind? furn?  (the MESH by `furn` (FURN_MODELS), else by `kind` (KIND_MODELS), else the
 *            crate — vertex-colored, so a descriptor color/material is ignored; kind → Interaction.
 *            kind `travel` is a site's departure BEACON; the world map opens on it. A `door` takes
 *            `vertical?` — BuildMode's auto-orient — for a N-S wall run)
 *   torch                 (decorative light prop — small solid post; carries a Light and a Heat)
 *   lantern               (standing lamp — steadier, wider light than the torch; vox mesh; a Heat)
 *   radio    sound? every? gain?  (spatial-audio test source — re-fires its cue on a timer)
 *   turret                (auto-firing defense — immovable player-faction stationary ranged CombatAI)
 *   rock     w? h?        (wilderness boulder — kinematic solid over its w×h cell cluster, the sprite frame by that shape)
 *   tree     species? progress? wild?  (wilderness pine — trunk collider under an overhanging canopy sprite; with a
 *            contentFlora `species` it GROWS — Growth via ColonySpawn's flora helpers, FloraSystem from there)
 *   plant    species progress? wild?   (a crop or shrub — walk-through, grown and harvested by FloraSystem)
 *   reach    half?                (quest zone marker — no entity; ColonyMap reads it)
 *   entry    id?                  (arrival-point marker, id default "default" — no entity; ColonyLevel._entries reads it)
 *   follower hp? recoverSecs? speed? range? state? bonusCapacity? bonusWeight?  (companion; spawns
 *            UNHIRED — "wait" + a rehire Interaction, so talking to it recruits)
 * The fields every descriptor takes (label, size, settlement, yaw) are ColonySpawn's.
 */
globalThis.contentPresets = {
  registered: false,

  // A prop's mesh model: `furn` names the piece (the cot is the bed station's bunk), `kind` a
  // station's default piece; the fence is a tile layer, not a prop (BuildMode).
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
    bed: "woodenBed",
    claim: "woodenSign",
    door: "woodenDoor",
    hydrate: "woodenTub",
    feed: "woodenBin",
    buff: "woodenAltar",
    travel: "portal",
  },

  /**
   * Register the colony entity kinds as EntityPreset defs (idempotent; called by content).
   * Register-time evaluation (Color.parse, Doll.rest) is safe here — this runs from a
   * scene's create(), never at script load. Defs are deep-copied per spawn (sprite refs pass
   * through by reference — see EntityPreset._clone).
   */
  register() {
    if (contentPresets.registered) return;
    contentPresets.registered = true;
    EntityPreset.register([
      {
        id: "raider",
        scale: 1.5,
        components: {
          // 16 design × 1.5 = 24 world px — near the doll's visual body (mob bboxes were
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
          Persona: { sex: "male", age: 30 }, // baseline — adapt re-picks per spawn (_persona)
          // loot table — no maxWeight (authored loot, never weight-gated)
          Inventory: { slots: [], capacity: 8 },
          // doll bandit: the white humanoid body — per-spawn skin lands as body-slot tints (adapt)
          Skeleton: {
            sprite: spineHuman,
            anim: Doll.rest(spineHuman),
          },
          // AUTHORED outfit — the doll's base layer (no Equipment, so no gear overlay either)
          Appearance: ColonySpawn.outfit(
            pixShirtRedwine,
            pixShoeDarkBrown,
            pixHatRedBandana,
          ),
        },
        adapt(s, over) {
          ColonySpawn.adaptMob(s, over);
          // deterministic skin over the white doll template — body-slot tints, so garments keep
          // their authored colours
          over.Skeleton = { tints: ColonySpawn.skinTints(ColonySpawn.skin(s)) };
          over.Persona = ColonySpawn.persona(s, 18, 45); // outlaw fighters — no children, no elders
        },
        post(entities, id, ctx) {
          CombatAI.attach(entities, id); // Velocity + Brain + State (mobile melee)
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
          // the rat rig; its states are Doll.RIGS
          Skeleton: { sprite: spineRat, anim: Doll.rest(spineRat) },
        },
        adapt(s, over) {
          ColonySpawn.adaptMob(s, over);
          over.Skeleton = { tints: ColonySpawn.coat(s) }; // a rat's coat rides the same per-slot axis
        },
        post(entities, id, ctx) {
          CombatAI.attach(entities, id); // mobile melee, acquires target by faction
        },
      },
      {
        id: "npc",
        scale: 1.5,
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // ×1.5 = 24 world px — the doll draws 1:1 (scale = the rig density, AssetMeta)
          Collision: { solid: true, kinematic: true },
          Name: { name: "" },
          Persona: { sex: "male", age: 30 }, // baseline — adapt re-picks per spawn (_persona)
          NPC: { name: "", lines: [] }, // NPC presence = "is an NPC" (radar/query)
          // doll civilian: skin tint over the shared civilian outfit; static, so idle just loops
          Skeleton: {
            sprite: spineHuman,
            anim: Doll.rest(spineHuman),
          },
          Appearance: ColonySpawn.outfit(pixShirtWhite, pixShoeBrown),
        },
        adapt(s, over) {
          over.NPC = { name: s.nameKey, questId: s.questId };
          // the E action — a merchant trades, any other NPC talks — so the scene's one pick
          // (Interactable) sees an NPC beside the stations
          over.Interaction = { kind: s.merchant !== undefined ? "trade" : "talk" };
          over.Skeleton = { tints: ColonySpawn.skinTints(ColonySpawn.skin(s)) };
          over.Persona = ColonySpawn.persona(s, 18, 64); // colony civilians — the full working-age span
          // TODO: the descriptor's `color` no longer reaches the outfit — route it through
          // Skeleton.tints on the garment slots (free now that skin sits on the body slots alone).
        },
        post(entities, id, ctx) {
          const mc = ctx.opts.descriptor.merchant;
          if (mc !== undefined) ColonySpawn.merchant(entities, id, mc);
        },
      },
      {
        id: "chest",
        components: {
          BBox: { x: -11, y: -9, width: 22, height: 18 }, // militaryCrate content 22×18
          Collision: { solid: true, kinematic: true },
          Interaction: { kind: "storage" },
          Name: { name: "Footlocker" },
          Inventory: { slots: [], capacity: 12 },
          Mesh: { model: "militaryCrate" }, // vox mesh — no Visual, billboard/shadow passes skip it
        },
        adapt(s, over) {
          const inv = {};
          if (s.items !== undefined) inv.slots = s.items;
          if (s.capacity !== undefined) inv.capacity = s.capacity;
          if (Object.keys(inv).length > 0) over.Inventory = inv;
        },
      },
      {
        // Solid kinematic prop. adapt resolves the LOOK from the descriptor — the Mesh by
        // furn/kind (VOLUME category; RenderMesh draws it, the billboard/shadow passes skip the
        // Visual-less entity) — plus the Interaction for a kind. No Mesh in the def: adapt always
        // adds one.
        id: "prop",
        components: {
          BBox: { x: -14, y: -14, width: 28, height: 28 }, // 1-cell default; footprint() overrides per mesh model
          Collision: { solid: true, kinematic: true },
          Name: { name: "" },
        },
        adapt(s, over) {
          const model =
            contentPresets.FURN_MODELS[s.furn] ??
            contentPresets.KIND_MODELS[s.kind] ??
            "woodenCrate";
          over.Mesh = { model };
          // collider matched to the model's voxel footprint (big furniture is multi-cell); a door
          // in a N-S wall run stands VERTICAL: swapped footprint + turned slab (the toggle keeps
          // yaw relative to this base)
          const fp = ColonySpawn.footprint(model);
          const vertical = s.kind === "door" && s.vertical === true;
          if (fp !== undefined)
            over.BBox = vertical
              ? { x: -fp.h / 2, y: -fp.w / 2, width: fp.h, height: fp.w }
              : { x: -fp.w / 2, y: -fp.h / 2, width: fp.w, height: fp.h };
          if (vertical) over.Mesh.yaw = 90;
          if (s.kind !== undefined)
            over.Interaction =
              s.kind === "door"
                ? { kind: "door", open: 0 } // toggle state rides the component (Row-safe)
                : { kind: s.kind };
          // a site beacon rises psPortal for as long as it stands. The emitter region is authored
          // over a 128 px frame and the beacon is one 32 px cell, so the stream runs at a quarter —
          // a constant, not a Visual read: the beacon is a mesh and carries no sprite scale.
          if (s.kind === "travel")
            over.ParticleEmitter = { asset: "psPortal", scale: 0.25 };
        },
      },
      {
        // Decorative LIGHT prop: a small solid post carrying a Light (drawn by RenderLighting).
        // Row copies every component, so the Light round-trips a map reload for free.
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
          BBox: { x: -5, y: -5, width: 10, height: 10 }, // lanternFloor content 10×10
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
        adapt(s, over) {
          const se = {};
          if (s.sound !== undefined) se.sound = s.sound;
          if (s.every !== undefined) se.every = s.every;
          if (s.gain !== undefined) se.gain = s.gain;
          if (Object.keys(se).length > 0) over.SoundEmitter = se;
        },
      },
      {
        // Auto-firing defense post: an immovable player-faction ACTOR — a stationary ranged
        // CombatAI (mobile:false, ranged:true), no dedicated component. Carries Health + player
        // faction so enemies target/damage it (two-sided combat). Built-only today (BuildMode).
        id: "turret",
        components: {
          BBox: { x: -8, y: -8, width: 16, height: 16 }, // militaryTurret content 16×16
          Collision: { solid: true, kinematic: true },
          Health: { hp: 8 },
          // shot damage is Stats.attack
          Stats: { maxHp: 8, maxStamina: 0, attack: 2, defense: 0, speed: 0 },
          Faction: { id: "player" }, // player ally; a hostile target for enemies
          Name: { name: "Turret" },
          Mesh: { model: "militaryTurret" }, // vox mesh (CombatAI's Visual reads are all guarded)
        },
        post(entities, id, ctx) {
          // stationary ranged brain: aggro == fire range; fires an instant hitscan at the nearest hostile
          CombatAI.attach(entities, id, {
            mobile: false,
            ranged: true,
            aggro: 220,
            deAggro: 220,
            attackRange: 220,
            cdMax: 0.5,
            bulletSpeed: 380,
            speed: 0,
          });
        },
      },
      {
        // Wilderness pine (OverworldGen scatter): a solid TRUNK collider under a canopy that
        // visually overhangs it (the sprite is visual-only) — the tree reads big while bodies
        // path around the trunk; a spawn descriptor's `size` scalar varies specimens. The
        // mature frame by default; a species swaps the sheet and FloraSystem sets the frame.
        id: "tree",
        components: {
          BBox: { x: -7, y: -7, width: 14, height: 14 }, // trunk, not the 48-wide canopy
          Collision: { solid: true, kinematic: true },
          Name: { name: "Pine" },
          Visual: { sprite: pixPine, subimg: 3 },
        },
        adapt: ColonySpawn.adaptFlora,
        post: ColonySpawn.postFlora,
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
        adapt: ColonySpawn.adaptFlora,
        post: ColonySpawn.postFlora,
      },
      {
        // Wilderness boulder (OverworldGen scatter): an immovable solid the rock sprite stands
        // on. One entity per cluster — adapt sizes the BBox to the w×h cell rect (the collider
        // matches the old scatter wall rect exactly, NavGrid/pathing unchanged) and picks the
        // frame drawn for that shape.
        id: "rock",
        components: {
          BBox: { x: -16, y: -16, width: 32, height: 32 }, // always overridden per-cluster (adapt)
          Collision: { solid: true, kinematic: true },
          Name: { name: "Rock" },
          Visual: { sprite: pixRock },
        },
        adapt(s, over, ctx) {
          // cluster footprint (w×h cells, from the overworld scatter): center the entity on the
          // rect and size the BBox to it; the sprite carries one frame per cluster shape (1×1,
          // 2×1, 1×2, 2×2 — a deeper cluster reads as a taller boulder)
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
          over.Visual = { sprite: pixRock, subimg: cw - 1 + (ch - 1) * 2 };
        },
        post(entities, id, ctx) {
          ColonySpawn.mirror(entities, id, ctx.opts.descriptor);
        },
      },
      {
        // Companion (a dynamic solid body). Spawns UNHIRED — a map resident with a "rehire"
        // Interaction (talk to hire into the squad; Companions.hire adds Squad + swaps it for
        // "companion"). Mortal-but-recoverable: at 0 hp it goes Down, then revives at the
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
          Persona: { sex: "male", age: 30 }, // baseline — adapt re-picks per spawn (_persona)
          Skeleton: {
            sprite: spineHuman,
            anim: Doll.rest(spineHuman),
          },
          Appearance: ColonySpawn.outfit(pixShirtWhite, pixShoeBrown),
          Follower: {
            state: "wait", // unhired residents hold still; hire() flips to follow
            speed: 260, // > player speed (220) so it can catch up when it lags
            range: 40,
            // Carry bonus to the player's Inventory while following (0 = none). A file-authored
            // follower names none, so it stays benefit-free; the scene's programmatic seed grants one.
            bonusCapacity: 0,
            bonusWeight: 0,
          },
          Interaction: { kind: "rehire" }, // talk (E) to hire; hire() swaps it for "companion"
        },
        adapt(s, over) {
          // skin on the body slots alone — garments keep their authored colours
          over.Skeleton = { tints: ColonySpawn.skinTints(ColonySpawn.skin(s)) };
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
          if (s.bonusCapacity !== undefined) fol.bonusCapacity = s.bonusCapacity;
          if (s.bonusWeight !== undefined) fol.bonusWeight = s.bonusWeight;
          if (Object.keys(fol).length > 0) over.Follower = fol;
        },
      },
    ]);
  },
};
