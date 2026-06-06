const PLATF_STOMP_BOUNCE = 450; // upward px/s given to the player after a stomp (< jump power)

// Goomba-like enemy behaviour for the platformer.
//
//   EnemySystem.update(world)                                // patrol: turn at walls, drive walk velocity
//   const hurt = EnemySystem.resolveStomp(world, playerId);  // arbitrate player↔enemy contact
//
// Enemies are dynamic solid bodies, so SolidSystem moves them and collides them
// with the kinematic platforms (zeroing vel.x when they hit a wall). They are
// NOT resolved against the player (both are dynamic), so the player passes
// through them and resolveStomp decides the outcome instead.
globalThis.EnemySystem = {
  // Patrol. Runs AFTER SolidSystem each tick: if a wall zeroed vel.x on the last
  // move, reverse direction; then drive the walk velocity for the next move.
  // Enemies walk off ledges (no ledge probing) — SMW-accurate.
  update(world) {
    for (const id of world.query(Enemy, Velocity)) {
      const en = world.get(Enemy, id);
      const vel = world.get(Velocity, id);
      if (vel.x === 0) en.dir = -en.dir; // hit a wall on the last move
      vel.x = en.dir * en.speed;
    }
  },

  // Resolves player↔enemy overlaps. A stomp (player falling and centred above the
  // enemy) kills the enemy and bounces the player; any other contact hurts the
  // player. Returns true if the player should respawn. Stomping takes priority,
  // so landing on an enemy never also counts as a hurt.
  resolveStomp(world, playerId) {
    const ppos = world.get(Position, playerId);
    const pbox = world.get(BBox, playerId);
    const pvel = world.get(Velocity, playerId);
    const px1 = ppos.x + pbox.x;
    const py1 = ppos.y + pbox.y;
    const px2 = px1 + pbox.width;
    const py2 = py1 + pbox.height;
    const pcy = (py1 + py2) * 0.5;

    let bounced = false;
    let hurt = false;

    for (const id of world.query(Enemy, Position, BBox)) {
      const epos = world.get(Position, id);
      const ebox = world.get(BBox, id);
      const ex1 = epos.x + ebox.x;
      const ey1 = epos.y + ebox.y;
      const ex2 = ex1 + ebox.width;
      const ey2 = ey1 + ebox.height;

      // AABB overlap test (skip if separated on any axis).
      if (px2 <= ex1 || px1 >= ex2 || py2 <= ey1 || py1 >= ey2) continue;

      const ecy = (ey1 + ey2) * 0.5;
      if (pvel.y > 0 && pcy < ecy) {
        world.remove(id); // stomped from above
        bounced = true;
      } else {
        hurt = true;
      }
    }

    if (bounced) {
      pvel.y = -PLATF_STOMP_BOUNCE;
      return false; // a successful stomp cancels the hurt
    }
    return hurt;
  },
};
