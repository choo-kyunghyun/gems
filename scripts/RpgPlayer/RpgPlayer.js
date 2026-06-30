// Player setup for the RPG genre. Builds the player entity and owns the cursor-aimed HITSCAN
// firing (fireBullet — an instant Combat.hitscan shot, reused by CombatAI for turrets).
globalThis.RpgPlayer = {
  // create the player entity, return its id. `opts`: bbox, dir, speed.
  spawn(world, spawn, opts) {
    const id = world.create();
    world.add(id, Position, { x: spawn.x, y: spawn.y, z: 0 });
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, BBox, opts.bbox);
    // oneWay/passThroughTicks unused in the RPG; falsy defaults keep the Collision shape explicit
    world.add(id, Collision, {
      solid: true,
      kinematic: false,
      oneWay: false,
      passThroughTicks: 0,
      mask: null,
      hits: [],
    });
    world.add(id, Direction, opts.dir);
    world.add(id, Name, { name: "Player" });
    world.add(id, Faction, { id: "player" }); // party faction — enemies aggro this by relation
    world.add(id, Health, { hp: 10 });
    world.add(id, Mortal, { kind: "respawn" }); // hp 0 → refill to Stats.maxHp + reposition (RpgScene)
    world.add(id, Stamina, { value: 100, exhausted: false });
    // primary attributes (stat INPUTS); StatModel.recompute derives the combat fields from these
    world.add(id, Attributes, StatModel.defaults());
    world.add(id, Stats, {
      // derived fields seeded here but OVERWRITTEN by StatModel.recompute below (no-Attributes fallback + doc)
      maxHp: 10,
      maxStamina: 100,
      attack: 1,
      defense: 0,
      speed: opts.speed,
    });
    world.add(id, Inventory, { slots: [], capacity: 16, maxWeight: 50 });
    world.add(id, Encumbrance, { threshold: 0.5, minScale: 0.4 });
    // survival needs — each a rising meter 0..max; at `critical` applies the named debuff Status.
    // OPT-IN like Stamina/Encumbrance. rate per second, tuned to deplete over minutes.
    world.add(id, Thirst, {
      value: 0,
      max: 100,
      rate: 0.8,
      critical: 0.8,
      status: "dehydrated",
    });
    world.add(id, Hunger, {
      value: 0,
      max: 100,
      rate: 0.5,
      critical: 0.8,
      status: "starving",
    });
    world.add(id, Drowsiness, {
      value: 0,
      max: 100,
      rate: 0.4,
      critical: 0.85,
      status: "drowsy",
    });
    world.add(id, Equipment, {
      slots: { weapon: "", armor: "", trinket: "", backpack: "" },
    });
    // hotbar + favorites — session player state, carried across maps; start empty, bound from the inventory
    const hotbarSlots = [];
    for (let i = 0; i < RPG_HOTBAR_SIZE; i++) hotbarSlots.push("");
    world.add(id, Hotbar, { slots: hotbarSlots, size: RPG_HOTBAR_SIZE });
    world.add(id, Favorites, { ids: [] });
    // hero sprite; the Animator overwrites sprite+subimg each frame, xscale/yscale persist (facing flip)
    world.add(id, Visual, {
      visible: true,
      sprite: spr_hero,
      subimg: 0,
      xscale: 1,
      yscale: 1,
      rot: 0,
      color: c_white,
      alpha: 1,
      speed: 0,
      time: 0,
    });
    // the player's lantern — reference Light for RenderLighting (reveals night; no-op in daylight)
    world.add(id, Light, {
      radius: 90,
      color: make_colour_rgb(255, 226, 168),
      intensity: 0.85,
    });
    // derive combat Stats from Attributes (recompute-from-source — the single derivation path)
    StatModel.recompute(world, id);
    return id;
  },

  // INSTANT hitscan shot along the resolved aim (no bullet entity; visual is a fading tracer).
  // `opts`: { damage, penetration?, pierce?, range, muzzleY?, nx?, ny? } — pierce (default 1) =
  // hostiles passed through; penetration (default 0) lowers target defense; nx/ny is a caller-resolved
  // aim, else the mouse cursor. Returns the normalized aim { nx, ny } for the muzzle flash.
  fireBullet(world, shooterId, opts) {
    const pos = world.get(Position, shooterId);
    const muzzleY = pos.y + (opts.muzzleY ?? 0);
    let nx;
    let ny;
    if (opts.nx !== undefined && opts.ny !== undefined) {
      const m = Math.sqrt(opts.nx * opts.nx + opts.ny * opts.ny) || 1;
      nx = opts.nx / m;
      ny = opts.ny / m;
    } else {
      const dx = mouse_x - pos.x;
      const dy = mouse_y - muzzleY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = dx / dist;
      ny = dy / dist;
    }
    const range = opts.range ?? 460; // px (defensive default; callers pass a velocity-scaled reach)
    const shot = Combat.hitscan(
      world,
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
