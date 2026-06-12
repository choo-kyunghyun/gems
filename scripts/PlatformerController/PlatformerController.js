const PLATF_WALK_SPEED = 200;
const PLATF_RUN_SPEED = 340;
const PLATF_JUMP_POWER = 700;

const PLATF_GROUND_ACCEL = 1500; // ramp toward target speed on the ground
const PLATF_AIR_ACCEL = 900; // weaker mid-air steering
const PLATF_FRICTION = 1800; // decel to a stop when idle on the ground
const PLATF_AIR_DRAG = 250; // gentle horizontal bleed while airborne (keeps momentum)
const PLATF_TURN_ACCEL = 2600; // extra bite when reversing direction (skid)

const PLATF_JUMP_CUT = 0.45; // fraction of rising vy kept when jump is released early
const PLATF_COYOTE = 6; // ticks of jump grace after walking off a ledge
const PLATF_JUMP_BUFFER = 10; // ticks a jump press is remembered before landing
const PLATF_DROP_TICKS = 8; // ticks the player ignores one-way platforms after a drop press
const PLATF_IFRAMES_RESPAWN = 90; // invincibility ticks after respawn / taking a hit (1.5 s)

// Combat defaults (used when unarmed or when the weapon leaves a field unset).
const PLATF_UNARMED_DMG = 1;
const PLATF_UNARMED_REACH = 28; // px the unarmed jab reaches
const PLATF_UNARMED_CD = 22; // ticks between unarmed jabs
const PLATF_MELEE_REACH = 34; // fallback melee reach for a weapon without `reach`
const PLATF_BULLET_SPEED = 600;
const PLATF_BULLET_LIFETIME = 70; // ticks before a bullet expires (range bound)

// Player input + entity setup for the platformer RPG.
// Usage:
//   const ctrl = PlatformerController.create(world, spawn); // once in scene create()
//   PlatformerController.pollInput(ctrl);                   // once per FRAME, before world.update()
//   PlatformerController.update(world, ctrl);               // once per physics TICK
//   PlatformerController.attack(world, ctrl);               // once per physics TICK (after physics)
//   PlatformerController.destroy();                         // in scene destroy()
//
// Edge-triggered input (jump press/release) is sampled per frame in pollInput() so it
// can't be dropped on 0-tick frames or double-counted on multi-tick frames. The attack
// hold-state is also latched per frame; continuous input (movement) is read per tick.
//
// ctrl = { id, jumpBuffer, jumpReleased, coyote, facing, iframes, attackHeld, attackCd }

globalThis.PlatformerController = {
  /** @param {{ x: number, y: number }} spawn */
  create(world, spawn) {
    // Bullet preset for ranged weapons. A kinematic Collision makes GravitySystem
    // skip it so bullets fly straight (not arc). It has NO BBox on purpose: Raycast
    // only tests (Collision, Position, BBox) entities, so without a BBox the bullet
    // can't appear as a target — otherwise it sits on its own ray origin and
    // self-hits at t=0 (ProjectileSystem already moves it via Projectile/Velocity).
    EntityPreset.register([
      {
        id: "bullet",
        components: {
          Velocity: { x: 0, y: 0, z: 0 },
          Collision: { solid: false, kinematic: true, mask: null, hits: [] },
          Projectile: { damage: 1, owner: -1 },
          Lifetime: { ticks: PLATF_BULLET_LIFETIME },
        },
      },
    ]);

    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A")],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D")],
      jump: [INPUT_SOURCE.KEYBOARD, ord("W")],
      run: [INPUT_SOURCE.KEYBOARD, vk_shift],
      drop: [INPUT_SOURCE.KEYBOARD, ord("S")],
      attack: [INPUT_SOURCE.MOUSE, mb_left],
      inventory: [INPUT_SOURCE.KEYBOARD, ord("I")],
      interact: [INPUT_SOURCE.KEYBOARD, ord("E")],
    });

    const id = world.create();
    world.add(id, Position, { x: spawn.x, y: spawn.y, z: 0 });
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, BBox, { x: -12, y: -24, width: 24, height: 24 });
    world.add(id, Collision, {
      solid: true,
      kinematic: false,
      oneWay: false,
      passThroughTicks: 0, // > 0 ⇒ falls through one-way platforms (set by drop)
      mask: null,
      hits: [],
    });
    world.add(id, Grounded, { isGrounded: false });
    world.add(id, Direction, { x: 1, y: 0, z: 0 });
    world.add(id, Name, { name: "Player" });

    // RPG layer (mirrors TopDownController): Health/Stats drive HP + the sheet,
    // Inventory/Equipment/Encumbrance the bag and gear. Visual gives a tinted box.
    world.add(id, Health, { hp: 10 });
    world.add(id, Stats, {
      level: 1,
      xp: 0,
      xpNext: 20,
      maxHp: 10,
      attack: 1,
      defense: 0,
      speed: PLATF_WALK_SPEED,
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

    return {
      id,
      jumpBuffer: 0,
      jumpReleased: false,
      coyote: 0,
      facing: 1,
      iframes: 0,
      attackHeld: false,
      attackCd: 0,
    };
  },

  // Sample edge-triggered jump input + the attack hold-state once per frame. Must
  // run before world.update(), outside the fixed-tick loop, or presses on 0-tick
  // frames get lost (and the realtime mouse query is read just once per frame).
  /** @param {{ jumpBuffer: number, jumpReleased: boolean, attackHeld: boolean }} ctrl */
  pollInput(ctrl) {
    if (Input.get("jump").pressed()) ctrl.jumpBuffer = PLATF_JUMP_BUFFER;
    if (Input.get("jump").released()) ctrl.jumpReleased = true;
    ctrl.attackHeld = Input.get("attack").down();
  },

  /** @param {{ id: number, jumpBuffer: number, jumpReleased: boolean, coyote: number, facing: number }} ctrl */
  update(world, ctrl) {
    const dt = world.tickDuration;
    const vel = world.get(Velocity, ctrl.id);
    // Read isGrounded live off the component each use. Caching it in a local
    // boolean is miscompiled by GMRT — the local gets clobbered mid-function
    // (a const flips true→false within one call), which silently broke coyote
    // time and the jump. Caching the component object (like vel) is fine.
    const groundedComp = world.get(Grounded, ctrl.id);

    if (ctrl.iframes > 0) ctrl.iframes--;

    // Horizontal: accelerate toward a target speed instead of snapping to it,
    // so the player has weight and carries momentum (SMW-style). Movement is
    // continuous input, so reading it per tick is correct. Speed comes from Stats
    // (equipment/encumbrance-modified) so a swift_ring etc. actually changes it.
    const dx =
      (Input.get("moveRight").down() ? 1 : 0) -
      (Input.get("moveLeft").down() ? 1 : 0);
    const stats = world.get(Stats, ctrl.id);
    const base = stats !== undefined ? stats.speed : PLATF_WALK_SPEED;
    const walk = base * EncumbranceSystem.scale(world, ctrl.id);
    const maxSpeed = Input.get("run").down()
      ? walk * (PLATF_RUN_SPEED / PLATF_WALK_SPEED)
      : walk;
    const target = dx * maxSpeed;

    let accel;
    if (dx === 0)
      accel = groundedComp.isGrounded ? PLATF_FRICTION : PLATF_AIR_DRAG;
    else if (dx * vel.x < 0)
      accel = groundedComp.isGrounded ? PLATF_TURN_ACCEL : PLATF_AIR_ACCEL; // reversing → skid
    else accel = groundedComp.isGrounded ? PLATF_GROUND_ACCEL : PLATF_AIR_ACCEL;

    const step = accel * dt;
    if (vel.x < target) vel.x = Math.min(vel.x + step, target);
    else if (vel.x > target) vel.x = Math.max(vel.x - step, target);

    if (dx !== 0) {
      ctrl.facing = dx;
      const dir = world.get(Direction, ctrl.id);
      dir.x = dx;
      dir.y = 0;
      const vis = world.get(Visual, ctrl.id);
      if (vis !== undefined) vis.xscale = dx;
    }

    // Drop through a one-way platform: hold the drop key while standing on one to
    // fall through it. Held input is continuous, so reading it per tick is fine;
    // SolidSystem skips one-way statics while passThroughTicks counts down.
    if (groundedComp.isGrounded && Input.get("drop").down())
      world.get(Collision, ctrl.id).passThroughTicks = PLATF_DROP_TICKS;

    // Coyote time: keep "grounded" alive for a few ticks after leaving a ledge.
    if (groundedComp.isGrounded) ctrl.coyote = PLATF_COYOTE;
    else if (ctrl.coyote > 0) ctrl.coyote--;

    // Jump: the buffer was set per frame in pollInput(); fire once ground (or
    // coyote grace) is available.
    if (ctrl.jumpBuffer > 0 && ctrl.coyote > 0) {
      vel.y = -PLATF_JUMP_POWER;
      ctrl.jumpBuffer = 0;
      ctrl.coyote = 0;
    } else if (ctrl.jumpBuffer > 0) {
      ctrl.jumpBuffer--;
    }

    // Variable height: consume the release exactly once and cut the climb short
    // if still rising. Consuming a flag (not re-reading released()) avoids the
    // cut compounding across multiple ticks in one frame.
    if (ctrl.jumpReleased) {
      if (vel.y < 0) vel.y *= PLATF_JUMP_CUT;
      ctrl.jumpReleased = false;
    }
  },

  // Resolve an attack this tick: the equipped weapon (or unarmed defaults) decides
  // a melee swing vs a cursor-aimed bullet. Gated by attackCd. Call once per tick.
  attack(world, ctrl) {
    if (ctrl.attackCd > 0) ctrl.attackCd--;
    if (!ctrl.attackHeld || ctrl.attackCd > 0) return;

    const wpn = EquipmentSystem.weaponProfile(world, ctrl.id);
    if (wpn !== null && !wpn.melee) {
      // Ranged: fire a bullet toward the cursor.
      this._fire(world, ctrl, wpn);
      ctrl.attackCd = wpn.fireCd !== undefined ? wpn.fireCd : PLATF_UNARMED_CD;
    } else {
      // Melee (armed or unarmed): swing a hitbox in the facing direction.
      const damage = wpn !== null ? wpn.damage : PLATF_UNARMED_DMG;
      const reach =
        wpn !== null
          ? wpn.reach !== undefined
            ? wpn.reach
            : PLATF_MELEE_REACH
          : PLATF_UNARMED_REACH;
      MeleeSystem.swing(world, ctrl.id, ctrl.facing, reach, damage);
      ctrl.attackCd =
        wpn !== null && wpn.fireCd !== undefined
          ? wpn.fireCd
          : PLATF_UNARMED_CD;
    }
  },

  // Spawn a bullet at the player aimed at the cursor (mirrors TopDownController).
  _fire(world, ctrl, wpn) {
    const speed =
      wpn.bulletSpeed !== undefined ? wpn.bulletSpeed : PLATF_BULLET_SPEED;
    const pos = world.get(Position, ctrl.id);
    const dx = mouse_x - pos.x;
    const dy = mouse_y - pos.y - 12; // aim from chest height
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const bid = EntityPreset.spawn("bullet", world, pos.x, pos.y - 12);
    const vel = world.get(Velocity, bid);
    vel.x = (dx / dist) * speed;
    vel.y = (dy / dist) * speed;
    const proj = world.get(Projectile, bid);
    proj.owner = ctrl.id;
    proj.damage = wpn.damage;

    if (dx < -0.01) ctrl.facing = -1;
    else if (dx > 0.01) ctrl.facing = 1;
  },

  // Teleport the player back to spawn and clear its motion/jump state. The caller
  // refills Health (HP-based death is resolved in the scene).
  /** @param {{ id: number, jumpBuffer: number, jumpReleased: boolean, coyote: number, facing: number }} ctrl */
  respawn(world, ctrl, spawn) {
    const pos = world.get(Position, ctrl.id);
    const vel = world.get(Velocity, ctrl.id);
    pos.x = spawn.x;
    pos.y = spawn.y;
    pos.z = 0;
    vel.x = 0;
    vel.y = 0;
    vel.z = 0;
    ctrl.jumpBuffer = 0;
    ctrl.jumpReleased = false;
    ctrl.coyote = 0;
    ctrl.facing = 1;
    ctrl.iframes = PLATF_IFRAMES_RESPAWN;
    world.get(Collision, ctrl.id).passThroughTicks = 0; // don't drop through the spawn ledge

    // Snap the interpolation snapshot too, or the player streaks from its old
    // position to spawn for one rendered frame.
    const prev = world.get(PrevPosition, ctrl.id);
    if (prev !== undefined) {
      prev.x = spawn.x;
      prev.y = spawn.y;
      prev.z = 0;
    }
  },

  destroy() {
    Input.unbindAll([
      "moveLeft",
      "moveRight",
      "jump",
      "run",
      "drop",
      "attack",
      "inventory",
      "interact",
    ]);
  },
};
