// Drowsiness need driver — thin wrapper over the shared Survival core. update() (awake) raises it in the
// tick loop; while the player SLEEPS the scene calls restore() each tick instead (see sceneRpg._sleep).
globalThis.DrowsinessSystem = {
  update(world) {
    Survival.tick(world, Drowsiness);
  },

  // Rest: lower drowsiness by `amount`. Returns true if it changed; refreshes the debuff so resting below
  // critical clears "drowsy" even while update() is bypassed during sleep.
  restore(world, id, amount) {
    const c = world.get(Drowsiness, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(world, id, c);
    return changed;
  },
};
