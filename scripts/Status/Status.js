// Status/buff DEFINITION registry (parallel of Item/Rarity). Registered at scene create()
// (contentStatuses.register), NOT at top level — GMRT load-order. Effect kinds on the declaration below.
/**
 * A status carries up to three effect kinds:
 *   dot/hot — Health change per `interval` (StatusSystem.update)
 *   mult    — live multiplicative factors read at use via StatusSystem.scale; never folded into Stats
 *   mods    — flat Stats deltas folded by the GAME (StatModel._foldStatuses), re-derived via onStatsChanged
 * Status stays stat-model-agnostic: it owns list/timing/dot-hot/scale; the game owns how `mods` fold.
 */
globalThis.Status = {
  register(defs) {
    Registry.register(Status, defs, Status.make);
  },

  /**
   * A status def: { id, name, color?, beneficial? (default buff), duration? (0 = no auto-expire),
   * dot?, hot?, interval? (default 1, seconds between dot/hot), mods?, mult? }
   */
  make(d) {
    return {
      id: d.id,
      name: d.name,
      color: d.color ?? "#cccccc",
      beneficial: d.beneficial !== false,
      duration: d.duration ?? 0,
      dot: d.dot ?? 0,
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
