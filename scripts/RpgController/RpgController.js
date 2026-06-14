const RPG_MOVE_SPEED = 220;
const RPG_BULLET_SPEED = 600;
const RPG_FIRE_CD = 8; // ticks between shots while held
const RPG_ATTACK_ANIM = 12; // ticks the attack pose stays up after a shot
const RPG_MELEE_REACH = 34; // fallback reach for a melee weapon without `reach`

// Player input + entity setup for the top-down genre.
// Usage:
//   const ctrl = RpgController.create(world, spawn);  // call once in scene create()
//   RpgController.update(world, ctrl);                 // call each physics tick
//   RpgController.destroy();                           // call in scene destroy()
//
// ctrl = { id, fireCd, attackCd } — hold this on the scene; pass it to update().

globalThis.RpgController = {
  /** @param {{ x: number, y: number }} spawn */
  create(world, spawn) {
    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A")],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D")],
      moveUp: [INPUT_SOURCE.KEYBOARD, ord("W")],
      moveDown: [INPUT_SOURCE.KEYBOARD, ord("S")],
      fire: [INPUT_SOURCE.MOUSE, mb_left],
      inventory: [INPUT_SOURCE.KEYBOARD, ord("I")],
      interact: [INPUT_SOURCE.KEYBOARD, ord("E")],
      build: [INPUT_SOURCE.KEYBOARD, ord("B")],
      follow: [INPUT_SOURCE.KEYBOARD, ord("F")], // toggle nearest companion wait/follow
    });

    // Shared RPG player entity; then the top-down-only Animator. BBox is centered;
    // faces down; move speed from Stats.
    const id = RpgPlayer.spawn(world, spawn, {
      bbox: { x: -12, y: -12, width: 24, height: 24 },
      dir: { x: 0, y: 1, z: 0 },
      speed: RPG_MOVE_SPEED,
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
      (stats !== undefined ? stats.speed : RPG_MOVE_SPEED) *
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
      // Cadence comes from the equipped weapon (unarmed → default). Read live.
      const wpn = EquipmentSystem.weaponProfile(world, ctrl.id);
      if (wpn !== null && wpn.melee) {
        // Melee weapon: swing a hitbox toward the cursor (aim updates Direction so the
        // swing + sprite face the click). Unarmed stays ranged (the else branch).
        const pos = world.get(Position, ctrl.id);
        const adx = mouse_x - pos.x;
        const ady = mouse_y - pos.y;
        const adist = Math.sqrt(adx * adx + ady * ady) || 1;
        dir.x = adx / adist;
        dir.y = ady / adist;
        const reach = wpn.reach !== undefined ? wpn.reach : RPG_MELEE_REACH;
        MeleeSystem.swing(world, ctrl.id, dir.x, dir.y, reach, wpn.damage);
      } else {
        this._fire(world, ctrl);
      }
      ctrl.fireCd =
        wpn !== null && wpn.fireCd !== undefined ? wpn.fireCd : RPG_FIRE_CD;
      ctrl.attackCd = RPG_ATTACK_ANIM;
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
        : RPG_BULLET_SPEED;
    const damage = wpn !== null && wpn.damage !== undefined ? wpn.damage : 1;

    // Shared spawn + aim (RpgPlayer.fireBullet); muzzleY defaults to 0 (fire from center).
    const aim = RpgPlayer.fireBullet(world, ctrl.id, { speed, damage });

    // Face the shot direction.
    const dir = world.get(Direction, ctrl.id);
    dir.x = aim.nx;
    dir.y = aim.ny;
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
      "follow",
    ]);
  },
};
