const PLATF_MOVE_SPEED = 200;
const PLATF_JUMP_POWER = 700;

// Player input + entity setup for the platformer genre.
// Usage:
//   const ctrl = PlatformerController.create(world, spawn);   // call once in scene create()
//   PlatformerController.update(world, ctrl);                  // call each physics tick
//   PlatformerController.destroy();                            // call in scene destroy()
//
// ctrl = { id, jumpBuffer }  — hold this on the scene; pass it to update() and camera.

globalThis.PlatformerController = {
  /** @param {{ x: number, y: number }} spawn */
  create(world, spawn) {
    Input.register("moveLeft",  new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("A")));
    Input.register("moveRight", new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("D")));
    Input.register("jump",      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("W")));

    const id = world.create();
    world.add(id, Position,  { x: spawn.x, y: spawn.y, z: 0 });
    world.add(id, Velocity,  { x: 0, y: 0, z: 0 });
    world.add(id, BBox,      { x: -12, y: -24, width: 24, height: 24 });
    world.add(id, Collision, { solid: true, kinematic: false, mask: null, hits: [] });
    world.add(id, Grounded,  { isGrounded: false });
    world.add(id, Name,      { name: "Player" });

    return { id, jumpBuffer: 0 };
  },

  /** @param {{ id: number, jumpBuffer: number }} ctrl */
  update(world, ctrl) {
    if (Input.get("jump").pressed()) ctrl.jumpBuffer = 10;

    const vel = world.get(Velocity, ctrl.id);
    const dx = (Input.get("moveRight").down() ? 1 : 0) - (Input.get("moveLeft").down() ? 1 : 0);
    vel.x = dx * PLATF_MOVE_SPEED;

    if (ctrl.jumpBuffer > 0 && world.get(Grounded, ctrl.id).isGrounded) {
      vel.y = -PLATF_JUMP_POWER;
      ctrl.jumpBuffer = 0;
    } else if (ctrl.jumpBuffer > 0) {
      ctrl.jumpBuffer--;
    }
  },

  destroy() {
    Input.unregister("moveLeft");
    Input.unregister("moveRight");
    Input.unregister("jump");
  },
};
