// platformer enemy patrol + hit resolution. run update/resolveStomp/resolveTouch AFTER
// SolidSystem so they read final positions. enemies have no Health/loot.
globalThis.EnemySystem = {
  /** reverse on wall (vel.x zeroed by SolidSystem), then drive walk vel. no ledge probing. */
  update(entities) {
    for (const id of entities.query(Enemy, Velocity)) {
      const en = entities.get(id, Enemy);
      const vel = entities.get(id, Velocity);
      if (vel.x === 0) en.dir = -en.dir; // hit a wall on the last move
      vel.x = en.dir * en.speed;
    }
  },

  /**
   * enemies are dynamic-vs-dynamic (overlap, not block); entities.remove is deferred so
   * mid-iteration removal is safe. returns true if any enemy was defeated.
   */
  resolveStomp(entities, playerId) {
    const pvel = entities.get(playerId, Velocity);
    if (pvel.y <= 0) return false; // only when descending
    const p = AABB.of(entities, playerId);
    let stomped = false;
    for (const id of entities.query(Enemy, Position, BBox)) {
      const e = AABB.of(entities, id);
      if (AABB.overlap(p, e) && p.cy < e.cy) {
        entities.remove(id);
        stomped = true;
      }
    }
    return stomped;
  },

  /** pure detection; caller handles respawn + i-frames */
  resolveTouch(entities, playerId, invincible) {
    if (invincible) return false;
    const p = AABB.of(entities, playerId);
    for (const id of entities.query(Enemy, Position, BBox)) {
      const e = AABB.of(entities, id);
      if (AABB.overlap(p, e)) return true;
    }
    return false;
  },
};
