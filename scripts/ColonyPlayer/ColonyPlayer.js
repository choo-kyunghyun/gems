// Player setup for the colony scene. Builds the player entity and owns the cursor-aimed HITSCAN
// firing (fireBullet — an instant Combat.hitscan shot, reused by CombatAI for turrets) plus the
// cursor→world AIM the shot resolves against (aim). What every doll shares — the rig's states,
// facing, stride — is Doll's.
// Silhouette px up a body the aim cursor means where it is over no body at all — a wall's drawn
// face, open ground. The bodies are drawn standing (RenderBillboard), so the cursor's ground
// point sits behind whatever it visibly covers; reading the plane AIM_H up the silhouette
// cancels that for anything the pick can't name.
const AIM_H = 16;

globalThis.ColonyPlayer = {
  // default skin tint for the white spineHuman body art — "#e8b890" as a GM BGR color int
  // (a literal, not Color.parse: top-level code runs in script load order on GMRT). One blend
  // the player's skin tone, worn as body-slot tints (ColonySpawn.skinTints) — whole-rig `color`
  // would wash the garments with it (the manual's composite of instance and slot blends).
  SKIN: 0x90b8e8,

  // the colony player's tuning — spawn's default opts: 16 design × 1.5 scale = 24 world px
  // bbox, nearer the doll's visual body (a smaller box let the sprite hug walls/mobs deep enough
  // to bury) and under the 32px cell so 1-cell doorways remain passable; speed in world px/s
  TUNING: {
    bbox: { x: -8, y: -8, width: 16, height: 16 },
    dir: { x: 0, y: 1, z: 0 },
    speed: 220,
    scale: 1.5,
  },

  /**
   * resolve THE player entity live by query (never a stored id — a map transfer can't dangle
   * it); -1 when no Playable entity exists. sceneColony latches it per frame as scene.playerId.
   */
  id(entities) {
    return entities.first(Playable);
  },

  /**
   * create the player entity, return its id. `opts` (default TUNING): bbox, dir, speed, scale?
   * (baked size factor over art-native 1.0 — multiplies the bbox AND the Visual, like a preset's
   * design scale). Boot only — a trip arrival transfers the existing player.
   */
  spawn(entities, spawn, opts = ColonyPlayer.TUNING) {
    const k = opts.scale ?? 1;
    const id = entities.create();
    entities.add(id, Position, { x: spawn.x, y: spawn.y, z: 0 });
    entities.add(id, Velocity, { x: 0, y: 0, z: 0 });
    entities.add(id, BBox, {
      x: opts.bbox.x * k,
      y: opts.bbox.y * k,
      width: opts.bbox.width * k,
      height: opts.bbox.height * k,
    });
    entities.add(id, Collision, {
      solid: true,
      kinematic: false,
    });
    entities.add(id, Direction, opts.dir);
    entities.add(id, Name, { name: "Player" });
    // the commander — authored like the name above, not hashed like a spawned colonist
    entities.add(id, Persona, { sex: "male", age: 34 });
    entities.add(id, Faction, { id: "player" }); // squad faction — enemies aggro this by relation
    // squad identity — hired companions copy this id; a trip transfers every member with it
    entities.add(id, Squad, { id: uuid() });
    entities.add(id, Health, { hp: 10 });
    entities.add(id, Mortal, { kind: "respawn" }); // hp 0 → refill to Stats.maxHp + reposition (ColonyCombat)
    // the sprint meter's rates ride the component (Stamina): ~3 s from full, ~4.5 s back
    entities.add(id, Stamina, {
      value: 100,
      exhausted: false,
      drain: 34,
      regen: 22,
      recover: 0.3,
    });
    // primary attributes (stat INPUTS); StatModel.recompute derives the combat fields from these
    entities.add(id, Attributes, StatModel.defaults());
    entities.add(id, Stats, {
      // derived fields seeded here but OVERWRITTEN by StatModel.recompute below (no-Attributes fallback + doc)
      maxHp: 10,
      maxStamina: 100,
      attack: 1,
      defense: 0,
      speed: opts.speed,
    });
    entities.add(id, Inventory, { slots: [], capacity: 16, maxWeight: 50 });
    entities.add(id, Encumbrance, { threshold: 0.5, minScale: 0.4 });
    // the survival needs, each from its def's seed (contentNeeds) — OPT-IN like Stamina/Encumbrance
    const needs = Need.all();
    for (let i = 0; i < needs.length; i++)
      entities.add(id, needs[i].id, Object.assign({}, needs[i].seed));
    entities.add(id, Equipment, {
      slots: { weapon: "", armor: "", trinket: "", backpack: "" },
    });
    // hotbar + favorites — session player state, carried across maps; start empty, bound from the inventory
    const hotbarSlots = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) hotbarSlots.push("");
    entities.add(id, Hotbar, { slots: hotbarSlots, size: HOTBAR_SIZE });
    entities.add(id, Favorites, { ids: [] });
    // skeletal body (SkeletonSystem mints the puppet, which plays it); xscale/yscale persist
    // as facing flip + baked size, so a flip must preserve |xscale| — see Doll.face.
    // The body art is a WHITE template, so the skin is a tint over its body slots.
    entities.add(id, Skeleton, {
      sprite: spineHuman,
      anim: Doll.rest(spineHuman),
      loop: true,
      speed: 1, // authored time
      xscale: AssetMeta.fit(spineHuman, k),
      yscale: AssetMeta.fit(spineHuman, k),
      color: c_white,
      tints: ColonySpawn.skinTints(ColonyPlayer.SKIN),
      alpha: 1,
    });
    // the doll: worn gear attached to the skeleton's equipment slots (rebuilt from Equipment by
    // AppearanceSystem — the gear seed's equip fills it, a map-travel sheet apply re-derives it)
    entities.add(id, Appearance, { slots: {}, dirty: true });
    // the PlayerSystem brain state: presence marks the input-driven entity (found live by query);
    // flat scalars so fireCd/attackCd + the frame-latched world cursor ride the map transfer
    entities.add(id, Playable, {
      fireCd: 0,
      attackCd: 0,
      attackAnim: "",
      cursorX: spawn.x,
      cursorY: spawn.y,
    });
    // the player's lantern — reference Light for RenderLighting (reveals night; no-op in daylight)
    entities.add(id, Light, {
      radius: 180,
      color: make_colour_rgb(255, 226, 168),
      intensity: 0.85,
    });
    // the follow camera's target marker — CameraFollow resolves it by LIVE query, and it
    // rides the whole-entity map transfer, so the camera re-finds the player in every
    // resumed/built store with no stored id to dangle
    entities.add(id, CameraFocus, {});
    // derive combat Stats from Attributes (recompute-from-source — the single derivation path)
    StatModel.recompute(entities, id);
    return id;
  },

  /**
   * THE world point the player is pointing at — what a shot, swing, or throw aims through. Under
   * the pitched camera the cursor covers a body's STANDING silhouette while the sim tests its
   * footprint on the ground, so the two disagree about what was clicked; here the silhouette
   * decides WHICH body and the footprint decides WHERE, which puts the hitscan through the
   * collider the player saw. Over no body it answers the aim plane (AIM_H).
   * Both halves read the cursor off `view` (the level's CameraSystem.view record) rather than
   * taking one, so the pick and the plane cannot be handed cursors that disagree; the two reads
   * are pure math over the frame's latched pointer (Input.poll), so they are one answer.
   */
  aim(entities, shooterId, view) {
    const pitch = view.pitch;
    const cursor = view.cursorWorld(); // the GROUND cursor — silhouette height is measured off it
    // Health is the shootable set: a corpse has none (ColonyCombat._toCorpse detaches it), so a
    // body on the ground never swallows the aim off the live one standing over it
    const target = Silhouette.pick(entities, cursor, pitch, {
      has: Health,
      ignore: shooterId,
    });
    if (target !== -1 && entities.get(target, BBox) !== undefined) {
      const e = AABB.of(entities, target);
      return { x: e.cx, y: e.cy };
    }
    return view.cursorWorld(-AIM_H * RenderBillboard.tall(pitch));
  },

  /**
   * INSTANT hitscan shot along the resolved aim (no bullet entity; visual is a fading tracer).
   * `opts`: { damage, penetration?, pierce?, range, muzzleY?, nx?, ny? } — pierce (default 1) =
   * hostiles passed through; penetration (default 0) lowers target defense; nx/ny is a caller-resolved
   * aim, else the mouse cursor. Returns the normalized aim { nx, ny } for the muzzle flash.
   */
  fireBullet(level, shooterId, opts) {
    const entities = level.entities;
    const pos = entities.get(shooterId, Position);
    const muzzleY = pos.y + (opts.muzzleY ?? 0);
    let nx;
    let ny;
    if (opts.nx !== undefined && opts.ny !== undefined) {
      const m = Math.sqrt(opts.nx * opts.nx + opts.ny * opts.ny) || 1;
      nx = opts.nx / m;
      ny = opts.ny / m;
    } else {
      // flat-camera fallback ONLY — mouse_x/mouse_y are wrong under the pitched matrix camera,
      // so callers there must resolve the aim themselves (PlayerSystem passes nx/ny from the
      // level-latched world cursor; see View.unproject)
      const dx = Input.pointer.roomX - pos.x;
      const dy = Input.pointer.roomY - muzzleY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = dx / dist;
      ny = dy / dist;
    }
    const range = opts.range ?? 920; // px (defensive default; callers pass a velocity-scaled reach)
    const shot = Combat.hitscan(
      level,
      pos.x,
      muzzleY,
      pos.x + nx * range,
      muzzleY + ny * range,
      {
        owner: shooterId,
        damage: opts.damage,
        penetration: opts.penetration ?? 0,
        pierce: opts.pierce ?? 1,
      },
    );
    // fading streak from muzzle to impact (or max range on a miss)
    WorldOverlay.pushTracer(pos.x, muzzleY, shot.x, shot.y);
    return { nx, ny };
  },
};
