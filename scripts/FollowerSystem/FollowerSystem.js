const FOLLOWER_EASE_BAND = 48; // px over `range` across which approach speed ramps to full

/**
 * A "follow" member steers toward the player, easing to a stop near `range` so it settles instead of
 * jittering; "wait" (and any non-member) holds still; a Downed one lies where it fell. Only sets
 * Velocity (SolidSystem integrates/collides). The player id is the live Playable query, never stored.
 * Membership and the wait/follow command are Companions'.
 */
globalThis.FollowerSystem = {
  update(level) {
    const entities = level.entities;
    const playerId = ColonyPlayer.id(entities);
    const pp = entities.get(playerId, Position);
    if (pp === undefined) return;
    entities.forEach([Follower, Velocity], (id, f, vel) => {
      if (id === playerId) return;
      // downed → hold still AND leave the doll in its `down` set (ColonyCombat._goDown owns that
      // pose until recovery) — the idle/walk drive below would stand it back up.
      if (entities.has(id, Downed)) {
        vel.x = 0;
        vel.y = 0;
        return;
      }
      // stationed → hold still; only "follow" seeks.
      if (f.state !== "follow") {
        vel.x = 0;
        vel.y = 0;
      } else {
        const pos = entities.get(id, Position);
        const dx = pp.x - pos.x;
        const dy = pp.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > f.range) {
          const ramp = Math.min(1, (dist - f.range) / FOLLOWER_EASE_BAND);
          // terrain movement cost (PathFollow.speedScale) — a companion wades/slogs like everyone
          const speed =
            f.speed * ramp * PathFollow.speedScale(level.grid, pos.x, pos.y);
          vel.x = (dx / dist) * speed;
          vel.y = (dy / dist) * speed;
        } else {
          vel.x = 0;
          vel.y = 0;
        }
      }

      // doll drive (opt-in via Skeleton): idle/walk by velocity, plus the facing flip
      ColonyPlayer.setState(
        entities,
        id,
        vel.x * vel.x + vel.y * vel.y > 1 ? "walk" : "idle",
      );
      ColonyPlayer.face(entities, id, vel.x);
    });
  },
};
