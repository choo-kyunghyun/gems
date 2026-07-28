// Drowsiness need driver — thin wrapper over the shared Survival core. update() (awake) raises it in the
// tick loop; while the player SLEEPS the level calls restore() each tick instead (see sceneRpg._sleep).
globalThis.DrowsinessSystem = {
  update(entities) {
    Survival.tick(entities, Drowsiness);
  },

  /**
   * Rest: lower drowsiness by `amount`. Returns true if it changed; refreshes the debuff so resting below
   * critical clears "drowsy" even while update() is bypassed during sleep.
   */
  restore(entities, id, amount) {
    const c = entities.get(Drowsiness, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(entities, id, c);
    return changed;
  },
};
