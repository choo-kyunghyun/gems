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
        st.maxHp += 2;
        st.attack += 1;
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
