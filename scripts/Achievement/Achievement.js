// Achievement DEFINITIONS — pure data ({ id, name, desc }), NO condition; the engine never sweeps.
// The unlock STATE lives in Tracker, which reads defs from here; the trigger rules stay with the
// content that owns them (contentAchievements).
globalThis.Achievement = {
  // ── Registry facade (Registry owns the store's contract) ──
  _defs: new Map(),
  _order: [],

  register(defs) {
    Registry.register(Achievement, defs);
    return this;
  },

  get(id) {
    return Registry.get(Achievement, id);
  },

  all() {
    return Registry.all(Achievement);
  },
};
