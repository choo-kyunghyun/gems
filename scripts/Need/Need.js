// Survival-need DEFINITION registry (parallel of Status). A def names one need component by its
// token, the seed a body starts with and, for an environmental need, the ticker that drives it.
// Registered at content.register (contentNeeds.register), NOT at top level — GMRT load-order.
/**
 * A need def: { id (the component token — Thirst/Hunger/…), name (i18n key of the HUD bar),
 * seed (the component data a body is given — value/max/rate/critical/status, plus the need's own
 * fields), system? (the `*System` whose update(level) moves the meter; absent = NeedSystem's
 * clock rise) }. Registration order is the HUD order and the tick order.
 */
globalThis.Need = {
  // ── Registry facade (Registry owns the store's contract) ──
  _defs: new Map(),
  _order: [],

  register(defs) {
    Registry.register(Need, defs, (d) => ({
      id: d.id,
      name: d.name,
      seed: d.seed,
      system: d.system, // may be undefined
    }));
  },

  all() {
    return Registry.all(Need);
  },
};
