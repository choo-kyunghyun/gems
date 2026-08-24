// Player setup for the colony scene. Builds the player entity and owns the cursor-aimed HITSCAN
// firing (fireBullet — an instant Combat.hitscan shot, reused by CombatAI for turrets).
globalThis.ColonyPlayer = {
  // default skin tint for the white spineHuman body art — "#e8b890" as a GM BGR color int
  // (a literal, not Color.parse: top-level code runs in script load order on GMRT). One blend
  // covers the WHOLE skeleton, worn attachments included (docs/GMRT.md) — there is no per-slot
  // colour, so garments are authored in their own colours and take this as a warm wash.
  SKIN: 0x90b8e8,

  // spineHuman is authored at 30 fps (its 1.0 s walk is 30 keyframed frames)
  FPS: 30,

  /**
   * create the player entity, return its id. `opts`: bbox, dir, speed, scale? (baked size
   * factor over art-native 1.0 — multiplies the bbox AND the Visual, like a preset's design scale).
   */
  spawn(entities, spawn, opts) {
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
    // squad identity — hired companions copy this id; a portal transfers every member with it
    entities.add(id, Squad, { id: uuid() });
    entities.add(id, Health, { hp: 10 });
    entities.add(id, Mortal, { kind: "respawn" }); // hp 0 → refill to Stats.maxHp + reposition (ColonyCombat)
    entities.add(id, Stamina, { value: 100, exhausted: false });
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
    // survival needs — each a rising meter 0..max; at `critical` applies the named debuff Status.
    // OPT-IN like Stamina/Encumbrance. rate per second, tuned to deplete over minutes.
    entities.add(id, Thirst, {
      value: 0,
      max: 100,
      rate: 0.8,
      critical: 0.8,
      status: "dehydrated",
    });
    entities.add(id, Hunger, {
      value: 0,
      max: 100,
      rate: 0.5,
      critical: 0.8,
      status: "starving",
    });
    entities.add(id, Drowsiness, {
      value: 0,
      max: 100,
      rate: 0.4,
      critical: 0.85,
      status: "drowsy",
    });
    entities.add(id, Equipment, {
      slots: { weapon: "", armor: "", trinket: "", backpack: "" },
    });
    // hotbar + favorites — session player state, carried across maps; start empty, bound from the inventory
    const hotbarSlots = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) hotbarSlots.push("");
    entities.add(id, Hotbar, { slots: hotbarSlots, size: HOTBAR_SIZE });
    entities.add(id, Favorites, { ids: [] });
    // skeletal body (SkeletonSystem mints the puppet and owns playback); xscale/yscale persist
    // as facing flip + baked size, so a flip must preserve |xscale| — see ColonyPlayer.face.
    // The body art is a WHITE template, so colour IS the skin tint.
    entities.add(id, Skeleton, {
      sprite: spineHuman,
      anim: "idle",
      loop: true,
      fps: ColonyPlayer.FPS,
      frame: 0,
      xscale: SpriteMeta.fit(k, spineHuman),
      yscale: SpriteMeta.fit(k, spineHuman),
      color: ColonyPlayer.SKIN,
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
   * Actor state -> the animation each rig plays it with, keyed by the Skeleton sprite's name.
   * The unarmed swing alternates attack/kick (see PlayerSystem), which lands as the human rig's
   * two punches; the rat has one bite, so a state a rig lacks leaves its set playing. spineHuman
   * also carries dodge / rush / sprint and spineRat eat, which no brain drives yet.
   */
  RIGS: {
    spineHuman: {
      idle: { anim: "idle", loop: true },
      walk: { anim: "walk", loop: true },
      run: { anim: "run", loop: true },
      attack: { anim: "punchRight", loop: false },
      kick: { anim: "punchLeft", loop: false },
    },
    spineRat: {
      idle: { anim: "idle", loop: true },
      walk: { anim: "walk", loop: true },
      run: { anim: "run", loop: true },
      attack: { anim: "attack", loop: false },
    },
  },

  /**
   * Drive an actor's skeleton to a named state — the one place a gameplay state becomes an
   * animation name. No-op for an actor that carries no Skeleton, or whose rig has no such state.
   */
  setState(entities, id, state) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    const rig = ColonyPlayer.RIGS[sprite_get_name(sk.sprite)];
    if (rig === undefined) return;
    const st = rig[state];
    if (st === undefined) return;
    SkeletonSystem.set(entities, id, st.anim, st.loop);
  },

  /**
   * Flip a humanoid's facing toward `vx`, ignoring anything under `dead`. Sign ONLY — |xscale|
   * carries the baked size factor, so a bare ±1 here would silently reset the actor's size.
   */
  face(entities, id, vx, dead) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    const d = dead ?? 1;
    if (vx < -d) sk.xscale = -Math.abs(sk.xscale);
    else if (vx > d) sk.xscale = Math.abs(sk.xscale);
  },

  /**
   * INSTANT hitscan shot along the resolved aim (no bullet entity; visual is a fading tracer).
   * `opts`: { damage, penetration?, pierce?, range, muzzleY?, nx?, ny? } — pierce (default 1) =
   * hostiles passed through; penetration (default 0) lowers target defense; nx/ny is a caller-resolved
   * aim, else the mouse cursor. Returns the normalized aim { nx, ny } for the muzzle flash.
   */
  fireBullet(entities, shooterId, opts) {
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
      // level-latched world cursor; see Camera.unproject)
      const dx = mouse_x - pos.x;
      const dy = mouse_y - muzzleY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = dx / dist;
      ny = dy / dist;
    }
    const range = opts.range ?? 920; // px (defensive default; callers pass a velocity-scaled reach)
    const shot = Combat.hitscan(
      entities,
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
