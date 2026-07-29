/**
 * @typedef {Object} StateSchema
 * @property {string} id                             registry name (e.g. "combat.idle")
 * @property {function(Entity, number): void} [enter]   called once on transition in
 * @property {function(Entity, number): void} [update]  called every tick while active
 * @property {function(Entity, number): void} [finish]  called once on transition out
 */

/**
 * Per-entity state machine over a NAMED state pool. States register once by id (like
 * Item/Status/InteractAction); State.current/next hold the id STRINGS ("" = none), resolved
 * through the pool each use — so a captured/parked actor (EntitySnapshot, chunk streaming,
 * entities.export) round-trips its state as plain data, never an object ref. Callbacks receive
 * (entities, id): the store needs no module statics (a per-map context like the Level still
 * lives with the states' owner — see CombatAI._grid/bind). `change` queues, `update`
 * applies (finish→enter) then ticks.
 */
globalThis.StateSystem = {
  _defs: new Map(), // id → StateSchema (STRING keys — never key a Map by an asset/object ref)

  /**
   * Register named states; re-registering an id replaces it (content registration is idempotent).
   * @param {StateSchema[]} defs
   */
  register(defs) {
    for (const def of defs) StateSystem._defs.set(def.id, def);
  },

  /**
   * Resolve a state id — throws on an unknown name (fail fast: a typo'd transition/preset).
   * @param {string} id
   * @returns {StateSchema}
   */
  get(id) {
    const def = StateSystem._defs.get(id);
    if (def === undefined) throw new Error(`Unknown state: ${id}`);
    return def;
  },

  /**
   * queue a transition to a registered state id; no-op if already in it unless `force`.
   * @param {Entity} entities
   * @param {number} id
   * @param {string} name
   * @param {boolean} [force]
   */
  change(entities, id, name, force = false) {
    const state = entities.get(State, id);
    if (state === undefined) return;
    if (state.current === name && !force) return;
    state.next = name;
  },

  /** @param {Entity} entities */
  update(entities) {
    const ids = entities.query(State);
    for (const id of ids) {
      const state = entities.get(State, id);

      if (state.next !== "") {
        if (state.current !== "") {
          const prev = StateSystem.get(state.current);
          if (prev.finish) prev.finish(entities, id);
        }
        state.current = state.next;
        state.next = "";
        const cur = StateSystem.get(state.current);
        if (cur.enter) cur.enter(entities, id);
      }

      if (state.current !== "") {
        const cur = StateSystem.get(state.current);
        if (cur.update) cur.update(entities, id);
      }
    }
  },
};
