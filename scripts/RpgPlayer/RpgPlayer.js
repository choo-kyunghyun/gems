// Shared player setup for the RPG genre controllers (platformer + top-down). Both built
// the same player entity (Health/Stats/Inventory/Equipment/Encumbrance/Visual + the core
// transform/collision) and fired the same cursor-aimed bullet; that's centralized here.
// Each controller calls spawn(), then adds its genre-only components (Grounded for the
// platformer, Animator for top-down) and builds its own ctrl bag.
globalThis.RpgPlayer = {
  // Create the shared player entity and return its id. `opts` carries the few fields that
  // differ per genre: bbox (collision box), dir (initial facing), speed (Stats.speed).
  spawn(world, spawn, opts) {
    // Shared "bullet" preset for fireBullet (registered here since RpgPlayer owns firing).
    // A kinematic Collision makes GravitySystem skip it so platformer bullets fly straight
    // (a no-op in top-down, which has no gravity); solid:false keeps it from being an
    // obstacle, and NO BBox keeps it off Raycast's target list (it can't self-hit at t=0,
    // and the per-tick segment cast still finds enemies). Lifetime bounds the range.
    EntityPreset.register([
      {
        id: "bullet",
        components: {
          Velocity: { x: 0, y: 0, z: 0 },
          Collision: { solid: false, kinematic: true, mask: null, hits: [] },
          Projectile: { damage: 1, owner: -1 },
          Lifetime: { ticks: 90 },
        },
      },
    ]);

    const id = world.create();
    world.add(id, Position, { x: spawn.x, y: spawn.y, z: 0 });
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, BBox, opts.bbox);
    // oneWay/passThroughTicks are platformer drop-through fields; harmless at false/0 for
    // top-down (never set there), so the Collision block is shared.
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
    world.add(id, Faction, { id: "player" }); // party faction — slimes aggro this by relation
    world.add(id, Health, { hp: 10 });
    world.add(id, Stats, {
      level: 1,
      xp: 0,
      xpNext: 20,
      maxHp: 10,
      attack: 1,
      defense: 0,
      speed: opts.speed,
    });
    world.add(id, Inventory, { slots: [], capacity: 16, maxWeight: 50 });
    world.add(id, Encumbrance, { threshold: 0.5, minScale: 0.4 });
    world.add(id, Equipment, {
      slots: { weapon: "", armor: "", trinket: "", backpack: "" },
    });
    world.add(id, Visual, {
      visible: true,
      sprite: spr_play,
      subimg: 0,
      xscale: 1,
      yscale: 1,
      rot: 0,
      color: make_colour_rgb(90, 160, 255),
      alpha: 1,
      speed: 0,
      time: 0,
    });
    // A soft warm lantern the player carries — the reference Light for RenderLighting (reveals the
    // area around the player at night; clamps to no-op in daylight). Drop this component for a
    // player with no light.
    world.add(id, Light, {
      radius: 180,
      color: make_colour_rgb(255, 226, 168),
      intensity: 0.85,
    });
    return id;
  },

  // Spawn a cursor-aimed bullet from the shooter. The "bullet" EntityPreset is registered
  // per genre (its definition differs — platformer bullets skip gravity), but the spawn +
  // aim math is shared. `opts`: { speed, damage, muzzleY? } — muzzleY offsets the spawn
  // (and aim origin) from the shooter's Position (e.g. chest height). Returns the
  // normalized aim { nx, ny } so the caller updates facing in its own form (scalar facing
  // vs Direction vector).
  fireBullet(world, shooterId, opts) {
    const pos = world.get(Position, shooterId);
    const muzzleY = pos.y + (opts.muzzleY ?? 0);
    const dx = mouse_x - pos.x;
    const dy = mouse_y - muzzleY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const bid = EntityPreset.spawn("bullet", world, pos.x, muzzleY);
    const vel = world.get(Velocity, bid);
    vel.x = (dx / dist) * opts.speed;
    vel.y = (dy / dist) * opts.speed;
    const proj = world.get(Projectile, bid);
    proj.owner = shooterId;
    proj.damage = opts.damage;
    return { nx: dx / dist, ny: dy / dist };
  },
};
