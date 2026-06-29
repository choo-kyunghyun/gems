// Player setup for the RPG genre (RpgController). Builds the player entity
// (Health/Stats/Inventory/Equipment/Encumbrance/Visual + the core transform/collision) and
// owns the cursor-aimed HITSCAN firing (fireBullet — an instant Combat.hitscan shot, also reused by
// CombatAI for turrets). The controller calls spawn(), then adds its genre-only Animator and builds
// its own ctrl bag.
globalThis.RpgPlayer = {
  // Create the player entity and return its id. `opts` carries the caller-supplied fields:
  // bbox (collision box), dir (initial facing), speed (Stats.speed).
  spawn(world, spawn, opts) {
    const id = world.create();
    world.add(id, Position, { x: spawn.x, y: spawn.y, z: 0 });
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, BBox, opts.bbox);
    // oneWay/passThroughTicks are the optional one-way-platform fields (unused in the RPG);
    // set to their falsy defaults to keep the Collision shape explicit.
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
    // Primary attributes (the data-driven stat INPUTS); StatModel.recompute (end of spawn) derives
    // the combat fields below from these. Defaults are tuned to reproduce the legacy sheet.
    world.add(id, Attributes, StatModel.defaults());
    world.add(id, Stats, {
      // The derived fields (maxHp/maxStamina/attack/defense/speed) are seeded here but
      // OVERWRITTEN by StatModel.recompute from Attributes below — kept as a no-Attributes
      // fallback + doc. (No level/xp — the RPG is item- + skill-driven, not playtime-driven.)
      maxHp: 10,
      maxStamina: 100,
      attack: 1,
      defense: 0,
      speed: opts.speed,
    });
    world.add(id, Inventory, { slots: [], capacity: 16, maxWeight: 50 });
    world.add(id, Encumbrance, { threshold: 0.5, minScale: 0.4 });
    // Survival needs (Gameplay/Survival) — each a "rising meter" 0..max that its system ticks up;
    // at `critical` it applies the named debuff Status (dot/slow), cleared by drinking/eating/sleeping.
    // OPT-IN, like Stamina/Encumbrance above. rate is per second; tuned to deplete over minutes.
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
    // Quick-use bar + favorited-item set — session-scoped player state (carried across maps in
    // RpgMap.go alongside the sheet). Slots/ids start empty; the player binds them from the
    // inventory (see Hotbar / Favorites + RpgInventoryUI).
    const hotbarSlots = [];
    for (let i = 0; i < RPG_HOTBAR_SIZE; i++) hotbarSlots.push("");
    world.add(id, Hotbar, { slots: hotbarSlots, size: RPG_HOTBAR_SIZE });
    world.add(id, Favorites, { ids: [] });
    // The 16px-native hero sprite (scale 1), untinted. The Animator (RpgController) overwrites
    // sprite+subimg each frame by state; xscale/yscale persist (facing flip below toggles xscale ±1).
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
    // A soft warm lantern the player carries — the reference Light for RenderLighting (reveals the
    // area around the player at night; clamps to no-op in daylight). Drop this component for a
    // player with no light.
    world.add(id, Light, {
      radius: 90,
      color: make_colour_rgb(255, 226, 168),
      intensity: 0.85,
    });
    // Derive the combat Stats from Attributes (+ equipped mods — none at spawn; the lead_pipe is
    // equipped later in sceneRpg.create). Recompute-from-source — the single derivation path.
    StatModel.recompute(world, id);
    return id;
  },

  // Fire an INSTANT hitscan shot from the shooter along the resolved aim (no in-flight bullet entity
  // — the geometry + damage walk is Combat.hitscan; the visual is a fading RpgWorldOverlay tracer).
  // `opts`: { damage, penetration?, pierce?, range, muzzleY?, nx?, ny? }. `range` bounds the shot
  // (px); `pierce` (default 1) is how many hostiles it passes through before a wall/ally stops it (a
  // future sniper sets it > 1). `penetration` (default 0) is the round's armor penetration (lowers
  // target defense at the hit, via Combat.mitigate). muzzleY offsets the origin (and cursor-aim
  // origin) from the shooter's Position (chest height); nx/ny is a caller-resolved aim direction
  // (right-stick/cursor Direction), falling back to the mouse cursor. Returns the normalized aim
  // { nx, ny } so the caller can aim the muzzle flash.
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
    // Fading streak from the muzzle to the impact point (or max range on a miss).
    RpgWorldOverlay.pushTracer(pos.x, muzzleY, shot.x, shot.y);
    return { nx, ny };
  },
};
