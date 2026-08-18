// Move-and-raycast for lobbed projectiles (guns now hitscan; retained for grenades). Each tick raycasts
// the bullet's motion, damages a hit Health, despawns on impact (no Collision → invisible to Raycast/Solid).
globalThis.ProjectileSystem = {
  update(entities) {
    const dt = SimClock.tickDuration;
    entities.forEach([Projectile, Position, Velocity], (id, proj, pos, vel) => {
      const x1 = pos.x + vel.x * dt;
      const y1 = pos.y + vel.y * dt;

      const hit = Raycast.cast(entities, pos.x, pos.y, x1, y1, {
        ignore: proj.owner,
      });

      if (hit === null) {
        pos.x = x1;
        pos.y = y1;
        return;
      }

      pos.x = hit.x;
      pos.y = hit.y;

      const hp = entities.get(hit.id, Health);
      // damage a hit Health unless allied (ally blocks like a wall); death reaction is central
      if (
        hp !== undefined &&
        !FactionSystem.allied(entities, proj.owner, hit.id)
      ) {
        Combat.applyDamage(
          entities,
          hit.id,
          proj.damage,
          proj.penetration ?? 0,
        );
      }
      entities.remove(id); // the bullet is spent on any impact (wall, ally, or hit)
    });
  },
};
