// Status/buff DEFINITION registry — the parallel of Item/Rarity for timed or maintained effects
// (poison, regen, slow, haste, fortify, encumbrance). A status carries up to three effect kinds,
// each routed the idiomatic way by StatusSystem + the consumer:
//   dot/hot  — Health change per second, applied over time by StatusSystem.update (every `interval`)
//   mult     — live multiplicative factors (e.g. { speed: 0.5 }) read at point of use via
//              StatusSystem.scale (the mover reads "speed"); never folded into Stats
//   mods     — flat additive Stats deltas (e.g. { attack: 5 }) folded into the derived sheet by the
//              GAME (StatModel._foldStatuses), recomputed on apply/remove via StatusSystem.onStatsChanged
//
// The kit stays stat-model-agnostic: it owns the list/timing/dot-hot/scale; the game owns how `mods`
// fold (its StatModel) and the content (Demo registers the actual defs — see RpgStatuses). Registered
// at a scene's create() (RpgStatuses.register), NOT at top level — avoids GMRT load-order issues.
//
// A category bucket of free functions over a private registry (the project's registry pattern, like
// Item/Rarity) — kept as one small namespace object, well under the 50-method class ceiling.
globalThis.Status = {
  _defs: {}, // id -> def
  _order: [], // ids in registration order (Status.all)

  /**
   * Register status definitions (idempotent per id — re-registering an id overwrites).
   * @param {Array<Object>} defs each: { id, name, color?, beneficial?, duration?, dot?, hot?,
   *   interval?, mods?, mult? }
   *   - id          unique string key
   *   - name        i18n display key
   *   - color       hex "#rrggbb" for the HUD chip (optional)
   *   - beneficial  true = buff (default), false = debuff — drives the HUD tint
   *   - duration    seconds the status lasts; 0/undefined = until explicitly removed (no auto-expire)
   *   - dot         HP removed per second (applied every `interval`); 0/undefined = none
   *   - hot         HP restored per second (applied every `interval`); 0/undefined = none
   *   - interval    seconds between dot/hot applications (default 1)
   *   - mods        flat additive Stats deltas while active (folded into the derived sheet by the game)
   *   - mult        live multiplicative factors by stat key (read by StatusSystem.scale)
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
        mods: d.mods, // may be undefined (no Stats fold)
        mult: d.mult, // may be undefined (no live multiplier)
      };
    }
  },

  get(id) {
    return Status._defs[id];
  },

  has(id) {
    return Status._defs[id] !== undefined;
  },

  // All registered defs in registration order (a fresh array each call).
  all() {
    const out = [];
    for (let i = 0; i < Status._order.length; i++)
      out.push(Status._defs[Status._order[i]]);
    return out;
  },
};
