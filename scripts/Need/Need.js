/**
 * Survival-need definition registry.
 *
 * A need def: { id (the component token), name (i18n key of the HUD bar), seed (the component
 * data a body is given), system? (the system whose update(level) moves the meter; absent = the
 * default clock rise) }. Registration order is the HUD order and the tick order.
 */
globalThis.Need = {
  register(defs) {
    Registry.register(Need, defs, Need.make);
  },

  make(d) {
    return { id: d.id, name: d.name, seed: d.seed, system: d.system };
  },

  all() {
    return Registry.all(Need);
  },
};
