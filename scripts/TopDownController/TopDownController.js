const TOPDOWN_MOVE_SPEED = 220;
const TOPDOWN_BULLET_SPEED = 600;
const TOPDOWN_FIRE_CD = 8; // ticks between shots while held

// Player input + entity setup for the top-down genre.
// Usage:
//   const ctrl = TopDownController.create(world, spawn);  // call once in scene create()
//   TopDownController.update(world, ctrl);                 // call each physics tick
//   TopDownController.destroy();                           // call in scene destroy()
//
// ctrl = { id }  — hold this on the scene; pass it to update() and camera.

globalThis.TopDownController = {
  /** @param {{ x: number, y: number }} spawn */
  create(world, spawn) {
    EntityPreset.register([
      {
        id: "bullet",
        components: {
          Velocity:   { x: 0, y: 0, z: 0 },
          BBox:       { x: -2, y: -2, width: 4, height: 4 },
          Projectile: { damage: 1, owner: -1 },
          Lifetime:   { ticks: 90 }, // max range
        },
      },
    ]);

    Input.register("moveLeft",  new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("A")));
    Input.register("moveRight", new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("D")));
    Input.register("moveUp",    new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("W")));
    Input.register("moveDown",  new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("S")));
    Input.register("fire",      new InputAction().bindButton(INPUT_SOURCE.MOUSE, mb_left));

    const id = world.create();
    world.add(id, Position,  { x: spawn.x, y: spawn.y, z: 0 });
    world.add(id, Velocity,  { x: 0, y: 0, z: 0 });
    world.add(id, BBox,      { x: -12, y: -12, width: 24, height: 24 });
    world.add(id, Collision, { solid: true, kinematic: false, mask: null, hits: [] });
    world.add(id, Name,      { name: "Player" });

    return { id, fireCd: 0 };
  },

  /** @param {{ id: number }} ctrl */
  update(world, ctrl) {
    const dx = (Input.get("moveRight").down() ? 1 : 0) - (Input.get("moveLeft").down() ? 1 : 0);
    const dy = (Input.get("moveDown").down() ? 1 : 0) - (Input.get("moveUp").down() ? 1 : 0);

    const vel = world.get(Velocity, ctrl.id);
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      vel.x = (dx / len) * TOPDOWN_MOVE_SPEED;
      vel.y = (dy / len) * TOPDOWN_MOVE_SPEED;
    } else {
      vel.x = 0;
      vel.y = 0;
    }

    if (ctrl.fireCd > 0) ctrl.fireCd--;
    if (Input.get("fire").down() && ctrl.fireCd === 0) {
      this._fire(world, ctrl);
      ctrl.fireCd = TOPDOWN_FIRE_CD;
    }
  },

  // Spawns a bullet at the player aimed at the cursor. Bullets carry no Collision,
  // so they pass through each other; ProjectileSystem raycasts their path each tick.
  _fire(world, ctrl) {
    const pos = world.get(Position, ctrl.id);
    const dx = mouse_x - pos.x;
    const dy = mouse_y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const bid = EntityPreset.spawn("bullet", world, pos.x, pos.y);
    const vel = world.get(Velocity, bid);
    vel.x = (dx / dist) * TOPDOWN_BULLET_SPEED;
    vel.y = (dy / dist) * TOPDOWN_BULLET_SPEED;
    world.get(Projectile, bid).owner = ctrl.id;
  },

  destroy() {
    Input.unregister("moveLeft");
    Input.unregister("moveRight");
    Input.unregister("moveUp");
    Input.unregister("moveDown");
    Input.unregister("fire");
  },
};
