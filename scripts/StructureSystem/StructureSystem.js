/**
 * Removes the structures destroyed in combat, their contents spilled and no refund. A loss on a
 * level that builds is reported through the hook.
 */
globalThis.StructureSystem = {
  /** Hook: an owned structure built from `item` was destroyed. */
  onLost(item) {},

  /** Drop the hook. */
  reset() {
    StructureSystem.onLost = function (item) {};
  },

  update(level) {
    const entities = level.entities;
    const own = Build.free || Build.allied(level);
    entities.forEach([Structure, Health], (id, st, hp) => {
      if (hp.hp > 0) return;
      Loot.spill(entities, id);
      entities.remove(id);
      if (own) StructureSystem.onLost(st.item);
      Log.info(`built ${st.item} destroyed`);
    });
  },
};
