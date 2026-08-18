// platformer enemy patrol + hit resolution. run update/resolveStomp/resolveTouch AFTER
// SolidSystem so they read final positions. enemies have no Health/loot.
globalThis.EnemySystem = {
  _a: AABB.rect(), // reused pair rects (docs/PERF.md)
  _b: AABB.rect(),

  /** reverse on wall (vel.x zeroed by SolidSystem), then drive walk vel. no ledge probing. */
  update(entities) {
    entities.forEach([Enemy, Velocity], (id, en, vel) => {
      if (vel.x === 0) en.dir = -en.dir; // hit a wall on the last move
      vel.x = en.dir * en.speed;
    });
  },

  /**
   * enemies are dynamic-vs-dynamic (overlap, not block); entities.remove is deferred so
   * mid-iteration removal is safe. returns true if any enemy was defeated.
   */
  resolveStomp(entities, playerId) {
    const pvel = entities.get(playerId, Velocity);
    if (pvel.y <= 0) return false; // only when descending
    const p = AABB.ofInto(entities, playerId, EnemySystem._a);
    const e = EnemySystem._b;
    let stomped = false;
    entities.forEach([Enemy, Position, BBox], (id, _en, pos, box) => {
      AABB.edgesInto(pos, box, e);
      if (AABB.overlap(p, e) && p.cy < e.cy) {
        entities.remove(id);
        stomped = true;
      }
    });
    return stomped;
  },

  /** pure detection; caller handles respawn + i-frames */
  resolveTouch(entities, playerId, invincible) {
    if (invincible) return false;
    const p = AABB.ofInto(entities, playerId, EnemySystem._a);
    const e = EnemySystem._b;
    let touched = false;
    entities.forEach([Enemy, Position, BBox], (id, _en, pos, box) => {
      AABB.edgesInto(pos, box, e);
      if (AABB.overlap(p, e)) touched = true;
    });
    return touched;
  },
};
