// Applies quest and event rewards: items only, no XP, since power comes from equipment and
// consumables.
globalThis.Progression = {
  applyReward(scene, reward) {
    if (reward === undefined || reward.items === undefined) return;
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    for (let i = 0; i < reward.items.length; i++) {
      const it = reward.items[i];
      Bag.add(inv, it.itemId, it.qty);
      // reward items count toward the collect rules like any other pickup
      scene.track("collect", it.itemId, it.qty);
    }
    scene.window.dirty = true;
  },
};
