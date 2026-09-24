// Move-and-cast for free projectiles. A bullet damages a hit Health and is spent on any impact; a
// lob arcs over bodies and stops where it meets a structure or its range runs out, and lies there.
// A projectile carries no Collision, so neither a cast nor the solid pass sees it.
const LAND_GAP = 1; // px a lob rests off the surface it struck, along its normal

globalThis.ProjectileSystem = {
  update(level) {
    const entities = level.entities;
    const dt = Time.step;
    entities.forEach([Projectile, Position, Velocity], (id, proj, pos, vel) => {
      if (vel.x === 0 && vel.y === 0) return; // a landed lob
      let sx = vel.x * dt;
      let sy = vel.y * dt;
      // the last step is the remainder, so a lob lands on its target point
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
          ? ProjectileSystem._structure(level, pos.x, pos.y, x1, y1, proj.owner)
          : Query.cast(entities, pos.x, pos.y, x1, y1, { ignore: proj.owner });

      if (hit === null) {
        pos.x = x1;
        pos.y = y1;
        if (proj.range === 0) {
          if (proj.lob === true) {
            vel.x = 0;
            vel.y = 0;
          } else entities.remove(id);
        }
        return;
      }

      if (proj.lob === true) {
        // a hair off the surface, so a line-of-sight cast from here doesn't start inside it
        pos.x = hit.x + hit.nx * LAND_GAP;
        pos.y = hit.y + hit.ny * LAND_GAP;
        vel.x = 0;
        vel.y = 0;
        return;
      }

      pos.x = hit.x;
      pos.y = hit.y;

      const hp = entities.get(hit.id, Health);
      // an ally blocks like a wall
      if (
        hp !== undefined &&
        !Diplomacy.allied(entities, proj.owner, hit.id)
      ) {
        Combat.applyDamage(
          entities,
          hit.id,
          proj.damage,
          proj.penetration,
        );
      }
      entities.remove(id);
    });
  },

  /**
   * The nearest structure on the step, or null — bodies are flown over. Allocates per step; only a
   * lob in flight pays it.
   */
  _structure(level, x0, y0, x1, y1, owner) {
    const all = Query.castAll(level.entities, x0, y0, x1, y1, { ignore: owner });
    for (let i = 0; i < all.length; i++) {
      if (Combat.isStructure(level.entities, all[i].id)) return all[i];
    }
    return null;
  },
};
