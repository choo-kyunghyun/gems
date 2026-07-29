// Status/buff DEFINITION registry (parallel of Item/Rarity). Registered at level create()
// (RpgStatuses.register), NOT at top level — GMRT load-order. Effect kinds on the declaration below.
/**
 * A status carries up to three effect kinds:
 *   dot/hot — Health change per `interval` (StatusSystem.update)
 *   mult    — live multiplicative factors read at use via StatusSystem.scale; never folded into Stats
 *   mods    — flat Stats deltas folded by the GAME (StatModel._foldStatuses), re-derived via onStatsChanged
 * Kit stays stat-model-agnostic: it owns list/timing/dot-hot/scale; the game owns how `mods` fold.
 */
globalThis.Status = {
  // ── Registry facade (Registry owns the store's contract) ──
  _defs: new Map(),
  _order: [],

  /**
   * Register status defs. Each:
   * { id, name, color?, beneficial? (default buff), duration? (0 = no auto-expire), dot?, hot?,
   *   interval? (default 1, seconds between dot/hot), mods?, mult? }
   * @param {Object[]} defs
   */
  register(defs) {
    Registry.register(Status, defs, (d) => ({
      id: d.id,
      name: d.name,
      color: d.color ?? "#cccccc",
      beneficial: d.beneficial !== false, // default true
      duration: d.duration ?? 0,
      dot: d.dot ?? 0,
      hot: d.hot ?? 0,
      interval: d.interval ?? 1,
      mods: d.mods, // may be undefined
      mult: d.mult, // may be undefined
    }));
  },

  /**
   * @param {string} id
   * @returns {Object|undefined}
   */
  get(id) {
    return Registry.get(Status, id);
  },

  /**
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return Registry.has(Status, id);
  },

  /**
   * @returns {Object[]}
   */
  all() {
    return Registry.all(Status);
  },
};
