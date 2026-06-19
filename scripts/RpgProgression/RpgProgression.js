// Character progression for the RPG scene — applying a quest/event reward to the player. With
// leveling removed (an item- + skill-driven RPG, no XP grind), a reward is now ITEMS ONLY:
// permanent power comes from equipment and attribute-granting consumables (the *_shard items),
// not XP. A free function taking the scene (composition; mirrors RpgScene), so a milestone's
// timed / world-event rewards can reuse it. The scene owns `world`/`ctrl` and the `_invDirty` flag.
globalThis.RpgProgression = {
  // Apply a reward { items?: [{itemId, qty}] } to the player. No-op for an undefined reward.
  applyReward(scene, reward) {
    if (reward === undefined || reward.items === undefined) return;
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    for (let i = 0; i < reward.items.length; i++) {
      const it = reward.items[i];
      InventorySystem.add(inv, it.itemId, it.qty);
      Profile.add("itemsCollected", it.qty);
    }
    scene._invDirty = true;
  },
};
