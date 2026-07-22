// Player setup for the RPG genre. Builds the player entity and owns the cursor-aimed HITSCAN
// firing (fireBullet — an instant Combat.hitscan shot, reused by CombatAI for turrets).
globalThis.RpgPlayer = {
  // default skin tint for the white spr_human template — "#e8b890" as a GM BGR color int
  // (a literal, not Color.parse: top-level code runs in script load order on GMRT)
  SKIN: 0x90b8e8,

  // create the player entity, return its id. `opts`: bbox, dir, speed, scale? (baked size
  // factor over art-native 1.0 — multiplies the bbox AND the Visual, like a preset's design scale).
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
    // oneWay/passThroughTicks unused in the RPG; falsy defaults keep the Collision shape explicit
    entities.add(id, Collision, {
      solid: true,
      kinematic: false,
      oneWay: false,
      passThroughTicks: 0,
      mask: null,
      hits: [],
    });
    entities.add(id, Direction, opts.dir);
    entities.add(id, Name, { name: "Player" });
    entities.add(id, Faction, { id: "player" }); // squad faction — enemies aggro this by relation
    // squad identity — hired companions copy this id; a portal transfers every member with it
    entities.add(id, Squad, { id: uuid() });
    entities.add(id, Health, { hp: 10 });
    entities.add(id, Mortal, { kind: "respawn" }); // hp 0 → refill to Stats.maxHp + reposition (RpgScene)
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
    for (let i = 0; i < RPG_HOTBAR_SIZE; i++) hotbarSlots.push("");
    entities.add(id, Hotbar, { slots: hotbarSlots, size: RPG_HOTBAR_SIZE });
    entities.add(id, Favorites, { ids: [] });
    // body sprite; the Animator overwrites sprite+subimg each frame, xscale/yscale persist (facing
    // flip + baked size — the flip must preserve |xscale|, see PlayerSystem). spr_human is a
    // WHITE template — color IS the skin tint (layers keep their own color). `scale` is the
    // DESIGN size; the sheet's declared density (SpriteMeta) divides the draw scale only
    // (BBox stays design-scale).
    entities.add(id, Visual, {
      visible: true,
      sprite: spr_human,
      subimg: 0,
      scale: k,
      xscale: SpriteMeta.fit(k, spr_human),
      yscale: SpriteMeta.fit(k, spr_human),
      rot: 0,
      color: RpgPlayer.SKIN,
      alpha: 1,
      speed: 0,
      time: 0,
    });
    // paper-doll: worn-gear overlays drawn around the body (rebuilt from Equipment by
    // AppearanceSystem — the gear seed's equip fills it, a map-travel sheet apply re-derives it)
    entities.add(id, Appearance, { back: [], front: [] });
    // the PlayerSystem brain state: presence marks the input-driven entity (found live by query);
    // flat scalars so fireCd/attackCd + the frame-latched world cursor ride the map transfer
    entities.add(id, Playable, {
      fireCd: 0,
      attackCd: 0,
      attackAnim: "",
      cursorX: spawn.x,
      cursorY: spawn.y,
    });
    // canonical humanoid strip states; PlayerSystem picks idle/walk/attack per tick
    entities.add(id, Animator, {
      graph: RpgPlayer.animGraph(),
      state: "idle",
      frame: 0,
      time: 0,
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

  // Canonical humanoid animation over the unified spr_human strip (the white tintable Rayman-
  // style figure, hand-drawn in Aseprite — source tools/pixel-art-kit/templates/human/, whose
  // frame tags this graph mirrors): 0 = idle, 1-2 = walk, 3-5 = fist punch, 6-10 = kick (the
  // unarmed swing alternates attack/kick — see PlayerSystem). EVERY paper-doll layer sheet
  // (Appearance / Equippable.worn) mirrors this exact strip layout — cell size, frame order,
  // foot anchor — so a layer draws at the body's subimg with zero animation knowledge (they are
  // derived from the same sheet by human_sprites.py). Fresh object per call.
  animGraph() {
    return {
      idle: { sprite: spr_human, start: 0, frames: 1, fps: 1, loop: true },
      walk: { sprite: spr_human, start: 1, frames: 2, fps: 10, loop: true },
      attack: { sprite: spr_human, start: 3, frames: 3, fps: 10, loop: false },
      kick: { sprite: spr_human, start: 6, frames: 5, fps: 13, loop: false },
    };
  },

  // INSTANT hitscan shot along the resolved aim (no bullet entity; visual is a fading tracer).
  // `opts`: { damage, penetration?, pierce?, range, muzzleY?, nx?, ny? } — pierce (default 1) =
  // hostiles passed through; penetration (default 0) lowers target defense; nx/ny is a caller-resolved
  // aim, else the mouse cursor. Returns the normalized aim { nx, ny } for the muzzle flash.
  fireBullet(entities, shooterId, opts) {
    const pos = entities.get(Position, shooterId);
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
      // scene-latched world cursor; see Camera.unproject)
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
    RpgWorldOverlay.pushTracer(pos.x, muzzleY, shot.x, shot.y);
    return { nx, ny };
  },
};
