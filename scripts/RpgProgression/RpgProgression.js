// Applies quest/event rewards (items only — no XP; power comes from equipment and consumables).
// Free function over the level; the level owns entities/playerId and _invDirty.
globalThis.RpgProgression = {
  /** add reward items to the player's bag; no-op if reward is undefined */
  applyReward(level, reward) {
    if (reward === undefined || reward.items === undefined) return;
    const inv = level.entities.get(Inventory, level.playerId);
    for (let i = 0; i < reward.items.length; i++) {
      const it = reward.items[i];
      InventorySystem.add(inv, it.itemId, it.qty);
      Profile.add("itemsCollected", it.qty);
    }
    level._invDirty = true;
  },
};
