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
const PLATF_IFRAMES_RESPAWN = 90; // invincibility ticks after a respawn (1.5 s)

// Player input + entity setup for the platformer movement showcase (no RPG layer —
// just movement, jumping, stomp-able enemies, and spike/void hazards).
// Usage:
//   const ctrl = PlatformerController.create(world, spawn); // once in scene create()
//   PlatformerController.pollInput(ctrl);                   // once per FRAME, before world.update()
//   PlatformerController.update(world, ctrl);               // once per physics TICK
//   PlatformerController.destroy();                         // in scene destroy()
//
// Edge-triggered input (jump press/release) is sampled per frame in pollInput() so it
// can't be dropped on 0-tick frames or double-counted on multi-tick frames; continuous
// input (movement) is read per tick.
//
// ctrl = { id, jumpBuffer, jumpReleased, coyote, facing, iframes }

globalThis.PlatformerController = {
  /** @param {{ x: number, y: number }} spawn */
  create(world, spawn) {
    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A")],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D")],
      jump: [INPUT_SOURCE.KEYBOARD, ord("W")],
      run: [INPUT_SOURCE.KEYBOARD, vk_shift],
      drop: [INPUT_SOURCE.KEYBOARD, ord("S")],
    });

    // Plain platformer player: transform + a dynamic solid body + facing/visual, plus
    // Grounded for jump/coyote. BBox is taller (feet at y+0, head at y-24); faces right.
    const id = world.create();
    world.add(id, Position, { x: spawn.x, y: spawn.y, z: 0 });
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, BBox, { x: -12, y: -24, width: 24, height: 24 });
    world.add(id, Collision, {
      solid: true,
      kinematic: false,
      oneWay: false,
      passThroughTicks: 0,
      mask: null,
      hits: [],
    });
    world.add(id, Direction, { x: 1, y: 0, z: 0 });
    world.add(id, Name, { name: "Player" });
    world.add(id, Grounded, { isGrounded: false });
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
    };
  },

  // Sample edge-triggered jump input once per frame. Must run before world.update(),
  // outside the fixed-tick loop, or presses on 0-tick frames get lost.
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
      Audio.play("snd_jump"); // non-positional (the platformer sets no audio listener)
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

  // Teleport the player back to spawn, clear motion/jump state, and grant brief
  // i-frames so it can't be re-hit on the spawn frame.
  /** @param {{ id: number, jumpBuffer: number, jumpReleased: boolean, coyote: number, facing: number }} ctrl */
  respawn(world, ctrl, spawn) {
    Audio.play("snd_hurt"); // hit by an enemy / spike, or fell in the void — all route through here
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
    Input.unbindAll(["moveLeft", "moveRight", "jump", "run", "drop"]);
  },
};
