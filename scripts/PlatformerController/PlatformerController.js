const PLATF_WALK_SPEED = 200;
const PLATF_RUN_SPEED = 340;
const PLATF_JUMP_POWER = 700;

const PLATF_GROUND_ACCEL = 1500; // ramp toward target speed on the ground
const PLATF_AIR_ACCEL = 900; // weaker mid-air steering
const PLATF_FRICTION = 1800; // decel to a stop when idle on the ground
const PLATF_AIR_DRAG = 250; // gentle horizontal bleed while airborne (keeps momentum)
const PLATF_TURN_ACCEL = 2600; // extra bite when reversing direction (skid)

const PLATF_JUMP_CUT = 0.45; // fraction of rising vy kept when jump is released early
const PLATF_FIREBALL_SPEED = 500; // px/s horizontal fireball velocity
const PLATF_FIREBALL_LIFETIME = 90; // ticks before fireball expires (~1.5 s at 60 Hz)

const PLATF_POWER_SMALL = 0; // default — 24 px tall
const PLATF_POWER_BIG = 1; // mushroom — 40 px tall
const PLATF_POWER_FIRE = 2; // fire flower — 40 px tall, can shoot
const PLATF_COYOTE = 6; // ticks of jump grace after walking off a ledge
const PLATF_JUMP_BUFFER = 10; // ticks a jump press is remembered before landing
const PLATF_DROP_TICKS = 8; // ticks the player ignores one-way platforms after a drop press
const PLATF_IFRAMES_RESPAWN = 90; // invincibility ticks after respawning (1.5 s at 60 Hz)

// Player input + entity setup for the platformer genre.
// Usage:
//   const ctrl = PlatformerController.create(world, spawn); // once in scene create()
//   PlatformerController.pollInput(ctrl);                   // once per FRAME, before world.update()
//   PlatformerController.update(world, ctrl);               // once per physics TICK
//   PlatformerController.destroy();                         // in scene destroy()
//
// Edge-triggered input (jump press/release) is sampled per frame in pollInput() so it
// can't be dropped on 0-tick frames or double-counted on multi-tick frames. Continuous
// input (movement) is read per tick in update().
//
// ctrl = { id, jumpBuffer, jumpReleased, coyote, facing }

globalThis.PlatformerController = {
  /** @param {{ x: number, y: number }} spawn */
  create(world, spawn) {
    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A")],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D")],
      jump: [INPUT_SOURCE.KEYBOARD, ord("W")],
      run: [INPUT_SOURCE.KEYBOARD, vk_shift],
      drop: [INPUT_SOURCE.KEYBOARD, ord("S")],
      fire: [INPUT_SOURCE.KEYBOARD, vk_space],
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
    world.add(id, Name, { name: "Player" });

    return {
      id,
      jumpBuffer: 0,
      jumpReleased: false,
      coyote: 0,
      facing: 1,
      iframes: 0,
      power: PLATF_POWER_SMALL,
      fireBuffer: false,
    };
  },

  // Sample edge-triggered jump input once per frame. Must run before world.update(),
  // outside the fixed-tick loop, or presses land on 0-tick frames get lost.
  /** @param {{ jumpBuffer: number, jumpReleased: boolean }} ctrl */
  pollInput(ctrl) {
    if (Input.get("jump").pressed()) ctrl.jumpBuffer = PLATF_JUMP_BUFFER;
    if (Input.get("jump").released()) ctrl.jumpReleased = true;
    if (Input.get("fire").pressed()) ctrl.fireBuffer = true;
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
    // continuous input, so reading it per tick is correct.
    const dx =
      (Input.get("moveRight").down() ? 1 : 0) -
      (Input.get("moveLeft").down() ? 1 : 0);
    const maxSpeed = Input.get("run").down()
      ? PLATF_RUN_SPEED
      : PLATF_WALK_SPEED;
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

    if (dx !== 0) ctrl.facing = dx;

    // Drop through a one-way platform: hold the drop key while standing on one to
    // fall through it. Held input is continuous, so reading it per tick is fine;
    // SolidSystem skips one-way statics while passThroughTicks counts down. No
    // effect on solid ground (passThroughTicks only gates one-way colliders).
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

  // Swap the player's BBox to match the new power state and reset fireBuffer.
  // PLATF_POWER_SMALL → small box; PLATF_POWER_BIG / PLATF_POWER_FIRE → big box.
  setPower(world, ctrl, power) {
    ctrl.power = power;
    ctrl.fireBuffer = false;
    const bbox = world.get(BBox, ctrl.id);
    if (power === PLATF_POWER_SMALL) {
      bbox.y = -24;
      bbox.height = 24;
    } else {
      bbox.y = -40;
      bbox.height = 40;
    }
  },

  // Teleport the player back to spawn and clear its motion/jump state.
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
    ctrl.fireBuffer = false;
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

  // Consume fireBuffer; if player is in Fire state, spawn a fireball in world.
  // Returns true if a fireball was created. Call once per physics tick.
  tryFireball(world, ctrl) {
    if (!ctrl.fireBuffer) return false;
    ctrl.fireBuffer = false;
    if (ctrl.power !== PLATF_POWER_FIRE) return false;
    const pos = world.get(Position, ctrl.id);
    const fb = world.create();
    world.add(fb, Position, {
      x: pos.x + ctrl.facing * 16,
      y: pos.y - 20,
      z: 0,
    });
    world.add(fb, Velocity, {
      x: ctrl.facing * PLATF_FIREBALL_SPEED,
      y: 0,
      z: 0,
    });
    world.add(fb, Projectile, { damage: 1, owner: ctrl.id, bouncy: true });
    world.add(fb, Lifetime, { ticks: PLATF_FIREBALL_LIFETIME });
    world.add(fb, Name, { name: "Fireball" });
    return true;
  },

  // If the player is Big or Fire, downgrade to Small and grant respawn i-frames.
  // Returns true if shrunk (caller should NOT also respawn). Returns false when
  // already Small (caller should respawn instead).
  shrink(world, ctrl) {
    if (ctrl.power === PLATF_POWER_SMALL) return false;
    this.setPower(world, ctrl, PLATF_POWER_SMALL);
    ctrl.iframes = PLATF_IFRAMES_RESPAWN;
    return true;
  },

  // Apply a collected powerup. Mushroom → Big (if currently Small); flower → Fire
  // (if not already Fire). No downgrade — powerups only improve state.
  grantPowerup(world, ctrl, type) {
    if (type === "mushroom" && ctrl.power < PLATF_POWER_BIG) {
      this.setPower(world, ctrl, PLATF_POWER_BIG);
    } else if (type === "flower" && ctrl.power < PLATF_POWER_FIRE) {
      this.setPower(world, ctrl, PLATF_POWER_FIRE);
    }
  },

  destroy() {
    Input.unbindAll(["moveLeft", "moveRight", "jump", "run", "drop", "fire"]);
  },
};
