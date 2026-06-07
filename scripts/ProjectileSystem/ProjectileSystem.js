// Move-and-raycast for projectiles. Each tick casts a ray along the bullet's
// movement (pos -> pos + vel*dt); on the nearest hit it snaps the bullet to the
// impact point, applies Projectile.damage to the target's Health (if any, removing
// it at <= 0 hp), then removes the bullet. With no hit the bullet advances. Range
// is bounded by Lifetime (LifetimeSystem). Bullets carry no Collision, so they are
// invisible to Raycast/SolidSystem and pass through each other.
globalThis.ProjectileSystem = {
  update(world) {
    const dt = world.tickDuration;
    for (const id of world.query(Projectile, Position, Velocity)) {
      const proj = world.get(Projectile, id);
      const pos = world.get(Position, id);
      const vel = world.get(Velocity, id);

      const x1 = pos.x + vel.x * dt;
      const y1 = pos.y + vel.y * dt;

      const hit = Raycast.cast(world, pos.x, pos.y, x1, y1, { ignore: proj.owner });

      if (hit === null) {
        pos.x = x1;
        pos.y = y1;
        continue;
      }

      pos.x = hit.x;
      pos.y = hit.y;

      const hp = world.get(Health, hit.id);
      if (hp !== undefined) {
        hp.hp -= proj.damage;
        if (hp.hp <= 0) world.remove(hit.id);
        world.remove(id);
      } else if (proj.bouncy && hit.ny === -1) {
        // Floor hit: bounce upward. Minimum 200 px/s so early hits aren't tiny.
        vel.y = -Math.max(Math.abs(vel.y), 200);
      } else {
        // Wall, ceiling, or non-bouncy projectile: destroy.
        world.remove(id);
      }
    }
  },
};
