const TOPDOWN_MOVE_SPEED = 220;
const TOPDOWN_BULLET_SPEED = 600;
const TOPDOWN_FIRE_CD = 8; // ticks between shots while held
const TOPDOWN_ATTACK_ANIM = 12; // ticks the attack pose stays up after a shot

// Loot rarity tiers for this genre — name is an i18n key, color is UI hex,
// valueMod scales item values. Tune per-template here.
const TOPDOWN_RARITIES = [
  { id: "common", name: "RARITY_COMMON", color: "#b0b0b0", valueMod: 1 },
  { id: "uncommon", name: "RARITY_UNCOMMON", color: "#4caf50", valueMod: 2 },
  { id: "rare", name: "RARITY_RARE", color: "#2196f3", valueMod: 5 },
  { id: "epic", name: "RARITY_EPIC", color: "#9c27b0", valueMod: 12 },
  { id: "legendary", name: "RARITY_LEGENDARY", color: "#ff9800", valueMod: 30 },
];

// Player input + entity setup for the top-down genre.
// Usage:
//   const ctrl = TopDownController.create(world, spawn);  // call once in scene create()
//   TopDownController.update(world, ctrl);                 // call each physics tick
//   TopDownController.destroy();                           // call in scene destroy()
//
// ctrl = { id, fireCd, attackCd } — hold this on the scene; pass it to update().

globalThis.TopDownController = {
  /** @param {{ x: number, y: number }} spawn */
  create(world, spawn) {
    Rarity.register(TOPDOWN_RARITIES);

    EntityPreset.register([
      {
        id: "bullet",
        components: {
          Velocity: { x: 0, y: 0, z: 0 },
          BBox: { x: -2, y: -2, width: 4, height: 4 },
          Projectile: { damage: 1, owner: -1 },
          Lifetime: { ticks: 90 }, // max range
        },
      },
    ]);

    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A")],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D")],
      moveUp: [INPUT_SOURCE.KEYBOARD, ord("W")],
      moveDown: [INPUT_SOURCE.KEYBOARD, ord("S")],
      fire: [INPUT_SOURCE.MOUSE, mb_left],
      inventory: [INPUT_SOURCE.KEYBOARD, ord("I")],
      interact: [INPUT_SOURCE.KEYBOARD, ord("E")],
      build: [INPUT_SOURCE.KEYBOARD, ord("B")],
    });

    const id = world.create();
    world.add(id, Position, { x: spawn.x, y: spawn.y, z: 0 });
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, BBox, { x: -12, y: -12, width: 24, height: 24 });
    world.add(id, Collision, {
      solid: true,
      kinematic: false,
      mask: null,
      hits: [],
    });
    world.add(id, Name, { name: "Player" });
    world.add(id, Direction, { x: 0, y: 1, z: 0 });
    world.add(id, Health, { hp: 10 });
    world.add(id, Stats, {
      level: 1,
      xp: 0,
      xpNext: 20,
      maxHp: 10,
      attack: 1,
      defense: 0,
      speed: TOPDOWN_MOVE_SPEED,
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
    world.add(id, Animator, {
      graph: {
        idle: {
          sprite: spr_play,
          frames: sprite_get_number(spr_play),
          fps: 6,
          loop: true,
        },
        walk: {
          sprite: spr_choo,
          frames: sprite_get_number(spr_choo),
          fps: 10,
          loop: true,
        },
        attack: {
          sprite: spr_choo,
          frames: sprite_get_number(spr_choo),
          fps: 12,
          loop: false,
        },
      },
      state: "idle",
      frame: 0,
      time: 0,
    });

    return { id, fireCd: 0, attackCd: 0 };
  },

  /** @param {{ id: number, fireCd: number, attackCd: number }} ctrl */
  update(world, ctrl) {
    const dx =
      (Input.get("moveRight").down() ? 1 : 0) -
      (Input.get("moveLeft").down() ? 1 : 0);
    const dy =
      (Input.get("moveDown").down() ? 1 : 0) -
      (Input.get("moveUp").down() ? 1 : 0);

    const vel = world.get(Velocity, ctrl.id);
    const dir = world.get(Direction, ctrl.id);
    const stats = world.get(Stats, ctrl.id);
    // Encumbrance scales the final speed (heavier bag → slower); 1 when the entity
    // carries no Encumbrance component. Applied here, not on Stats.speed, so it
    // never disturbs the balanced equipment-mod deltas.
    const speed =
      (stats !== undefined ? stats.speed : TOPDOWN_MOVE_SPEED) *
      EncumbranceSystem.scale(world, ctrl.id);
    const len = Math.sqrt(dx * dx + dy * dy);
    const moving = len > 0;
    if (moving) {
      vel.x = (dx / len) * speed;
      vel.y = (dy / len) * speed;
      dir.x = dx / len;
      dir.y = dy / len;
    } else {
      vel.x = 0;
      vel.y = 0;
    }

    if (ctrl.fireCd > 0) ctrl.fireCd--;
    if (ctrl.attackCd > 0) ctrl.attackCd--;
    // While build mode is active, LMB places tiles (BuildMode) — don't also fire.
    if (Input.get("fire").down() && ctrl.fireCd === 0 && !BuildMode.active) {
      this._fire(world, ctrl);
      // Cadence comes from the equipped weapon (unarmed → default). Read live.
      const wpn = EquipmentSystem.weaponProfile(world, ctrl.id);
      ctrl.fireCd =
        wpn !== null && wpn.fireCd !== undefined ? wpn.fireCd : TOPDOWN_FIRE_CD;
      ctrl.attackCd = TOPDOWN_ATTACK_ANIM;
    }

    // Animation tree: attack > walk > idle. attackCd is read live off ctrl each
    // use (no cached boolean — see GMRT boolean-local clobber note).
    const anim = world.get(Animator, ctrl.id);
    if (anim !== undefined) {
      let state = "idle";
      if (ctrl.attackCd > 0) state = "attack";
      else if (moving) state = "walk";
      AnimationSystem.set(anim, state);
    }

    // Facing: flip horizontally toward the last horizontal move; tint while
    // attacking so the placeholder sprite reads as a distinct state.
    const vis = world.get(Visual, ctrl.id);
    if (vis !== undefined) {
      if (dir.x < -0.01) vis.xscale = -1;
      else if (dir.x > 0.01) vis.xscale = 1;
      vis.color =
        ctrl.attackCd > 0
          ? make_colour_rgb(255, 110, 110)
          : make_colour_rgb(90, 160, 255);
    }
  },

  // Spawns a bullet at the player aimed at the cursor. Bullets carry no Collision,
  // so they pass through each other; ProjectileSystem raycasts their path each tick.
  // Damage and bullet speed come from the equipped weapon (unarmed → defaults);
  // per the chosen model, the weapon alone defines bullet damage (not stats.attack).
  _fire(world, ctrl) {
    const wpn = EquipmentSystem.weaponProfile(world, ctrl.id);
    const speed =
      wpn !== null && wpn.bulletSpeed !== undefined
        ? wpn.bulletSpeed
        : TOPDOWN_BULLET_SPEED;
    const damage = wpn !== null && wpn.damage !== undefined ? wpn.damage : 1;

    const pos = world.get(Position, ctrl.id);
    const dx = mouse_x - pos.x;
    const dy = mouse_y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const bid = EntityPreset.spawn("bullet", world, pos.x, pos.y);
    const vel = world.get(Velocity, bid);
    vel.x = (dx / dist) * speed;
    vel.y = (dy / dist) * speed;
    const proj = world.get(Projectile, bid);
    proj.owner = ctrl.id;
    proj.damage = damage;

    // Face the shot direction horizontally too.
    const dir = world.get(Direction, ctrl.id);
    dir.x = dx / dist;
    dir.y = dy / dist;
  },

  destroy() {
    Input.unbindAll([
      "moveLeft",
      "moveRight",
      "moveUp",
      "moveDown",
      "fire",
      "inventory",
      "interact",
      "build",
    ]);
  },
};
