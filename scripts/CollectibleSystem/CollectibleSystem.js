// reads Collision.hits filled by TriggerSystem (run after SolidSystem, before this)
globalThis.CollectibleSystem = {
  hitSpike(world, playerId) {
    const hits = world.get(Collision, playerId).hits;
    for (let i = 0; i < hits.length; i++) {
      if (world.get(Spike, hits[i]) !== undefined) return true;
    }
    return false;
  },
};
