// Applies quest/event rewards (items only — no XP; power comes from equipment and consumables).
// Free function over the scene; the scene owns entities/playerId and _invDirty.
globalThis.RpgProgression = {
  /** add reward items to the player's bag; no-op if reward is undefined */
  applyReward(scene, reward) {
    if (reward === undefined || reward.items === undefined) return;
    const inv = scene.level.entities.get(Inventory, scene.playerId);
    for (let i = 0; i < reward.items.length; i++) {
      const it = reward.items[i];
      InventorySystem.add(inv, it.itemId, it.qty);
      Profile.add("itemsCollected", it.qty);
    }
    scene._invDirty = true;
  },
};
