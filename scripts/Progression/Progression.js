// Applies quest/event rewards (items only — no XP; power comes from equipment and consumables).
// Free function over the scene; the scene owns entities/playerId, _invDirty, and the report seam.
globalThis.Progression = {
  /** add reward items to the player's bag; no-op if reward is undefined */
  applyReward(scene, reward) {
    if (reward === undefined || reward.items === undefined) return;
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    for (let i = 0; i < reward.items.length; i++) {
      const it = reward.items[i];
      InventorySystem.add(inv, it.itemId, it.qty);
      // through the seam, so reward items count toward the collect rules like any other pickup
      scene._track("collect", it.itemId, it.qty);
    }
    scene._invDirty = true;
  },
};
