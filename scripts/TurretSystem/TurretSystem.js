// Auto-fire driver for Turret entities — a stateless system object (like MeleeSystem), run once
// per physics tick from the RPG pipeline BEFORE ProjectileSystem so a shot spawned this tick is
// integrated the same tick. Each turret picks the nearest HOSTILE attackable body in range that it
// has clear LINE OF SIGHT to (by faction + a wall raycast) and fires a cursor-less "bullet" at it
// on cooldown — so a turret behind cover doesn't waste shots on enemies it can't actually reach.
//
// The bullet is the same EntityPreset the player fires (registered by RpgPlayer.spawn), routed
// through the shared ProjectileSystem: it raycasts to the target, and — since the turret is
// "player" faction — ProjectileSystem's ally check spares the player/companions/other turrets
// (no friendly fire) while still hitting "monster" slimes. So a turret reuses the entire existing
// projectile/loot/death path; a turret-killed slime (Mortal "despawn") spills loot via
// RpgScene.resolveHealth like a blaster kill.
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
      const target = TurretSystem._target(world, id, t);
      if (target === -1) continue; // nothing reachable in range — stay ready (cd already 0)
      TurretSystem._fire(world, id, target, t);
      t.cd = t.fireCd;
    }
  },

  // Nearest HOSTILE attackable body in range with clear line of sight, or -1. Faction relation via
  // FactionSystem; LOS via a wall raycast (see _canSee). Unlike FactionSystem.nearestHostile this
  // also skips targets behind cover, so the turret picks the closest enemy it can actually hit.
  // Only raycasts for candidates closer than the current best, so the cost stays small.
  _target(world, turretId, t) {
    const fa = FactionSystem.factionOf(world, turretId);
    if (fa === undefined) return -1;
    const pos = world.get(Position, turretId);
    const ids = world.query(Health, Position);
    let best = -1;
    let bestD = t.range * t.range;
    for (let i = 0; i < ids.length; i++) {
      const oid = ids[i];
      if (oid === turretId) continue;
      const fb = FactionSystem.factionOf(world, oid);
      if (fb === undefined || !FactionSystem.isHostile(fa, fb)) continue;
      const p = world.get(Position, oid);
      const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
      if (d >= bestD) continue; // farther than the best so far — can't win
      if (!TurretSystem._canSee(world, turretId, pos, oid, p)) continue;
      bestD = d;
      best = oid;
    }
    return best;
  },

  // Clear shot from the turret to the target? A kinematic solid (wall) between them blocks it; so
  // does an ALLY in the path (the bullet would just be eaten by it). A clear ray, the target
  // itself, or a hostile dynamic body in the way (the bullet would hit it instead — still a valid
  // enemy) all count as reachable. Mirrors SlimeAI's line-of-sight test.
  _canSee(world, turretId, from, targetId, to) {
    const hit = Raycast.cast(world, from.x, from.y, to.x, to.y, {
      ignore: turretId,
    });
    if (hit === null || hit.id === targetId) return true;
    const col = world.get(Collision, hit.id);
    if (col === undefined) return true;
    if (col.kinematic) return false; // a wall blocks the shot
    return !FactionSystem.allied(world, turretId, hit.id); // ally in the path eats the shot
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
