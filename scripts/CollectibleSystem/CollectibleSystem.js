// reads Collision.hits filled by TriggerSystem (run after SolidSystem, before this)
globalThis.CollectibleSystem = {
  hitSpike(entities, playerId) {
    const hits = entities.get(playerId, Collision).hits;
    for (let i = 0; i < hits.length; i++) {
      if (entities.has(hits[i], Spike)) return true;
    }
    return false;
  },
};
