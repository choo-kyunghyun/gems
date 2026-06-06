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
    Input.register(
      "moveLeft",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("A")),
    );
    Input.register(
      "moveRight",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("D")),
    );
    Input.register(
      "jump",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("W")),
    );
    Input.register(
      "run",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, vk_shift),
    );
    Input.register(
      "drop",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("S")),
    );

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

    return { id, jumpBuffer: 0, jumpReleased: false, coyote: 0, facing: 1 };
  },

  // Sample edge-triggered jump input once per frame. Must run before world.update(),
  // outside the fixed-tick loop, or presses land on 0-tick frames get lost.
  /** @param {{ jumpBuffer: number, jumpReleased: boolean }} ctrl */
  pollInput(ctrl) {
    if (Input.get("jump").pressed()) ctrl.jumpBuffer = PLATF_JUMP_BUFFER;
    if (Input.get("jump").released()) ctrl.jumpReleased = true;
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
    Input.unregister("moveLeft");
    Input.unregister("moveRight");
    Input.unregister("jump");
    Input.unregister("run");
    Input.unregister("drop");
  },
};
