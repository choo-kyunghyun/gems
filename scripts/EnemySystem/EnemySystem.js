// platformer enemy patrol + hit resolution. run update/resolveStomp/resolveTouch AFTER
// SolidSystem so they read final positions. enemies have no Health/loot.
globalThis.EnemySystem = {
  // reverse on wall (vel.x zeroed by SolidSystem), then drive walk vel. no ledge probing.
  update(world) {
    for (const id of world.query(Enemy, Velocity)) {
      const en = world.get(Enemy, id);
      const vel = world.get(Velocity, id);
      if (vel.x === 0) en.dir = -en.dir; // hit a wall on the last move
      vel.x = en.dir * en.speed;
    }
  },

  // enemies are dynamic-vs-dynamic (overlap, not block); world.remove is deferred so
  // mid-iteration removal is safe. returns true if any enemy was defeated.
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

  // pure detection; caller handles respawn + i-frames
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
