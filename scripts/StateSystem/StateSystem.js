/**
 * @typedef {Object} StateSchema
 * @property {function(number): void} [enter]   called once on transition in
 * @property {function(number): void} [update]  called every tick while active
 * @property {function(number): void} [finish]  called once on transition out
 */

// per-entity state machine; `change` queues, `update` applies (finish→enter) then ticks.
globalThis.StateSystem = {
  /**
   * queue a transition; no-op if already in `schema` unless `force`.
   * @param {ECS} world @param {number} id @param {StateSchema} schema @param {boolean} [force]
   */
  change(world, id, schema, force = false) {
    const state = world.get(State, id);
    if (state === undefined) return;
    if (state.current === schema && !force) return;
    state.next = schema;
  },

  /** @param {ECS} world */
  update(world) {
    const ids = world.query(State);
    for (const id of ids) {
      const state = world.get(State, id);

      if (state.next !== undefined) {
        if (state.current && state.current.finish) state.current.finish(id);
        state.current = state.next;
        state.next = undefined;
        if (state.current && state.current.enter) state.current.enter(id);
      }

      if (state.current && state.current.update) state.current.update(id);
    }
  },
};
