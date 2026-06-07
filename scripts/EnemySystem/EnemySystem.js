const PLATF_STOMP_BOUNCE = 450; // upward px/s given to the player after a stomp (< jump power)

// Goomba-like enemy behaviour for the platformer.
//
//   EnemySystem.update(world)
//   const { stomped, hurt } = EnemySystem.resolveStomp(world, playerId, invincible);
//
// stomped: player killed ≥1 enemy by landing on it — caller should grant i-frames.
// hurt:    player took a side hit while not invincible — caller should respawn.
// Stomping and being hurt are mutually exclusive (stomp wins).
//
// Enemies carry Health so fireballs (ProjectileSystem) can damage them in phase 6
// without any changes here; resolveStomp decrements hp and removes at ≤ 0.
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

  // Resolves player↔enemy overlaps. invincible=true (i-frames active) suppresses
  // hurt but never suppresses stomping. Returns { stomped, hurt }.
  resolveStomp(world, playerId, invincible) {
    const ppos = world.get(Position, playerId);
    const pbox = world.get(BBox, playerId);
    const pvel = world.get(Velocity, playerId);
    const px1 = ppos.x + pbox.x;
    const py1 = ppos.y + pbox.y;
    const px2 = px1 + pbox.width;
    const py2 = py1 + pbox.height;
    const pcy = (py1 + py2) * 0.5;

    let stomped = false;
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
      const en = world.get(Enemy, id);
      if (pvel.y > 0 && pcy < ecy) {
        if (en.stompable) {
          // Stompable enemy: drain health; remove when depleted.
          const hp = world.get(Health, id);
          if (hp !== undefined) {
            hp.hp--;
            if (hp.hp <= 0) world.remove(id);
          } else {
            world.remove(id);
          }
          stomped = true;
        } else if (!invincible) {
          // Non-stompable: stomping it hurts the player.
          hurt = true;
        }
      } else if (!invincible) {
        hurt = true;
      }
    }

    if (stomped) pvel.y = -PLATF_STOMP_BOUNCE;
    return { stomped, hurt: !stomped && hurt };
  },
};
