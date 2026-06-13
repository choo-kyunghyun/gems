// On-demand helper: maps an entity's carried weight to a speed multiplier, read
// live by the mover (see RpgController.update) rather than mutating Stats.speed
// — so it composes cleanly with equipment mods instead of fighting their balanced
// add/remove deltas. A plain object (not a class) per the GMRT static-method note.
globalThis.EncumbranceSystem = {
  // Speed multiplier in [enc.minScale, 1] from the entity's current Inventory load.
  // Returns 1 (no penalty) when the entity lacks Encumbrance/Inventory or the
  // inventory has no maxWeight. No penalty below `threshold`; linear from there to
  // `minScale` at full load.
  scale(world, id) {
    const enc = world.get(Encumbrance, id);
    if (enc === undefined) return 1;
    const inv = world.get(Inventory, id);
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

    // Linear blend from full speed at `threshold` to `minScale` at full load.
    const t = (frac - enc.threshold) / (1 - enc.threshold);
    return 1 + (enc.minScale - 1) * t;
  },
};
