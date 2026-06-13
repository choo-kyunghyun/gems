// Patrolling enemy behaviour for the platformer movement showcase.
//
//   EnemySystem.update(world)
//   const stomped = EnemySystem.resolveStomp(world, playerId); // jump-kill
//   const hurt    = EnemySystem.resolveTouch(world, playerId, invincible); // side hit
//
// Enemies are plain patrollers (no Health/loot): the player defeats one by landing
// on its head (resolveStomp), and any other contact respawns the player
// (resolveTouch). Run both AFTER SolidSystem so they read final positions.
globalThis.EnemySystem = {
  // Patrol. Runs AFTER SolidSystem each tick: if a wall zeroed vel.x on the last
  // move, reverse direction; then drive the walk velocity for the next move.
  // Enemies walk off ledges (no ledge probing).
  update(world) {
    for (const id of world.query(Enemy, Velocity)) {
      const en = world.get(Enemy, id);
      const vel = world.get(Velocity, id);
      if (vel.x === 0) en.dir = -en.dir; // hit a wall on the last move
      vel.x = en.dir * en.speed;
    }
  },

  // Stomp: while the player is falling, remove every enemy it overlaps from above
  // (player centre higher than the enemy centre). Returns true if any was defeated,
  // so the caller can bounce the player. Enemies are dynamic-vs-dynamic with the
  // player (SolidSystem only resolves vs kinematics), so they overlap rather than
  // block — that overlap is what we test. world.remove is deferred, so removing
  // mid-iteration is safe.
  resolveStomp(world, playerId) {
    const pvel = world.get(Velocity, playerId);
    if (pvel.y <= 0) return false; // only when descending
    const p = AABB.of(world, playerId);
    let stomped = false;
    for (const id of world.query(Enemy, Position, BBox)) {
      const e = AABB.of(world, id);
      if (AABB.overlap(p, e) && p.cy < e.cy) {
        world.remove(id);
        stomped = true;
      }
    }
    return stomped;
  },

  // True if the player overlaps any enemy this tick while not invincible — a side/
  // below hit. Pure detection; the caller respawns the player and grants i-frames.
  resolveTouch(world, playerId, invincible) {
    if (invincible) return false;
    const p = AABB.of(world, playerId);
    for (const id of world.query(Enemy, Position, BBox)) {
      const e = AABB.of(world, id);
      if (AABB.overlap(p, e)) return true;
    }
    return false;
  },
};
