const BULLET_SPEED = 600; // px/s, for a round that states no velocity
const SHOT_RANGE_SECS = 1.5; // hitscan reach, in seconds of bullet flight
const MUZZLE = 18; // px from the shooter's centre to its muzzle flash

/**
 * A gun's shot from its live Inventory slot, whoever pulls the trigger: one round spent as an
 * instant hitscan along the aim, drawn as a fading tracer with its muzzle flash and report. The
 * round's velocity scales only the reach.
 */
globalThis.Gunfire = {
  /**
   * Fire `slot`, composed as `wpn`, from `from` along (dx, dy), adding `attack` to the round's
   * power. An empty or unloaded gun reloads from `inv` first. Returns the profile that fired, or
   * null when dry.
   */
  shoot(level, from, inv, slot, wpn, dx, dy, attack) {
    if (wpn.noAmmo) {
      // recompose so this shot uses the loaded round's stats
      if (Loadout.reloadSlot(inv, slot) <= 0) return null;
      wpn = Loadout.composeWeapon(slot);
    }
    if (slot.rounds <= 0) Loadout.reloadSlot(inv, slot);
    if (slot.rounds <= 0) return null;

    const speed = wpn.velocity !== undefined ? wpn.velocity : BULLET_SPEED;
    const range = speed * SHOT_RANGE_SECS;
    const pos = level.entities.get(from, Position);
    const m = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / m;
    const ny = dy / m;
    const shot = Combat.hitscan(level, pos.x, pos.y, pos.x + nx * range, pos.y + ny * range, {
      owner: from,
      damage: Math.round(wpn.power) + attack,
      penetration: wpn.penetration ?? 0,
      pierce: 1,
    });
    WorldOverlay.pushTracer(level, pos.x, pos.y, shot.x, shot.y);
    slot.rounds -= 1;

    ParticleFx.burst(level, {
      asset: psMuzzle,
      x: pos.x + nx * MUZZLE,
      y: pos.y + ny * MUZZLE,
      angle: point_direction(0, 0, nx, ny),
    });
    Audio.play({ sound: sndGunFire, position: { x: pos.x, y: pos.y } });
    return wpn;
  },
};
