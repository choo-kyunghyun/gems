// Party follow AI for the RPG genre. A "follow"-state Follower steers toward the player each
// tick — full speed beyond `range`, easing to a stop over the last stretch so it settles
// against the player's body instead of jittering. A "wait"-state follower holds still. This
// only sets Velocity; SolidSystem integrates it and collides the follower against walls — so
// it's a stateless query system run per tick from the scene's step(), like MeleeSystem/SlimeAI.
//
// The player id is passed in (not stored on the follower), so after a map change the system
// just receives the new player id — no entity-reference re-link on migration.
const FOLLOWER_EASE_BAND = 48; // px over `range` across which approach speed ramps to full

globalThis.FollowerSystem = {
  update(world, playerId, followers) {
    const pp = world.get(Position, playerId);
    if (pp === undefined) return;
    for (let i = 0; i < followers.length; i++) {
      const id = followers[i];
      const f = world.get(Follower, id);
      const vel = world.get(Velocity, id);
      if (f === undefined || vel === undefined) continue;
      if (f.state !== "follow") {
        vel.x = 0;
        vel.y = 0;
        continue;
      }
      const pos = world.get(Position, id);
      const dx = pp.x - pos.x;
      const dy = pp.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > f.range) {
        const ramp = Math.min(1, (dist - f.range) / FOLLOWER_EASE_BAND);
        const speed = f.speed * ramp;
        vel.x = (dx / dist) * speed;
        vel.y = (dy / dist) * speed;
      } else {
        vel.x = 0;
        vel.y = 0;
      }
    }
  },
};
