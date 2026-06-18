// Character progression for the RPG scene — applying a quest/event reward to the player: XP with
// cascading level-ups (each level raises maxHp/attack, bumps the xp curve, and heals to full)
// plus granted items. A free function taking the scene (composition; mirrors RpgScene), so the
// milestone's timed / world-event rewards can reuse it instead of re-implementing the math.
// The scene owns `world`/`ctrl` and the `_invDirty` rebuild flag.
globalThis.RpgProgression = {
  // Apply a reward { xp?, items?: [{itemId, qty}] } to the player. No-op for an undefined reward.
  applyReward(scene, reward) {
    if (reward === undefined) return;
    const st = scene.world.get(Stats, scene.ctrl.id);
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    if (reward.xp) {
      st.xp += reward.xp;
      while (st.xp >= st.xpNext) {
        st.xp -= st.xpNext;
        st.level++;
        st.xpNext = Math.round(st.xpNext * 1.5);
        // Grant PRIMARY attributes (the RPG way) → re-derive, instead of bumping derived stats
        // directly: +2 POW reproduces the legacy +1 attack, +1 VIT the +2 maxHp (and nudges defense
        // via the VIT rule). StatModel.recompute then writes the derived sheet; heal to full after.
        const at = scene.world.get(Attributes, scene.ctrl.id);
        if (at !== undefined) {
          at.pow += 2;
          at.vit += 1;
        }
        StatModel.recompute(scene.world, scene.ctrl.id);
        const hp = scene.world.get(Health, scene.ctrl.id);
        if (hp !== undefined) hp.hp = st.maxHp; // heal to full on level-up
        Log.info(`level up! now Lv ${st.level}`);
      }
    }
    if (reward.items !== undefined) {
      for (let i = 0; i < reward.items.length; i++) {
        const it = reward.items[i];
        InventorySystem.add(inv, it.itemId, it.qty);
        Profile.add("itemsCollected", it.qty);
      }
      scene._invDirty = true;
    }
  },
};
