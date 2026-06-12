// Patrolling enemy behaviour for the platformer RPG.
//
//   EnemySystem.update(world)
//   const hurt = EnemySystem.resolveTouch(world, playerId, invincible);
//
// hurt: the player is overlapping an enemy while not invincible — the caller
// drains the player's Health and grants i-frames. Enemies are killed by the
// player's weapons (MeleeSystem / ProjectileSystem), not by contact, so this no
// longer touches enemy Health. They carry Health (damaged by weapons) + an
// Inventory loot table the scene spills on death.
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

  // True if the player overlaps any enemy this tick while not invincible (contact
  // damage). Pure detection — the caller applies the damage and i-frames.
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
