// Move-and-raycast for lobbed projectiles (guns now hitscan; this is retained for grenades etc).
// each tick raycasts the bullet's motion, damages a hit Health, despawns on impact. range bounded
// by Lifetime. bullets carry no Collision, so they're invisible to Raycast/SolidSystem.
globalThis.ProjectileSystem = {
  /** @param {ECS} world */
  update(world) {
    const dt = world.tickDuration;
    for (const id of world.query(Projectile, Position, Velocity)) {
      const proj = world.get(Projectile, id);
      const pos = world.get(Position, id);
      const vel = world.get(Velocity, id);

      const x1 = pos.x + vel.x * dt;
      const y1 = pos.y + vel.y * dt;

      const hit = Raycast.cast(world, pos.x, pos.y, x1, y1, {
        ignore: proj.owner,
      });

      if (hit === null) {
        pos.x = x1;
        pos.y = y1;
        continue;
      }

      pos.x = hit.x;
      pos.y = hit.y;

      const hp = world.get(Health, hit.id);
      // damage a hit Health unless allied (ally blocks like a wall); death reaction is central
      if (
        hp !== undefined &&
        !FactionSystem.allied(world, proj.owner, hit.id)
      ) {
        Combat.applyDamage(world, hit.id, proj.damage, proj.penetration ?? 0);
      }
      world.remove(id); // the bullet is spent on any impact (wall, ally, or hit)
    }
  },
};
