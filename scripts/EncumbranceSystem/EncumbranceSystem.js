// Maps carried weight → speed multiplier, delivered via a maintained "encumbered" status (not by the
// mover directly), so it composes with other speed statuses; the mover reads StatusSystem.scale(speed).
globalThis.EncumbranceSystem = {
  // Per-tick: refresh the "encumbered" status from each carrier's load. Overloaded → maintain with
  // live { speed }; else clear. maintain() carries no `mods`, so no Stats re-derive. Run before the
  // mover reads scale.
  update(entities) {
    const ids = entities.query(Encumbrance, Inventory);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const s = EncumbranceSystem.scale(entities, id);
      StatusSystem.maintain(
        entities,
        id,
        "encumbered",
        s < 1 ? { speed: s } : null,
      );
    }
  },

  // Speed multiplier in [minScale, 1] from current load. Returns 1 (no penalty) without
  // Encumbrance/Inventory/maxWeight, or below `threshold`; linear from threshold to minScale at full.
  scale(entities, id) {
    const enc = entities.get(Encumbrance, id);
    if (enc === undefined) return 1;
    const inv = entities.get(Inventory, id);
    if (
      inv === undefined ||
      inv.maxWeight === undefined ||
      inv.maxWeight <= 0
    ) {
      return 1;
    }

    const frac = InventorySystem.weight(inv) / inv.maxWeight;
    if (frac <= enc.threshold) return 1;
    if (frac >= 1) return enc.minScale;

    const t = (frac - enc.threshold) / (1 - enc.threshold);
    return 1 + (enc.minScale - 1) * t;
  },
};
