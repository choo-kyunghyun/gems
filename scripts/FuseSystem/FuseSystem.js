// Counts every Fuse down and detonates it in place: a radial Combat.explode from the charge's
// Position, the blast cues (psExplosion, sndExplosionLarge), then the entity is removed. Runs after
// ProjectileSystem, so a charge landing this frame detonates where it stopped. Lobbing one is
// Combat.lob.
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
};
