/**
 * @typedef {Object} StateSchema
 * @property {string} id                             registry name (e.g. "combat.idle")
 * @property {function(Level, number): void} [enter]   called once on transition in
 * @property {function(Level, number): void} [update]  called every tick while active
 * @property {function(Level, number): void} [finish]  called once on transition out
 */

/**
 * Per-entity state machine over a named state pool. A State holds id strings ("" = none),
 * resolved through the pool each use, so a parked or saved actor round-trips its state as plain
 * data, never an object ref. Callbacks receive (level, id): the level is the whole context, so a
 * state's owner holds no module statics. `change` queues; `update` applies (finish, then enter)
 * and then ticks.
 */
globalThis.StateSystem = {
  /** Re-registering an id replaces it. */
  register(defs) {
    Registry.register(StateSystem, defs);
  },

  /** Throws on an unknown name, so a typo'd transition fails fast. */
  get(id) {
    const def = Registry.get(StateSystem, id);
    if (def === undefined) throw new Error(`Unknown state: ${id}`);
    return def;
  },

  change(entities, id, name, force = false) {
    const state = entities.get(id, State);
    if (state === undefined) return;
    if (state.current === name && !force) return;
    state.next = name;
  },

  update(level) {
    const entities = level.entities;
    entities.forEach([State], (id, state) => {
      if (state.next !== "") {
        if (state.current !== "") {
          const prev = StateSystem.get(state.current);
          if (prev.finish) prev.finish(level, id);
        }
        state.current = state.next;
        state.next = "";
        const cur = StateSystem.get(state.current);
        if (cur.enter) cur.enter(level, id);
      }

      if (state.current !== "") {
        const cur = StateSystem.get(state.current);
        if (cur.update) cur.update(level, id);
      }
    });
  },
};
