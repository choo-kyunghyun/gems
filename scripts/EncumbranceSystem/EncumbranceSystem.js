// Maps carried weight to a speed multiplier, delivered as a maintained "encumbered" status so it
// composes with other speed statuses.
globalThis.EncumbranceSystem = {
  /** Runs before the mover reads its speed scale. */
  update(level) {
    const entities = level.entities;
    entities.forEach([Encumbrance, Inventory], (id) => {
      const s = EncumbranceSystem.scale(entities, id);
      Effects.maintain(
        entities,
        id,
        "encumbered",
        s < 1 ? { speed: s } : null,
      );
    });
  },

  /** In [minScale, 1]: 1 up to `threshold`, then linear down to minScale at full load. */
  scale(entities, id) {
    const enc = entities.get(id, Encumbrance);
    if (enc === undefined) return 1;
    const inv = entities.get(id, Inventory);
    if (
      inv === undefined ||
      inv.maxWeight === undefined ||
      inv.maxWeight <= 0
    ) {
      return 1;
    }

    const frac = Bag.weight(inv) / inv.maxWeight;
    if (frac <= enc.threshold) return 1;
    if (frac >= 1) return enc.minScale;

    const t = (frac - enc.threshold) / (1 - enc.threshold);
    return 1 + (enc.minScale - 1) * t;
  },
};
