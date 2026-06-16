// Hazard detection for the platformer. Reads the player's Collision.hits, which
// TriggerSystem fills each tick with the non-solid sensors (spikes) the player
// overlaps. TriggerSystem must run AFTER SolidSystem moves bodies and BEFORE this
// method, so hits reflect final positions.
globalThis.CollectibleSystem = {
  // True if the player overlaps any spike hazard this tick.
  hitSpike(world, playerId) {
    const hits = world.get(Collision, playerId).hits;
    for (let i = 0; i < hits.length; i++) {
      if (world.get(Spike, hits[i]) !== undefined) return true;
    }
    return false;
  },
};
