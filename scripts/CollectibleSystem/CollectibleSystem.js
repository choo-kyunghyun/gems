// Coin pickups and goal-post detection for the platformer.
//
//   const got = CollectibleSystem.collect(world, playerId);   // → # coins picked up this tick
//   const win = CollectibleSystem.reachedGoal(world, playerId); // → true on goal overlap
//
// Both read the player's Collision.hits, which TriggerSystem fills each tick with
// the non-solid sensors (coins, goal) the player overlaps. TriggerSystem must run
// AFTER SolidSystem moves bodies and BEFORE these methods, so hits reflect final
// positions. Coins are removed via world.remove (committed by the caller's flush).
globalThis.CollectibleSystem = {
  // Collect every coin the player overlaps this tick; returns the count removed.
  collect(world, playerId) {
    const hits = world.get(Collision, playerId).hits;
    let collected = 0;
    for (let i = 0; i < hits.length; i++) {
      const id = hits[i];
      if (world.get(Coin, id) !== undefined) {
        world.remove(id);
        collected++;
      }
    }
    return collected;
  },

  // True if the player overlaps the level goal this tick.
  reachedGoal(world, playerId) {
    const hits = world.get(Collision, playerId).hits;
    for (let i = 0; i < hits.length; i++) {
      if (world.get(Goal, hits[i]) !== undefined) return true;
    }
    return false;
  },
};
