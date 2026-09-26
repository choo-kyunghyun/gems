const FOLLOWER_EASE_BAND = 48; // px past `range` over which approach speed ramps to full

/**
 * A "follow" member steers toward the player, easing to a stop near `range` so it settles instead
 * of jittering; any other state holds still, and a Downed one lies where it fell. It only writes
 * Velocity. The player is found live, never stored.
 */
globalThis.FollowerSystem = {
  update(level) {
    const entities = level.entities;
    const playerId = ColonyPlayer.id(entities);
    const pp = entities.get(playerId, Position);
    if (pp === undefined) return;
    const downed = entities.column(Downed);
    const slots = Handle.SLOTS;
    entities.forEach([Follower, Velocity, Position], (id, f, vel, pos) => {
      if (id === playerId) return;
      // returns before the doll drive, which would stand a downed body back up
      if (downed[id % slots] !== undefined) {
        vel.x = 0;
        vel.y = 0;
        return;
      }
      if (f.state !== "follow") {
        vel.x = 0;
        vel.y = 0;
      } else {
        const dx = pp.x - pos.x;
        const dy = pp.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > f.range) {
          const ramp = Math.min(1, (dist - f.range) / FOLLOWER_EASE_BAND);
          const speed =
            f.speed * ramp * PathFollow.speedScale(level.grid, pos.x, pos.y);
          vel.x = (dx / dist) * speed;
          vel.y = (dy / dist) * speed;
        } else {
          vel.x = 0;
          vel.y = 0;
        }
      }

      Doll.setState(
        entities,
        id,
        vel.x * vel.x + vel.y * vel.y > 1 ? "walk" : "idle",
      );
      Doll.face(entities, id, vel.x);
    });
  },
};
