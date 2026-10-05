/** A Reach region the player's mask enters reports its target once and is spent. */
globalThis.ReachSystem = {
  update(level) {
    const entities = level.entities;
    entities.forEach([Reach, Position, BBox], (id, r, pos, box) => {
      const x1 = pos.x + box.x;
      const y1 = pos.y + box.y;
      const hit = Query.maskRect(entities, x1, y1, x1 + box.width, y1 + box.height, {
        has: Playable,
      });
      if (hit.length === 0) return;
      entities.remove(id);
      Progression.report(entities, "reach", r.target, 1);
      Log.info(`reached ${r.target}`);
    });
  },
};
