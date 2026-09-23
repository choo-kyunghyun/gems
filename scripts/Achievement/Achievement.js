// Achievement definitions — pure data ({ id, name, desc }), no condition; the engine never sweeps.
// The unlock state and the trigger rules live elsewhere.
globalThis.Achievement = {
  register(defs) {
    Registry.register(Achievement, defs);
  },

  get(id) {
    return Registry.get(Achievement, id);
  },

  all() {
    return Registry.all(Achievement);
  },
};
