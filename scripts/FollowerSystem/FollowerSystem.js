// Party follow AI. A "follow" Follower steers toward the player, easing to a stop near `range` so it
// settles instead of jittering; "wait" holds still. Only sets Velocity (SolidSystem integrates/collides).
// player id passed in, not stored — no entity-reference re-link on migration.
const FOLLOWER_EASE_BAND = 24; // px over `range` across which approach speed ramps to full

globalThis.FollowerSystem = {
  update(world, playerId, followers) {
    const pp = world.get(Position, playerId);
    if (pp === undefined) return;
    for (let i = 0; i < followers.length; i++) {
      const id = followers[i];
      const f = world.get(Follower, id);
      const vel = world.get(Velocity, id);
      if (f === undefined || vel === undefined) continue;
      // downed or stationed → hold still; only "follow" seeks.
      if (f.state !== "follow" || world.get(Downed, id) !== undefined) {
        vel.x = 0;
        vel.y = 0;
      } else {
        const pos = world.get(Position, id);
        const dx = pp.x - pos.x;
        const dy = pp.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > f.range) {
          const ramp = Math.min(1, (dist - f.range) / FOLLOWER_EASE_BAND);
          // terrain movement cost (PathFollow.speedScale) — a companion wades/slogs like everyone
          const speed = f.speed * ramp * PathFollow.speedScale(pos.x, pos.y);
          vel.x = (dx / dist) * speed;
          vel.y = (dy / dist) * speed;
        } else {
          vel.x = 0;
          vel.y = 0;
        }
      }

      // paper-doll drive (opt-in via Animator): idle/walk by velocity + facing flip. Flip by
      // SIGN only — |xscale| carries the baked size factor (see the preset design scale).
      const anim = world.get(Animator, id);
      if (anim !== undefined) {
        AnimationSystem.set(
          anim,
          vel.x * vel.x + vel.y * vel.y > 1 ? "walk" : "idle",
        );
        const vis = world.get(Visual, id);
        if (vis !== undefined) {
          if (vel.x < -1) vis.xscale = -Math.abs(vis.xscale);
          else if (vel.x > 1) vis.xscale = Math.abs(vis.xscale);
        }
      }
    }
  },

  // Add (sign +1) / remove (-1) a companion's carry bonus (slots + weight cap) on the player's Inventory.
  // balanced delta (like EquipmentSystem._applyContainer) so it never needs a recompute-from-base pass.
  applyBenefit(world, playerId, f, sign) {
    if (f === undefined) return;
    const inv = world.get(Inventory, playerId);
    if (inv === undefined) return;
    if (f.bonusCapacity) {
      inv.capacity += f.bonusCapacity * sign;
      if (inv.capacity < 0) inv.capacity = 0;
    }
    if (f.bonusWeight && inv.maxWeight !== undefined) {
      inv.maxWeight += f.bonusWeight * sign;
      if (inv.maxWeight < 0) inv.maxWeight = 0;
    }
  },
};
