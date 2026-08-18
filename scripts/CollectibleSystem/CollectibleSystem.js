// reads Collision.hits filled by TriggerSystem (run after SolidSystem, before this)
globalThis.CollectibleSystem = {
  hitSpike(entities, playerId) {
    const hits = entities.get(playerId, Collision).hits;
    for (let i = 0; i < hits.length; i++) {
      if (entities.get(hits[i], Spike) !== undefined) return true;
    }
    return false;
  },
};
