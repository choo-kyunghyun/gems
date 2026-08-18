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

// platformer player input + entity setup. no colony layer.
// edge-triggered input (jump press/release) is sampled once per frame in pollInput() to
// avoid drop on 0-tick frames or double-count on multi-tick frames; continuous input
// (movement) is read per tick.
// ctrl = { id, jumpBuffer, jumpReleased, coyote, facing, iframes }

globalThis.PlatformerController = {
  create(entities, spawn) {
    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A")],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D")],
      jump: [INPUT_SOURCE.KEYBOARD, ord("W")],
      run: [INPUT_SOURCE.KEYBOARD, vk_shift],
      drop: [INPUT_SOURCE.KEYBOARD, ord("S")],
    });

    // dynamic solid body; BBox feet at y+0, head at y-24
    const id = entities.create();
    entities.add(id, Position, { x: spawn.x, y: spawn.y, z: 0 });
    entities.add(id, Velocity, { x: 0, y: 0, z: 0 });
    entities.add(id, BBox, { x: -12, y: -24, width: 24, height: 24 });
    entities.add(id, Collision, {
      solid: true,
      kinematic: false,
      oneWay: false,
      passThroughTicks: 0,
      mask: null,
      hits: [],
    });
    entities.add(id, Direction, { x: 1, y: 0, z: 0 });
    entities.add(id, Name, { name: "Player" });
    entities.add(id, Grounded, { isGrounded: false });
    entities.add(id, Visual, {
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

  // must run before SimClock.advance() — presses on 0-tick frames would otherwise be lost
  pollInput(ctrl) {
    if (Input.get("jump").pressed()) ctrl.jumpBuffer = PLATF_JUMP_BUFFER;
    if (Input.get("jump").released()) ctrl.jumpReleased = true;
  },

  update(entities, ctrl) {
    const dt = SimClock.tickDuration;
    const vel = entities.get(Velocity, ctrl.id);
    // read isGrounded live off the component — caching a boolean local is miscompiled by
    // GMRT (flips mid-function, broke coyote time/jump). caching the object is fine.
    const groundedComp = entities.get(Grounded, ctrl.id);

    if (ctrl.iframes > 0) ctrl.iframes--;

    // accelerate toward target speed (not snap) for weighted, momentum-carrying feel
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
      accel = groundedComp.isGrounded ? PLATF_TURN_ACCEL : PLATF_AIR_ACCEL; // reversing direction → skid
    else accel = groundedComp.isGrounded ? PLATF_GROUND_ACCEL : PLATF_AIR_ACCEL;

    const step = accel * dt;
    if (vel.x < target) vel.x = Math.min(vel.x + step, target);
    else if (vel.x > target) vel.x = Math.max(vel.x - step, target);

    if (dx !== 0) {
      ctrl.facing = dx;
      const dir = entities.get(Direction, ctrl.id);
      dir.x = dx;
      dir.y = 0;
      const vis = entities.get(Visual, ctrl.id);
      if (vis !== undefined) vis.xscale = dx;
    }

    // SolidSystem skips one-way platforms while passThroughTicks counts down
    if (groundedComp.isGrounded && Input.get("drop").down())
      entities.get(Collision, ctrl.id).passThroughTicks = PLATF_DROP_TICKS;

    // coyote time: extend jump window a few ticks after leaving a ledge
    if (groundedComp.isGrounded) ctrl.coyote = PLATF_COYOTE;
    else if (ctrl.coyote > 0) ctrl.coyote--;

    // fire buffered jump as soon as ground (or coyote grace) is available
    if (ctrl.jumpBuffer > 0 && ctrl.coyote > 0) {
      vel.y = -PLATF_JUMP_POWER;
      ctrl.jumpBuffer = 0;
      ctrl.coyote = 0;
      Audio.play({ sound: snd_jump }); // 2D — platformer sets no audio listener
    } else if (ctrl.jumpBuffer > 0) {
      ctrl.jumpBuffer--;
    }

    // variable jump height: cut the climb on early release; consume the flag once to
    // avoid compounding across multiple ticks in the same frame
    if (ctrl.jumpReleased) {
      if (vel.y < 0) vel.y *= PLATF_JUMP_CUT;
      ctrl.jumpReleased = false;
    }
  },

  // teleport to spawn, clear motion/jump state, grant i-frames to avoid instant re-hit
  respawn(entities, ctrl, spawn) {
    Audio.play({ sound: snd_hitsound_armor });
    const pos = entities.get(Position, ctrl.id);
    const vel = entities.get(Velocity, ctrl.id);
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
    entities.get(Collision, ctrl.id).passThroughTicks = 0; // prevent dropping through spawn ledge

    // snap PrevPosition too, or the player streaks across the screen for one frame
    const prev = entities.get(PrevPosition, ctrl.id);
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
