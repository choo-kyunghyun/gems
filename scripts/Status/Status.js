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
  _defs: {}, // id -> def
  _order: [], // ids in registration order

  /**
   * Register status defs (later def with same id overwrites). Each:
   * { id, name, color?, beneficial? (default buff), duration? (0 = no auto-expire), dot?, hot?,
   *   interval? (default 1, seconds between dot/hot), mods?, mult? }
   */
  register(defs) {
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (Status._defs[d.id] === undefined) Status._order.push(d.id);
      Status._defs[d.id] = {
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
      };
    }
  },

  get(id) {
    return Status._defs[id];
  },

  has(id) {
    return Status._defs[id] !== undefined;
  },

  // fresh array each call.
  all() {
    const out = [];
    for (let i = 0; i < Status._order.length; i++)
      out.push(Status._defs[Status._order[i]]);
    return out;
  },
};
