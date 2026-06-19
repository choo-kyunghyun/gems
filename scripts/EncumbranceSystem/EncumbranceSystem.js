// Maps an entity's carried weight to a speed multiplier. The PENALTY is now delivered through the
// Buff/Status system, not applied by the mover directly: update() maintains an "encumbered" status
// whose live speed `mult` is this gradient, and the mover reads StatusSystem.scale(world, id, "speed")
// (so encumbrance composes with any other speed status — slow/haste). This module still OWNS the
// weight→penalty mechanic (the gradient + the on/off decision); only how the slow reaches the entity
// moved to the status layer. A plain system object (the project's System pattern).
globalThis.EncumbranceSystem = {
  // Per-tick: refresh the "encumbered" status for every Encumbrance carrier from its current load.
  // Overloaded (scale < 1) → maintain the status with the live { speed } multiplier (so the HUD
  // shows it and the mover slows); not overloaded → clear it. maintain() carries no `mods`, so this
  // never triggers a Stats re-derive. Run once per tick (sceneRpg.step), before the mover reads scale.
  update(world) {
    const ids = world.query(Encumbrance, Inventory);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const s = EncumbranceSystem.scale(world, id);
      StatusSystem.maintain(
        world,
        id,
        "encumbered",
        s < 1 ? { speed: s } : null,
      );
    }
  },

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
