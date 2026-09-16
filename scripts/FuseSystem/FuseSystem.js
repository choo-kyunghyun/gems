// Counts every Fuse down and detonates it in place: a radial Combat.explode from the charge's
// Position, the blast cues (psExplosion, sndExplosionLarge), then the entity is removed. Runs after
// ProjectileSystem, so a charge landing this frame detonates where it stopped.
globalThis.FuseSystem = {
  update(level) {
    const entities = level.entities;
    entities.forEach([Fuse, Position], (id, fuse, pos) => {
      fuse.secs -= Time.step;
      if (fuse.secs > 0) return;
      Combat.explode(level, pos.x, pos.y, fuse.radius, {
        owner: fuse.owner,
        damage: fuse.damage,
        penetration: fuse.penetration ?? 0,
      });
      ParticleFx.burst({ asset: psExplosion, x: pos.x, y: pos.y });
      Audio.play({
        sound: sndExplosionLarge,
        position: { x: pos.x, y: pos.y },
      });
      entities.remove(id);
    });
  },

  /**
   * Lob a fused charge from `ownerId`'s Position toward (tx, ty): a lobbed Projectile whose range
   * is the distance, so it lands ON the target point (or against the first collider on the way),
   * carrying the Fuse. Returns the charge's id.
   *   spec: { speed (px/s), secs, radius, damage, penetration? }
   */
  lob(entities, ownerId, tx, ty, spec) {
    const pos = entities.get(ownerId, Position);
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // a throw at the thrower's own feet has no direction: the charge just sits there
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    const id = entities.create();
    entities.add(id, Position, { x: pos.x, y: pos.y, z: 0 });
    entities.add(id, Velocity, {
      x: nx * spec.speed,
      y: ny * spec.speed,
      z: 0,
    });
    entities.add(id, Projectile, {
      damage: 0,
      owner: ownerId,
      lob: true,
      range: dist,
    });
    entities.add(id, Fuse, {
      secs: spec.secs,
      radius: spec.radius,
      damage: spec.damage,
      owner: ownerId,
      penetration: spec.penetration ?? 0,
    });
    return id;
  },
};
