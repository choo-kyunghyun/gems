/**
 * Status definition registry. A status carries up to three effect kinds:
 *   hot     — Health gain per `interval`
 *   mult    — live multiplicative factors read at use; never folded into Stats
 *   mods    — flat Stats deltas, folded by the game
 * Stat-model-agnostic: the game owns how `mods` fold.
 */
globalThis.Status = {
  register(defs) {
    Registry.register(Status, defs, Status.make);
  },

  /**
   * A status def: { id, name, color?, beneficial?, duration? (0 = no auto-expire), hot?,
   * interval? (seconds between hot ticks), mods?, mult? }
   */
  make(d) {
    return {
      id: d.id,
      name: d.name,
      color: d.color ?? "#cccccc",
      beneficial: d.beneficial !== false,
      duration: d.duration ?? 0,
      hot: d.hot ?? 0,
      interval: d.interval ?? 1,
      mods: d.mods,
      mult: d.mult,
    };
  },

  get(id) {
    return Registry.get(Status, id);
  },
};
