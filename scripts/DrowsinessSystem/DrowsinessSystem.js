// Per-tick driver for the Drowsiness need — thin wrapper over the shared Survival core (its own
// object so the sleep rule has a home). update() (awake) raises drowsiness in the scene's tick loop;
// while the player SLEEPS the scene calls restore() instead each tick (draining it as time is
// fast-forwarded — see sceneRpg._sleep). Plain system object.
globalThis.DrowsinessSystem = {
  update(world) {
    Survival.tick(world, Drowsiness);
  },

  // Rest: lower drowsiness by `amount` on entity `id` (the sleep recovery). Returns true if it
  // changed; refreshes the debuff so resting below critical clears "drowsy" even while update() is
  // bypassed during sleep.
  restore(world, id, amount) {
    const c = world.get(Drowsiness, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(world, id, c);
    return changed;
  },
};
