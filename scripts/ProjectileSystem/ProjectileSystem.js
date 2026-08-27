// Move-and-raycast for free projectiles (guns are hitscan). Each tick raycasts the motion: a bullet
// damages a hit Health and is spent on any impact (wall, ally, or hit); a lob arcs over bodies and
// stops where it meets a structure (Combat.isStructure) or where its range runs out, and lies there
// for its Fuse. A projectile carries no Collision, so it is invisible to Raycast/Solid.
const LAND_GAP = 1; // px a lob rests off the surface it struck, along the surface normal

globalThis.ProjectileSystem = {
  update(entities) {
    const dt = SimClock.tickDuration;
    entities.forEach([Projectile, Position, Velocity], (id, proj, pos, vel) => {
      if (vel.x === 0 && vel.y === 0) return; // a landed lob
      let sx = vel.x * dt;
      let sy = vel.y * dt;
      // range-limited: the last step is the remainder, so a lob lands ON its target point
      if (proj.range !== undefined) {
        const step = Math.sqrt(sx * sx + sy * sy);
        if (step >= proj.range) {
          const k = step > 0 ? proj.range / step : 0;
          sx *= k;
          sy *= k;
          proj.range = 0;
        } else proj.range -= step;
      }
      const x1 = pos.x + sx;
      const y1 = pos.y + sy;

      const hit =
        proj.lob === true
          ? ProjectileSystem._structure(entities, pos.x, pos.y, x1, y1, proj.owner)
          : Raycast.cast(entities, pos.x, pos.y, x1, y1, { ignore: proj.owner });

      if (hit === null) {
        pos.x = x1;
        pos.y = y1;
        if (proj.range === 0) {
          // flight over: a lob lands here, a bullet is dropped
          if (proj.lob === true) {
            vel.x = 0;
            vel.y = 0;
          } else entities.remove(id);
        }
        return;
      }

      if (proj.lob === true) {
        // land a hair off the struck surface, so the blast's line-of-sight casts (Combat.explode)
        // don't start inside the collider the charge rests against
        pos.x = hit.x + hit.nx * LAND_GAP;
        pos.y = hit.y + hit.ny * LAND_GAP;
        vel.x = 0;
        vel.y = 0;
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

  /**
   * a lob's impact: the nearest structure (Combat.isStructure) on the step, or null — bodies are
   * flown over. castAll allocates per step; only a lob in flight pays it.
   */
  _structure(entities, x0, y0, x1, y1, owner) {
    const all = Raycast.castAll(entities, x0, y0, x1, y1, { ignore: owner });
    for (let i = 0; i < all.length; i++) {
      if (Combat.isStructure(entities, all[i].id)) return all[i];
    }
    return null;
  },
};
