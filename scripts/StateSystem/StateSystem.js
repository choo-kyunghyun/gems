/**
 * @typedef {Object} StateSchema
 * @property {function(number): void} [enter]   once when the state becomes current
 * @property {function(number): void} [update]  every tick while current
 * @property {function(number): void} [finish]  once when the state is left
 */

/**
 * Per-entity state machine over the `State` component. `change` queues a
 * transition; `update` applies queued transitions (firing finish→enter) then runs
 * the current state's update. Drives SlimeAI's Idle→Chase→Attack and other
 * Brain-based actors.
 */
globalThis.StateSystem = {
  /**
   * Queue a transition to `schema`, applied on the next `update`. No-op if already
   * in `schema` unless `force`.
   * @param {World} world @param {number} id @param {StateSchema} schema @param {boolean} [force]
   */
  change(world, id, schema, force = false) {
    const state = world.get(State, id);
    if (state === undefined) return;
    if (state.current === schema && !force) return;
    state.next = schema;
  },

  /** Apply each entity's queued transition (finish→enter), then tick its current state. @param {World} world */
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
