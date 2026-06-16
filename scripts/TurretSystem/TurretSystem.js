// Auto-fire driver for Turret entities — a stateless system object (like MeleeSystem), run once
// per physics tick from the RPG pipeline BEFORE ProjectileSystem so a shot spawned this tick is
// integrated the same tick. Each turret picks the nearest HOSTILE attackable body in range (by
// faction — FactionSystem.nearestHostile) and fires a cursor-less "bullet" at it on cooldown.
//
// The bullet is the same EntityPreset the player fires (registered by RpgPlayer.spawn), routed
// through the shared ProjectileSystem: it raycasts to the target, and — since the turret is
// "player" faction — ProjectileSystem's ally check spares the player/companions/other turrets
// (no friendly fire) while still hitting "monster" slimes. So a turret reuses the entire existing
// projectile/loot/death path; turret kills spill loot via RpgScene.resolveDeaths like a blaster.
globalThis.TurretSystem = {
  update(world) {
    const ids = world.query(Turret, Position);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const t = world.get(Turret, id);
      if (t.cd > 0) {
        t.cd--; // cool down; read/written live off the component (no cached primitive)
        continue;
      }
      const pos = world.get(Position, id);
      const target = FactionSystem.nearestHostile(
        world,
        id,
        pos.x,
        pos.y,
        t.range,
      );
      if (target === -1) continue; // nothing in range — stay ready (cd already 0)
      TurretSystem._fire(world, id, target, t);
      t.cd = t.fireCd;
    }
  },

  // Spawn a bullet from the turret aimed at the target's current position. Mirrors
  // RpgPlayer.fireBullet's aim math, but targets an entity instead of the cursor.
  _fire(world, turretId, targetId, t) {
    if (!EntityPreset.has("bullet")) return; // player not spawned yet (shouldn't happen in-scene)
    const tp = world.get(Position, turretId);
    const target = world.get(Position, targetId);
    const dx = target.x - tp.x;
    const dy = target.y - tp.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const bid = EntityPreset.spawn("bullet", world, tp.x, tp.y);
    const vel = world.get(Velocity, bid);
    vel.x = (dx / dist) * t.bulletSpeed;
    vel.y = (dy / dist) * t.bulletSpeed;
    const proj = world.get(Projectile, bid);
    proj.owner = turretId; // raycast ignores the turret + ally check spares player-faction bodies
    proj.damage = t.damage;
  },
};
